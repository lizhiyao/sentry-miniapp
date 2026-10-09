# 配置项参考

`Sentry.init({ ... })` 支持的全部选项。通常只需 `dsn` + `release` 即可上手（见[快速接入](/guide/getting-started)），下面按参数类别列出类型、默认值和行为。

如果你还在判断“为什么需要这个选项”，先看对应的[异常、日志与上下文](/guide/errors-and-context)、[性能与链路追踪](/guide/performance-and-tracing)、[可靠上报与隐私同意](/guide/reliability-and-privacy)或[小游戏](/guide/minigame)指南。

## 基础

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `dsn` | `string` | — | Sentry DSN（必填，否则不上报） |
| `release` | `string` | — | 版本号；**Source Map 解析的关键**，需与上传时的 release 完全一致 |
| `environment` | `string` | — | 环境标识，如 `production` / `staging` |
| `debug` | `boolean` | `false` | 开启 SDK 调试日志 |
| `miniappPlatform` | `'wechat'｜'alipay'｜'bytedance'｜'qq'｜'swan'｜'dingtalk'｜'kuaishou'` | 自动识别 | 小程序宿主标记，写入 `contexts.miniapp.platform`。事件顶层 `platform` 固定为 Sentry 标准值 `javascript`。SDK 会结合平台对象、宿主名称、数据路径和 AppID 消除歧义；仅在信息缺失或冲突时手动指定。该选项不切换底层运行时 API。百度小程序使用 `swan` |
| `platform` | 同 `miniappPlatform` | — | 已弃用的兼容别名，请改用 `miniappPlatform`；两者同时传入时后者优先 |

## 采样

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `sampleRate` | `number` | `1.0` | 错误事件采样率（0.0–1.0） |
| `tracesSampleRate` | `number` | 未设 | 性能采样率。API 请求有父级时记为子 span，无父级时默认记为独立 segment span |
| `tracesSampler` | `function` | — | 动态采样回调，按页面 / 场景返回采样率。**设置后 `tracesSampleRate` 被忽略**（优先级更高） |

```js
tracesSampler: ({ name, inheritOrSampleWith }) => {
  if (name.includes('pages/pay')) return 1;   // 关键页全采
  if (name.includes('pages/about')) return 0.1;
  return inheritOrSampleWith(0.5);             // 其他默认 50%
},
```

> **关于 `http.client` span 名的基数**：API 请求的 span 名形如 `GET https://api.example.com/users/123`。SDK 已自动去掉 query/fragment 与 URL 内的账号密码，但**保留路径**——无法推断 REST 路由模板，强行参数化会误伤合法路径。若路径 id（`/users/123`、`/orders/abc`）导致 tracing 维度过高，可用 `beforeSendSpan` 统一改写 span 名（把数字 / UUID 段替换为 `:id`）。

