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

为**小程序与小游戏**接入 Sentry，结合设备、操作和请求记录排查线上异常；按需开启性能采样，分析请求与业务操作的耗时。

支持微信、支付宝、字节跳动、百度、QQ、钉钉、快手小程序，以及微信和抖音小游戏，适用于原生、**Taro** 和 **uni-app** 项目。

**[快速开始](https://sentry-miniapp.pages.dev/guide/getting-started)** · [完整文档](https://sentry-miniapp.pages.dev/) · [示例工程](https://sentry-miniapp.pages.dev/guide/examples)

---

## ✨ 核心能力与适用场景

| 你遇到的问题 | 接入后可以做什么 |
| --- | --- |
| 用户反馈线上报错，本地却难以复现 | 在 Sentry 集中查看异常，结合设备、页面、操作和请求记录还原出错经过 |
| 错误堆栈只有压缩文件和行号，找不到业务源码 | 上传对应构建的 Source Map 后，定位到原始源码位置并查看代码上下文 |
| 登录、支付或页面操作变慢，不知道卡在哪一步 | 开启性能采样后查看请求与业务步骤的耗时；配置链路追踪后关联已接入 Sentry 的后端操作 |
| 业务失败没有抛异常，缺少可查询的排查记录 | 主动记录独立业务日志和指标，查询关键步骤、统计失败次数或耗时分布 |
| 用户在弱网环境出错，监控请求也发送失败 | 将符合策略的数据暂存到有容量上限的本地队列，网络恢复后尝试补发 |
| 必须等用户同意隐私协议后才能发送监控数据 | 配置同意门禁，在同意前暂停 Sentry 网络发送，同意后尝试补发缓冲数据 |
| 微信 / 抖音小游戏也需要监控异常和卡顿 | 将小游戏异常与会话接入同一套 Sentry 监控，按需开启帧率与卡顿统计 |

自动采集范围取决于平台能力；React / Vue 组件错误需要接入框架错误处理，小游戏帧率监控需要主动开启。按项目类型查看 [Taro](https://sentry-miniapp.pages.dev/guide/taro)、[uni-app](https://sentry-miniapp.pages.dev/guide/uniapp)、[小游戏指南](https://sentry-miniapp.pages.dev/guide/minigame)或[平台支持范围](https://sentry-miniapp.pages.dev/guide/platforms)。

---

源码中的[实验性微信页面回放](https://sentry-miniapp.pages.dev/guide/page-replay)可按需录制选定页面，构建工具自动生成普通节点与静态组件标记；使用 npm 组件时先完成微信 npm 构建。纯模板入口、插件及动态库暂不支持自动标记，真机开销与自建后台仍待验收。当前 npm `2.0.2` 尚无此入口。已有实现和后台证据见 [#530](https://github.com/lizhiyao/sentry-miniapp/issues/530)，组件兼容与后续验收见 [#533](https://github.com/lizhiyao/sentry-miniapp/issues/533)。

源码示例还提供[本地回放验证](https://sentry-miniapp.pages.dev/guide/page-replay#先在本地验证-不上传-sentry)：导出录制后在本机查看，不占 Sentry 云服务额度；本地结果与后台验收分别记录。

## 接入要求

> 本文与当前官网面向 **2.x 正式版**。已有 1.x 项目升级，或自建后台暂时无法升级时，先看[版本选择与迁移说明](https://sentry-miniapp.pages.dev/guide/migration-2.0#version-choice)。

使用 Sentry 官方云服务，或 **26.4.2 及以上的自建 Sentry**。更旧的自建后台不在 2.x 支持范围内；只收到错误事件不能证明其它监控能力兼容。

## 🚀 5 分钟跑通

**接入前确认**：

- 已确认 Sentry 后台满足接入要求，创建好项目并复制该项目的 DSN。
- 小程序后台已把 Sentry 上报域名加入 `request` 合法域名。
- 宿主具备基础 JavaScript 能力；标准方法补齐和可选观测的降级边界见[运行时兼容说明](https://sentry-miniapp.pages.dev/guide/platform-compatibility)。

安装：

```bash
npm install sentry-miniapp
```

原生微信项目还需在开发者工具中执行「工具 → 构建 npm」；目录要求见[快速接入](https://sentry-miniapp.pages.dev/guide/getting-started#_1-安装)。Taro / uni-app 由框架构建处理依赖。

> 不使用 npm 时，可从 [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases) 下载对应版本的 `sentry-miniapp.umd.js`，放入项目的 `lib/` 目录，将下方导入改为 `const Sentry = require('./lib/sentry-miniapp.umd.js');`。调试源码仓库中的微信示例时，运行 `yarn build:miniapp` 生成示例依赖。

在入口文件（`app.js` / `app.ts`）**最顶部、`App()` 之前**初始化：

```javascript
const Sentry = require('sentry-miniapp');

Sentry.init({
  dsn: 'YOUR_DSN', // 复制 Sentry 项目中的完整 DSN
  release: 'my-project@1.0.0', // 与上传 Source Map 时的 release 一致
  environment: 'production',
});

App({ onLaunch() {} });
```

验证是否打通：

```javascript
Sentry.captureException(new Error('sentry test'));
```

然后到 Sentry 的 Issues 列表查看事件。

确认错误上报后，再按项目流量配置 `tracesSampleRate` 开启性能监控，见[性能与链路追踪](https://sentry-miniapp.pages.dev/guide/performance-and-tracing)。最小接入配置不启动性能采样。

没看到事件时，优先确认 DSN、合法域名、初始化位置和采样配置；完整排查清单见 [文档站 · 快速接入](https://sentry-miniapp.pages.dev/guide/getting-started) 与 [FAQ](https://sentry-miniapp.pages.dev/guide/faq#no-events)。

### 🤖 AI Coding Agent 辅助接入

在自己的小程序 / 小游戏项目中安装接入 skill：

```bash
npx --yes degit lizhiyao/sentry-miniapp/.agents/skills/sentry-miniapp-sdk .agents/skills/sentry-miniapp-sdk
```

然后让 Agent「使用 `sentry-miniapp-sdk` skill，识别平台和框架，完成初始化并给出验证步骤」。未自动发现时，让它读取 `.agents/skills/sentry-miniapp-sdk/SKILL.md`；使用方法见 [skill 指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/.agents/skills/sentry-miniapp-sdk/SKILL.md)。

---

## 📚 配置你需要的监控

基础错误上报打通后，可以[补充用户与业务上下文、记录日志](https://sentry-miniapp.pages.dev/guide/errors-and-context)，或[测量请求与业务操作耗时](https://sentry-miniapp.pages.dev/guide/performance-and-tracing)。需要用户同意后才能发送数据时，按[隐私同意指南](https://sentry-miniapp.pages.dev/guide/reliability-and-privacy)配置并验证；方法和参数见[常用 API](https://sentry-miniapp.pages.dev/guide/api)与[配置参考](https://sentry-miniapp.pages.dev/guide/configuration)。

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
| 排查没有事件、自动捕获、追踪或隐私同意问题 | [常见问题](https://sentry-miniapp.pages.dev/guide/faq) |
| 查看版本历史与每次发布内容 | [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases) |
| 参与开发或贡献 | [架构文档](https://github.com/lizhiyao/sentry-miniapp/blob/master/ARCHITECTURE.md) / [开发指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md) / [贡献指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/CONTRIBUTING.md) |

---

## 💬 联系与交流

如果是接入问题或线上排查，建议优先在 GitHub 提出来，方便把排查结论沉淀为可搜索的答案：

- **Bug / 没有数据 / Source Map 不还原**：[提交 Issue](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose)，请附 SDK 版本、目标平台、复现步骤、关键配置和 `Sentry.getDiagnostics()` 输出。
- **功能建议 / 监控方案讨论**：[发起 Discussion](https://github.com/lizhiyao/sentry-miniapp/discussions)，说明业务场景、目标平台和期望行为。

分享配置和日志前，请移除 Auth Token、AppSecret 和用户隐私数据。

想实时交流小程序 / 小游戏监控方案，可以加入微信群。由于微信群二维码有 7 天时效，请添加作者微信（**备注 sentry-miniapp**），由作者邀请入群：

<img src="https://raw.githubusercontent.com/lizhiyao/sentry-miniapp/master/docs/qrcode/zhiyao.jpeg" alt="作者微信二维码" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
