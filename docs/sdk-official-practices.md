# 官方 SDK 实践与 sentry-miniapp 的取舍

本文面向维护者，记录对官方 Browser、Node、Deno、Cloudflare SDK 的源码对照。上游基线固定为 `11.4.0`，提交 [`7f13c61336918fd727f473faa341b9a24f23718e`](https://github.com/getsentry/sentry-javascript/commit/7f13c61336918fd727f473faa341b9a24f23718e)，不以最新官网说明推断该版本行为。

本项目基线为 `2.0.0-beta.6` / Core `11.4.0`。下述“本轮修复”属于 beta.6 发布后的工作，不能据此宣称 npm 上的 beta.6 已包含修复。模块职责和长期契约见 [ARCHITECTURE](../ARCHITECTURE.md)，开发与发布命令见 [DEVELOPMENT](../DEVELOPMENT.md)；本文不复制两份操作清单。

## 已采用的共同做法

| 官方做法                                                                                                                                                                                                                                                                                                                                                                                        | sentry-miniapp 的选择                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台 SDK 装配配置、stack parser、transport、集成，事件处理继续交给 Core。[Browser 初始化](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/sdk.ts#L113-L128)、[Deno 初始化](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/src/sdk.ts#L105-L126)                   | 保留 `initAndBind`、Core Scope、事件 pipeline 和原生 SpanStreaming。小程序层负责宿主输入、生命周期、网络与 Storage 能力，不复制采样、Session 状态算法或 span buffer。  |
| 使用公开 hook 与 integration processor 补平台信息。[Node 日志 hook](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/node/src/sdk/client.ts#L64-L79)、[Deno Context](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/src/integrations/context.ts#L62-L73)                       | 环境数据属于 client，通过公开事件 processor 和 `preprocessSpan` 补缺失字段。操作创建时捕获 route/network，避免把结束时的新页面写入旧操作；用户覆盖与显式禁用仍须验证。 |
| 公共集成以 factories 暴露，隐藏实现对象的内部方法。[Core `defineIntegration`](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/integration.ts#L166-L173)                                                                                                                                                                          | named factories 与 `Integrations` namespace 是同一来源；不恢复旧公共 class。LinkedErrors、Dedupe 复用 Core 实现，不维护第二套算法。                                    |
| transport 保留 Core 的序列化、限流与 buffer，只适配宿主发送。[Cloudflare transport](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/cloudflare/src/transport.ts#L106-L147)、[Core offline](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/transports/offline.ts#L61-L95)  | 使用 `createTransport` 和一层 `makeOfflineTransport`。平台层处理请求槽位、超时、取消、同意门禁及有界持久化，不增加第二套重试状态机。                                   |
| 验收公开入口、安装包与最终 envelope。[Node CJS/ESM 默认 stream 测试](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/dev-packages/node-integration-tests/suites/hono/test.ts#L23-L79)、[Deno 测试 transport](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/test/transport.ts#L17-L27) | 保留真实 Core 测试、构建产物和 CJS/ESM 消费门禁；不仅断言 mock 或 hook 调用。检查最终 span 容器、属性、错误事件和线上请求字节，区分宿主模拟、实际设备与后台证据。      |

## 本轮确认并修复的两处缺口

### 被忽略的 HTTP 子 span 不能改变父 trace 的传播决策

Core fetch 与 Browser XHR 在 HTTP span 被 `ignoreSpans` 忽略、且存在活动父 span 时，不使用该子 span 生成请求头，而让 `getTraceData` 使用活动父 span。[Core fetch](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/fetch.ts#L105-L114)、[Browser XHR](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/tracing/request.ts#L404-L406)。

本项目原实现显式传入被忽略的 HTTP span，公开 CJS 产物探针已复现：父操作已采样，但请求传播变为未采样。这会把“省略本地请求 span”扩大成下游 trace 的采样变化。

修复仅调整请求头来源：有父时回落活动父 span；无父的 ignored HTTP segment 仍保留自身未采样决策。请求仍按原业务逻辑执行，本地 ignored span 仍不发送。相关实现和回归位于 [networkbreadcrumbs](../src/integrations/networkbreadcrumbs.ts) 与 [真实 Core 请求测试](../test/networkbreadcrumbs.realcore.test.ts)。修复后的完整验证结果留在文末填写。

### 错误事件需要明确携带 IP 推断设置

BrowserClient 根据 `getDataCollectionOptions().userInfo` 在 SDK metadata 写入 `settings.infer_ip`，Core 将该设置合并进事件；仅从 SDK 配置删除用户字段并不能替代这项协议设置。[BrowserClient](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L128-L137)、[Core metadata 合并](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/envelope.ts#L26-L45)。

本项目的真实 Core 最终事件探针已确认该字段缺失。本轮补齐错误／消息事件的 `sdk.settings.infer_ip`：按 Core 解析后的 `dataCollection.userInfo` 表达是否允许后台自动推断 IP，不把禁止推断解释为删除业务显式提供的 IP。与 Browser 一样，显式传入的底层 `_metadata.sdk.settings.infer_ip` 仍覆盖默认值；常规接入使用 `dataCollection`。日志和 metrics 已有独立的推断设置回归；不能用其中一条通道的通过结果证明所有通道都正确。相关回归见 [telemetry-user](../test/telemetry-user.realcore.test.ts)。

[Relay 协议](https://getsentry.github.io/relay/relay_event_schema/protocol/enum.AutoInferSetting.html)说明 `never` 禁止连接信息推断，但保留客户端传入值；缺省 legacy 规则可为 JavaScript 事件补充 IP。本轮确认的是字段遗漏及协议意义，不将它等同于目标部署上的实际推断结果。

交叉复核发现候选修复的异常路径：若元数据内的 `infer_ip` getter 抛错，事后合并设置会发生在 transport 创建后，留下未绑定的 client。本轮改为在 Core 构造资源之前读取并浅复制 settings；不可读配置原样抛错，transport factory 不执行，正常冻结输入保持原样。这是候选实现的修正，不计为 beta.6 已发布缺陷。

Session 是另一条通道。Browser 仅在允许 userInfo 时通过公开 `beforeSendSession` hook 添加 `{{auto}}`，已有值和显式 `null` 保留。[Browser hook](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L163-L165)、[Session helper](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/utils/ipAddress.ts#L10-L21)。本项目不为了对齐 Browser 顺手增加 Session 自动 IP 采集；该差异不等于已证实的 Session 泄漏。

## 必须按小程序环境保留的取舍

- **Scope 策略不同。** Node/Deno 使用 AsyncLocalStorage；Cloudflare 在调用入口建立隔离 Scope，并利用 `waitUntil` 延长发送寿命。[ALS 策略](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/server-utils/src/async-context.ts#L22-L52)、[Cloudflare 调用 Scope](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/cloudflare/src/utils/invocationScope.ts#L26-L58)。小程序没有等价能力，仍采用单活动 runtime，不承诺跨 `await` 的并发 Scope 隔离，也不照搬 isolate client 缓存。
- **冻结与资源寿命不同。** Browser 在 `visibilitychange` 后用 microtask 等其他监听结束 span；小程序可能同步冻结，仍需生命周期阶段保证 finalizer／Session 入队后再 flush。[Browser flush 时序](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L141-L158)。Core 基类的 `registerCleanup`、`dispose` 本身是 no-op，平台 SDK 必须实现清理。[Core 清理契约](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/client.ts#L1303-L1325)。按页面寿命常驻的 `setupOnce` 不能替代小程序重复 init、退休和 dispose 的 per-client 资源管理。
- **保留业务 span 层级。** Browser 默认 `parentSpanIsAlwaysRootSpan: true`；本项目默认保留直接父子关系，不把 `root → child → grandchild` 扁平化为全部挂 root。[Browser 默认值](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L203-L212)、[Core 选父逻辑](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/tracing/trace.ts#L603-L614)。
- **SDK metadata 使用本项目身份。** 官方 `applySdkMetadata` 默认构造 `@sentry/*` 包名并使用 Core 的版本；本项目独立发布，必须保留 `sentry.javascript.miniapp`、`npm:sentry-miniapp` 和自身版本，不能直接套用。[官方 helper](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/utils/sdkMetadata.ts#L17-L27)、[本项目 metadata](../src/client.ts)。
- **protected 接缝按必要性判断。** Core 在异步事件处理后才读取 Session，processing poll 又没有公开取消入口；本项目仍需选择捕获时 Session、并在 dispose 后结束无期限等待。[Core Session 更新](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/client.ts#L1554-L1556)、[Core processing poll](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/client.ts#L1376-L1395)。官方 Node 也保留 protected `_setupIntegrations` 适配，[见实现](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/node/src/sdk/client.ts#L213-L220)。不以“零 protected”为目标；本项目的理由、回归和移除条件统一维护在 [ARCHITECTURE](../ARCHITECTURE.md)。

## 待评估项，不属于本轮改动

1. **HTTP span 低基数命名。** 官方 Browser 的 stream XHR 名称只保留方法和域名，把 URL 放在属性中，[见命名逻辑](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/tracing/request.ts#L382-L399)。本项目仍保留路径名称。后续应比较查询体验、分组基数和迁移影响，再决定默认命名；本轮不悄然改变现有名称。
2. **仅错误监控的 tree-shaking。** 官方 Browser 的 [span API](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/tracing/browserSpanApi.ts#L13-L41) 在调用时安装 SpanStreaming，BrowserTracing 也负责装配；本项目默认 HTTP producer 需要默认 streaming。本项目须先测真实消费构建的体积和行为，再决定能否裁剪；不能为了减少体积移除仍需要的 SpanStreaming、编码或 transport 能力。
3. **配置对象复用的默认集成回归。** Deno 特别测试同一 options 对象修改配置后再次 init 不沿用第一次的默认集合，[见测试](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/test/sdk.test.ts#L65-L73)。本项目已每次构造默认实例，可补实际集成开关的同类回归；这不是已复现的缺陷，也不应照搬 Deno 的 tracing 集成集合。

## 验证记录

已完成固定上游源码阅读；两处初始缺陷分别已有公开 CJS 传播探针和真实 Core 最终事件的 red 证据。已发布 beta.6 的 CJS/ESM 两个新场景共四次精确失败，当前源码构建的实际安装包同一场景全部通过：

| 验证项                                                                    | 结果                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ignored HTTP child：父 trace 采样、无父 ignored segment、W3C 与既有请求头 | 三条真实 Core 回归通过；实际 CJS/ESM 两种 W3C 配置、有父／无父控制及业务对象身份均通过                                      |
| userInfo：错误／消息最终事件、显式业务 IP、Session 不新增自动 IP          | 九条真实 Core 回归通过，含冻结配置、默认值、显式底层覆盖及 getter 原错误；实际 CJS/ESM error 场景通过                       |
| lint、typecheck、单测及覆盖率检查                                         | lint、源码／测试 typecheck 通过；76 文件、1302 测试全通过；语句 98.72%、分支 95.55%、函数 99.23%、行 99.44%，保留原门槛     |
| 构建、实际包 CJS/ESM 消费与行为门禁                                       | CJS/ESM 各 19 场景通过；七平台各两种 URL 能力模式、UMD、68 个导出及类型入口通过；微信 bundle 与本地符号化通过；官网构建通过 |

本次没有运行上游完整 suite，没有新增实际 Relay 接收或真机验证。源码／协议一致性、最终本地 payload、后台处理和目标设备行为是不同证据，不能互相替代。真实用户反馈仍由 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 跟踪。