## 面包屑

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableUserInteractionBreadcrumbs` | `boolean` | `true` | 用户点击 / 触摸面包屑 |
| `enableNavigationBreadcrumbs` | `boolean` | `true` | 页面生命周期 / 路由面包屑 |
| `enableConsoleBreadcrumbs` | `boolean` | `false` | 把 `console` 输出记为面包屑 |
| `enableSystemInfo` | `boolean` | `true` | 采集 client 自有的设备 / 系统 / 应用与宿主版本快照 |
| `traceNetworkBody` | `boolean` | `false` | 网络面包屑中记录请求 / 响应体；体先按敏感键脱敏再按 `maxRequestBodySize` 截断，且仍受 `dataCollection.httpBodies` 约束 |
| `maxRequestBodySize` | `'small' \| 'medium' \| number` | `1 MB` | 单个请求 / 响应体上报的字节上限（`small` = 1 KB、`medium` = 10 KB）。数值须为正安全整数，否则回落默认；超出部分截断，省略号也计入上限，1／2 字节预算分别最多补 `.`／`..`。`request_body_size` / `response_body_size` 仍记录原文的完整字节数 |
| `dataCollection` | `object` | 见下 | core 11 的采集开关。本 SDK 尊重 `urlQueryParams`（URL、`url.full`、面包屑 `url.query`、页面 `onLoad` 入参）与 `httpBodies`（请求 / 响应体方向）；**不采集请求头、响应头与 cookie**，因此 `httpHeaders` / `cookies` 在本 SDK 无作用对象 |
| `maxBreadcrumbs` | `number` | `100` | 面包屑最大条数 |

> 网络面包屑（`url`/`method`/状态码/耗时）**默认开启**，无需配置。若开启 `traceNetworkBody` 后需要按 URL 排除 body，可在 `beforeBreadcrumb` 里按 `breadcrumb.data.url` 删除 `request_body` / `response_body`，或返回 `null` 丢弃该条面包屑。

> `dataCollection.httpBodies` 与 `traceNetworkBody` 是**两层独立的闸门**：前者按方向收窄（`outgoingRequest` / `outgoingResponse`），后者是本 SDK 的总开关；只有两者都放行才记录请求 / 响应体。SDK 自身采集的 URL 一律经过 `dataCollection.urlQueryParams` 过滤，默认即会把 `token` 这类敏感键值写成 `[Filtered]`。

## 采集数据的脱敏口径

SDK 自动采集的键值数据都走 core 11 的 `CollectBehavior` 语义：键名保留，命中的值就地替换成 `[Filtered]`。

- **匹配方式**：大小写不敏感的**片段**匹配，不是全等。`accessToken`、`xApiKey`、`sid` 这类写法都会被内置名单（`auth` / `token` / `secret` / `key` / `session` / `cookie` …）命中。
- **本 SDK 补齐**：core 内置名单没有的支付与证件类片段（`credit_card` / `card_number` / `cvv` / `ssn` / `id_card` 等）也一并脱敏。
- **作用范围**：请求 / 响应体（JSON 会递归到嵌套对象与数组，form 保留重复键及非敏感字段编码）、页面 `onLoad` 入参、默认 pageNotFound 与小游戏启动 query、HTTP URL query。
- **追加自己的片段**：顶层 `sensitiveKeys` 选项是**在以上名单之上追加**，不再顶掉内置默认；手动配置 `NetworkBreadcrumbs` 时也可在其工厂选项里追加：

```js
Sentry.init({
  traceNetworkBody: true,
  sensitiveKeys: ['memberNo'],
});
```

> 页面入参与 URL query 受 `dataCollection.urlQueryParams` 控制：`false` 时整块不采（面包屑里不出现 `query` / `url.query`），`{ deny: [...] }` / `{ allow: [...] }` 按名单收窄。

2.0 仅采集可识别的 JSON object／array 或 form 正文，先按键脱敏再截断；此策略独立于 query 开关。请求／响应的 `header` 与 `headers` 中，大小写不敏感的 Content-Type 仅用于判断格式，不写入遥测。已声明的纯文本、multipart 等不支持格式，以及无法识别的正文、JSON 原始值、坏 form 编码和 binary 均省略 `request_body`／`response_body`。缺少 Content-Type 时只接受可确认的 JSON／URL-encoded 键值结构。

大小可确认时仍记录 `*_body_size`：字符串按 UTF-8 字节数，ArrayBuffer／typed array 按实际视图 byteLength；JSON 对象按序列化后、过滤与截断前的大小。这是 SDK 可观察表示的大小，不是宿主最终 wire bytes；未知对象编码不猜测大小。1.x 的纯文本采集行为不延续到 2.0，敏感键过滤也不是任意正文的隐私保证。

SDK 自动产生的 HTTP、navigation/resource URL 名称去掉 query、fragment，并过滤明文 userinfo；HTTP `url.full` 可保留经过过滤的 query。User Timing 的业务名称不按 URL 处理。缺原生 `URLSearchParams` 的宿主使用 form 编码 polyfill，坏百分号不会抛错，非法 UTF-8 与孤立 surrogate 使用替换字符；SDK 自采 query 遇到不能安全解码的键时直接省略 query。

## Logs

2.0 删除 `enableLogs`。`Sentry.logger.trace/debug/info/warn/error/fatal` 按调用即采集，由 core 批量发送。迁移时移除 `enableLogs: true`；原先依赖 `enableLogs: false` 的应用，应停止调用 logger／安装日志集成，或配置 `beforeSendLog: () => null`。SDK 不默认安装 console 到 Logs 的集成。

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `beforeSendLog` | `function` | — | Log 发送前的钩子，可修改或返回 `null` 丢弃 |

```js
Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
});

Sentry.logger.info('checkout completed', {
  orderId: 'order_123',
});
```

`Sentry.logger.*` 会作为独立 log envelope 发送到 Sentry Logs；`enableConsoleBreadcrumbs` 只会把 `console` 输出记录为随下一次事件发送的面包屑，两者用途不同。

## Client reports

2.0 默认 `sendClientReports: true`，可显式设为 `false`。报告记录采样、处理器等丢弃原因；`flush()` 先排 core buffers，再通过同一 transport 排出报告。无 DSN、未获同意或 client 已关闭时不清计数；报告发送失败不会保存到离线缓存。`flush()` 成功不代表后台已接收，发送期间产生的异步丢弃留到下一轮。

## 接入诊断

`Sentry.getDiagnostics()` 会返回当前 SDK 的只读运行时摘要，适合在排查“没数据 / Source Map 不解析 / tracing 没串起来 / consent 未放行”时附到 issue：

```js
const diagnostics = Sentry.getDiagnostics();

