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
| `enableSystemInfo` | `boolean` | `true` | 采集设备 / 系统信息作为 context |
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
- **作用范围**：请求 / 响应体（JSON 会递归到嵌套对象与数组，form 保留重复键及非敏感字段编码）、页面 `onLoad` 入参、默认 pageNotFound 与小游戏启动 query、用户交互的 `dataset`、HTTP URL query。
- **追加自己的片段**：顶层 `sensitiveKeys` 选项是**在以上名单之上追加**，不再顶掉内置默认；手动配置 `NetworkBreadcrumbs` 时也可在其工厂选项里追加：

```js
Sentry.init({
  traceNetworkBody: true,
  sensitiveKeys: ['memberNo'],
});
```

> 页面入参与 URL query 受 `dataCollection.urlQueryParams` 控制：`false` 时整块不采（面包屑里不出现 `query` / `url.query`），`{ deny: [...] }` / `{ allow: [...] }` 按名单收窄。

JSON 与 form 正文脱敏独立于 query 策略，关闭 query 不会放过正文中的敏感值。form 键无法安全解码时正文置空，原始字节数仍记录；getter 等宿主数据读取失败时省略对应键值采集。1.x 仍保留未知纯文本正文的原有采集行为，不能将敏感键过滤视为任意正文的隐私保证。

SDK 自动产生的 HTTP、navigation/resource URL 名称去掉 query、fragment，并过滤明文 userinfo；HTTP `url.full` 可保留经过过滤的 query。User Timing 的业务名称不按 URL 处理。缺原生 `URLSearchParams` 的宿主使用 form 编码 polyfill，坏百分号不会抛错，非法 UTF-8 与孤立 surrogate 使用替换字符；SDK 自采 query 遇到不能安全解码的键时直接省略 query。

## Logs

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableLogs` | `boolean` | `false` | 启用 `Sentry.logger.trace/debug/info/warn/error/fatal` 上报 Sentry Logs |
| `beforeSendLog` | `function` | — | Log 发送前的钩子，可修改或返回 `null` 丢弃 |

```js
Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
  enableLogs: true,
});

