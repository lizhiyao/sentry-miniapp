# 性能与链路追踪

性能监控回答“哪里慢”，链路追踪回答“一次请求在小程序和服务端分别花了多久”。两者共用 trace，但不是同一件事。

## 先开启性能采样

设置 `tracesSampleRate` 或 `tracesSampler` 后，SDK 按采样决定发送性能 span：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  release: 'my-miniapp@1.0.0',
  tracesSampleRate: 0.2,
});
```

`0.2` 表示约 20% 的 trace 被采样。测试环境可临时使用 `1.0`，生产环境应结合流量和 Sentry 配额设置。

错误事件由 `sampleRate` 控制，性能数据由 `tracesSampleRate` 或 `tracesSampler` 控制，两套采样互不替代。

## 按页面或场景动态采样

关键链路全采、普通页面降采时使用 `tracesSampler`：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampler: ({ attributes, inheritOrSampleWith }) => {
    const route = typeof attributes.route === 'string' ? attributes.route : '';
    if (route.startsWith('pages/pay/')) return 1;
    if (route.startsWith('pages/about/')) return 0.05;
    return inheritOrSampleWith(0.2);
  },
});
```

设置 `tracesSampler` 后，它的优先级高于 `tracesSampleRate`。

这里按 `attributes.route` 判断页面，而不是按请求名称判断。自动 HTTP span 会携带请求开始时的页面路径；手动业务根 span 需要自己传入 `route`。请求子 span 继承父级的采样决定，页面条件不会单独改变已有流程内某个请求的采样。

## 自动采集哪些性能数据

默认网络集成采集 API 请求；通用 Performance observer 和 FPS 循环默认关闭。需要宿主性能条目时显式安装：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  integrations: [Sentry.performanceIntegration({ enableUserTiming: true })],
});
```

显式启用后的能力与边界：

| 数据 | 在 Sentry 中的用途 |
|------|--------------------|
| navigation 条目 | 真实宿主 operation；不能将 SDK 安装到首帧视为完整冷启动 |
| render 条目 | 实际渲染 operation，不猜测来自 `setData` |
| 资源加载 | 定位大资源或慢资源 |
| API 请求 | 包裹平台 `request`，作为 `http.client` span 查看请求耗时 |
| 小游戏首帧等待时间 | 测量 SDK 初始化到首次帧回调的耗时，帮助观察初始化阶段的等待时间 |
| 小游戏帧率与卡顿（需手动开启） | 查看平均帧率和卡顿次数，帮助定位运行不流畅的问题 |

平台未提供 `createObserver` 或可靠的性能时间戳时，SDK 会跳过无法测量的导航、渲染和资源数据。排查时可调用 `Sentry.getPerformanceManager()`，检查返回对象的 `createObserver` 和 `timeOrigin`。API 请求耗时由网络集成采集，**不依赖 PerformanceObserver**。

如果宿主性能监听注册失败，SDK 会停用该监听，独立的错误上报和 API 请求监控仍可继续。控制台不可用也不会阻断这一降级过程。

微信／抖音小游戏默认测量 SDK 初始化到首次帧回调的等待时间。这段时间不包含 SDK 初始化前的启动过程，也不代表画面已完成呈现，因此不能当作完整冷启动耗时。帧率（FPS）和卡顿统计默认关闭，配置 `enableMinigameFrameRate: true` 后开启；数据查看方式见[小游戏接入与性能](/guide/minigame)。

微信的 `wx.reportPerformance()` 属于小程序后台的自定义测速能力，不是 Sentry 性能监控的一部分；如需使用，请先在微信后台配置指标，再由业务代码主动调用。

## 添加业务 span

需要测量登录、支付、数据转换等业务操作时，可以使用熟悉的 Sentry API：

```js
await Sentry.startSpan(
  {
    name: 'checkout.submit',
    op: 'ui.action',
    attributes: { paymentMethod: 'balance' },
  },
  async () => {
    await submitOrder();
  },
);
```

`startSpan` 会在回调结束时自动结束 span；只有需要跨生命周期手动结束时才使用 `startInactiveSpan()`。需要页面或网络维度时，在创建业务 span 时显式提供 attributes。

小程序仅支持一个当前使用的 tracing client。多个任务并行跨越 `await` 时，不能保证后续请求仍关联各自原来的父 span。跨定时器的同步工作可用 `withActiveSpan(parent, callback)` 显式关联，具体示例见[uni-app 工程](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/uniapp)。

## 串联小程序与服务端

开启 tracing 后，SDK 可向 `tracePropagationTargets` 明确匹配的请求注入：

- `sentry-trace`：trace id、span id 与采样状态；
- `baggage`：Sentry Dynamic Sampling Context；
- `traceparent`：仅在 `propagateTraceparent: true` 时额外注入，用于兼容 W3C Trace Context / OpenTelemetry 后端。

小程序没有浏览器可靠的 same-origin 基准，因此 `tracePropagationTargets` 默认为空时**不注入任何追踪头**。只把自己控制的 API 域名加入白名单：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  tracePropagationTargets: [
    /^https:\/\/api\.example\.com\//,
    /^https:\/\/gateway\.example\.com\//,
  ],
  propagateTraceparent: true,
});
```

