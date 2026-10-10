# 官方 SDK 实践与 sentry-miniapp 的取舍

本文面向维护者，记录对官方 Browser、Node、Deno、Cloudflare SDK 的源码对照。上游基线固定为 `11.4.0`，提交 [`7f13c61336918fd727f473faa341b9a24f23718e`](https://github.com/getsentry/sentry-javascript/commit/7f13c61336918fd727f473faa341b9a24f23718e)，不以最新官网说明推断该版本行为。

本文描述当前源码的选择及其理由；依赖版本以 [package.json](../package.json) 为准。职责边界见 [ARCHITECTURE](../ARCHITECTURE.md)，版本复现、验证结果和发布状态见 [发布后审查](core-v11-postrelease-review.md)。

## 已采用的共同做法

| 官方做法                                                                                                                                                                                                                                                                                                                                                                                        | sentry-miniapp 的选择                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台 SDK 装配配置、stack parser、transport、集成，事件处理继续交给 Core。[Browser 初始化](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/sdk.ts#L113-L128)、[Deno 初始化](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/src/sdk.ts#L105-L126)                   | 保留 `initAndBind`、Core Scope、事件 pipeline 和原生 SpanStreaming。小程序层负责宿主输入、生命周期、网络与 Storage 能力，不复制采样、Session 状态算法或 span buffer。  |
| 使用公开 hook 与 integration processor 补平台信息。[Node 日志 hook](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/node/src/sdk/client.ts#L64-L79)、[Deno Context](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/src/integrations/context.ts#L62-L73)                       | 环境数据属于 client，通过公开事件 processor 和 `preprocessSpan` 补缺失字段。操作创建时捕获 route/network，避免把结束时的新页面写入旧操作；用户覆盖与显式禁用仍须验证。 |
| 公共集成以 factories 暴露，隐藏实现对象的内部方法。[Core `defineIntegration`](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/integration.ts#L166-L173)                                                                                                                                                                          | named factories 与 `Integrations` namespace 是同一来源；实现对象的内部方法不作为公共契约。LinkedErrors、Dedupe 复用 Core 实现，不维护第二套算法。                      |
| transport 保留 Core 的序列化、限流与 buffer，只适配宿主发送。[Cloudflare transport](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/cloudflare/src/transport.ts#L106-L147)、[Core offline](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/transports/offline.ts#L61-L95)  | 使用 `createTransport` 和一层 `makeOfflineTransport`。平台层处理请求槽位、超时、取消、同意门禁及有界持久化，不增加第二套重试状态机。                                   |
| 验收公开入口、安装包与最终 envelope。[Node CJS/ESM 默认 stream 测试](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/dev-packages/node-integration-tests/suites/hono/test.ts#L23-L79)、[Deno 测试 transport](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/test/transport.ts#L17-L27) | 保留真实 Core 测试、构建产物和 CJS/ESM 消费门禁；不仅断言 mock 或 hook 调用。检查最终 span 容器、属性、错误事件和线上请求字节，区分宿主模拟、实际设备与后台证据。      |

## 请求观察与 trace 传播

Core fetch 与 Browser XHR 在 HTTP span 被 `ignoreSpans` 忽略、且存在活动父 span 时，让 `getTraceData` 使用父 span。[Core fetch](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/fetch.ts#L105-L114)、[Browser XHR](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/tracing/request.ts#L404-L406)。本项目采用相同规则：忽略本地 HTTP 子 span 不应改变已采样父 trace 的下游传播决策；没有父 span 时，ignored HTTP segment 保留自身未采样决策。

小程序没有可靠的浏览器同源基线，传播头必须匹配显式白名单。请求字段通过单次快照同时供观测和宿主调用使用，避免 URL getter 的不同返回值让白名单检查与实际发送错位。快照保留业务扩展字段，并补齐宿主会读取的非枚举／继承字段；读取失败时透传原输入一次。非字符串 URL 不根据 String 转换结果放行追踪头或正文采集。

实现及回归见 [NetworkBreadcrumbs](../src/integrations/networkbreadcrumbs.ts)、[真实 Core 请求测试](../test/networkbreadcrumbs.realcore.test.ts)。

## IP 推断与采集策略

BrowserClient 按 `dataCollection.userInfo` 在 SDK metadata 写入 `settings.infer_ip`，Core 将设置合并进事件。[BrowserClient](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L128-L137)、[Core metadata](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/envelope.ts#L26-L45)。本项目同样对错误／消息事件明确表达该设置，因为在 SDK 内过滤用户字段不能阻止后台根据连接信息推断 IP。

[`never` 的 Relay 语义](https://getsentry.github.io/relay/relay_event_schema/protocol/enum.AutoInferSetting.html)是禁止自动推断，客户端显式传入的值仍保留。正常配置使用 `dataCollection`；底层 `_metadata.sdk.settings.infer_ip` 可覆盖默认值。元数据在构造 Core 资源前读取并浅复制，不改写冻结输入；不可读配置直接失败，避免留下未绑定的 transport。

错误、Logs、Metrics 和 Session 分别验证最终 payload，不能用一条通道代替其它通道。Session 不自动添加用于后台推断 IP 的 `{{auto}}` 标记。Browser 在允许 userInfo 时通过公开 hook 添加 `{{auto}}`，[见 Browser hook](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L163-L165)；小程序会话统计没有因此新增采集的需求。回归见 [telemetry-user](../test/telemetry-user.realcore.test.ts)。

## 函数包装与运行时降级

官方 Core fetch 使用 Proxy apply 保留 `fetch.preconnect` 等函数扩展，Browser XHR 也用代理保留调用参数和 receiver。[Core fetch](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/instrument/fetch.ts#L73-L82)、[Browser XHR](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser-utils/src/instrumentation/xhr.ts#L38-L66)。本项目的共享 instrumentation 和 App 使用同一个 helper，保留动态属性、descriptor、name／length、receiver、完整参数、返回值和原业务异常。

原函数标记仅通过代理虚拟读取提供给 Core FunctionToString，不写入宿主函数；已有不可配置标记遵守 Proxy get 不变量。没有直接使用官方 `fill`，因为它没有本项目需要的 descriptor 恢复和按 owner 退订语义，且 [`markFunctionWrapped`](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/utils/object.ts#L75-L83) 会写原函数 prototype／标记。复制扩展属性快照同样无法保留框架之后的动态更新。

Proxy 和 Reflect 需分别检测。[微信小游戏官方文档](https://developers.weixin.qq.com/minigame/dev/guide/runtime/js-support.html)说明部分客户端无法使用 Proxy；[抖音小程序支持表](https://partner.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/runtime)列出 Reflect 可用，但不能由此推断所有平台、客户端及适配器都具备完整实现。[MorJS 的跨端依赖规范](https://mor.ele.me/specifications/js/)也采用更保守的约束。

原函数调用使用 `Function.prototype.apply.call`，既不要求 Reflect.apply，也不会被宿主函数自有的 `apply` 扩展遮蔽。只有 Proxy 和 Reflect.get 都可用时才安装透明代理，并持有安装时的 get 方法以保留 accessor receiver。缺少任一能力时，普通函数回退调用包装，带扩展成员或不可检查的函数保留原样并跳过自动观测。请求字段枚举在 Reflect.ownKeys 不可用时通过 Object 的自有字符串／Symbol API 完成。SDK 不安装全局 Reflect／Proxy polyfill。

回归见 [instrumentation](../test/instrumentation.test.ts)、[跨端契约](../test/platform-contracts.realcore.test.ts)、[实际安装包消费](../scripts/internal/check-package-consumers.mjs)。模拟能力缺失验证降级行为，不等同于证明所有设备可用。

## 标准运行时与编码适配

[Core 的 buffer drain](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/utils/promisebuffer.ts#L69-L87) 使用 Promise.allSettled，[集成去重](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/integration.ts#L29-L42) 使用 Object.values，属性和事件准备也使用 Object.entries／fromEntries。这些是标准库方法，单靠 Babel 或构建 target 的语法转换不会产生实现。[Babel 的 polyfill 配置](https://babeljs.io/docs/babel-preset-env#usebuiltins-corejs)明确区分语法转换与标准库补齐。

本项目在入口先于 Core 安装按需 core-js 模块：globalThis、Array.prototype.includes、Object.entries／values／fromEntries、Promise.allSettled 和 String.prototype.isWellFormed／toWellFormed，不加载完整标准库或替换宿主 Promise 构造器。URLSearchParams 使用同版本 core-js-pure 的公开入口作为独立回退，SDK 仅按 Core 实际 record 编码／字符串名称解码检查查询参数能力，保留满足 SDK 需求的宿主构造器，不要求完整 URL、get() 或 pair 输入。安装回退保留已有数据属性的约束。固定版本的 Yarn patch 在 pure 模式跳过完整 URL 与 fetch／Request／Headers 的探测和包装，并在输入处复用同库 ToString 与公开 String.prototype.toWellFormed 来完成 USVString 转换；迭代、解析和编码算法仍由依赖维护。官方 SDK 的宿主基线、替代库复核与补丁退出条件见[查询参数依赖取舍](query-runtime-decision.md)。显式模块清单便于审查内联 Core 的依赖，不依赖应用自身的 Babel 配置或浏览器市场份额目标；迭代关闭、Symbol／`__proto__` 键和 thenable 边界由成熟实现负责。自身 flush 使用两条 then 分支释放等待资源，无需另补 Promise.finally。基础 ES2015 能力仍是宿主前提，不能把这项适配描述成完整 ES5 支持。

官方 React Native SDK 也通过 Core 的公开编码接缝选择宿主 encoder 或 UTF-8 回退，[见编码适配](https://github.com/getsentry/sentry-react-native/blob/main/packages/core/src/js/transports/encodePolyfill.ts)。core-js 不覆盖 TextEncoder；字节预算长度计算也不应分配完整编码结果。本项目保留共用的 UTF-8 标量适配，检测构造、返回 bytes 和中文／补充平面字符／孤立 surrogate 的编码；构造器存在但不可用时注册回退，既保留已有 singleton，也不覆盖全局 TextEncoder。二进制编码可用不等于宿主请求支持二进制 body，平台默认发送能力和显式配置继续由 transport 负责。

回归覆盖真实 Core 字节、flush 的成功／失败／dispose，以及实际 tarball 的入口安装顺序、待完成宿主请求和能力缺失组合。构建体积和受控复现记录放在[发布后审查](core-v11-postrelease-review.md)，接入文档只说明用户需要知道的支持边界。

## 生命周期和晚到批次

Browser 在页面隐藏时用 microtask 等其它监听结束 span，[见 flush 时序](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L141-L158)。小程序可能同步冻结，因此采用同步 finalizer → Core flush 的次序，并按 client 管理订阅、owner 与 drain 预算；DOM keepalive、Node 进程退出和 Cloudflare waitUntil 都不是等价能力。

Core 的 Logs／Metrics 属性转换发生在 beforeSend 回调之后，afterCapture 通知发生在写入 buffer 之后。[Logs](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/logs/internal.ts)、[Metrics](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/metrics/internal.ts)。本项目承诺退休后不再交付新采集的数据，故还须守住公开 afterCapture 边界：用公开 flush 排弃转换过程中关闭 client 后的晚到条目，只屏蔽 log／trace_metric 交付，保留关闭前已接受的错误和 span。该实现不复制 Core 序列化、timer 或私有 buffer；这一关闭契约也不能描述为所有官方 SDK 的共同保证。

可选 Debug ID 桥接和诊断输出均隔离故障，告警失败不应丢弃原事件。不复制 Core 的 Debug ID 解析与缓存，也不承诺修复不可读的 Core 全局 map。回归见 [client-lifecycle](../test/client-lifecycle.realcore.test.ts)、[stacktrace](../test/stacktrace.realcore.test.ts)。

## 必须按小程序环境保留的取舍

- **Scope 策略不同。** Node/Deno 使用 AsyncLocalStorage；Cloudflare 在调用入口建立隔离 Scope，并利用 `waitUntil` 延长发送寿命。[ALS 策略](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/server-utils/src/async-context.ts#L22-L52)、[Cloudflare 调用 Scope](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/cloudflare/src/utils/invocationScope.ts#L26-L58)。小程序没有等价能力，仍采用单活动 runtime，不承诺跨 `await` 的并发 Scope 隔离，也不照搬 isolate client 缓存。
- **资源由 client 管理。** Core 基类的 `registerCleanup`、`dispose` 是 no-op，平台 SDK 必须实现清理。[Core 清理契约](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/client.ts#L1303-L1325)。进程级 `setupOnce` 管理宿主包装；重复 init、退休和 dispose 需要 per-client 订阅与资源回收。
- **保留业务 span 层级。** Browser 默认 `parentSpanIsAlwaysRootSpan: true`；本项目默认保留直接父子关系，不把 `root → child → grandchild` 扁平化为全部挂 root。[Browser 默认值](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/client.ts#L203-L212)、[Core 选父逻辑](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/tracing/trace.ts#L603-L614)。
- **SDK metadata 使用本项目身份。** 官方 `applySdkMetadata` 默认构造 `@sentry/*` 包名并使用 Core 的版本；本项目独立发布，必须保留 `sentry.javascript.miniapp`、`npm:sentry-miniapp` 和自身版本，不能直接套用。[官方 helper](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/utils/sdkMetadata.ts#L17-L27)、[本项目 metadata](../src/client.ts)。
- **protected 接缝按必要性判断。** Core 在异步事件处理后才读取 Session，processing poll 又没有公开取消入口；本项目仍需选择捕获时 Session、并在 dispose 后结束无期限等待。[Core Session 更新](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/client.ts#L1554-L1556)、[Core processing poll](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/client.ts#L1376-L1395)。官方 Node 也保留 protected `_setupIntegrations` 适配，[见实现](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/node/src/sdk/client.ts#L213-L220)。不以“零 protected”为目标；本项目的理由、回归和移除条件统一维护在 [ARCHITECTURE](../ARCHITECTURE.md)。

## 演进所需的证据

1. **HTTP span 低基数命名。** 官方 Browser 的 stream XHR 名称只保留方法和域名，把 URL 放在属性中，[见命名逻辑](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/browser/src/tracing/request.ts#L382-L399)。本项目仍保留路径名称。后续应比较查询体验、分组基数和迁移影响，再决定默认命名；调整默认值需有消费构建与查询结果的对照。
2. **仅错误监控的 tree-shaking。** 官方 Browser 的 [span API](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/tracing/browserSpanApi.ts#L13-L41) 在调用时安装 SpanStreaming，BrowserTracing 也负责装配；本项目默认 HTTP producer 需要默认 streaming。本项目须先测真实消费构建的体积和行为，再决定能否裁剪；不能为了减少体积移除仍需要的 SpanStreaming、编码或 transport 能力。
3. **配置对象复用的默认集成回归。** Deno 特别测试同一 options 对象修改配置后再次 init 不沿用第一次的默认集合，[见测试](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/deno/test/sdk.test.ts#L65-L73)。本项目已每次构造默认实例，调整装配方式时须验证实际集成开关，不能照搬 Deno 的 tracing 集合。
