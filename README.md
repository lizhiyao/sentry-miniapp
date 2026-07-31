# Sentry Miniapp SDK — 小程序监控 SDK

[![npm version](https://img.shields.io/npm/v/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![npm download](https://img.shields.io/npm/dm/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/network/members)
[![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/stargazers)
![test coverage](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg)
[![Sentry Community SDK](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)
[![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)](./LICENSE)
[![文档站 docs](https://img.shields.io/badge/docs-sentry--miniapp.pages.dev-3eaf7c?logo=readthedocs&logoColor=white)](https://sentry-miniapp.pages.dev/)

简体中文 | [English](https://github.com/lizhiyao/sentry-miniapp/blob/master/docs/README.en.md)

一个基于 `@sentry/core` 核心构建的**小程序监控 SDK**，提供**异常监控**、**性能监控**、离线缓存、分布式追踪等能力。支持微信、支付宝、字节跳动、百度、QQ、钉钉、快手等多端小程序，以及微信 / 抖音等**小游戏**，并兼容 Taro / uni-app 等跨端框架。

小程序运行时没有浏览器 `window` / `fetch` / `XMLHttpRequest`，本 SDK 会使用各平台的小程序 API 完成事件上报与自动捕获。如果你的目标是 H5 页面，请使用官方 `@sentry/browser`；如果目标是小程序或小游戏，用本 SDK。

> **📖 接入细节与生产配置**：[sentry-miniapp.pages.dev](https://sentry-miniapp.pages.dev/) —— 快速接入、框架指南、配置项、Source Map、FAQ、示例工程都在文档站。

> **📰 最新文章**：[《我给 Sentry 提了个 PR，后来 sentry-miniapp 进了官方文档》](https://juejin.cn/post/7636106283963760681) — sentry-miniapp 已被收录进 Sentry 官方文档的 community-supported SDK 列表。觉得有用请帮忙点个 ⭐ Star，让更多小程序团队找到它。

完整版本历史见 [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases)。

---

## ✨ 你可以用它解决什么

- **异常自动捕获**：全局异常、Promise rejection、页面异常、内存告警开箱即采。
- **排查上下文**：设备信息、页面生命周期、点击 / 触摸、网络请求会作为面包屑随错误一起上报。
- **性能与链路追踪**：采集启动、页面渲染、资源加载和 API 请求耗时；请求可作为 `http.client` span 串联后端链路。
- **Source Map 友好**：把不同平台的虚拟堆栈路径统一为 `app:///`，兼容 Debug ID，并支持用 `stackParser` 适配特殊运行时。
- **弱网与合规场景**：断网或发送失败会本地缓存并重试；`requireConsent` 可在用户同意前只写缓冲、不发网络。
- **小游戏专属能力**：微信 / 抖音小游戏可采集冷启动首帧、FPS 和 jank。
- **熟悉的 Sentry API**：支持 `captureException`、`setUser`、`addBreadcrumb`、`startSpan`、`captureFeedback`、`Sentry.logger.*` 等常用能力。

---

## 🚀 5 分钟跑通

**接入前确认**：

- 已有 Sentry 项目（官方 SaaS 或私有化部署均可）。
- 小程序后台已把 Sentry 上报域名加入 `request` 合法域名。

安装：

```bash
npm install sentry-miniapp
```

> 不使用 npm 时，也可直接将 `examples/wxapp/lib/sentry-miniapp.js` 复制到小程序项目中引入。

在入口文件（`app.js` / `app.ts`）**最顶部、`App()` 之前**初始化：

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@<org>.ingest.sentry.io/<project>',
  release: 'my-project@1.0.0', // 与上传 Source Map 时的 release 一致
  environment: 'production',
  sampleRate: 1.0, // 异常采样率
  tracesSampleRate: 1.0, // 性能采样率；开启后 API 请求作为 http.client span 上报
});

App({ onLaunch() {} });
```

验证是否打通：

```javascript
Sentry.captureException(new Error('sentry test'));
```

然后到 Sentry 的 Issues 列表查看事件。

先排查这些常见问题：

- `Sentry.init` 必须在 `App()` 之前执行，放进 `App.onLaunch` 会丢失部分启动阶段能力。
- 默认集成已包含异常捕获、性能监控、Source Map 路径归一化、网络面包屑、Session 与网络状态监控，通常无需手动传 `integrations`。
- `addBreadcrumb` 不会单独上报，只随下一次事件一起发送；只调它而不捕获事件，后台会一直没有数据。
- `release` 要和 Source Map 上传时的 release 完全一致，否则源码堆栈无法还原。

---

## 📚 常用 API

```javascript
// 手动捕获异常 / 消息
Sentry.captureException(new Error('支付接口解析失败'));
Sentry.captureMessage('用户主动取消了授权', 'info');

// 用户与标签
Sentry.setUser({ id: 'user_12345', username: 'John Doe' });
Sentry.setTag('page_module', 'checkout');

// 业务面包屑
Sentry.addBreadcrumb({ message: '点击了[确认支付]', category: 'action', level: 'info' });

// Sentry Logs（需 init({ enableLogs: true })）
Sentry.logger.info('用户完成支付', { orderId: 'order_123' });

// 自定义测速
await Sentry.startSpan({ name: 'fetch-user', op: 'http.client' }, async () => { /* ... */ });

// 用户反馈：小程序无 DOM，请自行实现原生表单后提交
Sentry.captureFeedback({ message: '页面卡住了', name: '张三', email: 'zhangsan@example.com' });

// 接入诊断：排查接入问题时，可将诊断结果附到 issue
console.log(Sentry.getDiagnostics());

// 隐私合规：init({ requireConsent: true }) 后，用户同意隐私协议再补发缓冲
Sentry.setConsent(true);
```

---

## 🧭 下一步看哪里

已经跑通基础上报后，按你下一步要做的事进入对应文档：

| 我想做什么 | 看这里 |
|----------|--------|
| 按原生小程序完整接一遍 | [快速接入](https://sentry-miniapp.pages.dev/guide/getting-started) |
| 接 Taro / uni-app，尤其是组件错误 | [Taro](https://sentry-miniapp.pages.dev/guide/taro) / [uni-app](https://sentry-miniapp.pages.dev/guide/uniapp) |
| 配 Source Map、Debug ID 或排查堆栈不还原 | [Source Map 配置](https://sentry-miniapp.pages.dev/guide/sourcemap) |
| 配采样、Logs、隐私同意、`traceparent`、自定义 transport | [配置项参考](https://sentry-miniapp.pages.dev/guide/configuration) |
| 确认各平台、小程序 / 小游戏能力差异 | [支持平台与能力](https://sentry-miniapp.pages.dev/guide/platforms) |
| 关心主包体积 | [主包体积优化](https://sentry-miniapp.pages.dev/guide/bundle-size) |
| 看可运行示例 | [示例工程](https://sentry-miniapp.pages.dev/guide/examples) |
| 参与开发或贡献 | [开发指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md) / [贡献指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/CONTRIBUTING.md) |

---

## 🤖 AI 辅助接入

使用 [Claude Code](https://claude.ai/code) 或 [Cursor](https://cursor.com) 时，可让 AI 自动引导接入：

```bash
npx skills add https://github.com/lizhiyao/sentry-miniapp --skill sentry-miniapp-sdk
```

安装后在 AI 编辑器中输入“帮我接入 Sentry 监控”即可触发向导。

---

## ❓ 常见问题

- **必须在 `onError` 里手动上报吗？** 不用，`init` 会自动挂全局错误监听。
- **网络请求会随错误上报吗？** 会，默认开启，记成 `category: xhr` 面包屑随错误一起发。
- **uni-app（Vue）组件内错误上报率很低？** Vue 吞掉了组件错误，需接 `app.config.errorHandler`；Taro（React）用错误边界。
- **支持 Session Replay 吗？** 不支持（小程序无 DOM），用面包屑还原现场。
- **H5 端怎么办？** 用官方 `@sentry/browser`，按端条件编译引入。

> 每条的完整解答见 **[文档站 · 常见问题](https://sentry-miniapp.pages.dev/guide/faq)**。

---

## 💬 联系与交流

遇到问题？想探讨小程序监控方案？由于微信群二维码有 7 天时效，请添加作者微信（**备注 sentry-miniapp**），由作者邀请入群：

<img src="https://raw.githubusercontent.com/lizhiyao/sentry-miniapp/master/docs/qrcode/zhiyao.jpeg" alt="作者微信二维码" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />

---

## License

[MIT](./LICENSE)