只有后端网关或 OpenTelemetry 链路明确需要 W3C `traceparent` 时才打开 `propagateTraceparent`。Sentry 原生服务只需要默认的 `sentry-trace` 与 `baggage`。

如果请求已手动设置 `sentry-trace` 或 `traceparent`（头名不区分大小写），SDK 会保留整组请求头，由调用方负责与 `baggage` 的一致性。SDK 继续记录本地请求 span 和面包屑；希望由 SDK 自动串联服务端时，请让 SDK 生成这些追踪头。

字符串匹配的是完整 URL 中的子串，包括 query，并不是精确域名匹配。上面的锚定正则可避免第三方域名或查询参数包含相同文本时也收到追踪头。

`enableTracePropagation: false` 只停止追踪头注入，不会关闭本地 `http.client` span。开启性能采样后：

- 请求发生在活跃 span 内时，记录为该流程的子 span；
- 没有活跃 span 时，默认发送为独立 segment span，因此长时间运行、没有业务 trace 的小游戏也不会丢失请求性能；
- 独立 segment 是原生 span envelope，不会为每个请求制造一条根 transaction。若只想保留业务流程内的请求子 span，可设置 `enableStandaloneHttpSpans: false`。

用 `ignoreSpans` 过滤 HTTP 子 span 时，请求仍可沿用活跃父 span 的追踪头，保持服务端链路关联；它不会因此停止追踪头传播。需要停止传播时使用 `enableTracePropagation: false` 或收窄 `tracePropagationTargets`。

需要把一组请求和业务操作组织成同一条完整流程时，仍应使用 `Sentry.startSpan()` 包住该流程。

## 请求名称基数

请求 span 名会保留 URL 路径，例如 `GET https://api.example.com/users/123`。如果路径中的订单号、用户 id 导致维度过高，可在 `beforeSendSpan` 中把动态段统一改为 `:id`。SDK 不会自行猜测路由模板，避免误改合法路径。

```js
Sentry.init({
  beforeSendSpan(span) {
    // 同时处理独立请求和业务流程内的请求子 span。
    if (span.attributes['sentry.op'] === 'http.client') {
      span.name = span.name.replace(/\/\d+(?=\/|$)/g, '/:id');
    }
    return span;
  },
});
```

## 流式性能数据 {#core-11-的-span-streaming-升级须知}

SDK 使用流式 span 上报性能数据。已经结束的子操作可在根流程结束前分批发送，避免长流程一直占用本地缓冲、必须等全部完成才看到数据。

- 在 Sentry Traces／性能页面查看请求、业务操作和 segment span；业务维度通过 attributes 查询。
- 用 `beforeSendSpan` 修改 `name` 与 `attributes`，返回该 span；需要丢弃时使用 `ignoreSpans`，不能返回 `null`。
- 默认 `SpanStreaming` 集成负责批量发送；自定义默认集合时须保留 `spanStreamingIntegration()`。
- 退后台、关闭或替换配置时，SDK 会尝试排出缓冲；`flush()` 完成仍不代表后台接收确认。

这种数据格式由目标 Sentry 服务接收和展示。后台要求和旧配置迁移集中在[2.0 迁移指南](/guide/migration-2.0)，避免把客户端配置正确当作后台能力已验证。

## 验证链路

1. 测试环境临时设置 `tracesSampleRate: 1.0`。
2. 直接发起一次目标 API 请求，在 Sentry Performance / Traces 中确认独立 `http.client` span；再按需在 `Sentry.startSpan()` 管理的业务流程内确认父子关系。
3. 在真机网络面板或服务端日志中确认预期追踪头存在。
4. 确认第三方域名没有收到不必要的追踪头。
5. 打印 `Sentry.getDiagnostics()`，检查采样率、传播开关和 warnings。

没有 span 时，依次检查性能采样、`NetworkBreadcrumbs` 请求观测和 `SpanStreaming` 发送集成；没有父 span 的请求还受 `enableStandaloneHttpSpans` 控制。自定义默认集合须保留 `spanStreamingIntegration()`。本地 span 正常但服务端没有串联时，再查 `tracePropagationTargets`、网关透传和后端 Sentry / OpenTelemetry 配置。

所有相关选项见[配置项参考 · 采样](/guide/configuration#采样)与[配置项参考 · 分布式追踪](/guide/configuration#分布式追踪)。
