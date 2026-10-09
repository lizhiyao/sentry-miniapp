# 从 1.x 升级到 2.0

2.0 使用 `@sentry/core v11`，部分 API 和默认行为与 1.x 不同。本页说明需要修改的代码和配置；1.x 历史行为见[1.19 迁移记录](/guide/migration-1.19)。

通过 `npm install sentry-miniapp@next` 试用，或用 `npm install sentry-miniapp@2.0.0-beta.3` 固定版本。默认安装仍获取 1.x 稳定版。升级前先确认实际安装版本。

已使用早期 beta 的项目也应更新：beta.1 修复 `lastEventId()` 未更新的问题；beta.2 起，开启正文采集也会省略无法识别格式的正文；beta.3 修复自定义 transport 忽略超时时，`dispose()` 无法结束正在等待的 `flush()` 的问题。

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

`Sentry.Integrations` 保留，但只重导出与顶层相同的 factories，没有第二套实现。内部集成名称用于筛选，并非可构造的公共类。

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

删除 `traceLifecycle: 'static'`、`beforeSendTransaction`、`ignoreTransactions`、`withStaticSpan`／`withStreamedSpan` 和旧 measurement 双写。JS 显式传 static 在替换当前 runtime 前报错。使用 `startSpan`／`startInactiveSpan`／`startSpanManual`，数值写 attributes；`beforeSendSpan` 修改名称和属性，`ignoreSpans` 丢弃 span，不返回 null。

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

小程序仅支持一个 init 管理的活动 tracing client。stack strategy 不能隔离任意 Promise／await 并发，SDK owner 的 `withScope` 范围保持同步；不要承诺 await 后的并行请求仍绑定各自父 span。init 替换先退休旧 runtime，其迟到 SDK 回调不采集新数据；业务 HTTP 不被取消。

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

client reports 默认开启；需要关闭时显式设 false。报告通过同一 transport 发送，未同意／无 DSN 不清 outcomes，报告失败不入离线磁盘。flush 后异步产生的新 drop 留待下一次 flush。报告通过公开 recorder／envelope API 实现，不依赖 core 的内部 outcomes 容器。

`dataCollection.userInfo: false` 不删除业务显式 `setUser` 的所有传播。core 的 span／Logs／metrics enrichment 可读取显式 scope user；需要避免发送时，不设置这些字段或在对应 callback 处理。

## 自动采集与性能成本

- 不再自动读取交互 dataset，也不复制任意 User Timing detail。需要时由业务白名单构造 breadcrumb，不复制整份模板数据。
- handler／targetId 限 128 个 UTF-16 code units，eventType 限 64 个；坐标仅接受有限数值，业务参数不变。
- query 和 body 分别受 typed collector 控制；未知 plaintext、multipart／binary 默认省略正文，不因解析失败回落原文。
- 通用 Performance 与小游戏 FPS 默认关闭。显式安装 `performanceIntegration()` 或配置 `enableMinigameFrameRate: true`。
- 删除通用 Performance 的 `sampleRate`、`bufferSize`、`reportInterval`、`thresholds`、`enableMemory`；不再做二次 trace 采样、条目聚合和 memory 轮询。FPS 自身的统计窗口参数保留。
- 相对 PerformanceEntry 没有可信 timeOrigin 时省略 span，不伪造发生时间或关联到交付时当前页面。

小游戏首帧改为 `minigame.init_to_first_frame`，耗时属性为 `minigame.init_to_first_frame_ms`、context 为 `initToFirstFrameMs`。它测 SDK 安装至首个 rAF 回调，不是完整冷启动。更新查询和看板；FPS／jank 自定义阈值不代表 Sentry 标准 slow／frozen frames。

## 单目标缓存与同意

2.0 只有一层官方 offline 管道和一个活动持久投递目标。旧格式、DSN／tunnel 目标或不兼容隐私／存储策略变化时丢弃并诊断，不能跨目标补发。count／bytes／TTL 调整仅裁剪，不整批删兼容数据；同目标新 client 不继承旧 grant。

