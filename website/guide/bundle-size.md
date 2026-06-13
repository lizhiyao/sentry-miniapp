# 主包体积优化（分包异步加载）

小程序「主包体积」很宝贵（通常限制 2MB 以内）。`sentry-miniapp` 内置完整的 `@sentry/core` 引擎与多端适配，原始体积约 100KB。如果你很在意主包体积，可以把 SDK 放到分包并异步初始化；在支持跨分包异步加载的场景里，主包占用有机会降到 0。

## 方案 A：微信原生分包异步化

微信原生支持[分包异步化](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html)，可用 `require.async` 跨分包加载 SDK。

1. 把 `sentry-miniapp` 的 npm 包或构建产物放进某个分包目录（如 `subpackageA`）。
2. 在 `app.js` 顶部用 `require.async` 异步加载并初始化：

```javascript
// app.js
App({
  onLaunch() {
    require.async('./subpackageA/sentry-miniapp.js')
      .then((Sentry) => {
        Sentry.init({ dsn: 'https://xxxxxxxx@sentry.io/12345' /* ...其他配置 */ });
      })
      .catch((err) => console.error('Sentry 加载失败', err));
  },
});
```

这样 Sentry 的 ~100KB 会算入 `subpackageA` 分包，主包不再同步加载 SDK。

## 方案 B：其他平台 / 跨端框架

支付宝、字节、百度、Taro、uni-app 等项目要以各自平台和框架的分包能力为准。通用原则是：**确保 SDK 的实际产物被打进分包，并在分包加载完成后再执行 `Sentry.init`**。不同工具链对 `import('sentry-miniapp')` 是否拆包、拆到哪个包，规则并不一致，不能只看源码写法。

建议每次调整后检查构建产物：

- 主包目录里不应出现 `sentry-miniapp` / `@sentry/core` 相关大块代码；
- 分包目录里能找到 SDK 产物或对应 chunk；
- 真机预览验证：分包加载完成后主动 `captureException(new Error('sentry test'))`，确认能上报。

::: tip 权衡
异步加载会让 SDK 晚于主包就绪，**启动最早期（分包加载完成前）的异常可能漏报**。若更看重「尽早捕获启动异常」，可接受把 SDK 放主包；两者按你的优先级取舍。
:::
