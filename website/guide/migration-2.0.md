# 从 1.x 升级到 2.0

2.0 使用 `@sentry/core v11`，部分 API 和默认行为与 1.x 不同。本页先说明如何选择版本，再列出升级所需的代码和配置变更。

## 如何选择版本 {#version-choice}

1.x 是稳定版，2.0 仍处于 beta。使用官方 Sentry SaaS，或达到 Core v11 官方支持基线的自建 Sentry（26.4.2 及以上）时，可以按项目需要选择 v1 或 v2；已稳定运行的 1.x 项目无须为了版本号升级。

| 项目情况 | 建议 |
| --- | --- |
| 已使用 1.x，现有监控满足需要 | 保留已经验收的 1.x 配置和版本 |
| 新项目优先使用稳定版 | 接入 1.x，并使用下方的 1.x 文档归档 |
| 需要 Metrics 或流式性能数据，且可接受 beta 变更 | 先在测试项目试用 2.0，再按本页迁移和验证 |
| 自建 Sentry 低于 26.4.2，暂时不能升级后台 | 继续使用该后台已经验收过的 v1；不能据此保证任意旧后台都兼容 v1 |

错误监控、网络面包屑、离线缓存、Source Map 和链路追踪在 1.x 已有。2.0 可用 Metrics 记录业务计数和数值分布；性能数据采用流式 span，长流程尚未结束时，也能按批次发送已完成的子操作，减少等待整个流程收尾的时间。实际展示与接收仍取决于目标 Sentry 的能力和配置。

