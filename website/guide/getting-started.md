# 快速接入

`sentry-miniapp` 是基于 [`@sentry/core`](https://github.com/getsentry/sentry-javascript) 的跨端小程序 Sentry SDK，覆盖微信、支付宝、字节跳动、钉钉、QQ、百度、快手，并兼容 Taro / uni-app。

> 本页即**原生小程序**（微信 / 支付宝 / 字节等原生工程）的接入方式。用 Taro / uni-app 框架的另见 [Taro 接入指南](/guide/taro) 与 [uni-app 接入指南](/guide/uniapp)。

## 1. 安装

```bash
npm install sentry-miniapp --save
# 或 yarn add sentry-miniapp
```

## 2. 初始化

**务必让 `Sentry.init` 在 `App()` 调用之前执行**，这样才能捕获到应用启动阶段的异常、并在业务请求之前装好网络面包屑。

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://your-dsn@o0.ingest.sentry.io/0',

  // release 是 Source Map 生效的关键，需与上传 Source Map 时的 release 完全一致
  release: 'my-miniapp@1.0.0',
  environment: 'production',

  // 采样
  sampleRate: 1.0, // error 采样率
  tracesSampleRate: 1.0, // 性能采样率；开启后 API 请求会作为 http.client span 上报

  // 面包屑开关（均为默认值）
  enableUserInteractionBreadcrumbs: true,
  enableNavigationBreadcrumbs: true,
  enableConsoleBreadcrumbs: false,

  // 网络请求体：默认只记 url/method/状态码/耗时，开启后连请求/响应体也记录（内置脱敏）
  traceNetworkBody: false,
});
```

默认初始化路径已包含：**自动异常捕获、性能监控、Source Map 路径归一化、网络面包屑、Session 与网络状态监控**。通常无需手动传 `integrations`——只有要替换核心默认集成时才传；Source Map / 网络 / Session 等能力仍由各自顶层开关控制。

> 上面只是最小配置。离线缓存、采样、追踪头注入、面包屑开关、小游戏等**完整配置项**见 [配置项参考](/guide/configuration)。

## 3. 验证是否打通

主动捕获一个事件，然后到 Sentry「Issues」列表查看：

```js
Sentry.captureException(new Error('sentry test'));
// 或 Sentry.captureMessage('sentry test', 'error');
```

::: warning 注意
`addBreadcrumb`（面包屑）**不会单独上报**——它只在「下一次事件」发生时随事件一起发送。只调用 `addBreadcrumb` 而不捕获事件，后台会一直没有数据，这不是 SDK 没生效。
:::

## 4. 常见前置检查

- **合法域名**：自托管 Sentry / 真机预览时，需把 Sentry 上报域名加入小程序后台「request 合法域名」白名单（开发者工具可临时勾选「不校验合法域名」绕过）。
- **真机 vs 开发者工具**：微信开发者工具某些环境下的报错不会触发底层 `wx.onError`，建议在真机预览下测试。
- **uni-app / Taro 框架**：组件内的错误可能被框架接住、不冒泡到 `wx.onError`，需接框架的错误处理。详见 [Taro 接入指南](/guide/taro)、[uni-app 接入指南](/guide/uniapp) 或 [常见问题](/guide/faq#组件内错误)。

## 下一步

- [配置项参考](/guide/configuration) — 全部 `init` 选项
- [支持平台与能力矩阵](/guide/platforms)
- [Taro 接入指南](/guide/taro) · [uni-app 接入指南](/guide/uniapp)
- [常见问题 (FAQ)](/guide/faq)
- [Source Map 配置](/guide/sourcemap)
- [示例工程](/guide/examples)
