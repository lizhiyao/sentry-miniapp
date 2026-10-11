---
title: uni-app 小程序接入 Sentry：Vue 错误上报
description: 在 uni-app Vue 3 + Vite 小程序中接入 Sentry，配置 main.js 初始化与 Vue errorHandler，排查组件错误不上报，并完成 H5 分端接入和 Source Map 源码定位。
---

# uni-app 小程序接入 Sentry：Vue 错误上报 {#uni-app-接入指南}

**uni-app 小程序端使用 `sentry-miniapp`，Vue 组件错误还需要接入 `errorHandler`。** 仅初始化 SDK，不能覆盖被 Vue 接住的组件渲染、生命周期和模板事件错误；如果全局错误有数据、组件错误没有，优先检查这一步。

本页以 **uni-app（Vue 3 + Vite）编译到微信小程序**为例，提供 `main.js` 初始化、Vue 2 / Vue 3 错误处理与 H5 分端配置。可运行示例见 [`examples/uniapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/uniapp)。

## 接入前确认

- 已创建 Sentry 项目并复制完整 DSN；按[版本选择](/guide/migration-2.0#version-choice)确认后台兼容性。
- 微信小程序后台已配置实际上报地址的 `request` 合法域名，见[域名检查](/guide/getting-started#_4-常见前置检查)。
- 需要定位到 `.vue` 源码时，准备上传同一构建的 JS 与 Source Map，见[上线指南](/guide/sourcemap)。

## 为什么不能直接用 `@sentry/browser`

小程序可能提供 `window` 别名，但通常缺少 DOM、浏览器 `fetch` 和 `XMLHttpRequest`，网络需走平台请求 API（如微信 `wx.request`、支付宝 `my.httpRequest`）。仅有别名不能满足官方 Web SDK 的运行条件。`sentry-miniapp` 提供平台 transport、全局异常捕获、Source Map 归一化和网络面包屑。**uni-app 小程序端用 `sentry-miniapp`，H5 端才用 `@sentry/browser`**（见「分端接入」）。

## 1. 安装

```bash
npm install sentry-miniapp --save
```

## 2. 初始化封装

新建 `src/utils/sentry.js`：

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'YOUR_DSN', // 替换为 Sentry 项目中的完整 DSN
  release: 'my-uniapp@1.0.0', // 与上传 Source Map 时的 release 完全一致
  environment: 'production',
});

Sentry.setTag('app.framework', 'uni-app');

export default Sentry;
```

## 3. 初始化并接入 Vue 错误处理 {#_3-main-js-尽早初始化-接-vue-errorhandler-关键}

::: tip 组件错误由框架处理
Vue 会处理组件渲染、生命周期、watch 和模板事件中的错误，它们不一定进入宿主 `onError`。将 Vue `errorHandler` 接到 Sentry，才能覆盖这条捕获路径；详见 [Vue 应用错误处理](https://vuejs.org/api/application.html#app-config-errorhandler)。
:::

`src/main.js`（Vue3）：

```js
import Sentry from './utils/sentry'; // 先初始化，再加载 App 和业务模块
import { createSSRApp } from 'vue';
import App from './App.vue';

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

若项目已有 `errorHandler`，将捕获调用加入现有处理器，保留原有的错误处理逻辑。

**Vue 2 项目** 改用 `Vue.config.errorHandler`：

```js
import Vue from 'vue';
import Sentry from './utils/sentry';

Vue.config.errorHandler = (err, vm, info) => {
  Sentry.captureException(err, { extra: { lifecycleHook: info } });
  console.error(err);
};
```

> 这是 uni-app(Vue) 对应 Taro(React) 错误边界的做法。对比见 [常见问题 · 组件内错误](/guide/faq#component-errors)。

## 4. 分端接入（同时要 H5）

uni-app 用**条件编译**按端引入——小程序用 `sentry-miniapp`，H5 用官方 `@sentry/browser`：

用下方片段替换初始化封装中的 SDK 导入，保留后续的 `Sentry.init()`、标签设置和唯一的 `export default Sentry`。DSN、release 和 environment 可共用；平台专属选项放在对应分支。

```bash
npm install sentry-miniapp @sentry/browser --save
```

```js
let Sentry;

// #ifdef H5
Sentry = require('@sentry/browser');
// #endif

// #ifdef MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ || MP-KUAISHOU || MP-DINGTALK
Sentry = require('sentry-miniapp');
// #endif
```

## 5. 其它

- **网络**：`uni.request` 最终走对应小程序端被包裹的全局请求 API，请求会自动记成 `xhr` 面包屑、随错误事件上报，无需额外配置。
- **性能与追踪**：需要独立性能数据时再设置采样率，见[性能与链路追踪](/guide/performance-and-tracing)。
- **Source Map**：uni-app 经过编译，错误栈是编译后代码，需上传 Source Map 才能还原。配置见 [Source Map 上线指南](/guide/sourcemap)；真机堆栈出现 `appservice.app.js` 时，继续看[微信两层映射](/guide/sourcemap-advanced#微信真机的两层-source-map)。
- **验证**：`addBreadcrumb` 不会单独上报，需主动 `Sentry.captureException(new Error('test'))` 才能在 Issues 看到。详见 [快速接入](/guide/getting-started)。

## 下一步

- [示例工程](/guide/examples) · [异常、日志与上下文](/guide/errors-and-context) · [常见问题](/guide/faq)