Core v11 将自建 Sentry 26.4.2 及以上列为[官方支持范围](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/MIGRATION.md#upgrading-from-10x-to-11x)。更早版本可能部分可用，但不受支持；关闭性能采集也不能保证其与 v2 兼容。sentry-miniapp v2 仅支持流式 span，暂不提供旧 transaction 协议作为兼容选项。

1.x 用户请查阅固定在 `v1.20.4` tag 的 [README](https://github.com/lizhiyao/sentry-miniapp/blob/v1.20.4/README.md)、[官网源码归档](https://github.com/lizhiyao/sentry-miniapp/tree/v1.20.4/website)和[接入指南目录](https://github.com/lizhiyao/sentry-miniapp/tree/v1.20.4/website/guide)。当前官网的接入与配置示例对应 2.0，不应直接用于 1.x；更早的 1.x 变更见归档中的 `migration-1.19.md`。

选定 2.0 后，通过 `npm install sentry-miniapp@next` 试用，或用 `npm install sentry-miniapp@2.0.0-beta.6` 固定版本。默认安装仍获取 1.x 稳定版。升级前先确认实际安装版本。

已使用早期 beta 的项目也应更新：beta.1 修复 `lastEventId()` 未更新的问题；beta.2 起，开启正文采集也会省略无法识别格式的正文；beta.3 修复自定义 transport 忽略超时时，`dispose()` 无法结束正在等待的 `flush()` 的问题。

beta.6 修复会话错误统计的边界问题，以及部分宿主 API 不可读或只读时导致 SDK 初始化失败的问题。

## 试用前需要确认

2.0 仍处于 beta 阶段，API 和行为可能继续调整。不同平台的真机验证尚在进行，建议先在测试项目中接入，并检查：

- 在目标设备上测试切到后台再返回、断网后恢复，以及用户撤回隐私授权后的行为。
- 触发一次业务错误，确认 Sentry 能收到，并显示正确的源码文件和行号。上传的 JS 与 Source Map 必须来自运行中的同一版本构建，见 [Source Map 指南](/guide/sourcemap)。
- 使用性能监控时，确认 Sentry 服务支持 `span/v2`（2.0 使用的性能数据格式），并能显示请求和业务操作的耗时。

遇到问题可按 [beta 真机反馈说明](https://github.com/lizhiyao/sentry-miniapp/issues/457) 提供平台、版本、复现步骤和事件 ID。

## 公共 API 与集成

| 1.x 用法 | 2.0 迁移 |
| --- | --- |
| `new Sentry.Integrations.GlobalHandlers()` 等公共类 | 对应 named factory，如 `Sentry.globalHandlersIntegration()` |
| `System` | 默认 client 环境快照；`enableSystemInfo` 控制自动设备采集 |
| `Router` | Page 生命周期与导航尝试 breadcrumb；不再轮询或自动写 route tag |
| `Sentry.defaultIntegrations` 共享数组 | 省略配置，或每次调用 `getDefaultIntegrations(options)` |
| `showReportDialog()` | 原生反馈表单加 `captureFeedback()` |
| `new Dedupe({ fuzzyMatch: true })` | 官方 `dedupeIntegration()`；删除模糊消息去重 |

`Sentry.Integrations` 保留；集成改用与顶层相同的 factories，内部集成名称用于筛选，并非可构造的公共类。后续版本会保留原有工具出口 `Sentry.Integrations.normalizeMiniappFrameFilename()`；已发布的 beta.6 暂缺该出口，使用它的项目需更新至包含修复的版本后再沿用旧调用。

旧配置中的 `defaultIntegrations: Sentry.defaultIntegrations` 可直接删除，使用默认集合；需要自己选择基底时，改为 `defaultIntegrations: Sentry.getDefaultIntegrations(options)`，不要跨初始化复用返回的实例。

Core v11 已删除 `sendDefaultPii` 和 `enableLogs`。已发布的 beta.6 会忽略这些旧字段，不能依赖它们继续控制采集；后续版本会显式拒绝任何非 `undefined` 的旧值，混合新旧配置同样拒绝。届时 `init()` 会在替换当前 client 之前报迁移错误，直接构造 `MiniappClient` 也会拒绝；值为 `undefined` 等同未配置。按下文改写后应移除旧键。

原 System 独有的存储配额、应用更新信息由业务按实际需要采集。例如微信业务代码显式关联存储信息，不增加 SDK 默认权限调用：

```js
if (typeof wx.getStorageInfoSync === 'function') {
  const { currentSize, limitSize } = wx.getStorageInfoSync();
  Sentry.setContext('storage', { currentSizeKiB: currentSize, limitSizeKiB: limitSize });
}
// 在业务已有的更新检查回调中记录，不由 SDK 额外注册更新监听。
function onBusinessUpdateChecked({ hasUpdate }) {
  Sentry.addBreadcrumb({ category: 'app.update', data: { hasUpdate } });
}
```

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  integrations: [
    Sentry.networkBreadcrumbsIntegration({ sensitiveKeys: ['memberNo'] }),
    Sentry.performanceIntegration({ enableResource: true }),
  ],
});
```

`integrations` 数组追加到默认集合，同名用户实例优先；函数返回最终集合。使用 `defaultIntegrations: false` 时，业务 tracing 必须自行安装 `spanStreamingIntegration()`，SDK 不偷偷装回。

## Stream-only、采样与关联

删除 `traceLifecycle: 'static'`、`beforeSendTransaction`、`ignoreTransactions` 和旧 measurement 双写。JS 显式传 static 在替换当前 client 前报错。使用 `startSpan`／`startInactiveSpan`／`startSpanManual`，数值写 attributes；`beforeSendSpan` 修改名称和属性，`ignoreSpans` 丢弃 span，不返回 null。v1.20.4 未导出 `withStaticSpan`／`withStreamedSpan`，2.0 也不提供这两个辅助 API。

### beforeSendSpan 回调 {#before-send-span}

已有的脱敏或改名回调需要从 `SpanJSON` 改为 `StreamedSpanJSON`，不能继续读写旧字段：

| 1.x 字段 | 2.0 字段 |
| --- | --- |
| `description` | `name` |
| `data` | `attributes` |
| `op` | `attributes['sentry.op']` |
| `timestamp` | `end_timestamp` |

例如，归一化请求名称中的用户 ID，并移除业务自定义的邮箱属性：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  beforeSendSpan: span => {
    if (span.attributes['sentry.op'] === 'http.client') {
      span.name = span.name.replace(/\/users\/[^/]+/g, '/users/:id');
    }
    delete span.attributes['customer.email'];
    return span;
  },
});
```

回调作用于根 span 和子 span，不等待整条流程结束；返回修改后的 span。上表的 `end_timestamp` 是读取结束时间时的新字段，不应为了脱敏改写真实耗时。

### 采样与关联

不再设置 `forceTransaction` 或 `experimental.standalone`。无父 HTTP 默认创建 root／segment；仅采 child 时保留 `enableStandaloneHttpSpans: false`。core 小批发送不等于每次 end 发一个请求，root 未结束也可排 child。

手动 span 不再自动保存 route／network 快照。需要动态维度或据此采样时，在创建时显式提供：

```js
const span = Sentry.startInactiveSpan({
  name: 'checkout.submit',
  op: 'ui.action',
  attributes: { route: 'pages/checkout/index', 'network.type': 'wifi' },
});
// 操作完成后
span.end();
```

自动 HTTP 等 producer 在创建前写动态维度；稳定设备／应用字段只按缺失键补齐，用户值和单位优先。tags／extra 用于错误事件，attributes 用于 spans／Logs／metrics；不要自动复制所有 tags／context。

小程序仅支持一个 `init()` 管理的活动 tracing client，不能隔离任意 Promise／await 并发；不要假定 await 后的并行请求仍绑定各自父 span。重新初始化会停止旧 client 的自动采集，其迟到 SDK 回调不采集新数据；业务 HTTP 不被取消。

初始化配置阶段的 `integrations(defaults)`、`initialScope(scope)` 和 `transport(options)` 回调必须同步完成，且不能留下未结束的临时 `withScope` 或异步 `startSpan` 上下文。异步准备工作应先完成，再调用 `init()`。这项要求限定配置阶段；已绑定 client 的 integration `setup` 可按其生命周期正常创建异步 span。

## Logs、metrics 与 client reports

删除 `enableLogs`：显式 `logger.*` 调用即采集。原 true 直接移除；原 false 如需继续抑制，停止 logger 调用或使用 `beforeSendLog: () => null`。默认不将 console 转成 Logs。

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  beforeSendLog: log => log.level === 'debug' ? null : log,
  sendClientReports: true,
});
Sentry.logger.info('checkout completed', { channel: 'miniapp' });
Sentry.metrics.count('checkout.completed', 1);
```

client reports 默认开启；需要关闭时显式设 `sendClientReports: false`。报告通过同一通道发送，未同意或没有 DSN 时保留丢弃计数，报告失败不会写入离线缓存。`flush()` 后异步产生的丢弃计数留待下一次 `flush()`。

### 隐私配置 {#data-collection-migration}

Core v10 未配置 `sendDefaultPii` 时默认为 `false`；Core v11 删除了这一总开关，`dataCollection.userInfo` 默认是 `true`。原先使用 `sendDefaultPii: false` 时，关闭错误事件后台 IP 自动补充的最小改法是：

```js
// 1.x
Sentry.init({ dsn: 'YOUR_DSN', sendDefaultPii: false });

