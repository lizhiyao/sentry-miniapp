# Sentry Miniapp SDK — 小程序监控 SDK

![npm version](https://img.shields.io/npm/v/sentry-miniapp)
![npm download](https://img.shields.io/npm/dm/sentry-miniapp)
![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)
![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)
![test coverage](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg)
![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)

简体中文 | [English](./README.en.md)

一个基于 `@sentry/core` (v10.45.0) 核心构建的**小程序监控 SDK**，提供**异常监控**、**性能监控**、离线缓存、分布式追踪等能力。支持微信、支付宝、字节跳动、百度、QQ、钉钉、快手等多端小程序及 Taro / uni-app 等跨端框架。

> **💡 版本说明**
>
> - `v1.x.x`：全新架构，基于 Sentry V10 核心，全面支持微信、支付宝、字节跳动、百度、QQ、钉钉、快手等多端小程序及主流跨端框架（Taro / uni-app 等）。
> - `v0.x.x`：旧版本，已停止维护。

---

## ✨ 核心特性

- **🚀 现代架构**：基于最新的 Sentry JavaScript V10 SDK 核心模块构建。
- **📱 真正的多端支持**：内置 API 抹平引擎，一套代码无缝兼容**微信、支付宝、字节、百度、QQ、钉钉、快手**等主流小程序平台。
- **🎯 全自动异常捕获**：无需侵入业务代码，自动监听并上报生命周期异常（`onError`、`onUnhandledRejection`、`onPageNotFound`、`onMemoryWarning`）。
- **🍞 丰富的上下文面包屑**：自动记录设备信息、用户点击/触摸操作、网络请求（XHR/Fetch）、以及页面路由导航路径。
- **🗺️ 内置 SourceMap 路径抹平**：自动处理微信、支付宝、字节等多端小程序的虚拟堆栈路径，配合 sentry-cli 极简实现 SourceMap 解析。
- **📡 弱网离线缓存机制**：专为小程序网络环境设计，断网或发送失败时自动缓存 Event 到本地 Storage，网络恢复后静默重试上报，确保数据不丢失。
- **⚡ 深度性能监控**：集成小程序 Performance API，全面采集导航性能（FCP/LCP）、渲染性能、资源加载耗时及用户自定义性能标记。
- **�️ 智能降噪与过滤**：内置强大的错误去重和采样率控制机制，避免日志风暴。
- **🔧 跨端框架友好**：完美支持在 Taro、uni-app 等第三方多端编译框架中集成使用。
- **🔗 分布式追踪**：自动在网络请求中注入 `sentry-trace` / `baggage` 头，串联小程序与后端服务的完整调用链。
- **📊 Session 健康监控**：自动管理会话生命周期，在 Sentry Release Health 面板展示崩溃率和会话健康数据。
- **📶 网络状态监控**：实时追踪网络变化（WiFi/4G/离线），帮助排查网络相关的异常。
- **🔍 堆栈解析**：内置多平台堆栈解析器，支持 V8/Safari/JavaScriptCore 格式，配合 SourceMap 精准定位错误。

---

## 📦 安装

推荐使用 `npm` 进行安装。

```bash
npm install sentry-miniapp --save
```

> **注意：** `v1.1.0` 及以上版本已优化构建策略（内联依赖），**无需**再额外安装 `@sentry/core`。

*提示：如果您不使用 npm，也可以直接将项目仓库中 `examples/wxapp/lib/sentry-miniapp.js` 文件复制到小程序项目中引入。*

---

## 🚀 快速接入

### 1. 前置准备

1. 确保您有可用的 Sentry 平台账号（可以使用 [官方 Sentry SaaS](https://sentry.io/) 或 私有化部署服务）。
2. **非常重要**：在各平台的小程序管理后台，将 Sentry 的上报接口域名添加到 `request` 合法域名列表中。

### 2. 初始化 SDK

请在小程序入口文件（如 `app.js` 或 `app.ts`）的**最顶部**（调用 `App()` 之前）初始化 Sentry。

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
  environment: 'production', // 环境变量: production / development
  release: 'my-project-name@1.0.0', // 版本号，建议与 sourcemap 配合使用
  
  // --- 小程序特性配置 ---
  platform: 'wechat', // 当前平台 (wechat | alipay | bytedance | dd | swan 等)
  enableSystemInfo: true, // 自动采集系统与设备信息
  enableUserInteractionBreadcrumbs: true, // 自动记录用户点击行为
  enableNavigationBreadcrumbs: true, // 自动记录页面路由跳转
  traceNetworkBody: true, // [新增] 是否在面包屑中记录网络请求的请求体和响应体 (默认 false)
  
  // --- 离线缓存与可靠性 ---
  enableOfflineCache: true, // 开启断网离线缓存与重试机制 (默认开启)
  offlineCacheLimit: 30, // 离线缓存的最大事件数 (默认 30，可调大以防弱网下丢失更多数据)
  
  // --- SourceMap 支持 ---
  enableSourceMap: true, // 开启自动将堆栈的虚拟路径转为统一格式，配合上传 sourcemap 时的 --url-prefix "app:///"
  
  // --- 性能与采样率 ---
  sampleRate: 1.0, // 异常上报采样率 (0.0 - 1.0)

  // --- 分布式追踪 ---
  enableTracePropagation: true, // [新增] 自动在请求头中注入 sentry-trace/baggage（默认 true）
  tracePropagationTargets: ['api.example.com'], // [新增] 仅对指定域名注入追踪头（为空则全部注入）

  // --- Session 与网络监控 ---
  enableAutoSessionTracking: true, // [新增] 自动管理 Session 生命周期（默认 true）
  enableNetworkStatusMonitoring: true, // [新增] 实时监控网络状态变化（默认 true）

  // 可选：性能监控配置
  integrations: [
    Sentry.performanceIntegration({
      enableNavigation: true, // 导航耗时监控
      enableRender: true, // 渲染耗时监控
      enableResource: true, // 资源加载耗时
    }),
  ]
});

// 初始化完成后，再调用 App
App({
  onLaunch() {
    // ...
  }
});
```

---

## 📚 常用进阶用法

初始化完成后，SDK 会自动在后台工作。您也可以使用以下 API 进行手动埋点或主动上报。

### 手动异常与消息上报

```javascript
// 手动捕获并上报一个 Error 对象
try {
  throw new Error('支付接口解析失败');
} catch (error) {
  Sentry.captureException(error);
}

// 记录一条关键信息
Sentry.captureMessage('用户主动取消了授权', 'info');
```

### 丰富上下文信息 (Context & Breadcrumbs)

```javascript
// 设置当前操作的用户信息
Sentry.setUser({
  id: 'user_12345',
  username: 'John Doe'
});

// 设置用于过滤和统计的全局标签
Sentry.setTag('page_module', 'checkout_counter');

// 手动添加一条业务追踪面包屑
Sentry.addBreadcrumb({
  message: '用户点击了[确认支付]按钮',
  category: 'action',
  level: 'info',
  data: { cartId: 'c_888' }
});
```

### 自定义性能测速 (Performance)

```javascript
// 标记起始点
Sentry.addPerformanceMark('api-request-start');
// ... 执行耗时操作
Sentry.addPerformanceMark('api-request-end');

// 测量并记录该区间
Sentry.measurePerformance('fetch-user-data', 'api-request-start', 'api-request-end');
```

### 动态采样 (tracesSampler)

除了全局 `sampleRate`，你还可以通过 `tracesSampler` 回调实现按页面、按场景的精细化采样控制：

```javascript
Sentry.init({
  dsn: '...',
  tracesSampler: ({ name, inheritOrSampleWith }) => {
    // 核心页面 100% 采样
    if (name.includes('pages/index') || name.includes('pages/pay')) {
      return 1;
    }
    // 低优先级页面降低采样率
    if (name.includes('pages/about') || name.includes('pages/settings')) {
      return 0.1;
    }
    // 继承上游采样决策，或使用默认 50% 采样率
    return inheritOrSampleWith(0.5);
  },
});
```

> **注意：** 设置 `tracesSampler` 后，`tracesSampleRate` 将被忽略。`tracesSampler` 的优先级更高。

---

## 🗺️ Source Map 支持与配置

SDK 内置了多端堆栈路径归一化能力（`enableSourceMap: true`，默认开启），自动将各平台虚拟路径转换为统一的 `app:///` 前缀，配合 sentry-cli 即可实现 Source Map 解析。

**快速上传示例：**

```bash
sentry-cli releases files “my-miniapp@1.0.0” upload-sourcemaps ./dist \
  --url-prefix “app:///” \
  --ext js --ext map
```

> 详细的端到端配置指南（包括各构建工具配置、CI/CD 集成、验证与排查），请参阅 **[Source Map 完整配置指南](./docs/SOURCEMAP_GUIDE.md)**。

---

## 💬 用户反馈 (User Feedback)

在 Web 环境中，Sentry 提供了一个现成的 `showReportDialog()` 弹窗。但在小程序环境中没有 DOM 无法直接渲染该组件，因此 `showReportDialog()` 已被**废弃**。

请您**自行实现一个原生小程序表单（或弹窗）**来收集用户的反馈信息，然后调用 `Sentry.captureFeedback()` 提交到 Sentry 后台：

```javascript
// 当发生错误，或者用户主动点击“反馈”按钮时，展示您自己画的表单：
const userMessage = '页面卡住了，点什么都没反应';
const userName = '张三';
const userEmail = 'zhangsan@example.com';

// 将收集到的反馈发送给 Sentry
Sentry.captureFeedback({
  message: userMessage,
  name: userName,
  email: userEmail,
  // 选填：如果您想把这个反馈和某个具体的错误事件关联起来：
  // associatedEventId: 'abc123xyz...'
});
```

---

## 📦 主包体积优化 (0KB 主包占用方案)

小程序的“主包体积”非常宝贵（通常限制在 2MB 以内）。`sentry-miniapp` 由于集成了完整的 `@sentry/core` 核心引擎和多端适配，原始体积约在 100KB 左右。

如果您非常在意主包体积，**强烈建议使用平台提供的「分包异步化」或「动态加载」特性**，将 SDK 的体积完全转移到分包中。

### 方案 A：微信 / 支付宝小程序（推荐）

微信和支付宝等平台原生支持[分包异步化](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html)。

**具体操作步骤：**

1. 将 `sentry-miniapp` 的 npm 包或者构建后的文件放入您的某个分包目录中（例如 `subpackageA`）。
2. 在您的 `app.js` 顶部，使用 `require.async` 异步懒加载 SDK 并进行初始化：

```javascript
// app.js
App({
  onLaunch() {
    // 异步加载分包中的 sentry
    require.async('./subpackageA/sentry-miniapp.js').then((Sentry) => {
      Sentry.init({
        dsn: 'https://xxxxxxxx@sentry.io/12345',
        // ...其他配置
      });
      console.log('Sentry 异步加载并初始化成功');
    }).catch(err => {
      console.error('Sentry 加载失败', err);
    });
  }
});
```

*通过这种方式，Sentry 的 100KB 体积将**全部算入 `subpackageA` 的分包体积**，主包占用为 0！*

### 方案 B：其他小程序平台（字节、百度等）

对于暂不支持 `require.async` 的平台，您可以采用**分包预下载 + API 动态加载**的方式：

1. 同样将 SDK 放入分包（如 `subpackageA`）。
2. 在 `app.js` 中使用平台原生的分包加载 API 先下载分包，下载成功后再通过同步 `require` 引入 SDK：

```javascript
// 以字节小程序为例
App({
  onLaunch() {
    const loadTask = tt.loadSubpackage({
      name: 'subpackageA',
      success: () => {
        // 分包加载成功后，就可以安全地 require 了
        const Sentry = require('./subpackageA/sentry-miniapp.js');
        Sentry.init({ dsn: '...' });
      }
    });
  }
});
```

*注：如果您使用的是 Taro / uni-app 等跨端框架，可以直接使用 `import('sentry-miniapp')` 动态导入语法，框架会在编译时自动抹平各端差异。*

---

## ❓ 常见问题 (FAQ)

### 1. 初始化后无法自动上报异常，必须在 `onError` 中手动调 API 吗？

**完全不需要**。
`sentry-miniapp` 在初始化时会自动劫持并注册平台底层的全局错误监听（如 `wx.onError`）。只要确保 `Sentry.init` 在 `App()` 调用**之前**执行，它就能自动捕获所有未处理的 JS 异常。
如果发现没上报，请检查：

1. Sentry 域名是否加入了小程序后台合法域名。
2. `sampleRate` (采样率) 是否被意外设置得太低。
3. 微信开发者工具某些环境下的报错不会触发底层 `onError`，建议在**真机预览**下测试。

### 2. 这个 SDK 支持 Session Replay (屏幕操作回放) 吗？

目前 **不支持** `Sentry.replayIntegration()`。
Sentry 官方的 Replay 功能强依赖于浏览器标准 DOM 环境（通过 rrweb 录制）。小程序采用双线程架构且没有开放标准 DOM 接口，无法直接复用。建议通过完善**Breadcrumbs（面包屑路径）**结合**自定义日志**来还原用户操作现场。

---

## 📖 文档导航

| 文档 | 说明 |
|------|------|
| [Source Map 完整配置指南](./docs/SOURCEMAP_GUIDE.md) | 端到端 Source Map 配置，覆盖各构建工具、CI/CD 集成、验证与排查 |
| [多端兼容性报告](./docs/MultiPlatformCompatibilityReport.md) | 各小程序平台 API 兼容性矩阵与差异说明 |
| [示例项目](./examples/wxapp/) | 微信小程序完整接入示例 |
| [开发指南](./DEVELOPMENT.md) | 本地开发环境搭建与调试 |
| [贡献指南](./CONTRIBUTING.md) | 如何参与项目贡献 |

---

## 🤝 参与贡献

我们非常欢迎开发者提交 `Pull Request` 或通过 `Issues` 提出宝贵意见！

要参与本地开发：

1. `npm install` 安装依赖
2. `npm run dev` 启动监听编译
3. `npm run test:all` 运行完整的单元测试与集成测试套件

---

## 💬 联系与交流

遇到问题？想探讨小程序监控方案？欢迎加入我们的交流群。
由于微信群二维码有 7 天时效性限制，请添加作者微信（**备注 sentry-miniapp**），由作者邀请您入群：

<img src="docs/qrcode/zhiyao.jpeg" alt="作者微信二维码" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
