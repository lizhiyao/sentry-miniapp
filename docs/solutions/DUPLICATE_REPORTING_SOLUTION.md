# Sentry 重复上报问题解决方案

## 问题描述

在测试异步错误时，发现点击一次测试按钮会发出 2 个上报请求，导致同一个错误被重复上报到 Sentry。

## 问题原因分析

### 1. 双重捕获机制

Sentry SDK 中存在两个错误捕获机制同时工作：

1. **TryCatch 集成**：自动捕获未处理的异步错误
2. **小程序 onError 处理器**：手动调用 `Sentry.captureException`

### 2. 错误流程

```
异步错误发生
    ↓
TryCatch 集成自动捕获 → 发送第1个请求
    ↓
小程序 onError 被触发
    ↓
手动调用 Sentry.captureException → 发送第2个请求
```

### 3. 代码层面的问题

**修复前的 app.js：**
```javascript
onError: function (msg) {
  console.error('小程序发生脚本错误或 API 调用失败', msg);
  
  // ❌ 问题：手动捕获错误，导致重复上报
  Sentry.captureException(new Error(msg));
},
```

**TryCatch 集成（默认启用）：**
```javascript
// 在 defaultIntegrations 中自动包含
export const defaultIntegrations: Integration[] = [
  new HttpContext(),
  new Dedupe(),
  new GlobalHandlers(),
  new TryCatch(), // ← 自动捕获异步错误
  new Breadcrumbs(),
  new LinkedErrors(),
];
```

## 解决方案

### 1. 移除手动捕获

修改 `app.js` 中的 `onError` 处理器，移除手动调用 `Sentry.captureException`：

**修复后的 app.js：**
```javascript
onError: function (msg) {
  console.error('小程序发生脚本错误或 API 调用失败', msg);
  
  // ✅ 修复：不需要手动捕获错误，TryCatch 集成会自动捕获
  // 避免重复上报，这里只记录日志
},
```

### 2. 依赖自动捕获机制

TryCatch 集成会自动处理以下类型的错误：
- 未捕获的异步错误（setTimeout、Promise 等）
- 函数执行中的异常
- 事件处理器中的错误

### 3. 保留必要的手动捕获

只在以下情况下使用手动 `Sentry.captureException`：
- 已经被 try-catch 捕获的错误
- 需要添加特定上下文信息的错误
- 业务逻辑错误（非系统级错误）

## 验证结果

### 修复前
```
点击测试异步错误按钮
↓
发送 2 个请求：
1. TryCatch 集成自动捕获
2. onError 手动捕获
```

### 修复后
```
点击测试异步错误按钮
↓
发送 1 个请求：
1. TryCatch 集成自动捕获 ✅
```

## 最佳实践

### 1. 错误捕获策略

```javascript
// ✅ 推荐：让 TryCatch 集成自动处理
testAsyncError: Sentry.wrap(function() {
  setTimeout(function() {
    throw new Error('异步错误'); // TryCatch 会自动捕获
  }, 1000);
}),

// ✅ 推荐：手动捕获已处理的错误
testHandledError: function() {
  try {
    riskyOperation();
  } catch (error) {
    // 手动捕获并添加上下文
    Sentry.captureException(error, {
      tags: { action: 'risky_operation' },
      extra: { context: 'additional_info' }
    });
  }
}
```

### 2. 小程序错误处理

```javascript
// ✅ 正确的 onError 处理
onError: function (msg) {
  console.error('小程序发生脚本错误', msg);
  // 只记录日志，不手动上报
  // TryCatch 集成会自动处理
},

// ✅ 正确的网络错误处理
wx.request({
  url: 'https://api.example.com',
  fail: function(err) {
    // 网络错误需要手动捕获
    Sentry.captureException(new Error('网络请求失败: ' + err.errMsg));
  }
});
```

### 3. 集成配置

```javascript
// ✅ 使用默认集成（包含 TryCatch）
Sentry.init({
  dsn: 'your-dsn',
  integrations: [
    ...Sentry.getDefaultIntegrations(), // 包含 TryCatch
  ],
});

// ❌ 避免禁用 TryCatch 集成
Sentry.init({
  dsn: 'your-dsn',
  integrations: [
    ...Sentry.getDefaultIntegrations().filter(
      integration => integration.name !== 'TryCatch'
    ),
  ],
});
```

## 相关集成说明

### TryCatch 集成
- **作用**：自动捕获未处理的异步错误
- **覆盖范围**：setTimeout、setInterval、Promise、事件处理器
- **行为**：捕获错误后会重新抛出（保持原有错误流程）

### GlobalHandlers 集成
- **作用**：捕获全局错误事件
- **小程序中**：监听 `onError`、`onUnhandledRejection` 等
- **与 TryCatch 的关系**：互补，处理不同类型的错误

### Dedupe 集成
- **作用**：去除重复的错误事件
- **限制**：只能去除完全相同的事件，不能处理来源不同的相同错误

## 总结

重复上报问题的根本原因是**错误捕获机制重叠**。解决方案是：

1. **信任自动捕获**：让 TryCatch 集成处理系统级错误
2. **避免手动重复**：不在 onError 中手动调用 `Sentry.captureException`
3. **明确分工**：自动捕获处理系统错误，手动捕获处理业务错误

这样既能确保错误不被遗漏，又能避免重复上报，提高错误监控的准确性和效率。