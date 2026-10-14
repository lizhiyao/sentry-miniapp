# 配置项参考

`Sentry.init({ ... })` 的常用选项与小程序扩展选项。通常只需 `dsn` + `release` 即可上手（见[快速接入](/guide/getting-started)），下面按参数类别列出类型、默认值和行为。

本页对应 2.x 正式版。1.x 的接入与参数请使用[版本选择页中的归档文档](/guide/migration-2.0#version-choice)。

如果你还在判断“为什么需要这个选项”，先看对应的[异常、日志与上下文](/guide/errors-and-context)、[性能与链路追踪](/guide/performance-and-tracing)、[可靠上报与隐私同意](/guide/reliability-and-privacy)或[小游戏](/guide/minigame)指南。

## 基础

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `dsn` | `string` | — | Sentry DSN（必填，否则不上报） |
| `enabled` | `boolean` | `true` | 是否启用遥测；若不希望安装任何自动监听，应按业务条件决定是否调用 `init()` |
| `tunnel` | `string` | — | 自管的 envelope 转发地址；配置后将此地址加入宿主 request 合法域名 |
| `release` | `string` | — | 应用发布标识；按 release 上传 Source Map 时须与上传值一致。Debug ID 匹配见[进阶指南](/guide/sourcemap-advanced#debug-id-与自定义-stackparser) |
| `environment` | `string` | 'production' | 环境标识，如 `production` / `staging` |
| `debug` | `boolean` | `false` | 开启 SDK 调试日志 |
| `miniappPlatform` | `MiniappPlatform` | 自动识别 | 小程序宿主标记，写入 `contexts.miniapp.platform`。事件顶层 `platform` 固定为 Sentry 标准值 `javascript`。SDK 会结合平台对象、宿主名称、数据路径和 AppID 消除歧义；仅在信息缺失或冲突时手动指定。该选项不切换底层运行时 API。可选 `wechat`、`alipay`、`bytedance`、`qq`、`swan`、`dingtalk`、`kuaishou`；百度使用 `swan` |
| `platform` | 同 `miniappPlatform` | — | 已弃用的兼容别名，请改用 `miniappPlatform`；两者同时传入时后者优先 |

## 采样

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `sampleRate` | `number` | `1.0` | 错误事件采样率（0.0–1.0） |
| `tracesSampleRate` | `number` | 未设 | 性能采样率。API 请求有父级时记为子 span，无父级时默认记为独立 segment span |
| `tracesSampler` | `function` | — | 动态采样回调，按页面 / 场景返回采样率。**设置后 `tracesSampleRate` 被忽略**（优先级更高） |

```js
tracesSampler: ({ attributes, inheritOrSampleWith }) => {
  const route = typeof attributes.route === 'string' ? attributes.route : '';
  if (route.startsWith('pages/pay/')) return 1;   // 支付页面全采
  if (route.startsWith('pages/about/')) return 0.1;
  return inheritOrSampleWith(0.5);               // 其他默认 50%
},
```

自动 HTTP span 会携带请求开始时的 `route` 属性。手动创建业务根 span 时，需要自行提供该属性；请求子 span 沿用父级的采样决定。span 名表示请求或业务操作的名称，不能当作当前页面路径。

> **关于 `http.client` span 名的基数**：API 请求的 span 名形如 `GET https://api.example.com/users/123`。SDK 已自动去掉 query/fragment 与 URL 内的账号密码，但**保留路径**——无法推断 REST 路由模板，强行参数化会误伤合法路径。若路径 id（`/users/123`、`/orders/abc`）导致 tracing 维度过高，可用 `beforeSendSpan` 统一改写 span 名（把数字 / UUID 段替换为 `:id`）。

## 面包屑

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableUserInteractionBreadcrumbs` | `boolean` | `true` | 用户点击 / 触摸面包屑 |
| `enableNavigationBreadcrumbs` | `boolean` | `true` | 页面生命周期 / 路由面包屑 |
| `enableConsoleBreadcrumbs` | `boolean` | `false` | 把 `console` 输出记为面包屑 |
| `enableSystemInfo` | `boolean` | `true` | 采集设备、系统、应用与宿主版本信息；关闭时仍保留平台标识 |
| `traceNetworkBody` | `boolean` | `false` | 网络面包屑中记录请求 / 响应体；体先按敏感键脱敏再按 `maxRequestBodySize` 截断，且仍受 `dataCollection.httpBodies` 约束 |
| `maxRequestBodySize` | `'small' \| 'medium' \| number` | `1 MB` | 单个请求／响应体的字节上限；`small` = 1 KB、`medium` = 10 KB。超出部分截断，体积字段仍表示过滤、截断前的可观察大小 |
| `dataCollection` | `object` | 见下 | SDK 自动采集策略：用户 IP 自动补充、URL query 与请求／响应体方向 |
| `sensitiveKeys` | `string[]` | `[]` | 在默认敏感键名单上追加要过滤的键名片段 |
| `maxBreadcrumbs` | `number` | `100` | 面包屑最大条数 |

> 网络面包屑（`url`/`method`/状态码/耗时）**默认开启**，无需配置。若开启 `traceNetworkBody` 后需要按 URL 排除 body，可在 `beforeBreadcrumb` 里按 `breadcrumb.data.url` 删除 `request_body` / `response_body`，或返回 `null` 丢弃该条面包屑。

通过 `networkBreadcrumbsIntegration({ traceNetworkBody: true, denyBodyUrls: [...] })` 可排除指定 URL 的请求与响应正文。字符串按正则表达式解析；正则保留大小写等匹配选项，但忽略 `g`／`y` 和业务 `lastIndex`，确保重复请求与响应使用一致的排除规则。仅跳过正文，仍可记录 URL、状态与耗时。

## 采集数据的脱敏口径

采集开关控制 SDK 自动观察的数据，不会自动清理业务显式传入的用户、日志、span 属性或事件字段。

| 配置 | 行为 |
| --- | --- |
| `dataCollection.userInfo` | 默认 `true`；设为 `false` 关闭错误事件的后台 IP 自动补充，仍保留显式 `setUser()` 数据 |
| `dataCollection.urlQueryParams` | 默认 `true`；控制 HTTP URL query、页面 `onLoad` 入参、页面不存在报告和小游戏启动 query；`false` 时整块省略 |
| `dataCollection.httpBodies` | 默认允许宿主支持的方向；用数组选择 `outgoingRequest`／`outgoingResponse`，`[]` 禁止正文；还须开启 `traceNetworkBody` 才采集 |
| `dataCollection.httpHeaders`／`cookies` | SDK 不自动采集请求头、响应头或 cookie，因此没有作用对象 |

URL query 与正文使用独立策略。HTTP、导航与资源的名称去掉 query、fragment 和明文账号密码；HTTP `url.full` 可保留经过过滤的 query。User Timing 的名称由业务提供，不按 URL 处理。

键值过滤保留键名，把命中的值替换为 `[Filtered]`。匹配采用大小写不敏感的片段匹配：Core 的 `auth`／`token`／`secret`／`key`／`session`／`cookie` 等名单，加上 SDK 的支付和证件片段。`accessToken` 或 `xApiKey` 也会被命中；`sensitiveKeys` 只追加业务片段，不替换默认名单。

`urlQueryParams` 还接受 `{ allow: ['page', 'source'] }` 或 `{ deny: ['memberNo'] }` 来限制键。`true` 仍执行内置敏感键过滤，不表示发送原始数据。

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  traceNetworkBody: true,
  sensitiveKeys: ['memberNo'],
  dataCollection: { userInfo: false },
});
```

正文只采集可识别的 JSON 对象／数组或 URL-encoded form，先按键过滤再截断。格式根据 Content-Type 和实际内容判断；未知文本、multipart、二进制或无效编码省略正文。Content-Type 只用于识别格式，不写入遥测。

`request_body_size`／`response_body_size` 表示过滤与截断前的可观察 UTF-8 字节数或二进制视图大小，不一定等于网络实际传输大小。过滤不能替代业务自己的数据策略。各类数据的发送前回调见下方[过滤与钩子](#过滤与钩子)。

## Logs

`Sentry.logger.trace/debug/info/warn/error/fatal` 按调用采集并批量发送。用 `beforeSendLog` 修改或返回 `null` 丢弃；SDK 默认不把 console 转成 Logs。

```js
Sentry.logger.info('checkout completed', { orderId: 'order_123' });
```

`Sentry.logger.*` 用于独立业务日志；`enableConsoleBreadcrumbs` 只把 console 输出附在下一次事件上。使用方法见[异常、日志与上下文](/guide/errors-and-context#独立业务日志)。

## Metrics

业务通过 `Sentry.metrics.count/distribution/gauge` 记录指标，Core 负责缓冲与批处理。用 `beforeSendMetric` 修改或返回 `null` 丢弃；不要将订单号等高基数值作为聚合维度。调用示例见[Metrics API](/guide/api#metrics)。

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `beforeSendLog` | `(log) => log \| null` | — | 修改或丢弃独立业务日志 |
| `beforeSendMetric` | `(metric) => metric \| null` | — | 修改或丢弃业务指标 |

## Client reports

`sendClientReports` 默认 `true`，设为 `false` 可关闭上报丢弃统计。报告记录采样、过滤和发送失败等原因，通过同一发送通道交付，不能绕过隐私门禁。发送失败的报告不写入离线缓存。

失败尝试可能随后通过重试送达，因此报告中的 `network_error` 数量不等于最终丢失数量。`flush()` 会尝试排出当前报告；后续产生的丢弃计数留待下一轮。

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
| `options` | `release`、`environment`、采样、Source Map、consent、trace header 等配置摘要 |
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
| `enableOfflineCache` | `boolean` | `true` | 控制未开启 `requireConsent` 时内置 transport 的弱网缓存；自定义 transport 的缓存与重试由其实现负责 |
| `offlineCacheLimit` | `number` | `30` | 未启用 `requireConsent` 时，内置弱网缓存最多保留的 envelope 记录数 |
| `offlineCacheMaxAge` | `number` | `86400000` | 未启用 `requireConsent` 时，内置弱网缓存过期时间（ms），默认 24 小时 |

缓存条数、字节数和 TTL 须为非负安全整数，非法值回落默认；条数／字节上限为 0 时不保留记录，TTL 为 0 时立即过期。

## 隐私同意（同意后上报） {#隐私合规-同意后上报}

开始配置前建议先阅读[用户同意前不发送 Sentry 网络](/guide/reliability-and-privacy#用户同意前不发送-sentry-网络)。

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `requireConsent` | `boolean` | `false` | 开启后，用户同意隐私协议前 SDK 照常采集，但不发送 Sentry 网络请求 |
| `consentCacheLimit` | `number` | `100` | 启用 `requireConsent` 时，授权前后的共享缓存最多保留的 envelope 记录数；满了保留最早记录、丢弃最新记录 |
| `consentCacheMaxBytes` | `number` | `921600`（900 KiB） | 共享缓存的配置字节上限，授权前后均适用；实际取配置值与当前平台 SDK 预算中的较小值，整个容器包含元数据。支付宝／钉钉预算为 180 KiB，其余平台为 900 KiB |
| `consentCacheMaxAge` | `number` | `86400000` | 共享缓存过期时间（ms），授权前后均适用，默认 24 小时 |
| `onConsentCacheDrop` | `function` | — | 共享缓存因 `count` / `bytes` / `age` / `target_changed` / `policy_changed` / `migration_drop` 丢弃已知数量记录时回调 `{ reason, dropped }`；授权后的弱网缓存丢弃也会通知 |

开启 `requireConsent` 后，同意等待与弱网重试始终共用 `consentCache*` 上限和保留最早记录的策略；`setConsent(true)` 不会切换为 `offlineCache*`。条数按 envelope（一次上报批次）计算，一条记录可能包含多条日志、指标或 span，不等于遥测总条数。

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'YOUR_DSN',
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

同意状态属于当前 client，新的 `init({ requireConsent: true })` 默认未同意，不继承旧授权。授权后会尝试发送已准备好的日志、指标和 span，并补发缓存；回前台或网络恢复时也会尝试重放。撤回后排队请求停止启动，在途请求在宿主支持时尝试取消；已传输的字节无法撤回，业务请求不受影响。

开启 `requireConsent` 会使用 `consentCache*` 缓冲，即使 `enableOfflineCache: false`。目标 DSN／tunnel 或不兼容策略变化会丢弃旧记录，容量和 TTL 调整只裁剪兼容记录。撤回或关闭不会自动清空已保存的数据。

缺少同步 Storage 或存储操作失败时，会降级为有界内存，重启后其中的数据会丢失。查看 `getDiagnostics().transport.offlineStore` 的模式与故障代码；`persistent` 只说明存储通道可用，不表示后台已收到。重试、丢弃和自定义 transport 的边界见[可靠上报与隐私同意](/guide/reliability-and-privacy)。

常规接入使用 `Sentry.init()`；直接构造 `MiniappClient` 属于自管发送通道的[高级用法](/guide/api#集成与高级扩展)。

## 可选 Performance 采集 {#显式-performance-采集-2-0}

默认不安装 Performance observer。需要宿主性能条目时，追加 `performanceIntegration()`：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  integrations: [Sentry.performanceIntegration({ enableUserTiming: true })],
});
```

| 工厂选项 | 默认 | 数据 |
| --- | --- | --- |
| `enableNavigation` | `true` | 宿主导航条目 |
| `enableRender` | `true` | 宿主渲染条目 |
| `enableResource` | `true` | 宿主资源条目 |
| `enableUserTiming` | `false` | measure 转 span，mark 记面包屑，不自动读取 detail |

没有 observer 或可信时间基准时，跳过相应测量；相对时间缺少有效 `timeOrigin` 时提示 `performance_time_origin_missing`。HTTP 请求耗时独立采集，不依赖 Performance observer。小游戏 FPS 另需 `enableMinigameFrameRate: true`，一次首帧观察按小游戏能力默认启用。

## 性能数据里的运行环境维度

性能数据使用 attributes，事件的 tags 与一般 context 不会自动变成 span 属性。SDK 补充缺失的稳定环境字段，保留业务显式值：

| 属性 | 含义 |
| --- | --- |
| `miniapp.platform` | 小程序宿主标识 |
| `miniapp.host_version`／`miniapp.host_sdk_version` | 宿主 App／基础库版本 |
| `app.app_version` | 小程序自身版本 |
| `device.manufacturer`／`device.model` | 设备厂商与机型 |
| `os.name`／`os.version`／`os.type` | 操作系统名、版本与类型 |
| `performance.api.available`／`performance.integration` | 性能集成登记的能力 |

宿主缺少字段时省略对应属性；`enableSystemInfo: false` 关闭自动设备、系统与版本采集，平台标识和业务字段保留。

自动 HTTP span 记录请求开始时的 route 和已观测的 network.type。业务 span 需要这些动态维度或据此采样时，在创建时显式提供：

```js
await Sentry.startSpan({
  name: 'checkout',
  attributes: { route: 'pages/checkout', 'network.type': 'wifi' },
}, () => submitOrder());
```

异步父子关联的限制与采样方式见[性能与链路追踪](/guide/performance-and-tracing)。

## 运行环境与自建 Sentry

npm 包的 `engines.node` 声明 SDK 与 Core 的 Node.js 依赖范围；业务构建器还有自己的 Node.js 要求，应同时满足。开发本仓库时使用[开发指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md)列出的工具链版本。Node.js 版本不能当作手机宿主版本要求；实际运行时能力见[跨平台差异与降级](/guide/platform-compatibility)。

自建 Sentry 版本基线、1.x 文档归档和升级步骤集中在[版本选择与迁移](/guide/migration-2.0#version-choice)。

## 分布式追踪

追踪头的用途、域名限制与验证方式见[性能与链路追踪](/guide/performance-and-tracing#串联小程序与服务端)。

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableTracePropagation` | `boolean` | `true` | 是否允许向 `tracePropagationTargets` 匹配的请求注入追踪头（`sentry-trace` / `baggage`，以及可选 `traceparent`）。只控制传播，不关闭本地请求 span |
| `enableStandaloneHttpSpans` | `boolean` | `true` | 无活跃 span 时，把 API 请求作为独立 segment span 上报；设为 `false` 后只保留业务流程内的请求子 span，网络面包屑不受影响 |
| `tracePropagationTargets` | `Array<string｜RegExp>` | `[]`（不注入） | 追踪头的 URL 匹配列表。字符串对完整 URL（含 query）做不区分大小写的包含匹配；限定域名时请使用[锚定正则示例](/guide/performance-and-tracing#串联小程序与服务端)。未配置时不注入 |
| `propagateTraceparent` | `boolean` | `false` | 额外注入 W3C `traceparent` 头，用于和 OpenTelemetry / W3C Trace Context 兼容的后端链路串联 |

## Session 与网络

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableAutoSessionTracking` | `boolean` | `true` | 自动 Session 管理，为 Sentry Release Health 提供会话数据 |
| `enableNetworkStatusMonitoring` | `boolean` | `true` | 实时监控网络状态变化（WiFi/4G/离线） |

## 小游戏

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableMinigameLifecycle` | `boolean` | 小游戏 `true` / 小程序 `false` | SDK 初始化到首次帧回调的等待时间、启动场景、onShow/onHide 面包屑；不包含完整冷启动 |
| `enableMinigameFrameRate` | `boolean` | `false` | 帧率（FPS）/ 卡顿（jank）监控；小程序无全局 rAF，开启也安全 no-op |
| `minigameFrameRateOptions` | `object` | 见下 | 帧率监控细调，仅 `enableMinigameFrameRate` 生效时使用 |

`minigameFrameRateOptions` 子项：`fpsWarningThreshold`（默认 `30`）、`longFrameThresholdMs`（默认 `50`）、`reportInterval`（默认 `10000`）、`maxJankBreadcrumbsPerWindow`（默认 `3`）、`jankLevels`（可选，分级卡顿阈值）。使用方法与数据去向见[小游戏接入与性能](/guide/minigame)。

前三项须为有限正数，可使用小数；0、负数、NaN、Infinity 或非数值回落对应默认值。`maxJankBreadcrumbsPerWindow` 是非负安全整数，0 表示禁用卡顿面包屑，非法值回落默认 3。

`jankLevels` 为 `{ minor?, major?, severe? }`（毫秒，各档全可选）。提供后切换为**分级统计**：每帧卡顿按命中的最高档归类，面包屑带 `jankLevel`，会话汇总包含 `jank.minor` / `jank.major` / `jank.severe` 属性（仅启用的档），总次数为 `jank.count`。不提供时沿用 `longFrameThresholdMs` 单档；两者同时提供时 `jankLevels` 优先。

## 过滤与钩子

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `allowUrls` | `Array<string｜RegExp>` | 空 | 仅上报栈帧匹配这些 URL 的错误 |
| `denyUrls` | `Array<string｜RegExp>` | 空 | 不上报栈帧匹配这些 URL 的错误 |
| `ignoreErrors` | `Array<string｜RegExp>` | 空 | 消息/类型匹配的错误直接丢弃 |
| `attachStacktrace` | `boolean` | `true` | 为无原始堆栈的手动消息或异常值附加捕获位置；切换该选项可能改变事件分组 |
| `beforeSend` | `function` | — | 事件发送前的钩子，可修改或返回 `null` 丢弃 |
| `beforeSendSpan` | `function` | — | 修改流式 span，返回 `StreamedSpanJSON`；常用字段为 `name`、`is_segment` 和 `attributes`。不能返回 `null`，丢弃使用 `ignoreSpans` |
| `ignoreSpans` | `Array<string｜RegExp｜object>` | `[]` | 按名称匹配，或用含 `name`、`op`、`attributes` 的对象过滤；至少指定一项，多项须同时匹配 |
| `traceLifecycle` | `'stream'` | `'stream'` | 流式性能上报；其他值不受支持，会使初始化报错 |
| `beforeBreadcrumb` | `function` | — | 修改面包屑，或返回 `null` 丢弃 |
| `transportOptions` | `object` | 见下 | 内置上报通道选项：请求头、超时和 Sentry 网络并发上限 |
| `transport` | `function` | 内置 | 自定义传输层（高级用法） |

> `allowUrls`／`denyUrls`／`ignoreErrors` 由默认 `EventFilters` 集成实现；关闭或替换默认集合时，需要保留该集成。

`beforeSendSpan` 的属性可以是标量，也可以是带 `value`／`unit` 的值。回调只修改当前 span；迁移旧字段时参见[回调迁移](/guide/migration-2.0#before-send-span)。

```js
Sentry.init({
  dsn: 'YOUR_DSN',
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
- `maxConcurrentRequests`：默认 `2`，限制同时在途的 Sentry 请求。更多请求等待宿主槽位；Core 的有界发送缓冲溢出时会丢弃并记录 `queue_overflow`，不能靠调高此值消除所有排队或丢弃。
- `binaryRequestBody`：`'arraybuffer'` 或 `'unsupported'`。默认微信／抖音使用 ArrayBuffer，其余平台暂按未确认能力拒绝二进制 envelope，诊断提示 `binary_request_unsupported`。确认目标宿主支持后，可显式设为 `'arraybuffer'`。 含附件的混合批次会整体拒绝，不拆分或强转；此类能力错误不进入离线重试。

默认白名单依据[微信](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)和[抖音](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/network/http/tt-request)的请求文档。其他平台未在白名单内不代表一定不支持；应核对小程序／小游戏对应接口，并用目标设备与 Sentry 验证二进制接收。

- `headers`：附加到 envelope 请求的自定义请求头。

通常不建议调大 `requestTimeout` 或 `maxConcurrentRequests`。自建 Sentry 服务响应较慢时，应先检查服务和网络链路；确需调整时，也要在真机上确认业务请求不受影响。

## 集成

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `integrations` | `Integration[]` 或 `function` | — | 数组会追加到默认集合，同名时用户实例优先；函数接收默认集合并返回最终集合，可用于过滤或改写 |
| `defaultIntegrations` | `false｜Integration[]` | 全部内置默认集成 | 设为 `false` 可关闭全部默认集成；自定义数组会替换默认集合基底 |

默认集合包括异常、网络、页面、Session、网络状态、过滤与 Source Map 集成，以及负责性能批量发送的 `SpanStreaming`。部分集成受顶层开关或宿主能力影响，实际列表可通过 `getDiagnostics().integrations` 查看。自定义默认集合时，若要发送 span，须保留 `spanStreamingIntegration()`；缺少时会提示 `span_streaming_missing`。

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
    defaults.filter((integration) => integration.name !== 'NetworkStatus'),
});

// 关闭全部默认集成，只安装显式提供的集成
Sentry.init({
  dsn: 'YOUR_DSN',
  defaultIntegrations: false,
  integrations: [Sentry.Integrations.globalHandlersIntegration()],
});
```

每次 `init()` 都应创建新的有状态 integration 实例。不要跨多次初始化复用
缓存后的 `getDefaultIntegrations()` 结果。使用 named factories，或 `Sentry.Integrations` 中相同的 factories，以便每次初始化取得独立的集成状态。反馈由业务 UI 收集后调用 `captureFeedback()`。

未指定集成时使用默认集合；自定义时可在每次初始化调用 `Sentry.getDefaultIntegrations(options)`。路径工具由 `Sentry.Integrations.normalizeMiniappFrameFilename()` 提供。相关 API 的升级改法见[迁移说明](/guide/migration-2.0)。

交互面包屑只记录必要的目标和处理器标识，不自动复制 `dataset`。业务需要更多信息时，显式提取允许的字段并调用 `addBreadcrumb()`。

## client 关闭与切换 {#_2-0-的-client-关闭与切换契约}

通常在应用入口初始化一次。需要关闭或替换配置时，先停止创建新的业务 trace，再在独立控制流中执行。不要在 `withScope()`、尚未结束的异步 `startSpan()` 或同步采集回调中重新 `init()`；这些初始化返回 `undefined`，并提示 `init_scope_unsupported` 或 `reentrant_init_unsupported`。

| 操作 | 使用方式与结果 |
| --- | --- |
| `flush(timeout?)` | 尝试排出已经接收的数据，SDK 继续工作；适合退后台或一次性测试 |
| `close(timeout?)` | 停止新的业务采集，尝试排出已有数据并释放资源；返回是否完成本次排空 |
| `client.dispose()` | 立即废弃 client，停止发送并解除资源，不生成最后汇总 |
| 再次 `init()` | 退休旧 client，再绑定新实例；旧 SDK 操作的迟到回调不会转交新实例 |

`close()` 的正有限 timeout 是整个收尾的毫秒预算；0 或省略表示等待排空，非法值回落 2000ms。替换旧 client 的内部收尾预算为 2000ms。关闭不会取消业务请求或定时器，也不会清空已有面包屑；需要清空时使用 `getIsolationScope().clearBreadcrumbs()`。

顶层 `Sentry.close()` 完成后会解除它所关闭的当前绑定，`Sentry.getClient()` 返回 `undefined`；若等待关闭期间已经初始化了新 client，新绑定会保留。直接调用实例的 `client.close()` 或 `client.dispose()` 只关闭该实例，不修改当前 Scope 的绑定；不要仅凭 `getClient()` 非空判断实例仍可采集。

自动 Session 按每次前台运行管理；JavaScript 未处理异常记为 `unhandled`，不代表宿主进程崩溃。原会话结束后才完成处理的错误仍可发送，但不会补改已结束会话或记入新会话。统计迁移见[关闭与 Session 统计](/guide/migration-2.0#关闭与-session-统计)。

SDK 能包装 `App()` 时，会在业务同步 `onHide` 返回后收尾并 flush，不等待返回的 Promise。晚初始化或小游戏使用可用的原生 show／hide 监听；缺少任一监听时自动会话降级，需要业务管理边界。业务在异步 hide 回调中产生数据，或依赖原生监听执行顺序时，应在自己的处理器末尾显式调用 `flush()`。

事件 ID、`flush()`／`close()` 返回 `true` 均不代表后台接收确认，也不保证离线缓存全部排空。实际交付须在目标 Sentry 项目核对。资源归属、共享监听和取消的实现原因见[架构文档](https://github.com/lizhiyao/sentry-miniapp/blob/master/ARCHITECTURE.md#5-生命周期与共享宿主观测)。
