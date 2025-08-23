# Sentry Envelope 大小限制解决方案

## 问题描述

在使用 Sentry 小程序 SDK 时，可能会遇到以下错误：

```
400 Bad Request: envelope exceeded size limits for type 'event'
```

这个错误表示发送到 Sentry 的事件数据包（envelope）超过了大小限制。

## 问题原因

Sentry 对不同类型的事件有大小限制：<mcreference link="https://develop.sentry.dev/sdk/envelopes/#size-limits" index="0">0</mcreference>

- **事件（Event）**: 通常限制在 1MB 以内
- **实际建议**: 保持在 256KB 以内以确保稳定性

导致事件过大的常见原因：

1. **面包屑数据过多**: 大量的用户交互、导航、请求记录
2. **上下文信息过大**: 设备信息、应用状态、自定义上下文
3. **额外数据过多**: 通过 `setExtra()` 添加的大量调试信息
4. **堆栈跟踪过深**: 复杂的调用链产生的长堆栈

## 解决方案

### 1. 在 beforeSend 中限制事件大小

```javascript
Sentry.init({
  dsn: 'your-dsn',
  beforeSend(event) {
    // 限制面包屑数量
    if (event.breadcrumbs && event.breadcrumbs.length > 20) {
      event.breadcrumbs = event.breadcrumbs.slice(-20); // 只保留最近20个
    }
    
    // 检查事件大小
    const eventSize = JSON.stringify(event).length;
    if (eventSize > 200000) { // 200KB 限制
      console.warn('[Sentry] 事件过大 (' + eventSize + ' bytes)，正在优化...');
      
      // 移除大型上下文数据（保留核心信息）
      if (event.contexts) {
        Object.keys(event.contexts).forEach(key => {
          if (key !== 'device' && key !== 'app' && key !== 'miniapp') {
            delete event.contexts[key];
          }
        });
      }
      
      // 进一步限制面包屑
      if (event.breadcrumbs && event.breadcrumbs.length > 10) {
        event.breadcrumbs = event.breadcrumbs.slice(-10);
      }
      
      // 限制额外数据大小
      if (event.extra) {
        const extraSize = JSON.stringify(event.extra).length;
        if (extraSize > 10000) { // 10KB
          event.extra = { note: '额外数据因大小限制被移除' };
        }
      }
    }
    
    return event;
  },
});
```

### 2. 配置面包屑集成

```javascript
Sentry.init({
  dsn: 'your-dsn',
  integrations: [
    // 自定义面包屑配置
    ...Sentry.getDefaultIntegrations().map(integration => {
      if (integration.name === 'Breadcrumbs') {
        return new Sentry.Integrations.Breadcrumbs({
          console: true,
          navigation: true,
          request: true,
          userInteraction: true,
        });
      }
      return integration;
    }),
  ],
});
```

### 3. 谨慎使用 setContext 和 setExtra

```javascript
// ❌ 避免添加大量数据
Sentry.setContext('large_data', {
  data: 'x'.repeat(100000), // 100KB 数据
  array: new Array(10000).fill('data')
});

// ✅ 只添加必要的调试信息
Sentry.setContext('app_state', {
  current_page: 'index',
  user_action: 'click_button',
  timestamp: new Date().toISOString()
});

// ✅ 限制额外数据大小
Sentry.setExtra('debug_info', {
  action: 'user_click',
  element_id: 'submit_btn',
  // 避免添加大型对象或长字符串
});
```

### 4. 监控事件大小

```javascript
Sentry.init({
  dsn: 'your-dsn',
  beforeSend(event) {
    const eventSize = JSON.stringify(event).length;
    console.log('[Sentry] 事件大小:', eventSize, 'bytes');
    
    if (eventSize > 100000) { // 100KB
      console.warn('[Sentry] 事件较大，建议优化');
    }
    
    return event;
  },
});
```

## 最佳实践

### 1. 面包屑管理
- 限制面包屑数量在 20-50 个以内
- 避免在面包屑中存储大量数据
- 定期清理不必要的面包屑类型

### 2. 上下文信息
- 只添加调试必需的上下文信息
- 避免存储完整的对象或数组
- 使用简洁的键值对

### 3. 额外数据
- 限制 `setExtra()` 中的数据大小
- 避免存储二进制数据或长文本
- 考虑使用引用而不是完整数据

### 4. 堆栈跟踪
- 合理设置 `Error.stackTraceLimit`
- 避免过深的函数调用链

## 验证修复

使用以下代码验证事件大小是否合理：

```javascript
// 在 beforeSend 中添加大小检查
beforeSend(event) {
  const eventSize = JSON.stringify(event).length;
  const envelopeSize = eventSize * 1.3; // 估算 envelope 大小
  
  console.log('事件大小:', eventSize, 'bytes');
  console.log('预估 envelope 大小:', Math.round(envelopeSize), 'bytes');
  
  if (envelopeSize > 262144) { // 256KB
    console.error('事件可能过大，需要优化');
  }
  
  return event;
}
```

## 示例项目修复

本项目的示例小程序已经应用了上述解决方案：

- 在 `examples/wxapp/app.js` 中添加了事件大小限制
- 限制面包屑数量在 20 个以内
- 移除过大的上下文和额外数据
- 保留核心调试信息（device、app、miniapp）

这些修改确保了异步错误和其他事件能够正常上报，避免 400 错误。