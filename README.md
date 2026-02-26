# Sentry Miniapp SDK

![npm version](https://img.shields.io/npm/v/sentry-miniapp)
![npm download](https://img.shields.io/npm/dm/sentry-miniapp)
![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)
![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)
![github watchers](https://img.shields.io/github/watchers/lizhiyao/sentry-miniapp?style=social)
![github license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)
![test coverage](https://img.shields.io/badge/test%20coverage-286%20tests-brightgreen.svg)

基于 `@sentry/core` 10.39.0 的微信小程序异常监控 SDK。

> 注意：
1、sentry-miniapp v1.x.x 版本暂时只支持微信小程序和微信小游戏。
2、sentry-miniapp v0.x.x 版本已停止维护

## 特性

- 🚀 基于最新的 Sentry JavaScript SDK 核心模块
- 🎨 遵守 Sentry 官方统一的 API 设计文档，使用方式和官方保持一致
- 📍 默认上报异常发生时的路由栈
- 🎯 自动捕获小程序生命周期异常（onError、onUnhandledRejection、onPageNotFound、onMemoryWarning）
- 🍞 自动记录面包屑（设备、用户操作、网络请求、页面导航等）
- 🛡️ 智能错误去重和过滤机制
- ⚡ 全面的性能监控（导航性能、渲染性能、资源加载、用户自定义性能标记）
- 📈 智能性能阈值检查和自动警告
- 🔧 支持在 Taro 等第三方小程序框架中使用
- 📱 支持微信小程序和微信小游戏
- 🔧 TypeScript 编写，提供完整的类型定义
- 📦 支持 ES6 和 CommonJS 两种模块系统
- 📊 完善的测试覆盖率（286 测试用例，覆盖核心功能模块）
- 🔍 完整的集成测试套件

扫码体验：sentry-miniapp 使用示例小程序
<img src="docs/qrcode/sentry-miniapp.jpg" alt="sentry-miniapp 使用示例小程序" width="300" height="300" />

## 安装和使用

### 前置要求

1. 使用前需要确保有可用的 `Sentry Service`，比如：使用 [官方 Sentry Service](https://sentry.io/welcome/) 服务 或[自己搭建 Sentry Service](https://docs.sentry.io/server/)。如果想直接将异常信息上报到 <https://sentry.io/>，由于其没有备案，可以先将异常信息上报给自己已备案域名下的服务端接口，由服务端进行请求转发。
2. 在小程序管理后台配置 `Sentry Service` 对应的 `request` 合法域名

### 安装依赖

推荐使用 npm 方式。

**稳定版本：**

   ```bash
   npm install sentry-miniapp --save
   ```

> **注意：** v1.1.0 版本升级了核心依赖 `@sentry/core` 至 10.39.0，并优化了构建策略（内联依赖），不再需要额外安装 `@sentry/core`。

### 重要提示

项目仓库中`examples/wxapp/lib/sentry-miniapp.js` 文件，也可以可以直接复制到小程序中使用。

## 快速开始

### 1. 初始化 SDK

在小程序的 `app.js` 或 `app.ts` 中初始化 Sentry：

```javascript
import * as Sentry from 'sentry-miniapp';

// 在 App() 之前初始化
Sentry.init({
  dsn: 'YOUR_SENTRY_DSN_HERE',
  environment: 'production', // 或 'development'
  debug: false, // 开发环境可设置为 true
  
  // 小程序特有配置
  platform: 'wechat', 
  enableSystemInfo: true, // 是否收集系统信息
  enableUserInteractionBreadcrumbs: true, // 是否记录用户交互面包屑
  enableConsoleBreadcrumbs: true, // 是否记录控制台日志面包屑
  enableNavigationBreadcrumbs: true, // 是否记录导航面包屑
  
  // 采样率配置
  sampleRate: 1.0, // 错误采样率
  
  // 性能监控配置（可选）
  integrations: [
    // 性能监控集成
    Sentry.performanceIntegration({
      enableNavigation: true, // 导航性能监控
      enableRender: true, // 渲染性能监控
      enableResource: true, // 资源加载监控
      enableUserTiming: true, // 用户自定义性能标记
      sampleRate: 1.0, // 性能数据采样率
      reportInterval: 30000, // 数据上报间隔（毫秒）
    }),
  ]
  
  // 过滤配置
  beforeSend(event) {
    // 可以在这里过滤或修改事件
    return event;
  },
});

App({
  // 你的小程序配置
});
```

### 2. 手动捕获异常

```javascript
import * as Sentry from 'sentry-miniapp';

// 捕获异常
try {
  // 可能出错的代码
  throw new Error('Something went wrong!');
} catch (error) {
  Sentry.captureException(error);
}

// 捕获消息
Sentry.captureMessage('用户执行了某个操作', 'info');

// 添加面包屑
Sentry.addBreadcrumb({
  message: '用户点击了按钮',
  category: 'ui',
  level: 'info',
  data: {
    buttonId: 'submit-btn'
  }
});

// 设置用户信息
Sentry.setUser({
  id: '12345',
  username: 'john_doe',
  email: 'john@example.com'
});

// 设置标签
Sentry.setTag('page', 'home');

// 设置上下文
Sentry.setContext('character', {
  name: 'Mighty Fighter',
  age: 19,
  attack_type: 'melee'
});
```

### 3. 性能监控

```javascript
import * as Sentry from 'sentry-miniapp';

// 手动标记性能时间点
Sentry.addPerformanceMark('page-load-start');
// ... 页面加载逻辑
Sentry.addPerformanceMark('page-load-end');

// 测量性能区间
Sentry.measurePerformance('page-load', 'page-load-start', 'page-load-end');

// 记录自定义性能数据
Sentry.recordPerformance({
  name: 'api-request',
  value: 1200, // 毫秒
  unit: 'millisecond',
  tags: {
    endpoint: '/api/user',
    method: 'GET'
  }
});
```

## 常见问题 (FAQ)

### 1. SDK 支持 Session Replay (会话回放) 吗？

目前 `sentry-miniapp` **不支持** `Sentry.replayIntegration()` 会话回放功能。

**原因：**
Sentry 的 Session Replay 功能主要依赖于 Web 环境下的 DOM 录制技术（如 rrweb）。微信小程序环境没有标准的 DOM 接口，且视图层与逻辑层分离，无法直接复用 Web 端的录制实现。

**建议替代方案：**

- 使用面包屑（Breadcrumbs）记录详细的用户操作路径。
- 结合性能监控（Performance）和日志（Logging）还原问题现场。

### 2. 在 `sentry.init` 之后，无法自动上报异常，需要在 `onError` 中手动上报吗？

**不需要**。

`sentry-miniapp` SDK 在初始化时会自动调用 `wx.onError` (以及 `wx.onUnhandledRejection` 等) 来监听全局异常。只要 `Sentry.init` 调用成功，SDK 就会自动捕获并上报未处理的异常。

**如果发现无法自动上报，请检查以下几点：**

1. **初始化时机**：确保 `Sentry.init` 是在 `App()` 函数调用**之前**执行的。
2. **合法域名**：请确保在微信小程序后台配置了 Sentry 的 `request` 合法域名。
3. **过滤配置**：检查 `sampleRate` (采样率) 是否设置过低，或者 `beforeSend` 回调函数是否过滤了该错误。
4. **环境因素**：在微信开发者工具中，某些错误可能不会触发 `wx.onError`，建议在真机上进行测试。

**如果确实需要手动上报**（例如在 `try...catch` 中捕获的异常），可以使用 `Sentry.captureException(error)`。

## 贡献

欢迎通过 `issue`、`pull request` 等方式贡献 `sentry-miniapp`。

## 联系作者

### sentry-miniapp 微信交流群

由于微信群二维码有时效性限制，想入群的同学可以加作者微信（添加时请备注 sentry-miniapp），由作者邀请入群

### 作者微信二维码

<img src="docs/qrcode/zhiyao.jpeg" alt="作者微信二维码" width="300" height="300" />
