# Sentry Miniapp SDK — 小程序监控 SDK

[![npm version](https://img.shields.io/npm/v/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![npm download](https://img.shields.io/npm/dm/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/network/members)
[![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/stargazers)
![test coverage](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg)
[![Sentry Community SDK](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)
[![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)](./LICENSE)
[![文档站 docs](https://img.shields.io/badge/docs-sentry--miniapp.pages.dev-3eaf7c?logo=readthedocs&logoColor=white)](https://sentry-miniapp.pages.dev/)

简体中文 | [English](./README.en.md)

一个基于 `@sentry/core` 核心构建的**小程序监控 SDK**，提供**异常监控**、**性能监控**、离线缓存、分布式追踪等能力。支持微信、支付宝、字节跳动、百度、QQ、钉钉、快手等多端小程序，以及微信 / 抖音等**小游戏**，并兼容 Taro / uni-app 等跨端框架。

> **📖 完整文档请看文档站**：[sentry-miniapp.pages.dev](https://sentry-miniapp.pages.dev/) —— 快速接入、能力矩阵、各框架接入、FAQ、Source Map 配置、示例索引，带导航与搜索。本 README 只做速览与入口。

> **📰 最新文章**：[《我给 Sentry 提了个 PR，后来 sentry-miniapp 进了官方文档》](https://juejin.cn/post/7636106283963760681) — sentry-miniapp 已被收录进 Sentry 官方文档的 community-supported SDK 列表。觉得有用请帮忙点个 ⭐ Star，让更多小程序团队找到它。

<details>
<summary><b>🆕 v1.3 → v1.11 What's New（点击展开）</b></summary>

| 版本 | 亮点 |
|---|---|
| **v1.11** | 小游戏性能数据**独立上报为 transaction**（进 Sentry Performance 页）；API 请求上报为 `http.client` span；上线[文档站](https://sentry-miniapp.pages.dev/)、新增 Taro / uni-app 集成示例与[两层 Source Map 离线合成脚本](./scripts/merge-sourcemap.mjs) |
| **v1.10** | 🎮 **小游戏支持**：自动识别小游戏环境，新增冷启动首帧耗时、帧率 / 卡顿（FPS / jank）监控 |
| **v1.8.0** | AI 辅助接入 skill — Claude Code / Cursor 自动引导集成 |
| **v1.7.0** | 新增 `tracesSampler` 动态采样；新增 Source Map 完整配置指南 |
| **v1.6.0** | 13 项功能优化 + 16 项问题修复；构建产物压缩，包体积减少约 **59%** |
| **v1.5.0** | Performance 增强（可配阈值 / setData 慢渲染检测 / 内存采集）；新增页面生命周期、用户交互、Console 三类 Breadcrumb |
| **v1.4.0** | NetworkBreadcrumbs 抓 Request / Response Body；离线缓存上限可配 |
| **v1.3.0** | 🎯 重构构建（Vite + bundle-inline）：对外**零依赖**，修掉 `miniprogram_npm` 模块解析问题；内置 Source Map 路径自动抹平 |

完整变更见 [CHANGELOG.md](./CHANGELOG.md)。

</details>

---

## ✨ 核心特性

- **🚀 现代架构**：基于 Sentry JavaScript V10 SDK 核心模块构建。
- **📱 真正的多端支持**：内置 API 抹平引擎，一套代码兼容**微信、支付宝、字节、百度、QQ、钉钉、快手**等主流小程序平台。
- **🎮 小游戏支持**：自动识别小游戏环境，异常 / 网络 / 设备监控开箱即用，并提供小游戏专属的**冷启动首帧耗时**与**帧率 / 卡顿监控**。
- **🎯 全自动异常捕获**：无需侵入业务代码，自动监听并上报生命周期异常（`onError`、`onUnhandledRejection`、`onPageNotFound`、`onMemoryWarning`）。
- **🍞 丰富的上下文面包屑**：自动记录设备信息、用户点击 / 触摸、网络请求（XHR）以及页面生命周期。
- **🗺️ 内置 SourceMap 路径抹平**：自动统一多端虚拟堆栈路径，配合 sentry-cli 极简实现 Source Map 解析。
- **📡 弱网离线缓存**：断网或发送失败时自动缓存事件到本地 Storage，网络恢复后静默重试，确保数据不丢失。
- **⚡ 深度性能监控**：采集导航性能（FCP/LCP）、渲染性能、资源加载耗时及自定义性能标记。
- **🔗 分布式追踪**：自动注入 `sentry-trace` / `baggage` 头，并将 API 请求耗时上报为 `http.client` span，串联小程序与后端调用链。
- **📊 Session 健康监控** 与 **📶 网络状态监控**：会话生命周期管理 + 实时网络变化追踪（WiFi/4G/离线）。
- **🛡️ 智能降噪**：内置错误去重与采样率控制，避免日志风暴。

---

## 📦 安装

```bash
npm install sentry-miniapp
```

> 不使用 npm 时，也可直接将 `examples/wxapp/lib/sentry-miniapp.js` 复制到小程序项目中引入。

### 🤖 AI 辅助接入

使用 [Claude Code](https://claude.ai/code) 或 [Cursor](https://cursor.com) 时，可让 AI 自动引导接入：

```bash
npx skills add https://github.com/lizhiyao/sentry-miniapp --skill sentry-miniapp-sdk
```

安装后在 AI 编辑器中输入“帮我接入 Sentry 监控”即可触发向导。

---

## 🚀 快速接入

**前置**：① 准备一个 Sentry 账号（[官方 SaaS](https://sentry.io/) 或私有化部署）；② 在小程序后台把 Sentry 上报域名加入 `request` 合法域名。

在入口文件（`app.js` / `app.ts`）**最顶部、`App()` 之前**初始化：

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
  release: 'my-project@1.0.0', // 与上传 Source Map 时的 release 一致
  environment: 'production',
  sampleRate: 1.0, // 异常采样率
  tracesSampleRate: 1.0, // 性能采样率；开启后 API 请求作为 http.client span 上报
});

App({ onLaunch() {} });
```

默认集成已含**异常捕获、性能监控、Source Map 路径归一化、网络面包屑、Session 与网络状态监控**，通常无需手动传 `integrations`（传入会覆盖默认）。完整配置项（离线缓存、追踪头注入、面包屑开关等）见[文档站 · 快速接入](https://sentry-miniapp.pages.dev/guide/getting-started)。

**验证是否打通**——主动捕获一个事件，到 Sentry「Issues」列表查看：

```javascript
Sentry.captureException(new Error('sentry test'));
```

> ⚠️ `addBreadcrumb` 不会单独上报，只随下一次事件一起发送——只调它而不捕获事件，后台会一直没有数据。

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

// 自定义测速
await Sentry.startSpan({ name: 'fetch-user', op: 'http.client' }, async () => { /* ... */ });
```

需要按页面 / 场景精细采样时用 `tracesSampler` 回调（设置后 `tracesSampleRate` 被忽略），写法见[文档站 · 快速接入](https://sentry-miniapp.pages.dev/guide/getting-started)。

---

## 🗺️ Source Map

SDK 默认开启多端堆栈路径归一化（`enableSourceMap: true`），自动将各平台虚拟路径转为统一 `app:///` 前缀，配合 sentry-cli 上传即可解析：

```bash
sentry-cli releases files "my-miniapp@1.0.0" upload-sourcemaps ./dist \
  --url-prefix "app:///" --ext js --ext map
```

> 端到端配置（各构建工具、CI/CD、跨端框架两层 map 串联、验证排查）见 **[Source Map 完整配置指南](./docs/SOURCEMAP_GUIDE.md)**。

---

## 🎮 小游戏支持

`sentry-miniapp` 同样适用于微信 / 抖音等**小游戏**：自动识别环境，异常 / 网络 / 设备监控开箱即用，并额外提供**冷启动首帧耗时**与**帧率 / 卡顿监控**。初始化与小程序完全一致，开启 `tracesSampleRate` 后性能数据会作为独立 transaction 进 Performance 页。

> 能力矩阵与性能上报细节见[文档站 · 支持平台与能力](https://sentry-miniapp.pages.dev/guide/platforms)。

## 📦 主包体积优化

SDK 原始体积约 100KB。很在意主包体积时，可用平台「分包异步化」/「动态加载」把 SDK 完全移到分包，做到**主包 0KB 占用**。

> 微信 / 支付宝 / 字节 / Taro / uni-app 的具体做法见[文档站 · 主包体积优化](https://sentry-miniapp.pages.dev/guide/bundle-size)。

---

## 💬 用户反馈

小程序无 DOM，`showReportDialog()` 已废弃。请自行实现原生表单收集反馈，再调 `Sentry.captureFeedback()` 提交：

```javascript
Sentry.captureFeedback({ message: '页面卡住了', name: '张三', email: 'zhangsan@example.com' });
```

---

## ❓ 常见问题（速览）

- **必须在 `onError` 里手动上报吗？** 不用，`init` 会自动挂全局错误监听。
- **网络请求会随错误上报吗？** 会，默认开启，记成 `category: xhr` 面包屑随错误一起发。
- **uni-app（Vue）组件内错误上报率很低？** Vue 吞掉了组件错误，需接 `app.config.errorHandler`；Taro（React）用错误边界。
- **支持 Session Replay 吗？** 不支持（小程序无 DOM），用面包屑还原现场。
- **H5 端怎么办？** 用官方 `@sentry/browser`，按端条件编译引入。

> 每条的完整解答见 **[文档站 · 常见问题](https://sentry-miniapp.pages.dev/guide/faq)**。

---

## 📖 文档导航

| 文档 | 说明 |
|------|------|
| [文档站](https://sentry-miniapp.pages.dev/) | 快速接入 / 能力矩阵 / FAQ / Source Map / 示例（推荐，带搜索） |
| [Taro 接入指南](https://sentry-miniapp.pages.dev/guide/taro) · [uni-app 接入指南](https://sentry-miniapp.pages.dev/guide/uniapp) | 跨端框架接入与组件错误处理 |
| [Source Map 完整配置指南](./docs/SOURCEMAP_GUIDE.md) | 端到端配置、各构建工具、CI/CD、验证排查 |
| [多端兼容性报告](./docs/MultiPlatformCompatibilityReport.md) | 各小程序平台 API 差异说明 |
| [示例项目](./examples/) | wxapp（原生）/ taro（React）/ uniapp（Vue）三套可运行示例 |
| [开发指南](./DEVELOPMENT.md) · [贡献指南](./CONTRIBUTING.md) | 本地开发、调试与贡献 |

---

## 💬 联系与交流

遇到问题？想探讨小程序监控方案？由于微信群二维码有 7 天时效，请添加作者微信（**备注 sentry-miniapp**），由作者邀请入群：

<img src="docs/qrcode/zhiyao.jpeg" alt="作者微信二维码" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />

---

## License

[MIT](./LICENSE)
