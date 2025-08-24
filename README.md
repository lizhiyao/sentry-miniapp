# Sentry Miniapp SDK

![npm version](https://img.shields.io/npm/v/sentry-miniapp)
![npm download](https://img.shields.io/npm/dm/sentry-miniapp)
![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)
![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)
![github watchers](https://img.shields.io/github/watchers/lizhiyao/sentry-miniapp?style=social)
![github license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)
![test coverage](https://img.shields.io/badge/test%20coverage-274%2B%20tests-brightgreen.svg)

基于 `@sentry/core` 10.5.0 的微信小程序异常监控 SDK。

## 特性

- 🚀 基于最新的 Sentry JavaScript SDK 核心模块（@sentry/core 10.5.0）
- 📱 支持微信小程序和微信小游戏
- 🔍 自动捕获 JavaScript 异常和未处理的 Promise 拒绝
- 🍞 自动记录面包屑（用户操作、网络请求、页面导航等）
- 📊 收集系统信息和设备信息
- 🎯 支持自定义错误过滤和数据处理
- 💪 TypeScript 支持
- ✅ 完善的测试覆盖率（274+ 测试用例）
- 🛡️ 稳定可靠的错误处理和去重机制
- 🔧 开发友好的调试和集成测试工具

## 安装

```bash
npm install sentry-miniapp
```

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
  platform: 'wechat', // 'wechat' | 'alipay' | 'bytedance' | 'qq' | 'baidu'
  enableSystemInfo: true, // 是否收集系统信息
  enableUserInteractionBreadcrumbs: true, // 是否记录用户交互面包屑
  enableConsoleBreadcrumbs: true, // 是否记录控制台日志面包屑
  enableNavigationBreadcrumbs: true, // 是否记录导航面包屑
  
  // 采样率配置
  sampleRate: 1.0, // 错误采样率
  
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

## 功能特点

- [x] 基于 [sentry-javascript 最新的基础模块](https://www.yuque.com/lizhiyao/dxy/zevhf1#0GMCN) 封装
- [x] 遵守[官方统一的 API 设计文档](https://www.yuque.com/lizhiyao/dxy/gc3b9r#vQdTs)，使用方式和官方保持一致
- [x] 使用 [TypeScript](https://www.typescriptlang.org/) 进行编写
- [x] 包含 Sentry SDK（如：[@sentry/browser](https://github.com/getsentry/sentry-javascript/tree/master/packages/browser)）的所有基础功能
- [x] 支持 `ES6`、`CommonJS` 两种模块系统（支持小程序原生开发方式、使用小程序框架开发方式两种开发模式下使用）
- [x] 默认监听并上报小程序的 onError、onUnhandledRejection、onPageNotFound、onMemoryWarning 事件返回的信息（各事件支持程度与对应各小程序官方保持一致）
- [x] 默认上报运行小程序的设备、操作系统、应用版本信息
- [x] 支持微信小程序
- [x] 支持微信小游戏
- [x] 支持在 [Taro](https://taro.aotu.io/) 等第三方小程序框架中使用
- [x] 默认上报异常发生时的路由栈
- [x] 完善的代码测试覆盖率（274+ 测试用例，覆盖核心功能模块）
- [x] 智能错误去重和过滤机制
- [x] 完整的集成测试套件

## 用法

支持两种使用方式：

- 直接引用
- 通过 npm 方式使用（推荐）

### 注意

1. 无论选择哪种使用方式，都需要开启「微信开发者工具 - 设置 - 项目设置 - 增强编译」功能
2. 使用前需要确保有可用的 `Sentry Service`，比如：使用 [官方 Sentry Service](https://sentry.io/welcome/) 服务 或[自己搭建 Sentry Service](https://docs.sentry.io/server/)。如果想直接将异常信息上报到 <https://sentry.io/>，由于其没有备案，可以先将异常信息上报给自己已备案域名下的服务端接口，由服务端进行请求转发。
3. 在小程序管理后台配置 `Sentry Service` 对应的 `request` 合法域名

### 直接引用

1. 下载构建好的文件：
   - 微信小程序：从 `examples/wxapp/lib/sentry-miniapp.js` 获取
   - 或者运行 `npm run build:miniapp` 生成最新版本
2. 将文件放入项目的合适目录中，比如 `lib` 或 `vendor` 文件夹
3. 参照 `examples/wxapp/app.js` 代码，进行 `Sentry` 的初始化
4. `sentry-miniapp` 会自动上报微信小程序 `wx.onError()` 捕获的异常

### npm 方式

1. 安装依赖

   ```bash
   npm install sentry-miniapp --save
   # 或者
   yarn add sentry-miniapp
   ```

2. 使用「微信开发者工具 - 工具 - 构建 npm」进行构建，详情可参考[npm 支持](https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html)

3. 在 `app.js` 中引用并初始化 `Sentry`，根据实际需求设置上报到 Sentry 的元信息

   ```js
   import * as Sentry from "sentry-miniapp";

   // init Sentry
   // init options: https://github.com/getsentry/sentry-javascript/blob/master/packages/types/src/options.ts
   Sentry.init({
     dsn: "__DSN__",
     // ...
   });

   // Set user information, as well as tags and further extras
   Sentry.configureScope((scope) => {
     scope.setExtra("battery", 0.7);
     scope.setTag("user_mode", "admin");
     scope.setUser({ id: "4711" });
     // scope.clear();
   });

   // Add a breadcrumb for future events
   Sentry.addBreadcrumb({
     message: "My Breadcrumb",
     // ...
   });

   // Capture exceptions, messages or manual events
   Sentry.captureException(new Error("Good bye"));
   Sentry.captureMessage("Hello, world!");
   Sentry.captureEvent({
     message: "Manual",
     stacktrace: [
       // ...
     ],
   });
   ```

## 开发

### 知识储备

开发前请仔细阅读下面内容：

- [Sentry 官方文档](https://docs.sentry.io/)
- [sentry-javascript 项目](https://github.com/getsentry/sentry-javascript)
- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)

#### sentry-core 设计图

![Dashboard](docs/sentry-core.png)

#### sentry-hub 设计图

![Dashboard](docs/sentry-hub.png)

#### sentry-miniapp 设计图

![Dashboard](docs/sentry-miniapp.png)

### 相关命令

```bash
# 开发相关命令
npm run dev                    # 启动开发模式（监听文件变化）
npm run build:miniapp          # 构建小程序开发版本
npm run build                  # 构建生产版本
npm run build:types            # 构建类型定义文件

# 测试相关命令
npm test                       # 运行完整测试套件（274+ 测试用例）
npm run test:watch             # 监听模式运行测试
npm run test:coverage          # 生成测试覆盖率报告
npm run test:integration       # 运行集成测试

# 代码质量
npm run lint                   # 代码检查
npm run lint:fix               # 自动修复代码问题

# 发布相关命令
npm run prepublishOnly         # 发布前构建
npm publish                    # 发布到 npm
```

## 效果图

![Dashboard](docs/screenshot/sentry-admin.png)
![Error00](docs/screenshot/sentry-error-00.png)
![Error01](docs/screenshot/sentry-error-01.png)
![Error02](docs/screenshot/sentry-error-02.png)

## 谁在使用 sentry-miniapp

### 微信小程序

- 丁香医生
- 丁香医生医生端
- 丁香人才
- 丁香家

## 参考资料

- [sentry-javascript](https://github.com/getsentry/sentry-javascript)
- [Sentry 官方文档](https://docs.sentry.io/)
- [Sentry JavaScript SDKs](https://docs.sentry.io/platforms/javascript/)
- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [wx.request](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)
- [小程序 App](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html)
- [wx.onError、App.onError 疑惑及如何捕获 Promise 异常？](https://developers.weixin.qq.com/community/develop/doc/000c8cf5794770272709f38a756000)

## 其他小程序异常监控产品

- [Fundebug](https://www.fundebug.com/)
- [FrontJS](https://www.frontjs.com/home/tour)
- [Bugout](https://bugout.testin.cn/)

## 贡献

欢迎通过 `issue`、`pull request` 等方式贡献 `sentry-miniapp`。

### 贡献指南

1. **Fork 项目并创建分支**
   ```bash
   git clone https://github.com/your-username/sentry-miniapp.git
   git checkout -b feature/your-feature-name
   ```

2. **安装依赖并设置开发环境**
   ```bash
   npm install
   npm run dev  # 启动开发模式
   ```

3. **编写代码和测试**
   - 修改 `src/` 目录下的源码
   - 为新功能添加相应的测试用例
   - 确保测试覆盖率不降低

4. **运行测试和检查**
   ```bash
   npm test                # 运行完整测试套件
   npm run lint            # 代码风格检查
   npm run build:miniapp   # 验证构建
   ```

5. **在示例项目中验证**
   - 在 `examples/wxapp` 中测试新功能
   - 确保在真实小程序环境中正常工作

6. **提交 Pull Request**
   - 提供清晰的变更说明
   - 包含测试用例和文档更新
   - 确保所有 CI 检查通过

### 测试要求

- 新功能必须包含相应的单元测试
- 测试覆盖率应保持在高水平
- 集成测试应验证端到端功能
- 所有测试必须通过才能合并

## 联系作者

PS. 由于微信群二维码有时效性限制，想入群的同学还可以加作者微信（添加时请备注 sentry-miniapp），由作者邀请入群

### sentry-miniapp 微信交流群

<img src="docs/qrcode/sentry-miniapp.jpeg" alt="微信交流群二维码" width="300" height="400" />

### 作者微信二维码

<img src="docs/qrcode/zhiyao.jpeg" alt="作者微信二维码" width="300" height="300" />
