# uni-app 接入指南

uni-app 底层是 **Vue**。本页以 **uni-app（Vue3 + Vite）编译到微信小程序**为例，给出完整接入，并重点讲清一个最容易踩的坑：**Vue 会吞掉组件内错误**。可运行示例见 [`examples/uniapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/uniapp)。

## 为什么不能直接用 `@sentry/browser`

小程序没有浏览器的 `window` / `fetch` / `XMLHttpRequest`，网络只能走 `wx.request`，官方 Web SDK 的传输层与全局错误钩子都用不了。`sentry-miniapp` 补齐了这层（自定义 transport、小程序全局异常捕获、Source Map 归一化、网络面包屑）。**uni-app 小程序端用 `sentry-miniapp`，H5 端才用 `@sentry/browser`**（见「分端接入」）。

## 1. 安装

```bash
npm install sentry-miniapp --save
```

## 2. 初始化封装

新建 `src/utils/sentry.js`：

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://your-dsn@o0.ingest.sentry.io/0',
  release: 'my-uniapp@1.0.0', // 与上传 Source Map 时的 release 完全一致
  environment: 'production',

  platform: 'wechat',
  sampleRate: 1.0, // error 采样率
  tracesSampleRate: 1.0, // 性能采样率；开启后 API 请求会作为 http.client span 上报

  // 网络面包屑默认开启（自动包裹全局 wx.request；uni.request 最终也走它，无需额外配置）。
  traceNetworkBody: false,
});

Sentry.setTag('app.framework', 'uni-app');

export default Sentry;
```

## 3. main.js 尽早初始化 + 接 Vue errorHandler（关键）

::: danger 最常见的「明明设了 sampleRate: 1 却只偶尔上报一条」根因
uni-app 底层是 Vue。**组件内**（`render` / 生命周期 / `watch` / 模板 `@click` 调用的方法）抛出的错误，会被 **Vue 自己的错误处理接住、只打印 console，不会冒泡到 `wx.onError`**，SDK 默认捕获不到。必须把 Vue 的 `errorHandler` 接到 Sentry，组件内错误才会上报。
:::

`src/main.js`（Vue3）：

```js
import { createSSRApp } from 'vue';
import App from './App.vue';
import Sentry from './utils/sentry'; // 引入即执行 Sentry.init（先于业务、能捕获启动异常）

export function createApp() {
  const app = createSSRApp(App);

  // 关键：把 Vue 组件内错误转交 Sentry
  app.config.errorHandler = (err, instance, info) => {
    Sentry.captureException(err, { extra: { lifecycleHook: info } });
    console.error(err); // 保留本地打印，方便开发期排查
  };

  return { app };
}
```

**Vue2（uni-app 旧版）** 改用 `Vue.config.errorHandler`：

```js
import Vue from 'vue';
import Sentry from './utils/sentry';

Vue.config.errorHandler = (err, vm, info) => {
  Sentry.captureException(err, { extra: { lifecycleHook: info } });
  console.error(err);
};
```

> 这是 uni-app(Vue) 对应 Taro(React) 错误边界的做法。对比见 [常见问题 · 组件内错误](/guide/faq#组件内错误)。

## 4. 分端接入（同时要 H5）

uni-app 用**条件编译**按端引入——小程序用 `sentry-miniapp`，H5 用官方 `@sentry/browser`：

```js
// #ifdef H5
import * as Sentry from '@sentry/browser';
// #endif
// #ifdef MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ || MP-KUAISHOU || MP-DINGTALK
import * as Sentry from 'sentry-miniapp';
// #endif
```

## 5. 其它

- **网络**：`uni.request` 最终走被包裹的全局 `wx.request`，请求会自动记成 `xhr` 面包屑、随错误事件上报，无需额外配置。
- **Source Map**：uni-app 经过编译，错误栈是编译后代码，需上传 Source Map 才能还原。配置见 [Source Map 配置](/guide/sourcemap)。
- **验证**：`addBreadcrumb` 不会单独上报，需主动 `Sentry.captureException(new Error('test'))` 才能在 Issues 看到。详见 [快速接入](/guide/getting-started)。

## 下一步

- [示例工程](/guide/examples) · [常见问题](/guide/faq) · [支持平台与能力](/guide/platforms)
