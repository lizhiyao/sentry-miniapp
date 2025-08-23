// 测试 Sentry SDK 是否正常工作
const Sentry = require('./lib/sentry-miniapp.js');

console.log('Sentry SDK 已加载:', typeof Sentry);
console.log('可用方法:', Object.keys(Sentry));

// 模拟小程序环境
global.wx = {
  request: function(options) {
    console.log('模拟 wx.request 调用:');
    console.log('  URL:', options.url);
    console.log('  Method:', options.method);
    console.log('  Headers:', options.headers);
    console.log('  Data:', options.data);
    
    // 模拟成功响应
    if (options.success) {
      options.success({
        statusCode: 200,
        data: { success: true }
      });
    }
  },
  getSystemInfo: function() {
    return {
      platform: 'devtools',
      version: '8.0.5',
      SDKVersion: '2.19.4'
    };
  }
};

try {
  // 初始化 Sentry
  Sentry.init({
    dsn: 'https://test@sentry.io/123456',
    environment: 'test',
    debug: true,
    beforeSend(event) {
      console.log('beforeSend 被调用，事件类型:', event.type);
      return event;
    }
  });
  
  console.log('Sentry 初始化成功');
  
  // 测试异常捕获
  console.log('\n测试异常捕获...');
  Sentry.captureException(new Error('测试异常'));
  
  console.log('\n测试消息捕获...');
  Sentry.captureMessage('测试消息', 'info');
  
  console.log('\nSDK 测试完成！');
  
} catch (error) {
  console.error('SDK 测试失败:', error);
  process.exit(1);
}