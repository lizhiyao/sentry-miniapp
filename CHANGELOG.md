# 更新日志

本文档记录了 sentry-miniapp 项目的所有重要变更。
## [1.6.0](https://github.com/lizhiyao/sentry-miniapp/compare/v1.5.0...v1.6.0) (2026-03-26)


### ✨ Features | 新功能

* 新增 13 项功能优化，全面提升监控能力 ([f407bf0](https://github.com/lizhiyao/sentry-miniapp/commit/f407bf0615315259cf1aa8fdad41d74494f699f2))


### 🐛 Bug Fixes | 修复

* 修复技术审查发现的 16 项问题 ([2cd5a82](https://github.com/lizhiyao/sentry-miniapp/commit/2cd5a82b549753afecd4f616d0f2714e62b57273))


### ⚡ Performance Improvements | 性能优化

* 启用 esbuild 压缩，包体积减少约 59% ([2c98974](https://github.com/lizhiyao/sentry-miniapp/commit/2c989745bb3a9bebe9c85d29792c7b9c45e07b34))


### ✅ Tests | 测试

* 补充测试覆盖率，新增 Performance vs Profiling 文档 ([7b24c68](https://github.com/lizhiyao/sentry-miniapp/commit/7b24c6807b853269c8ef3ed00ac06e8d588f8790))

## [1.5.0](https://github.com/lizhiyao/sentry-miniapp/compare/v1.4.1...v1.5.0) (2026-03-24)


### ✨ Features | 新功能

* 增强 Performance 集成：可配阈值、setData 慢渲染检测、内存采集 ([3b2e88d](https://github.com/lizhiyao/sentry-miniapp/commit/3b2e88ddc9d42b155d734383b37fdca5af82be87))
* 新增页面生命周期、用户交互和 Console 面包屑集成 ([476c0f9](https://github.com/lizhiyao/sentry-miniapp/commit/476c0f90038fb6b5b3464136c63c066a23e56819))
* 路由集成适配全平台并补全多平台测试覆盖 ([691c491](https://github.com/lizhiyao/sentry-miniapp/commit/691c49130cfe94fb1dbcee56afff6c21a8ec6d4f))


### 🐛 Bug Fixes | 修复

* 构建时同步 SourceMap 文件到示例项目 ([664de93](https://github.com/lizhiyao/sentry-miniapp/commit/664de93237efeb7bc3de92bf7489de82034caba9))


### 🎫 Chores | 其他更新

* 同步示例项目中的 SDK 构建产物 ([71913c9](https://github.com/lizhiyao/sentry-miniapp/commit/71913c9bb58b28eadcd879f7bc10d44ebb685e1f))
* 锁定 @sentry/core 为固定版本 10.45.0 ([d72133e](https://github.com/lizhiyao/sentry-miniapp/commit/d72133e2543b09c4093947dfd7b9fd7cd919dd45))


### 📝 Documentation | 文档

* 更新 PERFORMANCE_API.md 新增阈值和内存采集配置说明 ([9d1cf12](https://github.com/lizhiyao/sentry-miniapp/commit/9d1cf127120a6d73d6e146e4ae61ae6cfda18b41))

## [1.4.1](https://github.com/lizhiyao/sentry-miniapp/compare/v1.4.0...v1.4.1) (2026-03-23)


### 🐛 Bug Fixes | 修复

* **ci:** 加回 --update-checksums 以应对 npm registry 的 integrity 变更 ([799ce6c](https://github.com/lizhiyao/sentry-miniapp/commit/799ce6cc949940b8d831d929e9657cff235342e9))
* **ci:** 移除 yarn 缓存以彻底避免 integrity hash 不匹配问题 ([5b6ed8c](https://github.com/lizhiyao/sentry-miniapp/commit/5b6ed8c8cfa29295a25d501f4e145e98dc6ae5d8))
* 同步 SDK_VERSION 至 1.4.0 并新增版本一致性校验 ([e863f9a](https://github.com/lizhiyao/sentry-miniapp/commit/e863f9abeedcea6ad53b7b531233709bfd7845f7))
* 安装 prettier、修复镜像源检测正则、清理 ESLint 警告 ([7db125e](https://github.com/lizhiyao/sentry-miniapp/commit/7db125e567e2a4417b34129fa3d09c89c843a16a))


### 🎫 Chores | 其他更新

* **ci:** 升级基础 Node 版本至 20 以适配最新依赖 (eslint-visitor-keys) ([aa6e770](https://github.com/lizhiyao/sentry-miniapp/commit/aa6e7704267f4ecb1b2702d70091a9626c0ece55))
* 从 npm 发布产物中移除 CHANGELOG.md 以进一步精简包体积 ([f86fa49](https://github.com/lizhiyao/sentry-miniapp/commit/f86fa49774ed9dfffc6a05010ccf8f131d90d44f))
* 从 npm 发布产物中移除不必要的 src 目录以减小包体积 ([5cd523b](https://github.com/lizhiyao/sentry-miniapp/commit/5cd523b695b69ad6024899e9d2bfd0f576df7c43))
* 同步示例项目中的 SDK 构建产物 ([405207d](https://github.com/lizhiyao/sentry-miniapp/commit/405207d1401db81f4ade1681d5b16918ad9b8ca5))
* 新增 CLAUDE.md 并清理冗余配置文件 ([7e024a0](https://github.com/lizhiyao/sentry-miniapp/commit/7e024a02f44f976fe2f6a0b409b4a74c4d81755c))
* 配置 commit-and-tag-version 自动同步 SDK_VERSION ([1137d26](https://github.com/lizhiyao/sentry-miniapp/commit/1137d26fbad21b13cdc27b985a75f0576cabd51f))


### 📝 Documentation | 文档

* 修复文档中的过时内容 ([63c261a](https://github.com/lizhiyao/sentry-miniapp/commit/63c261a22153fea58115e18801a42ffecd7b59e6))

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