// 2.0：移除旧键，明确新的采集策略
Sentry.init({ dsn: 'YOUR_DSN', dataCollection: { userInfo: false } });
```

这不等价于旧版的整套隐私策略，也不删除业务显式 `setUser` 的字段。core 的 span／Logs／metrics enrichment 可读取显式 scope user；需要避免发送时，不设置这些字段或在对应 callback 处理。正文仍受 `traceNetworkBody` 闸门控制，默认关闭；启用后再由 `dataCollection.httpBodies` 收窄方向。迁移时应按项目需要确认各项[采集配置](/guide/configuration#采集数据的脱敏口径)，不要只替换键名。

## 自动采集与性能成本

- 不再自动读取交互 dataset，也不复制任意 User Timing detail。需要时由业务白名单构造 breadcrumb，不复制整份模板数据。
- handler／targetId 限 128 个 UTF-16 code units，eventType 限 64 个；坐标仅接受有限数值，业务参数不变。
- query 和 body 使用独立的采集策略；无法识别的纯文本、multipart／binary 默认省略正文，不因解析失败回落原文。
- 通用 Performance 与小游戏 FPS 默认关闭。显式安装 `performanceIntegration()` 或配置 `enableMinigameFrameRate: true`。
- 删除通用 Performance 的 `sampleRate`、`bufferSize`、`reportInterval`、`thresholds`、`enableMemory`；不再做二次 trace 采样、条目聚合和 memory 轮询。FPS 自身的统计窗口参数保留。
- 相对 PerformanceEntry 没有可信 timeOrigin 时省略 span，不伪造发生时间或关联到交付时当前页面。

小游戏首帧改为 `minigame.init_to_first_frame`，耗时属性为 `minigame.init_to_first_frame_ms`、context 为 `initToFirstFrameMs`。它测 SDK 安装至首个 rAF 回调，不是完整冷启动。更新查询和看板；FPS／jank 自定义阈值不代表 Sentry 标准 slow／frozen frames。

## 单目标缓存与同意

2.0 的同意等待与弱网重试共用一个缓存，只向当前 Sentry 目标补发。更换 DSN／tunnel、读取旧格式或使用不兼容的隐私／存储策略时，会丢弃旧数据并记录诊断。只调整条数、字节上限或过期时间时，会裁剪仍兼容的记录。重新初始化的 client 不继承旧授权。

SDK 按实际运行平台限制整个缓存容器，记录与元数据都计入：支付宝／钉钉最多 180 KiB，其余平台最多 900 KiB。`consentCacheMaxBytes` 默认仍为 900 KiB，较小的配置可进一步收窄，详见[跨平台 Storage 差异](/guide/platform-compatibility#storage-与离线缓存)。重试不会延长原过期时间；重放前保存删除失败的记录不会发送，移除成功后中断仍可能丢失数据。缓存只能尽力补发，不能保证不丢失、不重复或后台接收成功。

`requireConsent: true` 会启用同意等待与弱网共享缓存，即使 `enableOfflineCache: false`；授权前后始终使用 `consentCache*`，不会切换为 `offlineCache*`。条数／字节上限为 0 时不缓存，缺少 Storage 时可降级为内存并记录诊断。撤回后排队的 Sentry 请求不会启动，在途请求会在宿主支持时尝试取消；已保存的记录不会自动清空。自定义 transport 的内部队列仍需自行控制实际发送。具体配置见[可靠上报与隐私同意](/guide/reliability-and-privacy)。

直接构造 MiniappClient 是低层 event／feedback 用法，必须提供 transport 和显式 scope；不接管自动 runtime、持久 store 或并行 tracing。默认应用接入迁到 init。

手工调用 `Sentry.Transports.createMiniappOfflineStore(options)` 的高级用法也有变化：2.0 必须提供 `targetId` 和 `policyId`，缺少时会报错。前者须区分完整 Sentry 目标（包括 DSN 与 tunnel），后者须反映实际采集与存储策略；不要用固定常量冒充所有配置相同。这是 SDK 为隔离缓存目标和策略作出的选择。常规接入继续让 `init()` 管理缓存，无需手工构造 store。

## 关闭与 Session 统计

`dispose()` 会中断本 SDK 所有等待中的 `flush()`，返回 false；即使自定义 transport 忽略 timeout，迟到结果也不会覆盖该返回值。每次 flush 只触发一次 core flush hook。

`close(正有限 timeout)` 使用总预算；0／undefined 等待排空。init 替换内部预算为 2000ms，不改变公共 close。hide 尝试同步排 buffer，只有空闲槽与同步 hooks 才能在返回前启动 request／storage；冻结后 timer 不执行，不能承诺全部送达。业务异步 hide 之后产生的数据需要显式 flush。

`close()` 开始后不再接收新的业务 capture 调用；已经进入 core 处理队列的数据仍可继续排出，SDK 的同步收尾步骤可以生成最后一份汇总。`dispose()` 后再捕获不会执行事件处理器或 `beforeSend`，返回的事件 ID 也不代表成功上报。

Session 按每次前台运行管理，JS 未处理异常从 crashed 改为 unhandled，不证明宿主进程崩溃。迁移 Release Health 分母、status 过滤与告警，重新建立统计基线，不直接比较 1.x crash-free 曲线。如果异步事件处理在原会话退出后才完成，错误事件仍按配置发送，但不再计入已退出会话的错误统计，也不记入后来开始的新会话。

## 上线前验证

上线前，按项目启用的功能，在目标小程序／小游戏和自己的 Sentry 项目中分别确认错误、性能、Logs、Metrics、会话统计与上报丢弃统计。开发者工具或本地测试通过，不能代替真机前后台恢复和后台实际接收结果。上传同一次构建的 JS 与 map，确认新错误能还原到业务源码；使用 Debug ID 时，还需核对事件与上传文件的 ID 一致。参考 [Source Map 进阶](/guide/sourcemap-advanced)。

参与 SDK 开发或升级 core 依赖时，请阅读仓库的[开发指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md#core-扩展边界与升级审查)。
