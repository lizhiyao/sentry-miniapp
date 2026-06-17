# 配置项参考

`Sentry.init({ ... })` 支持的全部选项。**通常只需 `dsn` + `release` 即可上手**（见[快速接入](/guide/getting-started)），下面是完整清单，按需取用。

## 基础

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `dsn` | `string` | — | Sentry DSN（必填，否则不上报） |
| `release` | `string` | — | 版本号；**Source Map 解析的关键**，需与上传时的 release 完全一致 |
| `environment` | `string` | — | 环境标识，如 `production` / `staging` |
| `debug` | `boolean` | `false` | 开启 SDK 调试日志 |
| `platform` | `'wechat'｜'alipay'｜'bytedance'｜'qq'｜'baidu'｜'swan'｜'dingtalk'｜'kuaishou'` | 自动识别 | 事件上标注的平台；运行时平台 SDK 会自动检测，一般无需手动设 |

## 采样

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `sampleRate` | `number` | `1.0` | 错误事件采样率（0.0–1.0） |
| `tracesSampleRate` | `number` | 未设 | 性能采样率；**开启后** API 请求作为 `http.client` span 上报。不设则不采集性能 |
| `tracesSampler` | `function` | — | 动态采样回调，按页面 / 场景返回采样率。**设置后 `tracesSampleRate` 被忽略**（优先级更高） |

```js
tracesSampler: ({ name, inheritOrSampleWith }) => {
  if (name.includes('pages/pay')) return 1;   // 关键页全采
  if (name.includes('pages/about')) return 0.1;
  return inheritOrSampleWith(0.5);             // 其他默认 50%
},
```

## 面包屑

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableUserInteractionBreadcrumbs` | `boolean` | `true` | 用户点击 / 触摸面包屑 |
| `enableNavigationBreadcrumbs` | `boolean` | `true` | 页面生命周期 / 路由面包屑 |
| `enableConsoleBreadcrumbs` | `boolean` | `false` | 把 `console` 输出记为面包屑 |
| `enableSystemInfo` | `boolean` | `true` | 采集设备 / 系统信息作为 context |
| `traceNetworkBody` | `boolean` | `false` | 网络面包屑中记录请求 / 响应体（内置敏感字段脱敏） |
| `maxBreadcrumbs` | `number` | `100` | 面包屑最大条数 |

> 网络面包屑（`url`/`method`/状态码/耗时）**默认开启**，无需配置。若开启 `traceNetworkBody` 后需要按 URL 排除 body，可在 `beforeBreadcrumb` 里按 `breadcrumb.data.url` 删除 `request_body` / `response_body`，或返回 `null` 丢弃该条面包屑。

## Source Map

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableSourceMap` | `boolean` | `true` | 自动将各平台虚拟堆栈路径归一化为 `app:///` 前缀。详见 [Source Map 配置](/guide/sourcemap) |

## 离线缓存（弱网可靠性）

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableOfflineCache` | `boolean` | `true` | 断网 / 发送失败时缓存事件到本地 Storage，网络恢复后静默重试 |
| `offlineCacheLimit` | `number` | `30` | 离线缓存最大事件数 |
| `offlineCacheMaxAge` | `number` | `86400000` | 缓存过期时间（ms），默认 24 小时，超时丢弃 |

## 分布式追踪

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enableTracePropagation` | `boolean` | `true` | 是否注入 `sentry-trace` / `baggage` 头。只控制传播，不关闭本地 API 请求 span |
| `tracePropagationTargets` | `Array<string｜RegExp>` | 空（全部注入） | 仅匹配的请求才注入追踪头；为空则对所有非 Sentry 请求注入 |

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

`minigameFrameRateOptions` 子项：`fpsWarningThreshold`（默认 `30`）、`longFrameThresholdMs`（默认 `50`）、`reportInterval`（默认 `10000`）、`maxJankBreadcrumbsPerWindow`（默认 `3`）、`jankLevels`（可选，分级卡顿阈值）。详见 [支持平台与能力](/guide/platforms)。

`jankLevels` 为 `{ minor?, major?, severe? }`（毫秒，各档全可选）。提供后切换为**分级统计**：每帧卡顿按命中的最高档归类，面包屑带 `jankLevel`，会话汇总额外增发 `jank_minor_count` / `jank_major_count` / `jank_severe_count`（仅启用的档）。不提供时沿用 `longFrameThresholdMs` 单档，行为与历史完全一致；两者同时提供时 `jankLevels` 优先。

## 过滤与钩子

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `allowUrls` | `Array<string｜RegExp>` | 空 | 仅上报栈帧匹配这些 URL 的错误 |
| `denyUrls` | `Array<string｜RegExp>` | 空 | 不上报栈帧匹配这些 URL 的错误 |
| `ignoreErrors` | `Array<string｜RegExp>` | 空 | 消息/类型匹配的错误直接丢弃 |
| `beforeSend` | `function` | — | 事件发送前的钩子，可修改或返回 `null` 丢弃 |
| `beforeBreadcrumb` | `function` | — | 面包屑记录前的钩子 |
| `transport` | `function` | 内置 | 自定义传输层（高级用法） |

> `allowUrls` / `denyUrls` / `ignoreErrors` 由内置的 `EventFilters` 集成实现，`init` 时自动装配（若你在 `integrations` 里已自带 `EventFilters` / `InboundFilters`，则不重复追加）。

## 集成

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `integrations` | `Integration[]` | 默认核心集成 | **传入会替换核心默认集成**（如 `GlobalHandlers` / `TryCatch` / `PerformanceIntegration`）。通常无需设置；如需在默认之上追加，用 `[...Sentry.getDefaultIntegrations(), new Sentry.Integrations.XXX()]` |
| `defaultIntegrations` | `Integration[]` | 内置 | 底层兼容字段；`sentry-miniapp` 会在 `init` 时显式组装集成，业务自定义请优先使用 `integrations` |

> 默认初始化路径已含：自动异常捕获、性能监控、Source Map 路径归一化、网络面包屑、Session 与网络状态监控。其中 Source Map / 网络 / Session / 页面面包屑 / 网络状态等集成会根据顶层开关在 `init` 时追加。