console.log(diagnostics.platform);
console.log(diagnostics.options);
console.log(diagnostics.integrations);
console.log(diagnostics.warnings);
```

诊断信息不会发送事件、不会触发离线缓存 flush，也不会暴露完整 DSN；`dsn` 只会显示是否配置、是否合法以及 host。常用字段：

| 字段 | 说明 |
|------|------|
| `platform` | 当前检测到的平台、是否小程序环境、是否小游戏 |
| `client` | 是否已初始化、当前 client 是否为 `MiniappClient` |
| `options` | `release`、`environment`、采样、Source Map、Logs、consent、trace header 等配置摘要 |
| `transport` | 是否自定义 transport、离线缓存与 consent 门禁状态，以及内置上报超时 / 网络并发上限 |
| `integrations` | 已装配的 integration 名称列表 |
| `warnings` | SDK 识别出的潜在接入问题，如缺 `release`、tracing 未开启、consent 正在阻断上报 |

## Source Map

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableSourceMap` | `boolean` | `true` | 自动将各平台虚拟堆栈路径归一化为 `app:///` 前缀。详见 [Source Map 上线指南](/guide/sourcemap) |
| `stackParser` | `StackParser` | `miniappStackParser` | 自定义堆栈解析器；私有引擎或特殊堆栈格式才需要覆盖 |

## 离线缓存（弱网可靠性）

