# Sentry Miniapp SDK — 小程序监控 SDK

[![npm version](https://img.shields.io/npm/v/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![npm download](https://img.shields.io/npm/dm/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/network/members)
[![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/stargazers)
![test coverage](https://img.shields.io/badge/test%20coverage-98.5%25%2B-brightgreen.svg)
[![Sentry Community SDK](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)
[![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)](./LICENSE)
[![文档站 docs](https://img.shields.io/badge/docs-sentry--miniapp.pages.dev-3eaf7c?logo=readthedocs&logoColor=white)](https://sentry-miniapp.pages.dev/)

简体中文 | [English](https://github.com/lizhiyao/sentry-miniapp/blob/master/docs/README.en.md)

一个基于 `@sentry/core` 核心构建的**小程序监控 SDK**，提供**异常监控**、**性能监控**、离线缓存、分布式追踪等能力。支持微信、支付宝、字节跳动、百度、QQ、钉钉、快手等多端小程序，以及微信 / 抖音等**小游戏**，并兼容 Taro / uni-app 等跨端框架。

小程序运行时没有浏览器 `window` / `fetch` / `XMLHttpRequest`，本 SDK 会使用各平台的小程序 API 完成事件上报与自动捕获。如果你的目标是 H5 页面，请使用官方 [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/develop/packages/browser)；如果目标是小程序或小游戏，用本 SDK。

> **📖 接入细节与生产配置**：[sentry-miniapp.pages.dev](https://sentry-miniapp.pages.dev/) —— 快速接入、框架指南、配置项、Source Map、FAQ、示例工程都在文档站。

> **📰 最新文章**：[《我给 Sentry 提了个 PR，后来 sentry-miniapp 进了官方文档》](https://juejin.cn/post/7636106283963760681) — sentry-miniapp 已被收录进 Sentry 官方文档的 community-supported SDK 列表。觉得有用请帮忙点个 ⭐ Star，让更多小程序团队找到它。

---

## ✨ 核心能力与适用场景

- **异常自动捕获**：自动捕获全局异常、Promise rejection、页面异常和内存告警，把问题送进 Sentry Issues，而不是只停留在用户反馈里。
- **排查上下文**：记录设备信息、页面生命周期、点击 / 触摸和网络请求面包屑，帮助还原用户出错前做了什么。
- **性能与链路追踪**：采集启动、页面渲染、资源加载和 API 请求耗时；开启 tracing 后，请求可作为 `http.client` span 串联后端链路。
- **Source Map 友好**：统一多平台虚拟堆栈路径为 `app:///`，配合 Source Map / Debug ID 还原源码位置；特殊运行时可用 `stackParser` 适配。
- **弱网与合规场景**：上报失败会先进本地离线队列，网络恢复后自动重试；开启 `requireConsent` 后，事件只写入本地缓冲，不向 Sentry 发起请求，用户同意后再调用 `Sentry.setConsent(true)` 补发。
- **小游戏专属能力**：微信 / 抖音小游戏可采集冷启动首帧、FPS 和 jank，便于定位卡顿和首帧慢问题。
- **熟悉的 Sentry API**：支持 `captureException`、`setUser`、`addBreadcrumb`、`startSpan`、`captureFeedback`、`Sentry.logger.*` 等常用能力。

---

## 🚀 5 分钟跑通

**接入前确认**：

- 已有可用的 Sentry 服务（Sentry SaaS 或自托管实例均可），并在 Sentry 中创建好项目、复制该项目的 DSN。
- 小程序后台已把 Sentry 上报域名加入 `request` 合法域名。

安装：

```bash
npm install sentry-miniapp
```

> 不使用 npm 时，可从 [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases) 下载对应版本的 `sentry-miniapp.umd.js`；调试源码仓库中的微信示例时，运行 `yarn build:miniapp` 生成示例依赖。

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

没看到事件时，优先确认 DSN、合法域名、初始化位置和采样配置；完整排查清单见 [文档站 · 快速接入](https://sentry-miniapp.pages.dev/guide/getting-started) 与 [FAQ](https://sentry-miniapp.pages.dev/guide/faq#no-events)。

### 🤖 AI Coding Agent 辅助接入

在 sentry-miniapp 仓库内使用时，支持仓库内 Agent Skills 的工具通常会自动发现 `sentry-miniapp-sdk`。

如果你是在自己的小程序 / 小游戏项目里接入，推荐把 skill 安装到当前项目的 `.agents/skills/`，这样支持仓库内 Agent Skills 的工具进入项目后就能自动发现：

```bash
npx --yes degit lizhiyao/sentry-miniapp/.agents/skills/sentry-miniapp-sdk .agents/skills/sentry-miniapp-sdk
```

然后在你的项目里直接说：

> 使用 `sentry-miniapp-sdk` skill 帮我接入 sentry-miniapp：先识别平台和框架，再完成初始化并给出验证步骤。

如果想跨多个项目复用，也可以把命令最后的目标路径换成你的 Agent 全局 skills 目录。Agent 没有自动加载时，让它读取 `.agents/skills/sentry-miniapp-sdk/SKILL.md` 即可。这样 Agent 会按仓库约定检查原生小程序 / Taro / uni-app、入口文件位置、初始化顺序和生产配置注意事项。

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

// 隐私合规：初始化时设置 requireConsent: true，用户同意后再补发缓冲事件
Sentry.setConsent(true);
```

---

## 🧭 下一步看哪里

已经跑通基础上报后，按你下一步要做的事进入对应文档：

| 我想做什么 | 看这里 |
|----------|--------|
| 按原生小程序完整接一遍 | [快速接入](https://sentry-miniapp.pages.dev/guide/getting-started) |
| 在 Taro / uni-app 项目中接入，并处理组件错误 | [Taro](https://sentry-miniapp.pages.dev/guide/taro) / [uni-app](https://sentry-miniapp.pages.dev/guide/uniapp) |
| 接入微信 / 抖音小游戏和性能监控 | [小游戏接入与性能](https://sentry-miniapp.pages.dev/guide/minigame) |
| 配异常上下文、Logs、性能、追踪或隐私同意 | [能力指南](https://sentry-miniapp.pages.dev/guide/errors-and-context) |
| 查公开方法和完整初始化参数 | [常用 API](https://sentry-miniapp.pages.dev/guide/api) / [配置项参考](https://sentry-miniapp.pages.dev/guide/configuration) |
| 上传 Source Map 或排查 Debug ID、微信合并文件 | [上线指南](https://sentry-miniapp.pages.dev/guide/sourcemap) / [进阶排障](https://sentry-miniapp.pages.dev/guide/sourcemap-advanced) |
| 确认各平台、小程序 / 小游戏能力差异 | [支持范围](https://sentry-miniapp.pages.dev/guide/platforms) |
| 关心主包体积 | [主包体积优化](https://sentry-miniapp.pages.dev/guide/bundle-size) |
| 看可运行示例 | [示例工程](https://sentry-miniapp.pages.dev/guide/examples) |
| 查看版本历史与每次发布内容 | [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases) |
| 参与开发或贡献 | [开发指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md) / [贡献指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/CONTRIBUTING.md) |

---

## ❓ 常见问题

- **初始化后 Sentry 里没有事件？** 先用 `captureException` 主动发一个测试事件，再检查 DSN、`request` 合法域名、`Sentry.init` 是否在 `App()` 前执行、`sampleRate` 是否过低，以及是否只调用了 `addBreadcrumb`。面包屑不会单独上报，只会随下一次事件发送。
- **必须在 `onError` 里手动上报吗？** 不用。`Sentry.init` 会注册平台全局错误监听；前提是它在 `App()` 前执行。若初始化太晚，启动阶段生命周期、Session 和部分面包屑会降级。
- **网络请求会随错误上报吗？** 会。默认记录 `url`、`method`、状态码、耗时等摘要，并作为面包屑随事件上报；默认不记录请求 / 响应体，需要时再开启 `traceNetworkBody` 并做好脱敏。
- **uni-app / Taro 组件错误为什么还要额外接？** 框架可能先接住组件错误，不一定冒泡到平台全局 `onError`。Vue 用 `app.config.errorHandler` / `Vue.config.errorHandler`，Taro React 建议加 Error Boundary。
- **隐私协议同意前会发请求吗？** 默认会按 SDK 配置正常上报；如果业务要求同意前禁止出网，请开启 `requireConsent`，并在用户同意后调用 `Sentry.setConsent(true)`。
- **支持 Session Replay 或 H5 端吗？** 小程序没有 DOM，暂不支持官方 Session Replay；H5 端请用官方 [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/develop/packages/browser)，小程序端继续用 `sentry-miniapp`。

> 每条的完整解答见 **[文档站 · 常见问题](https://sentry-miniapp.pages.dev/guide/faq)**。

---

## 💬 联系与交流

如果是接入问题或线上排查，建议优先在 GitHub 提出来，方便把排查结论沉淀为可搜索的答案：

- **Bug / 没有数据 / Source Map 不还原**：[提交 Issue](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose)，请附 SDK 版本、目标平台、复现步骤、关键配置和 `Sentry.getDiagnostics()` 输出。
- **功能建议 / 监控方案讨论**：[发起 Discussion](https://github.com/lizhiyao/sentry-miniapp/discussions)，说明业务场景、目标平台和期望行为。

请勿公开 DSN、token 或用户隐私数据；贴日志和配置前请先脱敏。

想实时交流小程序 / 小游戏监控方案，可以加入微信群。由于微信群二维码有 7 天时效，请添加作者微信（**备注 sentry-miniapp**），由作者邀请入群：

<img src="https://raw.githubusercontent.com/lizhiyao/sentry-miniapp/master/docs/qrcode/zhiyao.jpeg" alt="作者微信二维码" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
