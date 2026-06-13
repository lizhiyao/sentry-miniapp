# 主包体积优化（0KB 主包占用）

小程序「主包体积」很宝贵（通常限制 2MB 以内）。`sentry-miniapp` 内置完整的 `@sentry/core` 引擎与多端适配，原始体积约 100KB。如果你很在意主包体积，**用平台的「分包异步化」/「动态加载」把 SDK 完全移到分包**，主包占用可降到 0。

## 方案 A：微信 / 支付宝（推荐）

微信、支付宝等原生支持[分包异步化](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html)。

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

这样 Sentry 的 ~100KB **全部算入 `subpackageA` 分包**，主包占用为 0。

## 方案 B：其他平台（字节、百度等）

对暂不支持 `require.async` 的平台，用**分包预下载 + 动态加载**：

```javascript
// 以字节小程序为例
App({
  onLaunch() {
    tt.loadSubpackage({
      name: 'subpackageA',
      success: () => {
        const Sentry = require('./subpackageA/sentry-miniapp.js');
        Sentry.init({ dsn: '...' });
      },
    });
  },
});
```

## Taro / uni-app

直接用动态导入 `import('sentry-miniapp')`，框架会在编译时抹平各端差异。

::: tip 权衡
异步加载会让 SDK 晚于主包就绪，**启动最早期（分包加载完成前）的异常可能漏报**。若更看重「尽早捕获启动异常」，可接受把 SDK 放主包；两者按你的优先级取舍。
:::
