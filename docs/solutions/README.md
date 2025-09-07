# Sentry 小程序 SDK 解决方案文档

本文件夹包含了 Sentry 小程序 SDK 在实际使用中遇到的常见问题及其解决方案。

## 文档列表

### [DEDUPE_SOLUTION.md](./DEDUPE_SOLUTION.md)
**Sentry 去重机制问题解决方案**
- 问题：多次点击相同消息只上报一次
- 原因：Sentry 的 Dedupe 集成会过滤重复事件
- 解决方案：在消息内容中添加时间戳或唯一标识符

### [ENVELOPE_SIZE_SOLUTION.md](./ENVELOPE_SIZE_SOLUTION.md)
**Sentry 事件包大小限制问题解决方案**
- 问题：异步错误上报返回 400 错误，提示 "envelope exceeded size limits"
- 原因：面包屑、上下文信息过多导致事件包超过大小限制
- 解决方案：在 beforeSend 中限制事件大小和面包屑数量

### [DUPLICATE_REPORTING_SOLUTION.md](./DUPLICATE_REPORTING_SOLUTION.md)
**Sentry 重复上报问题解决方案**
- 问题：点击一次测试异步错误会发出 2 个上报请求
- 原因：TryCatch 集成和小程序 onError 处理器双重捕获
- 解决方案：移除 onError 中的手动捕获，依赖自动捕获机制

## 使用指南

这些文档基于实际项目中遇到的问题，提供了：

1. **问题描述**：详细说明问题现象和影响
2. **原因分析**：深入分析问题的技术原因
3. **解决方案**：提供完整的代码修复方案
4. **验证方法**：包含测试脚本验证修复效果
5. **最佳实践**：总结预防类似问题的最佳实践

## 相关资源

- [Sentry 官方文档](https://docs.sentry.io/)
- [小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/)
- [项目示例代码](../../examples/wxapp/)

## 贡献

如果您在使用过程中遇到新的问题或有更好的解决方案，欢迎提交 Issue 或 Pull Request。