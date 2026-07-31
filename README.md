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

完整版本历史见 [CHANGELOG.md](./CHANGELOG.md)。

---

## ✨ 核心特性

- **🚀 现代 SDK 内核**：基于 Sentry JavaScript V10 SDK 核心模块构建。
- **📱 多端与跨端框架**：一套 API 兼容微信、支付宝、字节、百度、QQ、钉钉、快手，并支持 Taro / uni-app 小程序端。
- **🎯 自动异常与上下文**：自动捕获全局异常、Promise rejection、页面异常、内存告警，并记录设备、交互、网络和页面生命周期面包屑。
- **⚡ 性能、追踪与日志**：采集导航 / 渲染 / 资源 / 自定义 span；API 请求可作为 `http.client` span 串联后端；支持 `Sentry.logger.*` 独立日志。
- **🗺️ Source Map 与堆栈还原**：自动统一多端虚拟堆栈路径，兼容 Debug ID 注入，并可通过 `stackParser` 适配私有引擎或特殊堆栈格式。
- **📡 可靠上报与合规门禁**：断网 / 发送失败自动缓存，恢复后重试；`requireConsent` 支持用户同意前只入缓冲、不发网络。
- **🎮 小游戏能力**：自动识别微信 / 抖音小游戏，提供冷启动首帧耗时、FPS / jank 监控。
- **🛡️ 降噪与过滤**：内置错误去重、采样率控制和发送前过滤钩子，避免日志风暴。

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

接入时注意：

- `Sentry.init` 必须在 `App()` 之前执行，放进 `App.onLaunch` 会丢失部分启动阶段能力。
- 默认集成已包含异常捕获、性能监控、Source Map 路径归一化、网络面包屑、Session 与网络状态监控，通常无需手动传 `integrations`。
- 完整配置项见[文档站 · 配置项参考](https://sentry-miniapp.pages.dev/guide/configuration)。

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

// Sentry Logs（需 init({ enableLogs: true })）
Sentry.logger.info('用户完成支付', { orderId: 'order_123' });

// 自定义测速
await Sentry.startSpan({ name: 'fetch-user', op: 'http.client' }, async () => { /* ... */ });

// 用户反馈：小程序无 DOM，请自行实现原生表单后提交
Sentry.captureFeedback({ message: '页面卡住了', name: '张三', email: 'zhangsan@example.com' });

// 隐私合规：init({ requireConsent: true }) 后，用户同意隐私协议再补发缓冲
Sentry.setConsent(true);
```

采样、Logs、隐私同意、`traceparent` 等高级配置见[文档站 · 配置项参考](https://sentry-miniapp.pages.dev/guide/configuration)。

---

## 🧭 生产配置入口

README 只保留结论，生产接入细节统一看官网：

| 场景 | README 结论 | 详细文档 |
|------|-------------|----------|
| Source Map | `release` 需与上传时一致；SDK 默认归一化为 `app:///`，特殊堆栈可配 `stackParser` | [Source Map 完整配置指南](./docs/SOURCEMAP_GUIDE.md) |
| Taro / uni-app | 小程序端直接用 `sentry-miniapp`；H5 端用官方 `@sentry/browser` | [Taro](https://sentry-miniapp.pages.dev/guide/taro) / [uni-app](https://sentry-miniapp.pages.dev/guide/uniapp) |
| 小游戏 | 初始化方式与小程序一致，小游戏环境会启用专属生命周期与帧率能力 | [支持平台与能力](https://sentry-miniapp.pages.dev/guide/platforms) |
| 主包体积 | 关心主包体积时，用分包异步化 / 动态加载降低主包占用 | [主包体积优化](https://sentry-miniapp.pages.dev/guide/bundle-size) |

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
