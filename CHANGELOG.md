# 更新日志

本文档记录了 sentry-miniapp 项目的所有重要变更。

## [1.0.1-beta.2] - 2025-01-07

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