Sentry.logger.info('checkout completed', {
  orderId: 'order_123',
});
```

`Sentry.logger.*` 会作为独立 log envelope 发送到 Sentry Logs；`enableConsoleBreadcrumbs` 只会把 `console` 输出记录为随下一次事件发送的面包屑，两者用途不同。

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

SDK 的缓存条数、字节数、TTL 与性能 buffer/report interval 使用非负安全整数；负数、NaN、Infinity 和小数回落各自默认值。缓存条数／字节上限为 0 时不保留事件，TTL 为 0 时立即过期。通用 Performance 的 `bufferSize: 0` 不保留统计条目，`reportInterval: 0` 关闭周期汇总；timer 间隔还受 JavaScript timer 上限约束。这些校验不改变 core 的 `sampleRate`、`tracesSampleRate` 或 `tracesSampler` 决策。

## 隐私合规（同意后上报）

开始配置前建议先阅读[用户同意前不发送 Sentry 网络](/guide/reliability-and-privacy#用户同意前不发送-sentry-网络)。

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `requireConsent` | `boolean` | `false` | 开启后，用户同意隐私协议前 SDK 照常采集，但不发送任何网络请求 |
| `consentCacheLimit` | `number` | `100` | 同意前缓冲最大事件数；满了保留最早的冷启动数据、丢弃最新事件 |
| `consentCacheMaxBytes` | `number` | `921600` | 同意前缓冲最大字节数；受小程序单 key Storage 约 1MB 限制，默认约 900KB |
| `consentCacheMaxAge` | `number` | `86400000` | 同意前缓冲过期时间（ms），默认 24 小时 |
| `onConsentCacheDrop` | `function` | — | 同意缓冲因 `count` / `bytes` / `age` 丢弃事件时回调 `{ reason, dropped }` |

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

`requireConsent: true` 会隐含启用本地缓冲：即便 `enableOfflineCache: false`，同意前事件仍会先写入小程序 Storage；如果传入自定义 `transport`，SDK 也会先用 consent 门禁包住它。当前版本使用单 key 存储，同意缓冲与弱网重试复用 `sentry_offline_store`，因此 `consentCacheMaxBytes` 实际建议不超过默认约 900KB；如需突破单 key 上限，需要未来改为分片存储。

## 性能数据里的运行环境维度

core 11 的 span 只携带 attributes：事件上的 `tags` 不会进 span，`contexts` 也只有 `response` /
`profile` / `culture` 等白名单会被映射。SDK 因此在**每个 span 结束进入处理阶段时**，按所属 client 补齐自动采集的运行环境维度，
Performance / Traces 可以直接按这些键筛选（键名沿用 `@sentry/conventions` 的 OTel 语义）：

| 属性 | 含义 |
|------|------|
| `miniapp.platform` | 小程序宿主标识（`wechat` / `alipay` / `bytedance` 等） |
| `miniapp.host_version` | 宿主 App 版本（微信 / 抖音自身版本） |
| `app.app_version` | 小程序自身版本 |
| `device.manufacturer` / `device.model` | 设备厂商与机型 |
| `os.name` / `os.version` / `os.type` | 系统名、系统版本、系统类型（如 `iOS` / `17.4` / `ios`） |
| `network.type` | 当前网络类型 |
| `route` | 当前页面路径 |
| `performance.api.available` / `performance.integration` | 宿主性能 API 与集成可用性 |

宿主版本与小程序版本是两个独立的键。事件侧 `contexts.os` 沿用宿主信息、`os.version` 取的是宿主
版本，而 span 侧的 `os.version` 按 OTel 语义是系统版本——按 `os.*` 筛选 span 时以本表为准。

其余说明：

- 维度属于「哪个 client 在采集」：多个 client 重叠时各自携带自己的平台标记与采集开关，`enableSystemInfo: false` 的那一路不会拿到别的 client 的设备信息。
- `route` 取 `getCurrentPages()` 页面栈栈顶，随每次 span 实时计算；业务没有定义 `onShow` 时，`navigateBack` 之后也不会停留在旧页面。小游戏没有 `getCurrentPages()`，因此不写 `route`。
- `network.type`、`performance.api.available`、`performance.integration` 由各集成登记到所属 client。
- 用户或集成已经写过的同名属性一律保留，SDK 只填空缺。
- `enableSystemInfo: false` 时只保留 `miniapp.platform` 与 `route`，设备与系统维度不采集。

## 运行环境与自建 Sentry

- 构建与测试环境要求 Node.js ≥ 20.19（与 core 11 的最低要求一致）。
- core 11 要求自建 Sentry **26.4.2 及以上**。**不要**把 `traceLifecycle: 'static'` 当作旧版本的兼容
  方案：实测在 static 下独立 HTTP span 仍按 `span/v2`（`content_type:
  application/vnd.sentry.items.span.v2+json`）发送，切换只改变事务与发送时机，不会退回旧 envelope
  格式。低于该版本请留在使用 core 10 的 sentry-miniapp 1.20.x，或先升级自建服务。
- `traceLifecycle: 'static'` 只用于保留旧事务语义（`beforeSendTransaction` / `ignoreTransactions`
  生效）；此模式下 `beforeSendSpan` 必须用 `withStaticSpan()` 包装，否则 core 会跳过该回调。

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
| `enableMinigameFrameRate` | `boolean` | 小游戏 `true` / 小程序 `false` | 帧率（FPS）/ 卡顿（jank）监控；小程序无全局 rAF，开启也安全 no-op |
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
| `beforeSendTransaction` | `function` | — | **core 11 下失效**：默认 span 生命周期不再产出 transaction 事件，请改用 `beforeSendSpan` / `ignoreSpans`。仅在显式设置 `traceLifecycle: 'static'` 时生效 |
| `beforeSendSpan` | `function` | — | Span 发送前的钩子，收到 `StreamedSpanJSON`（`name` / `is_segment` / `attributes`）。此处 `attributes` 的值是**原始值**（如 `'POST'`、`201`）；`{type, value}` 注解只在序列化后的 envelope 里才加上，按注解写法改值会静默失效。独立 segment span 也经过该钩子 |
| `ignoreSpans` | `Array<string｜RegExp>` | 空 | 按 span 名丢弃 span，替代 core 10 的 `ignoreTransactions` |
| `traceLifecycle` | `'static'｜'stream'` | `'stream'` | `@sentry/core` 11 的 span 生命周期，SDK 原样透传。`'stream'` 按 trace 分批发 span、无 transaction 事件；`'static'` 为 core 保留的旧事务模型（`beforeSendTransaction` / `ignoreTransactions` 仅在此模式下有效），core 计划在后续大版本移除 |
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
- `headers`：附加到 envelope 请求的自定义请求头。

通常不建议调大 `requestTimeout` 或 `maxConcurrentRequests`。自建 Sentry 服务响应较慢时，应先检查服务和网络链路；确需调整时，也要在真机上确认业务请求不受影响。

## 集成

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `integrations` | `Integration[]｜(defaults) => Integration[]` | — | 数组会追加到默认集合，同名时用户实例优先；函数接收默认集合并返回最终集合，可用于过滤或改写 |
| `defaultIntegrations` | `false｜Integration[]` | 全部内置默认集成 | 设为 `false` 可关闭全部默认集成；自定义数组会替换默认集合基底 |

默认集成包含 `FunctionToString`、`HttpContext`、`GlobalHandlers`、`TryCatch`、`LinkedErrors`、`Dedupe`、**`SpanStreaming`**、`PerformanceAPI`、`RewriteFrames`、`NetworkBreadcrumbs`、`Session`、`PageBreadcrumbs`、`NetworkStatus` 和 `EventFilters`（部分受顶层开关或运行时影响）。`Dedupe` / `LinkedErrors` / `RewriteFrames` / `FunctionToString` / `SpanStreaming` 直接复用 `@sentry/core` 官方实现。自定义 `defaultIntegrations` 时漏掉 `SpanStreaming` 会让业务 trace、导航与帧率汇总等非独立 span 一条都发不出去，`getDiagnostics()` 会给出 `span_streaming_missing` 警告。所有默认能力统一由 `getDefaultIntegrations(options)` 构造，不存在绕过 `defaultIntegrations` 的额外追加。

```js
// 在默认集合上追加；同名集成会覆盖默认实例
Sentry.init({
  dsn: 'YOUR_DSN',
  integrations: [new Sentry.Integrations.ConsoleBreadcrumbs()],
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
`defaultIntegrations` 静态数组或缓存后的 `getDefaultIntegrations()` 结果；静态数组仅为 1.x
兼容保留且已弃用。
