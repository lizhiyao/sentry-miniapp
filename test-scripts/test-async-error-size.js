// 测试异步错误的事件大小
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
    
    if (dataSize > 1000000) { // 1MB
      console.log('⚠️  警告: 请求体过大 (>1MB)');
    }
    
    // 解析并显示事件内容
    if (options.data) {
      try {
        const lines = options.data.split('\n');
        const eventLine = lines.find(line => line.includes('"exception"') || line.includes('"message"'));
        if (eventLine) {
          const event = JSON.parse(eventLine);
          console.log('\n--- 事件内容分析 ---');
          console.log('事件ID:', event.event_id);
          console.log('时间戳:', event.timestamp);
          
          if (event.exception) {
            console.log('异常类型:', event.exception.values[0].type);
            console.log('异常消息:', event.exception.values[0].value);
            if (event.exception.values[0].stacktrace) {
              console.log('堆栈帧数量:', event.exception.values[0].stacktrace.frames?.length || 0);
            }
          }
          
          if (event.breadcrumbs) {
            console.log('面包屑数量:', event.breadcrumbs.length);
            console.log('面包屑总大小:', JSON.stringify(event.breadcrumbs).length, 'bytes');
          }
          
          if (event.contexts) {
            console.log('上下文数量:', Object.keys(event.contexts).length);
            console.log('上下文大小:', JSON.stringify(event.contexts).length, 'bytes');
          }
          
          if (event.tags) {
            console.log('标签数量:', Object.keys(event.tags).length);
          }
          
          if (event.extra) {
            console.log('额外数据大小:', JSON.stringify(event.extra).length, 'bytes');
          }
          
          // 计算各部分大小
          const eventSize = JSON.stringify(event).length;
          console.log('\n--- 大小分析 ---');
          console.log('事件JSON大小:', eventSize, 'bytes');
          console.log('完整envelope大小:', dataSize, 'bytes');
        }
      } catch (e) {
        console.log('解析事件失败:', e.message);
      }
    }
    
    // 模拟400错误（如果数据过大）
    if (dataSize > 262144) { // 256KB
      console.log('\n❌ 模拟 400 错误: envelope exceeded size limits');
      if (options.fail) {
        options.fail({
          statusCode: 400,
          errMsg: 'envelope exceeded size limits for type \'event\''
        });
      }
    } else {
      // 模拟成功响应
      if (options.success) {
        options.success({
          statusCode: 200,
          data: { success: true }
        });
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
  // 初始化 Sentry（使用与示例项目相同的配置）
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
    
    beforeSend(event) {
      console.log('\n--- beforeSend 被调用 ---');
      console.log('事件类型:', event.type || 'exception');
      console.log('事件ID:', event.event_id);
      
      // 计算事件大小
      const eventSize = JSON.stringify(event).length;
      console.log('事件大小:', eventSize, 'bytes');
      
      if (eventSize > 262144) { // 256KB
        console.log('⚠️  事件过大，可能会被拒绝');
      }
      
      return event;
    },
    
    // 使用默认集成
    integrations: [
      ...Sentry.getDefaultIntegrations(),
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
  
  console.log('Sentry 初始化成功\n');
  
  // 添加大量面包屑来模拟真实使用场景
  console.log('添加大量面包屑...');
  for (let i = 0; i < 100; i++) {
    Sentry.addBreadcrumb({
      message: `用户操作 ${i + 1}`,
      category: 'user',
      level: 'info',
      data: {
        action: 'click',
        element: `button-${i}`,
        timestamp: new Date().toISOString(),
        page: 'index',
        extra_data: `这是一些额外的数据 ${i}`.repeat(10), // 增加数据量
      },
    });
  }
  
  // 添加大量上下文信息
  Sentry.setContext('large_context', {
    data: 'x'.repeat(10000), // 10KB 的数据
    array: new Array(1000).fill('test'),
    nested: {
      level1: {
        level2: {
          level3: 'deep data'.repeat(100)
        }
      }
    }
  });
  
  console.log('\n开始测试异步错误...');
  
  // 模拟异步错误（与示例项目相同）
  setTimeout(function() {
    try {
      throw new Error('这是一个异步错误');
    } catch (error) {
      console.log('\n捕获异步错误，准备上报...');
      Sentry.captureException(error);
    }
  }, 100);
  
  // 等待处理完成
  setTimeout(() => {
    console.log('\n测试完成！');
  }, 2000);
  
} catch (error) {
  console.error('测试失败:', error);
  process.exit(1);
}