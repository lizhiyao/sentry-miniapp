# 常见问题 (FAQ)

## 初始化后必须在 `onError` 中手动调 API 吗？

**不需要。** SDK 初始化时会自动劫持并注册平台底层的全局错误监听（如 `wx.onError`）。只要 `Sentry.init` 在 `App()` 调用**之前**执行，就能自动捕获未处理的 JS 异常。

没上报时检查：① Sentry 域名是否加入小程序后台合法域名；② `sampleRate` 是否被设得太低；③ 微信开发者工具某些环境的报错不触发底层 `onError`，建议**真机预览**下测试。

## 网络请求会随错误事件一起上报吗？

**会，且默认开启。** SDK 默认启用 `NetworkBreadcrumbs`，自动劫持 `wx.request` / `my.httpRequest`，把每个网络请求记成 `category: xhr` 的面包屑，随**下一个被捕获的错误事件**一起上报（与 `@sentry/browser` 默认行为一致）。

- **默认字段**：`url` / `method` / `status_code` / `duration`；失败请求标 `error` 级、慢请求（>3s）标 `warning` 级。
- **默认不带请求 / 响应体**，需要 body 时开启 `traceNetworkBody: true`（内置敏感字段脱敏，可用 `denyBodyUrls` 排除指定 URL）。
- **uni-app / Taro 无需额外配置**：`uni.request` / `Taro.request` 最终都会走到被包裹的全局 `wx.request`。

如果错误里没有网络面包屑，多半是：① 错误触发前没发过请求；② `Sentry.init` 晚于请求执行（务必在请求之前 init）。

## 组件内错误 {#组件内错误}

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

## 支持 Session Replay（屏幕操作回放）吗？

**不支持。** Sentry 官方 Replay 强依赖浏览器 DOM（rrweb 录制），小程序双线程架构、无开放 DOM 接口，无法直接复用。建议用**丰富的面包屑路径** + 自定义日志还原现场。

## uni-app / Taro 的 H5 端如何监控？

`sentry-miniapp` **仅适配小程序平台**，不内置浏览器原生信号（`window.onerror`、`fetch`/XHR 拦截等）。H5 端请用官方 [`@sentry/browser`](https://docs.sentry.io/platforms/javascript/)，按端条件编译引入；两端上报同一个 DSN 即可在同一 Project 聚合查看。

条件编译的具体写法见 [Taro 接入指南](/guide/taro) 与 [uni-app 接入指南](/guide/uniapp) 的「分端接入」一节。