工作方式与验证步骤见[可靠上报与隐私同意](/guide/reliability-and-privacy#弱网离线缓存)。

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableOfflineCache` | `boolean` | `true` | 断网 / 发送失败时缓存事件到本地 Storage，网络恢复后静默重试 |
| `offlineCacheLimit` | `number` | `30` | 离线缓存最大事件数 |
| `offlineCacheMaxAge` | `number` | `86400000` | 缓存过期时间（ms），默认 24 小时，超时丢弃 |

SDK 的缓存条数、字节数、TTL 使用非负安全整数；负数、NaN、Infinity 和小数回落各自默认值。缓存条数／字节上限为 0 时不保留事件，TTL 为 0 时立即过期。2.0 删除通用 Performance 的 `sampleRate`、`bufferSize`、`reportInterval`、`thresholds` 和 `enableMemory`；span 采样和批处理由 core 负责。

## 隐私合规（同意后上报）

开始配置前建议先阅读[用户同意前不发送 Sentry 网络](/guide/reliability-and-privacy#用户同意前不发送-sentry-网络)。

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `requireConsent` | `boolean` | `false` | 开启后，用户同意隐私协议前 SDK 照常采集，但不发送任何网络请求 |
| `consentCacheLimit` | `number` | `100` | 同意前缓冲最大事件数；满了保留最早的冷启动数据、丢弃最新事件 |
| `consentCacheMaxBytes` | `number` | `921600` | 同意前缓冲最大字节数；受小程序单 key Storage 约 1MB 限制，默认约 900KB |
| `consentCacheMaxAge` | `number` | `86400000` | 同意前缓冲过期时间（ms），默认 24 小时 |
| `onConsentCacheDrop` | `function` | — | 同意缓冲因 `count` / `bytes` / `age` / `target_changed` / `policy_changed` / `migration_drop` 丢弃已知数量的事件时回调 `{ reason, dropped }` |

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
  requireConsent: true,
  consentCacheLimit: 100,
  onConsentCacheDrop: ({ reason, dropped }) => {
    console.warn('Sentry consent cache dropped events', reason, dropped);
  },
});

// 用户点击同意隐私协议后，补发同意前缓冲并恢复正常上报
Sentry.setConsent(true);

// 用户撤回同意后，后续事件继续只入本地缓冲、不发网络
Sentry.setConsent(false);
```

2.0 的 `new MiniappClient(options)` 是自管的低层入口，必须显式提供 `transport`（类型和运行时都检查）。它只保障有显式 scope 的 event／feedback，不启动 SDK 自动 lifecycle、持久 store 或离线重放，也不承诺任意异步多 client tracing 隔离。旧的无参数或默认 transport 构造请迁移到 `init`。低层 `requireConsent: true` 未授权时拒绝发送并报告 `low_level_consent_blocking`，不声称已缓存；授权后只交给显式 transport。需要 SDK 缓存和自动恢复时使用 `init`。

同意状态、缓存配置和丢弃回调属于各 client。顶层 `Sentry.setConsent` / `Sentry.getConsent` 只路由当前 MiniappClient；也可调用 `client.setConsent` / `client.getConsent`。构造其他 client 不改变原实例状态；新的 `init({ requireConsent: true })` 默认未同意，不继承旧授权。关闭或退休的实例不能用授权 API 影响新实例。

授权会同步调用 client.flush，排出 core span/log/metric 等缓冲，并通过独立 runtime handle 请求离线重放，不等待尚未完成的 beforeSend processing。默认 show 与网络从离线恢复也经过该恢复入口；撤回暂停重放，退休／关闭永久停止旧 owner 的重放权限。离线磁盘重放仍是 best-effort，flush 成功不表示磁盘排空或后台已接收。撤回会立即阻止默认 transport 新的实际请求，对在途 SDK 遥测请求 best-effort abort；已传输字节无法撤回，业务 HTTP 不受影响。未完成的排队/在途请求由唯一 core offline 层处理，缓存保留待重新同意，仍受容量与过期限制。自定义 transport 的私有队列由其自身控制，SDK 入口门禁不能强制撤销其中已接收的工作。

`requireConsent: true` 会隐含启用本地缓冲：即便 `enableOfflineCache: false`，同意前事件仍会先写入小程序 Storage；如果传入自定义 `transport`，SDK 也会先用 consent 门禁包住它。2.0 的同意缓冲与弱网重试共用一个 `sentry_miniapp_offline_v2` 容器，记录包含版本、目标身份、原始创建时间和 typed payload；总 UTF-8 字节预算（含元数据）硬封顶 900KB。DSN（含 public key、project、path）或 tunnel 切换，以及不兼容的缓存隐私协议变化，会丢弃旧容器；容量、TTL、淘汰策略调整只裁剪记录。旧 `sentry_offline_store` 无可验证目标身份，直接删除，不恢复或刷新 TTL。SDK 只访问这两个缓存 key。

重试沿用记录原始时间，不延长 TTL。删除提交失败时不向 core 交付记录，本实例停止消费磁盘并降级为有界内存；写入失败会拒绝 store 的 Promise，不能当作持久化成功。缺少同步 Storage API 时也使用有界内存，冷启动会丢失其中的数据。直接调用 `createMiniappOfflineStore` 必须提供 `targetId` 和版本化 `policyId`；返回值的 `getDiagnostics()` 以及 SDK `getDiagnostics().transport.offlineStore` 报告实际 storage 模式和失败代码，不返回原始缓存数据；`unknown` 表示尚未进行存储操作，`persistent` 表示同步存储通道可用，`memory` 表示本实例已回退为有界内存。模式不代表后台接收或 durable ACK。丢弃通知在成功提交后执行；未知格式无法可靠计数时只记诊断。

## 显式 Performance 采集（2.0）

默认不安装 Performance observer，也不启动 FPS 采样循环。通用 Performance 须显式安装 `performanceIntegration({ enableNavigation, enableRender, enableResource, enableUserTiming })`；前三项默认 `true`，User Timing 默认 `false`。FPS 须配置 `enableMinigameFrameRate: true`。小游戏生命周期的一次首帧观察仍保留。

只为真实 navigation/render/resource/measure operation 生成 span，mark 作为面包屑；不生成 observer delivery 父 span、原始条目缓冲、周期统计或阈值告警，不自动读取 User Timing detail。宿主条目须有有效 epoch 毫秒时间，或提供与条目相同时间基准的有效 epoch 毫秒 `timeOrigin`；仅有相对时间则省略对应 span，并诊断 `performance_time_origin_missing`。SDK 不将初始化墙钟或首批结束时间当成 origin。宿主没有 observer 时安全跳过，不能据此承诺所有平台均提供性能时间线。

2.0 只接受 `traceLifecycle: 'stream'`；JS 显式传入 `static` 在替换当前 runtime 前报错。删除 `beforeSendTransaction`、`ignoreTransactions` 和 `withStaticSpan`／`withStreamedSpan` 出口，改用 `beforeSendSpan` 修改名称／属性、`ignoreSpans` 丢弃。小游戏数值只写 span attributes，不再双写 static measurements。首帧近似改名 `minigame.init_to_first_frame`，耗时属性 `minigame.init_to_first_frame_ms`，上下文 `initToFirstFrameMs`；它表达 SDK 安装到首个 rAF 回调，无法代替完整冷启动。时钟回拨／非法差值省略并诊断 `performance_clock_invalid`，不填虚假的 0。

## 性能数据里的运行环境维度

core 11 的 span 使用 attributes；事件上的 tags 与一般 context 不会自动成为 span 属性。
SDK 在 client 构造时保存稳定环境快照，在 core 合并公共属性后只填缺失字段：

| 属性 | 含义 |
|------|------|
| `miniapp.platform` | 小程序宿主标识（`wechat` / `alipay` / `bytedance` 等） |
| `miniapp.host_version` / `miniapp.host_sdk_version` | 宿主 App / 基础库版本 |
| `app.app_version` | 小程序自身版本 |
| `device.manufacturer` / `device.model` | 设备厂商与机型 |
| `os.name` / `os.version` / `os.type` | 系统名、系统版本、系统类型（如 `iOS` / `17.4` / `ios`） |
| `performance.api.available` / `performance.integration` | 性能集成登记的稳定能力 |

事件与 span 的 OS name/version 都表示操作系统，不再把宿主版本当成 OS 版本。宿主能力缺失时省略字段，不填 `unknown` 或 `0x0`。

自动 HTTP 操作在创建 span 前捕获页面栈 route 和已观测的 network.type，供 `tracesSampler` / `ignoreSpans` 使用；请求在另一页面完成也保留开始维度。延迟交付的 PerformanceEntry 不使用交付时页面。小游戏没有页面栈时不写 route。

手动 span 只补稳定环境；动态 route/network 由业务在创建时显式传入：

```js
Sentry.startInactiveSpan({
  name: 'checkout',
  attributes: { route: 'pages/checkout', 'network.type': 'wifi' },
});
```

自动操作初始属性的优先级为 SDK 默认值 → 显式 scope 同名属性 → 操作显式属性。初始值只支持合法标量、同类数组和无单位包装值；带 unit 或不适配创建类型的 scope 值不强转，也不补该键的默认值，最终仍由 core 合并原始属性。若要按这些值采样，应在创建时显式提供合法标量。手动 span 的显式属性和 scope 单位始终优先于稳定默认值。

`enableSystemInfo: false` 禁止 SDK 自动采集 device/os/app/runtime version，包括显式 HttpContext 的残余路径；平台标识与用户自己提供的字段保留。默认环境状态不写共享 scope。小程序 tracing 的正式支持范围是一个活动 init client，不承诺任意并发 client 或跨 await 上下文隔离。

## 运行环境与自建 Sentry

- 构建与测试环境要求 Node.js ≥ 20.19（与 core 11 的最低要求一致）。
- core v11 的[官方迁移说明](https://github.com/getsentry/sentry-javascript/blob/3e02c87cd51066b147ab37c5c33b44bfe69ae3cd/MIGRATION.md)要求自建 Sentry 26.4.2 及以上。升级后仍须在目标环境验收 span/v2 与其他遥测接收；2.0 不支持 static，不能用它作为旧后台的降级路径。
- 删除项、数据采集与统计迁移见[升级到 2.0](/guide/migration-2.0)。

## 分布式追踪

追踪头的用途、域名限制与验证方式见[性能与链路追踪](/guide/performance-and-tracing#串联小程序与服务端)。

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableTracePropagation` | `boolean` | `true` | 是否允许向 `tracePropagationTargets` 匹配的请求注入追踪头（`sentry-trace` / `baggage`，以及可选 `traceparent`）。只控制传播，不关闭本地请求 span |
| `enableStandaloneHttpSpans` | `boolean` | `true` | 无活跃 span 时，把 API 请求作为独立 segment span 上报；设为 `false` 后只保留业务流程内的请求子 span，网络面包屑不受影响 |
| `tracePropagationTargets` | `Array<string｜RegExp>` | `[]`（不注入） | 追踪头域名白名单。小程序没有可靠的 same-origin，未配置时不向任意业务域名注入；仅添加自己控制的 API |
| `propagateTraceparent` | `boolean` | `false` | 额外注入 W3C `traceparent` 头，用于和 OpenTelemetry / W3C Trace Context 兼容的后端链路串联 |

## Session 与网络

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableAutoSessionTracking` | `boolean` | `true` | 自动 Session 管理，为 Sentry Release Health 提供会话数据 |
| `enableNetworkStatusMonitoring` | `boolean` | `true` | 实时监控网络状态变化（WiFi/4G/离线） |

## 小游戏

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableMinigameLifecycle` | `boolean` | 小游戏 `true` / 小程序 `false` | 冷启动首帧耗时、启动场景、onShow/onHide 面包屑 |
| `enableMinigameFrameRate` | `boolean` | `false` | 帧率（FPS）/ 卡顿（jank）监控；小程序无全局 rAF，开启也安全 no-op |
| `minigameFrameRateOptions` | `object` | 见下 | 帧率监控细调，仅 `enableMinigameFrameRate` 生效时使用 |

`minigameFrameRateOptions` 子项：`fpsWarningThreshold`（默认 `30`）、`longFrameThresholdMs`（默认 `50`）、`reportInterval`（默认 `10000`）、`maxJankBreadcrumbsPerWindow`（默认 `3`）、`jankLevels`（可选，分级卡顿阈值）。使用方法与数据去向见[小游戏接入与性能](/guide/minigame)。

`jankLevels` 为 `{ minor?, major?, severe? }`（毫秒，各档全可选）。提供后切换为**分级统计**：每帧卡顿按命中的最高档归类，面包屑带 `jankLevel`，会话汇总额外增发 `jank_minor_count` / `jank_major_count` / `jank_severe_count`（仅启用的档）。不提供时沿用 `longFrameThresholdMs` 单档，行为与历史完全一致；两者同时提供时 `jankLevels` 优先。

## 过滤与钩子

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `allowUrls` | `Array<string｜RegExp>` | 空 | 仅上报栈帧匹配这些 URL 的错误 |
| `denyUrls` | `Array<string｜RegExp>` | 空 | 不上报栈帧匹配这些 URL 的错误 |
| `ignoreErrors` | `Array<string｜RegExp>` | 空 | 消息/类型匹配的错误直接丢弃 |
| `attachStacktrace` | `boolean` | `true` | 为没有堆栈的事件（`captureMessage`、非 Error 值的 `captureException`）自动附加堆栈。core 11 起默认由 `false` 改为 `true`；有无堆栈会影响 Sentry 分组，切换该开关会产生新 issue 分组 |
| `beforeSend` | `function` | — | 事件发送前的钩子，可修改或返回 `null` 丢弃 |
| `beforeSendSpan` | `function` | — | Span 发送前的钩子，收到 `StreamedSpanJSON`（`name` / `is_segment` / `attributes`）。attributes 是 core 的 RawAttributes，可为标量或带 value／unit 的包装；序列化后的 envelope 再带 type 注解。独立 segment span 也经过该钩子 |
| `ignoreSpans` | `Array<string｜RegExp>` | 空 | 按 span 名丢弃 span，替代 core 10 的 `ignoreTransactions` |
| `traceLifecycle` | `'stream'` | `'stream'` | 2.0 唯一支持路径，复用 core 原生小批发送；JS 显式 static 报配置错误 |
| `beforeBreadcrumb` | `function` | — | 面包屑记录前的钩子 |
| `transportOptions` | `object` | 见下 | 内置上报通道选项：请求头、超时和 Sentry 网络并发上限 |
| `transport` | `function` | 内置 | 自定义传输层（高级用法） |

> `allowUrls` / `denyUrls` / `ignoreErrors` 由内置的 `EventFilters` 集成实现，`init` 时自动装配（若你在 `integrations` 里已自带 `EventFilters`，则由 core 去重、不重复追加。`InboundFilters` 已被 `@sentry/core` 11 移除）。

```js
Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
  transportOptions: {
    requestTimeout: 3000,
    maxConcurrentRequests: 2,
    headers: {
      'Content-Type': 'application/x-sentry-envelope; charset=utf-8',
    },
  },
});
```

- `requestTimeout`：单次 Sentry 上报的超时时间（ms），默认 `3000`。超时后 SDK 会在宿主支持时调用 `RequestTask.abort()`，并把发送失败交给离线缓存处理。
- `maxConcurrentRequests`：最多同时占用宿主网络槽位的 Sentry 请求数，默认 `2`。更多事件会先在 `@sentry/core` 的有界缓冲中等待，避免监控请求占满小程序网络并发、影响业务接口。
- `binaryRequestBody`：`'arraybuffer'` 或 `'unsupported'`。默认仅在微信／抖音上采用精确 ArrayBuffer；其余平台暂按未确认能力拒绝二进制 envelope，并报告 `binary_request_unsupported`，永久能力错误不进入离线重试。文本 envelope 仍按原字符串发送。对于含附件的 mixed envelope，拒绝作用于整个 envelope，不拆分或强转 payload。其他宿主在对应基础库、设备上验证原始请求字节后，可显式设置 `'arraybuffer'`；也可在任何平台设置 `'unsupported'` 禁用二进制发送。

默认依据：[微信官方请求类型](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)和[抖音小程序请求说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/network/http/tt-request)包含 ArrayBuffer 请求体。支付宝、钉钉、QQ、百度、快手暂未进入默认二进制能力白名单，这表示 SDK 尚未确认，不能据此断言这些宿主都不支持。尤其[快手小程序](https://open.kuaishou.com/docs/develop/api/network/request/request)与[小游戏](https://open.kuaishou.com/miniGameDocs/gameDev/api/network/request/ks.request.html)的参数表不同，不能按品牌混用支持结论。七平台 fixture 验证 SDK 的数据类型、拒绝与显式配置契约；真机及后台接收仍需单独验收。

- `headers`：附加到 envelope 请求的自定义请求头。

通常不建议调大 `requestTimeout` 或 `maxConcurrentRequests`。自建 Sentry 服务响应较慢时，应先检查服务和网络链路；确需调整时，也要在真机上确认业务请求不受影响。

## 集成

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `integrations` | `Integration[]｜(defaults) => Integration[]` | — | 数组会追加到默认集合，同名时用户实例优先；函数接收默认集合并返回最终集合，可用于过滤或改写 |
| `defaultIntegrations` | `false｜Integration[]` | 全部内置默认集成 | 设为 `false` 可关闭全部默认集成；自定义数组会替换默认集合基底 |

默认集成包含 `FunctionToString`、`GlobalHandlers`、`TryCatch`、`LinkedErrors`、`Dedupe`、**`SpanStreaming`**、`RewriteFrames`、`NetworkBreadcrumbs`、`Session`、`PageBreadcrumbs`、`NetworkStatus` 和 `EventFilters`（部分受顶层开关或运行时影响）。`Dedupe` / `LinkedErrors` / `RewriteFrames` / `FunctionToString` / `SpanStreaming` 直接复用 `@sentry/core` 官方实现。自定义 `defaultIntegrations` 时漏掉 `SpanStreaming` 会让业务 trace、导航与帧率汇总等非独立 span 一条都发不出去，`getDiagnostics()` 会给出 `span_streaming_missing` 警告。所有默认能力统一由 `getDefaultIntegrations(options)` 构造，不存在绕过 `defaultIntegrations` 的额外追加。

```js
// 在默认集合上追加；同名集成会覆盖默认实例
Sentry.init({
  dsn: 'YOUR_DSN',
  integrations: [Sentry.consoleBreadcrumbsIntegration()],
});

// 过滤默认集合
Sentry.init({
  dsn: 'YOUR_DSN',
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== 'PerformanceAPI'),
});

