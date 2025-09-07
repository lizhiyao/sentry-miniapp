# Performance API 集成

本文档介绍了 sentry-miniapp 中 Performance API 集成的功能和使用方法。

## 功能概述

Performance API 集成为微信小程序提供了全面的性能监控能力，包括：

- **导航性能监控**：自动收集页面导航和路由切换的性能数据
- **渲染性能监控**：监控页面渲染和组件更新的性能指标
- **资源加载监控**：跟踪图片、文件等资源的加载性能
- **用户自定义性能标记**：支持开发者自定义的性能测量点
- **性能阈值检查**：自动检测性能问题并发送警告
- **智能数据上报**：定期汇总和上报性能数据

## 配置选项

```javascript
Sentry.init({
  // ... 其他配置
  integrations: [
    // ... 其他集成
    new Sentry.Integrations.PerformanceIntegration({
      // 启用导航性能监控
      enableNavigationTiming: true,
      
      // 启用渲染性能监控
      enableRenderTiming: true,
      
      // 启用资源加载监控
      enableResourceTiming: true,
      
      // 启用用户自定义性能标记
      enableUserTiming: true,
      
      // 性能数据采样率 (0.0 - 1.0)
      sampleRate: 1.0,
      
      // 性能条目缓冲区大小
      bufferSize: 100,
      
      // 数据上报间隔 (毫秒)
      reportInterval: 30000,
    }),
  ],
});
```

## 性能阈值

集成会自动检查以下性能阈值，并在超出时发送警告：

- **导航性能**：平均导航时间 > 3000ms
- **渲染性能**：平均渲染时间 > 1000ms
- **资源加载**：平均加载时间 > 2000ms

## 自定义性能标记

开发者可以使用微信小程序的 Performance API 添加自定义性能标记：

```javascript
// 标记操作开始
wx.performance.mark('operation-start');

// 执行一些操作...

// 标记操作结束
wx.performance.mark('operation-end');

// 测量操作耗时
wx.performance.measure('operation-duration', 'operation-start', 'operation-end');
```

## 性能数据结构

上报到 Sentry 的性能数据包含以下信息：

```javascript
{
  // 性能摘要
  performance_summary: {
    total_entries: 50,
    navigation_count: 5,
    render_count: 20,
    resource_count: 15,
    measure_count: 8,
    mark_count: 12,
    report_time: '2024-01-15T10:30:00.000Z',
    
    // 导航性能统计
    navigation_stats: {
      avg_duration: 1200,
      max_duration: 2500,
      min_duration: 800
    },
    
    // 渲染性能统计
    render_stats: {
      avg_duration: 450,
      max_duration: 800,
      min_duration: 200
    },
    
    // 资源加载统计
    resource_stats: {
      avg_load_time: 600,
      max_load_time: 1500,
      total_transfer_size: 1024000,
      avg_transfer_size: 68266
    }
  }
}
```

## 面包屑记录

集成会自动为重要的性能事件添加面包屑：

- 页面导航事件
- 性能警告（超出阈值时）
- 用户自定义性能标记

## 兼容性

- **微信小程序**：支持基础库 2.11.0 及以上版本
- **开发者工具**：部分 Performance API 在开发者工具中可能不可用
- **真机调试**：建议在真机上测试性能监控功能

## 最佳实践

1. **合理设置采样率**：在生产环境中建议设置较低的采样率以减少性能开销
2. **自定义性能标记**：为关键业务流程添加自定义性能标记
3. **监控关键页面**：重点监控首页、核心功能页面的性能
4. **定期分析数据**：定期查看 Sentry 中的性能数据，识别性能瓶颈

## 示例代码

查看 `examples/wxapp/pages/test/test.js` 中的 `testPerformanceAPI` 方法，了解如何测试 Performance API 集成功能。

## 故障排除

### Performance API 不可用

如果在开发者工具中遇到 Performance API 不可用的情况：

1. 确保微信开发者工具版本为最新
2. 在真机上进行测试
3. 检查小程序基础库版本

### 性能数据未上报

如果性能数据没有出现在 Sentry 中：

1. 检查 `sampleRate` 配置是否大于 0
2. 确认 `reportInterval` 设置合理
3. 查看控制台是否有错误信息
4. 验证 Sentry DSN 配置正确