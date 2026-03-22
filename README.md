# Sentry Miniapp SDK

![npm version](https://img.shields.io/npm/v/sentry-miniapp)
![npm download](https://img.shields.io/npm/dm/sentry-miniapp)
![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)
![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)
![test coverage](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg)
![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)

一个基于 `@sentry/core` (v10.45.0) 核心构建的**多端小程序异常与性能监控 SDK**。旨在为小程序开发者提供与 Web 端一致的、强大且现代的 Sentry 监控体验。

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
- **📡 弱网离线缓存机制**：专为小程序网络环境设计，断网或发送失败时自动缓存 Event 到本地 Storage，网络恢复后静默重试上报，确保数据不丢失。
- **⚡ 深度性能监控**：集成小程序 Performance API，全面采集导航性能（FCP/LCP）、渲染性能、资源加载耗时及用户自定义性能标记。
- **�️ 智能降噪与过滤**：内置强大的错误去重和采样率控制机制，避免日志风暴。
- **🔧 跨端框架友好**：完美支持在 Taro、uni-app 等第三方多端编译框架中集成使用。

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
  
  // --- 离线缓存与可靠性 ---
  enableOfflineCache: true, // 开启断网离线缓存与重试机制 (默认开启)
  
  // --- 性能与采样率 ---
  sampleRate: 1.0, // 异常上报采样率 (0.0 - 1.0)
  
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
