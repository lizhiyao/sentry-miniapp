# 性能与链路追踪

性能监控回答“哪里慢”，链路追踪回答“一次请求在小程序和服务端分别花了多久”。两者共用 trace，但不是同一件事。

## 先开启性能采样

设置 `tracesSampleRate` 后，SDK 才会发送性能 transaction 和 span：

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
  tracesSampler: ({ name, inheritOrSampleWith }) => {
    if (name.includes('pages/pay')) return 1;
    if (name.includes('pages/about')) return 0.05;
    return inheritOrSampleWith(0.2);
  },
});
```

设置 `tracesSampler` 后，它的优先级高于 `tracesSampleRate`。

## 自动采集哪些性能数据

默认性能集成会在宿主支持时读取小程序 Performance API：

| 数据 | 在 Sentry 中的用途 |
|------|--------------------|
| 导航与启动 | 判断页面进入和启动阶段耗时 |
| 渲染与 `setData` | 发现渲染过慢、更新过重 |
| 资源加载 | 定位大资源或慢资源 |
| API 请求 | 作为 `http.client` span 查看请求耗时 |
| 小游戏冷启动、FPS、jank | 作为小游戏专属 transaction 与 measurement |

宿主没有对应 Performance API 时，相关采集会跳过，不影响异常上报。小游戏性能请看[小游戏接入与性能](/guide/minigame)。

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

`startSpan` 会管理回调生命周期。只有确实需要跨越多个回调手动结束时，才使用 `startInactiveSpan`。

## 串联小程序与服务端

开启 tracing 后，SDK 默认可向非 Sentry 请求注入：

- `sentry-trace`：trace id、span id 与采样状态；
- `baggage`：Sentry Dynamic Sampling Context；
- `traceparent`：仅在 `propagateTraceparent: true` 时额外注入，用于兼容 W3C Trace Context / OpenTelemetry 后端。

生产环境建议用 `tracePropagationTargets` 限制只向自己的 API 域名发送追踪头：

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

`enableTracePropagation: false` 只停止追踪头注入，不会关闭本地 `http.client` span。要停止性能采集，应移除性能采样配置。

## 请求名称基数

请求 span 名会保留 URL 路径，例如 `GET https://api.example.com/users/123`。如果路径中的订单号、用户 id 导致维度过高，可在 `beforeSendTransaction` 中把动态段统一改为 `:id`。SDK 不会自行猜测路由模板，避免误改合法路径。

## 验证链路

1. 测试环境临时设置 `tracesSampleRate: 1.0`。
2. 发起一次目标 API 请求，在 Sentry Performance / Traces 中确认 `http.client` span。
3. 在真机网络面板或服务端日志中确认预期追踪头存在。
4. 确认第三方域名没有收到不必要的追踪头。
5. 打印 `Sentry.getDiagnostics()`，检查采样率、传播开关和 warnings。

没有 span 时，先确认性能采样已开启；本地 span 正常但服务端没有串联时，再检查 `tracePropagationTargets`、网关透传和后端 Sentry / OpenTelemetry 配置。

所有相关选项见[配置项参考 · 采样](/guide/configuration#采样)与[配置项参考 · 分布式追踪](/guide/configuration#分布式追踪)。
