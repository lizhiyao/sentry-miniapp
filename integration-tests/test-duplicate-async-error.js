// 测试异步错误重复上报修复
const Sentry = require('../examples/wxapp/lib/sentry-miniapp.js');

let requestCount = 0;

// 模拟小程序环境
global.wx = {
  request: function(options) {
    requestCount++;
    console.log(`\n=== wx.request 调用 #${requestCount} ===`);
    console.log('URL:', options.url);
    console.log('Method:', options.method);
    
    // 解析请求体以显示异常信息
    if (options.data) {
      try {
        const lines = options.data.split('\n');
        const eventLine = lines.find(line => line.includes('"exception"'));
        if (eventLine) {
          const event = JSON.parse(eventLine);
          if (event.exception && event.exception.values) {
            console.log('异常信息:', event.exception.values[0].value);
            console.log('异常类型:', event.exception.values[0].type);
          }
        }
      } catch (e) {
        console.log('请求数据:', options.data.substring(0, 200) + '...');
      }
    }
    
    // 模拟成功响应
    if (options.success) {
      setTimeout(() => {
        options.success({
          statusCode: 200,
          data: { success: true }
        });
      }, 10);
    }
  },
  getSystemInfo: function() {
    return {
      platform: 'devtools',
      version: '8.0.5',
      SDKVersion: '2.19.4'
    };
  },
  showToast: function(options) {
    console.log('Toast:', options.title);
  }
};

// 添加全局错误处理器来捕获 TryCatch 重新抛出的错误
process.on('uncaughtException', (error) => {
  if (error.message === '这是一个异步错误') {
    console.log('\n✅ TryCatch 集成正确捕获并重新抛出了错误');
    
    // 等待一下让请求完成，然后显示结果
    setTimeout(() => {
      console.log('\n📊 测试结果总结:');
      console.log('========================================');
      console.log(`总共发送的请求数量: ${requestCount}`);
      
      if (requestCount === 1) {
        console.log('✅ 测试通过！异步错误只上报了一次，重复上报问题已修复。');
      } else if (requestCount === 2) {
        console.log('❌ 测试失败！仍然存在重复上报问题，发送了 2 个请求。');
      } else {
        console.log(`⚠️  异常情况！发送了 ${requestCount} 个请求，请检查配置。`);
      }
      
      console.log('\n💡 说明:');
      console.log('- TryCatch 集成会自动捕获异步错误');
      console.log('- onError 不应该再手动调用 Sentry.captureException');
      console.log('- 正确的做法是让 TryCatch 集成处理所有未捕获的错误');
      
      process.exit(0);
    }, 1000);
  } else {
    console.error('未预期的错误:', error);
    process.exit(1);
  }
});

try {
  console.log('🧪 测试异步错误重复上报修复');
  console.log('========================================\n');
  
  // 初始化 Sentry（使用修复后的配置）
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
    
    // 使用修复后的 beforeSend 配置
    beforeSend(event) {
      console.log('\n📤 beforeSend 被调用');
      console.log('事件类型:', event.type || 'exception');
      
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
        
        // 移除过大的额外数据
        if (event.extra) {
          Object.keys(event.extra).forEach(key => {
            const extraSize = JSON.stringify(event.extra[key]).length;
            if (extraSize > 10000) { // 10KB 限制
              delete event.extra[key];
            }
          });
        }
      }
      
      return event;
    },
    
    // 自定义集成（使用修复后的配置）
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
  
  console.log('Sentry 初始化成功（使用修复后的配置）\n');
  
  // 模拟小程序的 onError 处理（修复后的版本）
  function onError(msg) {
    console.log('\n🚨 小程序 onError 被调用:', msg);
    console.log('注意：不再手动调用 Sentry.captureException，避免重复上报');
  }
  
  // 模拟异步错误测试（与示例项目相同）
  console.log('🔥 开始测试异步错误...');
  console.log('预期结果：只应该看到 1 个 wx.request 调用\n');
  
  const testAsyncError = Sentry.wrap(function() {
    setTimeout(function() {
      // 这个错误会被 TryCatch 集成自动捕获
      throw new Error('这是一个异步错误');
    }, 100);
    
    console.log('⏰ 100ms 后将发生异步错误...');
  });
  
  // 执行测试
  testAsyncError();
  
  // 等待处理完成并显示结果
  setTimeout(() => {
    console.log('\n📊 测试结果总结:');
    console.log('========================================');
    console.log(`总共发送的请求数量: ${requestCount}`);
    
    if (requestCount === 1) {
      console.log('✅ 测试通过！异步错误只上报了一次，重复上报问题已修复。');
    } else if (requestCount === 2) {
      console.log('❌ 测试失败！仍然存在重复上报问题，发送了 2 个请求。');
    } else {
      console.log(`⚠️  异常情况！发送了 ${requestCount} 个请求，请检查配置。`);
    }
    
    console.log('\n💡 说明:');
    console.log('- TryCatch 集成会自动捕获异步错误');
    console.log('- onError 不应该再手动调用 Sentry.captureException');
    console.log('- 正确的做法是让 TryCatch 集成处理所有未捕获的错误');
  }, 2000);
  
} catch (error) {
  console.error('测试失败:', error);
  process.exit(1);
}