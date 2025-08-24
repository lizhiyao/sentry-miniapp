# 集成测试脚本

本文件夹包含了用于验证 Sentry 小程序 SDK 各种功能和问题修复的集成测试脚本。这些测试模拟真实的小程序环境，进行端到端的功能验证。

## 脚本列表

### [debug-miniapp-request.js](./debug-miniapp-request.js)
**基础调试脚本**
- 用途：调试 Sentry SDK 的基本功能
- 功能：模拟小程序环境，测试异常捕获和网络请求

### [test-async-error-size.js](./test-async-error-size.js)
**异步错误大小测试脚本**
- 用途：重现 "envelope exceeded size limits" 问题
- 功能：模拟大量面包屑和上下文数据，测试事件包大小限制

### [test-duplicate-async-error.js](./test-duplicate-async-error.js)
**重复上报测试脚本**
- 用途：验证异步错误重复上报问题的修复
- 功能：测试 TryCatch 集成和手动捕获的冲突

### [test-multiple-exceptions.js](./test-multiple-exceptions.js)
**多次异常测试脚本**
- 用途：测试多次异常捕获功能
- 功能：模拟连续点击异常捕获按钮的场景

### [test-multiple-messages.js](./test-multiple-messages.js)
**多次消息测试脚本**
- 用途：验证消息去重问题的修复
- 功能：测试添加时间戳后的多次消息上报

### [test-size-limit-fix.js](./test-size-limit-fix.js)
**大小限制修复验证脚本**
- 用途：验证事件包大小限制问题的修复效果
- 功能：测试 beforeSend 中的大小限制逻辑

## 使用方法

所有脚本都可以通过 Node.js 直接运行：

```bash
# 运行单个集成测试
node integration-tests/test-duplicate-async-error.js

# 运行核心集成测试套件
npm run test:integration

# 运行所有测试（单元测试 + 集成测试）
npm run test:all

# 或者从项目根目录运行特定脚本
cd /path/to/sentry-miniapp
node integration-tests/脚本名称.js
```

## 脚本特点

1. **模拟环境**：所有脚本都模拟了小程序环境（wx 对象）
2. **网络监控**：监控并显示 Sentry 的网络请求
3. **详细日志**：提供详细的执行日志和结果分析
4. **自动验证**：自动判断测试结果是否符合预期

## 相关文档

- [解决方案文档](../docs/solutions/)
- [示例项目](../examples/wxapp/)
- [开发指南](../DEVELOPMENT_GUIDE.md)

## 注意事项

- 这些脚本仅用于测试和验证，不应在生产环境中使用
- 脚本中的 DSN 是示例用途，实际使用时请替换为您自己的 DSN
- 运行脚本前请确保已安装项目依赖