SDK 按实际运行平台限制整个缓存容器，记录与元数据都计入：支付宝／钉钉最多 180 KiB，其余平台最多 900 KiB。`consentCacheMaxBytes` 默认仍为 900 KiB，较小的配置可进一步收窄，详见[跨平台 Storage 差异](/guide/platform-compatibility#storage-与离线缓存)。typed codec 保留 binary／子视图；retry 不刷新原 TTL。shift 必须持久提交删除后才交给 transport：提交失败不发送；退休 owner 在途失败不得覆盖新 owner store。缓存是 best-effort，不承诺 durable ACK、恰好一次或绝不丢失。

`requireConsent: true` 保留同意前缓存含义，即使 enableOfflineCache=false；count／bytes=0 则不缓存，缺 Storage 可内存降级并诊断。撤回后排队请求不得启动，已经在途请求在宿主支持时 abort。第三方 transport 私有队列仍需自己的实际发送门。

直接构造 MiniappClient 是低层 event／feedback 用法，必须提供 transport 和显式 scope；不接管自动 runtime、持久 store 或并行 tracing。默认应用接入迁到 init。

## 关闭与 Session 统计

`dispose()` 会中断本 SDK 所有等待中的 `flush()`，返回 false；即使自定义 transport 忽略 timeout，迟到结果也不会覆盖该返回值。每次 flush 只触发一次 core flush hook。

`close(正有限 timeout)` 使用总预算；0／undefined 等待排空。init 替换内部预算为 2000ms，不改变公共 close。hide 尝试同步排 buffer，只有空闲槽与同步 hooks 才能在返回前启动 request／storage；冻结后 timer 不执行，不能承诺全部送达。业务异步 hide 之后产生的数据需要显式 flush。

`close()` 开始后不再接收新的业务 capture 调用；已经进入 core 处理队列的数据仍可继续排出，SDK 的同步收尾步骤可以生成最后一份汇总。`dispose()` 后再捕获不会执行事件处理器或 `beforeSend`，返回的事件 ID 也不代表成功上报。

Session 按每次前台运行管理，JS 未处理异常从 crashed 改为 unhandled，不证明宿主进程崩溃。迁移 Release Health 分母、status 过滤与告警，重新建立统计基线，不直接比较 1.x crash-free 曲线。如果异步事件处理在原会话退出后才完成，错误事件仍按配置发送，但不再计入已退出会话的错误统计，也不记入后来开始的新会话。

## 验收与后续 core 升级

当前 core 版本在 `package.json` 中精确固定，并用 real-core 回归验证契约；后续升级先检查 sampling／DSC、buffers、dataCollection 与集中 protected／internal 依赖的源码变化，再跑同一契约矩阵，不放宽 pin 来替代验证。

公共 capture 入口固定当前 scope 与 Session 归属，保留原 isolation scope 给 core 更新 `lastEventId()`。Session 引用仅在 hint 与 client 自有 WeakMap 中传递，不写入事件 payload；processor／`beforeSend` 替换事件时仍保持归属，采集时没有 Session 的错误也不会计入后来启动的前台 episode。Debug ID 宿主同步通过公开 `preprocessEvent` hook 执行，不覆写 `_prepareEvent`／`_processEvent`。仍保留两个窄 protected 适配：Session 更新时选择捕获的引用并委托 core，以及 dispose 后停止 processing 等待。它们的升级审查与回归要求见仓库 `DEVELOPMENT.md`。

上线前分别验证最终 envelopes、真实宿主和目标 Sentry 后台：span/v2、Logs、metrics、session、client_report 与符号化都要有对应版本和配置。mock／VM 不证明真机冻结或后台功能可用。JS 与 map 来自同一次构建，Debug ID 与实际 frame／artifact 匹配；参考 [Source Map 进阶](/guide/sourcemap-advanced)。