// 关闭全部默认集成，只安装显式提供的集成
Sentry.init({
  dsn: 'YOUR_DSN',
  defaultIntegrations: false,
  integrations: [Sentry.Integrations.globalHandlersIntegration()],
});
```

每次 `init()` 都应创建新的有状态 integration 实例。不要跨多次初始化复用
缓存后的 `getDefaultIntegrations()` 结果。2.0 删除旧 `defaultIntegrations` 静态数组、公共 class 和空 `showReportDialog`；使用 named factories，或 `Sentry.Integrations` 中相同的 factories。反馈由业务 UI 收集后调用 `captureFeedback()`。

2.0 不再自动复制交互 `dataset`；自动 targetId／handler 限 128 个 UTF-16 code units，eventType 限 64 个，不改业务传参。业务需要时应构造显式白名单的 breadcrumb，避免复制整份模板数据。导航 API 的面包屑由 Page collector 提供，服从 `enableNavigationBreadcrumbs` 和 query 策略；跳转尝试不写 route tag，也不启动轮询。

## 2.0 的 client 关闭与切换契约

`init()` 只保留一个活动 runtime。切换前，旧 client 停止持久缓存消费，同步执行 SDK finalizer 并启动 owner flush，再绑定新 client；内部收尾预算为 2000ms。同步 span/sampler/DSC hook 中重入 `init()` 会返回 `undefined` 并诊断 `reentrant_init_unsupported`，业务应在 hook 返回后的独立控制流中切换。

`client.close(timeout)` 的正有限 timeout 是整个收尾的预算；`0` 或省略 timeout 表示等待排空，不套内部 2000ms 预算。负数、NaN、Infinity 使用 2000ms 安全预算。重复 close 共享同一 Promise。`dispose()` 是立即废弃：禁用采集与发送，排弃 core buffer，再解除资源；它不生成最后的 summary，也可以中断等待中的 close，使其返回 `false`。宿主恢复后，默认发送队列在实际出队时仍检查终态与绝对 deadline。

SDK finalizer 与资源 cleanup 分开，前者只在关闭的同步收尾窗口产生最后数据。关闭后日志／指标不会再执行用户采集 callback 或填入 buffer；callback 内关闭 client 后返回的日志／指标也被拒收。任意第三方 core hook 抛错可能中断 core 其余 listener，内部 buffer 清理只能 best-effort；SDK 仍完成终态和资源清理，不修改 core 私有 hooks/buffers。

`close`／`flush` 返回 `true` 不等于后台 ACK 或持久缓存已经排空。高级直接构造 client 不获得 SDK 持久缓存消费权限；错误／feedback 需显式 scope 归属，不承诺多个直接构造 client 的 streaming timer 独立隔离。自定义 transport 的内部队列、取消和严格停止能力仍由其实现负责。

2.0 将 JS 未处理异常的 Session 状态从 `crashed` 改为 `unhandled`，不将可继续运行的异常当作宿主进程崩溃。Release Health 的统计与告警须重新建立基线，不能直接比较 1.x 的 crash-free 数据；没有真实原生崩溃证据时 SDK 不生成 `crashed`。

自动 Session 按前台 episode 维护 client 自有引用，在业务同步 `onHide` 之后结束。正常会话收尾发送 `exited`；core 已上报 `unhandled` 等终态时，退后台、关闭或切换 client 只释放该会话引用，不重复发送终态，避免 Release Health 重复累计。异步事件处理使用采集时的 session；S1 结束后开始 S2，S1 的迟到错误不会修改或结束 S2。已结束 S1 是否补发更新遵循 core 原生语义，不能将迟到错误重新归到当前前台。手动 `startSession`／`captureSession`／`endSession` 直接沿用 core API 的发送语义，不能把反复发送终态更新当作幂等操作。

默认 MiniappLifecycle 协调器独立于 Session、Page 与 FPS。可包装 App 时，业务同步 handler、SDK after 收尾和最后 flush 按阶段运行；Session 在协调器之后安装也不会越过最后 flush。小游戏使用原生 onShow/onHide；可检测到已注册 App 的 late init 使用原生 onAppShow/onAppHide（如有）。原生监听相对业务监听的顺序由宿主控制，业务 handler 末尾显式 flush 才能覆盖随后产生的数据。App 入口不可读、不可写或 setter 忽略包装时，改用可用的原生监听；冻结的 App 定义仍交给宿主注册，无法注入的 handler 不保证自动收尾，业务需显式 flush。没有监听能力时安全降级；没有 getApp 检测能力时，SDK 也无法可靠判断 App 是否已注册。

默认 transport 的终态 shutdown 会清掉等待队列、尝试 abort SDK 在途请求并一次结算；abort 抛错、同步 fail 或迟到 success/fail 都不能重复结算。第三方 transport 的私有队列与取消能力由其实现负责。core 自己创建的单次 drain timeout 可能在关闭后空执行一次，SDK 不改写其私有 timer。

`getDiagnostics().warnings` 可查询 `late_init`、`lifecycle_unavailable`、`reentrant_init_unsupported` 和 `invalid_close_timeout`。这些诊断只保留有界的状态代码，不发送事件；禁用默认集成时，生命周期与 hide/show 边界由业务显式管理。

TryCatch 的 timer/rAF 捕获按每次调度绑定到活动 `init` client。同一函数多次调度不会复用首个 owner；one-shot 完成、对应 clear/cancel 或 client 退休后释放采集状态。退休不取消业务 interval/rAF，迟到业务回调仍保留 `this`、参数、返回值和原异常，但不再由旧 SDK 回调捕获到新 client。回调返回 Promise 时保持原 Promise 身份，不捕获其异步 rejection，也不提供跨 await 的 scope 隔离；宿主独立发出的全局未处理异常遵循当前 runtime 的捕获边界。

GlobalHandlers 的宿主监听按 client 安装，重复使用同一 integration 对象时也保持独立去重窗口。运行实例退休即退订并释放 client；缺少 off API 的旧监听仅保留失效回调，迟到参数不会被读取。注册或解除某个监听失败不阻断其他能力，低层直接构造的 MiniappClient 不自动注册这些监听。宿主随后独立发出的全局异常仍按当前活动 runtime 捕获，不承诺恢复已丢失的旧异步来源。

NetworkStatus 的初始查询与变化监听属于安装它的 client。运行实例退休后，旧查询和无 off API 的监听不会读取迟到参数；已经观察到实时变化后，迟到初始查询不能覆盖网络状态。恢复联网时同步发起 flush，异步失败由 SDK 接住；这不代表磁盘重放已完成。

小游戏首帧与 FPS 的 SDK rAF 同样按 client 管理。FPS 退后台停止自己的帧循环，回前台重建基线，重复 show 不丢弃有效窗口；缺 cancel API 时旧帧以请求身份失效。close 的同步 finalizer 最多产生一次最后汇总，dispose 和资源 cleanup 只释放状态、不产生汇总。注册或解除某项监听失败不阻断其余资源释放，业务自身的 rAF 不由这些集成取消。

Performance 的 observer 按 client 独立维护，复用 integration 配置对象不会把旧 observer 转给新 client；2.0 没有通用报告定时器、原始条目缓冲或周期汇总。运行实例退休时同步释放 observer，迟到 entry 不再读取。Page、Console、HTTP 与生命周期协调器也在退休时同步退订；低层直接构造并手动绑定 client 不会启动这些自动 producer。SDK 的 breadcrumb 格式化或不可写 Page 定义失败不阻断原业务 API、回调或 console。
