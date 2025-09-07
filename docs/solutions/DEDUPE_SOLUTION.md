# Sentry 去重机制解决方案

## 问题描述

用户反映多次点击测试异常捕获时，只有第一次发送了异常上报请求。这是因为 Sentry SDK 的 Dedupe integration 在起作用。

## 去重机制原理

Sentry 的 Dedupe integration 会比较以下内容来判断事件是否重复：

1. **异常类型** (`exception.type`)
2. **异常消息** (`exception.value`)
3. **指纹** (`fingerprint`)
4. **堆栈跟踪** (`stacktrace`)

如果这些内容完全相同，后续的异常会被过滤掉，不会发送到 Sentry 服务器。

## 解决方案

### 方案 1：添加动态内容（推荐用于测试）

在异常消息中添加时间戳或其他动态内容：

```javascript
// 修改前
throw new Error('这是一个测试异常');

// 修改后
const timestamp = new Date().toISOString();
throw new Error(`这是一个测试异常 - ${timestamp}`);
```

### 方案 2：使用自定义指纹

为每次异常设置不同的指纹：

```javascript
Sentry.captureException(error, {
  fingerprint: [`test-exception-${Date.now()}`],
  tags: {
    action: 'test_exception',
    click_count: clickCount,
  }
});
```

### 方案 3：禁用 Dedupe integration（不推荐）

```javascript
Sentry.init({
  dsn: 'your-dsn',
  integrations: [
    // 排除 Dedupe integration
    ...Sentry.getDefaultIntegrations().filter(
      integration => integration.name !== 'Dedupe'
    )
  ]
});
```

### 方案 4：使用不同的异常类型

```javascript
class TestException extends Error {
  constructor(message, clickCount) {
    super(message);
    this.name = `TestException_${clickCount}`;
  }
}

throw new TestException('测试异常', clickCount);
```

## 生产环境建议

在生产环境中，去重机制是有益的，因为它可以：

1. **减少噪音**：避免相同错误的重复上报
2. **节省配额**：减少 Sentry 事件配额的消耗
3. **提高效率**：让开发者专注于不同类型的错误

因此，建议：

- **测试环境**：使用方案 1 或 2 来确保每次测试都能上报
- **生产环境**：保持默认的去重机制
- **特殊情况**：如果确实需要捕获相同的错误多次，使用自定义指纹

## 验证方法

使用提供的测试脚本验证修复效果：

```bash
node test-multiple-exceptions.js
```

应该看到每次点击都会：
1. 调用 `beforeSend`
2. 发送 `wx.request`
3. 生成不同的事件 ID

## 最佳实践

1. **测试代码**：添加动态标识符确保每次测试都能上报
2. **生产代码**：保持去重机制，使用有意义的错误消息和上下文
3. **监控配置**：合理设置采样率和过滤规则
4. **错误分类**：使用标签和上下文信息帮助错误分类和调试