// 测试事件大小限制修复
const Sentry = require('./examples/wxapp/lib/sentry-miniapp.js');

// 模拟小程序环境
global.wx = {
  request: function(options) {
    console.log('\n=== wx.request 调用 ===');
    console.log('URL:', options.url);
    console.log('Method:', options.method);
    
    // 计算请求体大小
    const dataSize = options.data ? Buffer.byteLength(options.data, 'utf8') : 0;
    console.log('请求体大小:', dataSize, 'bytes');
    
    if (dataSize > 262144) { // 256KB
      console.log('❌ 请求体仍然过大 (>256KB)');
      if (options.fail) {
        options.fail({
          statusCode: 400,
          errMsg: 'envelope exceeded size limits for type \'event\''
        });
      }
    } else {
      console.log('✅ 请求体大小合理 (<256KB)');
      // 模拟成功响应
      if (options.success) {
        options.success({
          statusCode: 200,
          data: { success: true }
        });
      }
    }
    
    // 解析并显示事件内容
    if (options.data) {
      try {
        const lines = options.data.split('\n');
        const eventLine = lines.find(line => line.includes('"exception"') || line.includes('"message"'));
        if (eventLine) {
          const event = JSON.parse(eventLine);
          console.log('\n--- 优化后的事件分析 ---');
          console.log('事件ID:', event.event_id);
          
          if (event.breadcrumbs) {
            console.log('面包屑数量:', event.breadcrumbs.length);
            console.log('面包屑总大小:', JSON.stringify(event.breadcrumbs).length, 'bytes');
          }
          
          if (event.contexts) {
            console.log('上下文数量:', Object.keys(event.contexts).length);
            console.log('保留的上下文:', Object.keys(event.contexts).join(', '));
          }
          
          if (event.extra) {
            console.log('额外数据:', event.extra);
          }
          
          const eventSize = JSON.stringify(event).length;
          console.log('\n--- 大小验证 ---');
          console.log('事件JSON大小:', eventSize, 'bytes');
          console.log('是否超过200KB限制:', eventSize > 200000 ? '是' : '否');
        }
      } catch (e) {
        console.log('解析事件失败:', e.message);
      }
    }
  },
  
  getSystemInfo: function() {
    return {
      platform: 'devtools',
      version: '8.0.5',
      SDKVersion: '2.19.4',
      brand: 'iPhone',
      model: 'iPhone 12',
      system: 'iOS 15.0',
      language: 'zh_CN',
      screenWidth: 375,
      screenHeight: 812
    };
  },
  
  showToast: function(options) {
    console.log('Toast:', options.title);
  }
};

try {
  // 使用修复后的配置初始化 Sentry
  Sentry.init({
    dsn: 'https://47703e01ba4344b8b252c15e8fd980fd@o113510.ingest.us.sentry.io/1528228',
    environment: 'test',
    debug: false,
    
    // 小程序特有配置
    platform: 'wechat',
    enableSystemInfo: true,
    enableUserInteractionBreadcrumbs: true,
    enableConsoleBreadcrumbs: true,
    enableNavigationBreadcrumbs: true,
    
    // 采样率配置
    sampleRate: 1.0,
    
    // 限制事件大小以避免 400 错误
    beforeSend(event) {
      // 过滤包含敏感信息的事件
      if (event.message && event.message.includes('password')) {
        return null;
      }
      
      // 限制面包屑数量以控制事件大小
      if (event.breadcrumbs && event.breadcrumbs.length > 20) {
        event.breadcrumbs = event.breadcrumbs.slice(-20); // 只保留最近20个
      }
      
      // 检查事件大小，如果过大则移除部分数据
      const eventSize = JSON.stringify(event).length;
      if (eventSize > 200000) { // 200KB 限制
        console.warn('[Sentry] 事件过大 (' + eventSize + ' bytes)，正在优化...');
        
        // 移除大型上下文数据
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
        
        // 移除额外数据
        if (event.extra) {
          const extraSize = JSON.stringify(event.extra).length;
          if (extraSize > 10000) { // 10KB
            event.extra = { note: '额外数据因大小限制被移除' };
          }
        }
      }
      
      return event;
    },
    
    // 自定义集成
    integrations: [
      // 使用默认集成，但限制面包屑配置
      ...Sentry.getDefaultIntegrations().map(integration => {
        // 限制面包屑集成的配置
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
  
  // 设置用户信息
  Sentry.setUser({
    id: 'user123',
    username: 'john_doe',
  });
  
  // 设置全局标签
  Sentry.setTag('app.version', '1.0.0');
  Sentry.setTag('miniapp.platform', 'wechat');
  
  console.log('Sentry 初始化成功（使用大小限制配置）\n');
  
  // 添加大量面包屑来测试限制
  console.log('添加大量面包屑来测试限制...');
  for (let i = 0; i < 50; i++) {
    Sentry.addBreadcrumb({
      message: `用户操作 ${i + 1}`,
      category: 'user',
      level: 'info',
      data: {
        action: 'click',
        element: `button-${i}`,
        timestamp: new Date().toISOString(),
        page: 'index',
        extra_data: `这是一些额外的数据 ${i}`.repeat(5), // 适量数据
      },
    });
  }
  
  // 添加大型上下文信息来测试限制
  Sentry.setContext('large_context', {
    data: 'x'.repeat(50000), // 50KB 的数据
    array: new Array(500).fill('test'),
    nested: {
      level1: {
        level2: {
          level3: 'deep data'.repeat(200)
        }
      }
    }
  });
  
  // 添加大量额外数据
  Sentry.setExtra('large_extra', {
    data: 'y'.repeat(20000), // 20KB 的数据
    timestamp: new Date().toISOString()
  });
  
  console.log('\n开始测试异步错误（带大量数据）...');
  
  // 模拟异步错误
  setTimeout(function() {
    try {
      throw new Error('这是一个异步错误（测试大小限制）');
    } catch (error) {
      console.log('\n捕获异步错误，准备上报...');
      Sentry.captureException(error);
    }
  }, 100);
  
  // 等待处理完成
  setTimeout(() => {
    console.log('\n测试完成！');
    console.log('\n📊 总结:');
    console.log('- 如果看到 "✅ 请求体大小合理"，说明大小限制生效');
    console.log('- 如果看到 "[Sentry] 事件过大"，说明beforeSend优化被触发');
    console.log('- 面包屑应该被限制在20个以内');
    console.log('- 大型上下文数据应该被移除');
  }, 2000);
  
} catch (error) {
  console.error('测试失败:', error);
  process.exit(1);
}