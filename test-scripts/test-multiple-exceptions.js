// 测试多次异常捕获
const Sentry = require('./examples/wxapp/lib/sentry-miniapp.js');

// 模拟小程序环境
global.wx = {
  request: function(options) {
    console.log('\n=== wx.request 调用 ===');
    console.log('URL:', options.url);
    console.log('Method:', options.method);
    console.log('Headers:', JSON.stringify(options.headers, null, 2));
    
    // 解析请求体以显示异常信息
    if (options.data) {
      try {
        const lines = options.data.split('\n');
        const eventLine = lines.find(line => line.includes('"exception"'));
        if (eventLine) {
          const event = JSON.parse(eventLine);
          if (event.exception && event.exception.values) {
            console.log('异常信息:', event.exception.values[0].value);
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
    
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
  },
  showToast: function(options) {
    console.log('Toast:', options.title);
  }
};

// 模拟页面数据
const pageData = {
  clickCount: 0
};

// 模拟 setData 方法
function setData(data) {
  Object.assign(pageData, data);
  console.log('页面数据更新:', pageData);
}

try {
  // 初始化 Sentry
  Sentry.init({
    dsn: 'https://test@sentry.io/123456',
    environment: 'test',
    debug: false, // 关闭调试日志以便观察
    beforeSend(event) {
      console.log('\n--- beforeSend 被调用 ---');
      console.log('事件类型:', event.type || 'exception');
      console.log('事件ID:', event.event_id);
      if (event.exception && event.exception.values) {
        console.log('异常消息:', event.exception.values[0].value);
      }
      console.log('标签:', event.tags);
      return event;
    }
  });
  
  console.log('Sentry 初始化成功\n');
  
  // 模拟多次点击异常捕获按钮
  function testException() {
    try {
      // 故意抛出一个错误，每次都包含不同的时间戳以避免去重
      const timestamp = new Date().toISOString();
      throw new Error(`这是一个测试异常 - ${timestamp}`);
    } catch (error) {
      // 手动捕获异常
      Sentry.captureException(error, {
        tags: {
          action: 'test_exception',
          page: 'index',
          click_count: (pageData.clickCount || 0) + 1,
        },
        extra: {
          timestamp: new Date().toISOString(),
          userAgent: 'miniapp',
          clickCount: (pageData.clickCount || 0) + 1,
        },
      });
      
      // 更新点击计数
      setData({
        clickCount: (pageData.clickCount || 0) + 1
      });
      
      console.log(`异常已捕获并上报 (${pageData.clickCount})`);
    }
  }
  
  console.log('开始测试多次异常捕获...');
  
  // 模拟连续点击 5 次
  for (let i = 1; i <= 5; i++) {
    console.log(`\n========== 第 ${i} 次点击 ==========`);
    testException();
  }
  
  console.log('\n测试完成！');
  
} catch (error) {
  console.error('测试失败:', error);
  process.exit(1);
}