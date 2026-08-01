# 常见问题 (FAQ)

## 初始化后 Sentry 里没有数据，先查什么？ {#no-events}

先用最小链路确认 SDK 是否能发出事件：

```js
Sentry.captureException(new Error('sentry test'));
```

如果 Sentry Issues 里仍然看不到事件，按这个顺序排查：

- **DSN / Project 是否可用**：确认 DSN 属于当前要看的 Sentry Project，且没有把测试事件发到其它环境或其它项目里。
- **request 合法域名是否配置**：把 DSN 里的实际 host 加入小程序后台「request 合法域名」，例如 `o0.ingest.sentry.io`；自托管则填写你的 Sentry 服务域名。
- **初始化位置是否太晚**：`Sentry.init` 必须在 `App()` 调用之前执行。放进 `App.onLaunch` 后，手动 `captureException` 仍可能可用，但启动阶段生命周期、Session、部分面包屑和冷启动耗时会降级。
- **是否只调用了 `addBreadcrumb`**：面包屑不会单独上报，只会随下一次 error / message / transaction 一起发送。验证接入时请用 `captureException` 或 `captureMessage`。
- **采样是否过滤了事件**：确认 `sampleRate` 没有被设得太低；如果只验证性能 transaction，还要确认 `tracesSampleRate` 或 `tracesSampler`。
- **开发者工具与真机差异**：微信开发者工具某些环境的报错不触发底层 `wx.onError`，建议用真机预览验证自动异常捕获。
- **框架组件错误是否被吞掉**：uni-app / Taro 的组件错误可能被 Vue / React 先接住，不一定冒泡到平台全局 `onError`。这类错误需要接框架错误处理，见 [组件内错误](#component-errors)。

排查时也可以打印诊断信息，并把输出贴到 GitHub issue：

```js
console.log(Sentry.getDiagnostics());
```

## 初始化后必须在 `onError` 中手动调 API 吗？

**不需要。** SDK 初始化时会自动劫持并注册平台底层的全局错误监听（如 `wx.onError`）。只要 `Sentry.init` 在 `App()` 调用**之前**执行，就能自动捕获未处理的 JS 异常。

如果整体没有数据，先按 [初始化后没有数据](#no-events) 的清单排查；如果只有组件内错误缺失，继续看 [组件内错误](#component-errors)。

## 网络请求会随错误事件一起上报吗？

**会，且默认开启。** SDK 默认启用 `NetworkBreadcrumbs`，自动劫持 `wx.request` / `my.httpRequest`，把每个网络请求记成 `category: xhr` 的面包屑，随**下一个被捕获的错误事件**一起上报（与 `@sentry/browser` 默认行为一致）。

- **默认字段**：`url` / `method` / `status_code` / `duration`；失败请求标 `error` 级、慢请求（>3s）标 `warning` 级。
- **默认不带请求 / 响应体**，需要 body 时开启 `traceNetworkBody: true`（内置敏感字段脱敏；按 URL 排除可在 `beforeBreadcrumb` 里二次处理）。
- **uni-app / Taro 无需额外配置**：`uni.request` / `Taro.request` 最终会走到对应小程序端被包裹的全局请求 API（如微信 `wx.request`、支付宝 `my.httpRequest`）。

如果错误里没有网络面包屑，多半是：① 错误触发前没发过请求；② `Sentry.init` 晚于请求执行（务必在请求之前 init）。

## `Sentry.logger.*` 和 console 面包屑有什么区别？

`Sentry.logger.*` 会发送独立的 log envelope，适合业务日志查询、聚合、告警和跨事件分析；需要在初始化时开启 `enableLogs: true`。

`enableConsoleBreadcrumbs` 只会把 `console.log/warn/error` 记录成面包屑，随**下一次 error / message / transaction 事件**一起发送；如果后续没有事件，它不会单独出现在 Sentry。

## 组件内错误 {#component-errors}

### uni-app（Vue）组件内的错误没上报 / 上报率很低？

uni-app 底层是 Vue。**组件内（render / 生命周期 / watch / `@click` 方法）抛的错会被 Vue 自己的 `errorHandler` 接住、不冒泡到 `wx.onError`**，SDK 默认捕获不到——这是「`sampleRate` 设了 1 却只偶尔上报一条」的常见根因。把 Vue 的 `errorHandler` 接到 Sentry：

```js
// uni-app Vue3（main.js / main.ts）
export function createApp() {
  const app = createSSRApp(App);
  app.config.errorHandler = (err, instance, info) => {
    Sentry.captureException(err, { extra: { lifecycleHook: info } });
  };
  return { app };
}
```

Vue2 用 `Vue.config.errorHandler`。

### Taro 呢？

**Taro 不是 Vue**，默认用 React（也支持 Vue）。用 **Vue** 时同理接 `errorHandler`；用 **React** 时，React 不像 Vue 那样静默吞错，但可加一个**错误边界（Error Boundary）**把渲染错误转给 Sentry：

```jsx
class SentryBoundary extends React.Component {
  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: info });
  }
  render() {
    return this.props.children;
  }
}
// 包住根组件：<SentryBoundary><App /></SentryBoundary>
```

完整示例见 [示例工程](/guide/examples)。

## 隐私协议同意前如何避免发送 Sentry 网络请求？ {#privacy-consent}

默认情况下，SDK 会按你的初始化配置正常上报事件。如果业务要求用户同意隐私协议前不能发出 Sentry 网络请求，可以开启 `requireConsent`：

```js
Sentry.init({
  dsn: 'https://your-dsn@o0.ingest.sentry.io/0',
  requireConsent: true,
});
```

开启后，同意前捕获到的事件会写入本地缓冲，不会向 Sentry 发起请求。用户同意后调用：

```js
Sentry.setConsent(true);
```

SDK 会恢复发送，并补发仍在缓冲期内的事件。用户撤回同意时可调用 `Sentry.setConsent(false)`，后续事件会继续进入缓冲而不是出网。

这个能力适合隐私协议弹窗、分端合规开关、灰度验证等场景；如果只是想降低上报量，优先使用 `sampleRate` / `tracesSampleRate`，不要把 `requireConsent` 当采样开关。

## 支持 Session Replay（屏幕操作回放）吗？

**不支持。** Sentry 官方 Replay 强依赖浏览器 DOM（rrweb 录制），小程序双线程架构、无开放 DOM 接口，无法直接复用。建议用**丰富的面包屑路径** + 自定义日志还原现场。

## uni-app / Taro 的 H5 端如何监控？

`sentry-miniapp` **仅适配小程序平台**，不内置浏览器原生信号（`window.onerror`、`fetch`/XHR 拦截等）。H5 端请用官方 [`@sentry/browser`](https://docs.sentry.io/platforms/javascript/)，按端条件编译引入；两端上报同一个 DSN 即可在同一 Project 聚合查看。

条件编译的具体写法见 [Taro 接入指南](/guide/taro) 与 [uni-app 接入指南](/guide/uniapp) 的「分端接入」一节。
