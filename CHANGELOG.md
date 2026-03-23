# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.4.0](https://github.com/lizhiyao/sentry-miniapp/compare/v1.3.1...v1.4.0) (2026-03-23)


### ✨ Features | 新功能

* add NetworkBreadcrumbs integration to capture request and response body ([1f56cd1](https://github.com/lizhiyao/sentry-miniapp/commit/1f56cd1494de95a2f6b42f4a841dd5deec14013b))
* make offline cache limit configurable via offlineCacheLimit ([1ca2376](https://github.com/lizhiyao/sentry-miniapp/commit/1ca2376b26b743070296c1593bcad2435abebdc8))


### 🐛 Bug Fixes | 修复

* deprecate showReportDialog and guide users to use captureFeedback ([d2577d4](https://github.com/lizhiyao/sentry-miniapp/commit/d2577d4698d34ec44bbfbd1661612c45f5be618c))
* ignore self-hosted sentry dsn requests in network breadcrumbs ([7e44560](https://github.com/lizhiyao/sentry-miniapp/commit/7e4456065c5ada88188b04225c28636d09742d1a))


### 🎫 Chores | 其他更新

* auto sync build artifact to examples ([0111b8b](https://github.com/lizhiyao/sentry-miniapp/commit/0111b8ba2e4dc63dfc8fadbe9fd1ae5fe5f0bfee))
* configure commit-and-tag-version for automated releases and changelog ([01b9f7a](https://github.com/lizhiyao/sentry-miniapp/commit/01b9f7a457239b3aa3b8c97606dbb515c7a9419f))
* explicitly define npm published files whitelist ([78da4c8](https://github.com/lizhiyao/sentry-miniapp/commit/78da4c82c7c2640ffdffc511b4048509be04c00c))
* update package-lock.json with rollup-plugin-visualizer dependency ([a1902e3](https://github.com/lizhiyao/sentry-miniapp/commit/a1902e30442024c28ebcbf0212849de3df9ed0b5))
* update package.json keywords to improve npm discoverability ([572f405](https://github.com/lizhiyao/sentry-miniapp/commit/572f405f2d0ea25339901f74a54c7d8bfab2ce5a))


### 📝 Documentation | 文档

* add guide for main package size optimization via subpackage async loading ([6cd7b13](https://github.com/lizhiyao/sentry-miniapp/commit/6cd7b13212b63be8e4baf4154cd19d26868f8455))
* consolidate DEVELOPMENT_GUIDE.md into DEVELOPMENT.md ([19e26bd](https://github.com/lizhiyao/sentry-miniapp/commit/19e26bd37cc3ba59d5bbe3e806a365bb8db585fc))
* fix invalid date for v1.3.1 in CHANGELOG ([66f485b](https://github.com/lizhiyao/sentry-miniapp/commit/66f485b047e7e7cd661d0549bed32ec14d562d2d))
* update CHANGELOG for v1.4.0 release ([6350fcc](https://github.com/lizhiyao/sentry-miniapp/commit/6350fcc77ed108b1df7c6e83b0456a80ee1b2b5a))

## [1.4.0] - 2026-03-23

### 新增

- ✨ 新增 `NetworkBreadcrumbs` 集成：支持抓取网络请求的 Request Body 和 Response Body。通过 `traceNetworkBody: true` 开启，方便深度排查接口异常。
- ✨ 离线缓存上限可配置：在 `Sentry.init` 中新增 `offlineCacheLimit` 选项，允许开发者根据业务场景调大离线重试队列（默认 30）。
- 🚀 支持全平台自动构建同步：重构构建脚本，`npm run build` 现在会自动将产物同步至示例工程，提升本地开发和直接拷贝单文件用户的体验。

### 修复 & 优化

- 🐛 修复无限死循环：在 `NetworkBreadcrumbs` 中自动忽略了配置的自托管（Self-Hosted）Sentry DSN 域名以及 `sentry.io`，防止上报请求被拦截。
- 🗑️ 废弃 `showReportDialog`：小程序环境不支持 Sentry 官方 HTML 弹窗，已废弃该方法并输出清晰的警告，文档中增加了自定义 UI + `captureFeedback` 的最佳实践。
- 📦 优化主包体积说明：在 README 中增加了关于“利用分包异步化实现 0KB 主包占用”的详细指南。
- 🔍 优化 NPM 发现率：补充了全量的小程序平台和跨端框架中英文关键词。
- 📚 文档精简：合并并删除了冗余的 `DEVELOPMENT_GUIDE.md`。

## [1.3.1] - 2026-03-23

### 修复

- 🐛 修复事件上报中出现大量 `undefined` 值的问题
- 🔧 改进系统信息收集逻辑，为所有可能为 undefined 的字段提供默认值
- ✅ 增强 `getSystemInfo` 函数的健壮性，确保返回的数据结构完整
- 🎯 改进事件构建器中的系统信息处理，提供完整的回退机制

### 新增

- 🧪 新增系统信息处理的测试用例，验证 undefined 字段的处理
- 🧪 新增系统信息不可用时的回退值测试

## [1.0.1-beta.1] - 2025-01-07

### 修复

- 🐛 修复 Performance API 集成中的 TypeError 错误 (`entries.forEach is not a function`)
- 🔧 为不同的 PerformanceObserver 回调参数格式添加健壮处理
- ✅ 改进与微信小程序 PerformanceObserver 实现的兼容性

### 改进

- 🎯 增强 `_handlePerformanceEntries` 方法以处理各种条目格式：
  - 标准数组格式
  - 单个对象格式
  - PerformanceObserverEntryList 类对象
  - 无效/null 参数（优雅处理）

### 新增

- 🧪 为不同 Performance API 条目格式添加额外测试用例

## [未发布]

### 新增

- ✅ 大幅提升测试覆盖率，新增 274+ 测试用例
- 🧪 新增 `crossPlatform.test.ts` - 测试平台检测、SDK获取和系统信息功能
- 🧪 新增 `eventbuilder.test.ts` - 测试事件构建、异常处理和消息格式化
- 🧪 新增 `polyfills.test.ts` - 测试 polyfill 功能
- 🧪 新增 `version.test.ts` - 测试版本信息导出
- 🧪 新增 `dedupe.test.ts` - 测试去重集成功能
- 🧪 新增 `router.test.ts` - 测试路由集成功能
- 📁 新增 `integration-tests/` 目录 - 包含端到端集成测试
- 🔧 新增开发模式监听构建 (`npm run dev`)
- 📚 完善开发文档和贡献指南

### 改进

- 🧪 增强 `helpers.test.ts` - 补充更多工具函数测试
- 🔧 修复测试隔离问题 - 解决模块缓存导致的测试干扰
- 🎯 优化测试结构 - 改进异步导入和测试期望值
- 📝 更新 README.md - 反映最新功能和测试状态
- 📝 更新 DEVELOPMENT.md - 添加测试和质量保证指南
- 🏗️ 改进构建配置 - 支持开发和生产模式

### 移除

- 🗑️ 清理过时文件 - 移除 `test-scripts` 目录下的调试脚本
- 🧹 重构测试脚本 - 将调试脚本移至 `integration-tests` 目录

### 修复

- 🐛 修复 `crossPlatform.test.ts` 中的测试失败问题
- 🐛 解决模块缓存导致的测试隔离问题
- 🔧 修复 TypeScript 类型错误
- ✅ 确保所有测试稳定通过

---

## 版本说明

### 语义化版本控制

本项目遵循 [语义化版本控制](https://semver.org/lang/zh-CN/) 规范：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 变更类型

- **新增** - 新功能
- **改进** - 对现有功能的改进
- **修复** - 问题修复
- **移除** - 移除的功能
- **安全** - 安全相关的修复
- **废弃** - 即将移除的功能

### 图标说明

- ✅ 完成的功能
- 🧪 测试相关
- 🔧 开发工具
- 📚 文档
- 🐛 Bug 修复
- 🎯 性能优化
- 🏗️ 构建系统
- 📁 文件结构
- 🗑️ 删除
- 🧹 重构
