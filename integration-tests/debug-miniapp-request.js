// 调试微信小程序异常上报请求
const fs = require('fs');
const path = require('path');

// 模拟微信小程序环境
global.wx = {
  request: function (options) {
    console.log('\n🌐 微信小程序 wx.request 被调用:');
    console.log('  URL:', options.url);
    console.log('  Method:', options.method);
    console.log('  Headers:', JSON.stringify(options.header, null, 2));
    console.log('  Data type:', typeof options.data);
    console.log('  Data length:', options.data ? options.data.length : 0);

    if (options.data) {
      try {
        const parsed = JSON.parse(options.data);
        console.log('  Event type:', parsed.exception ? 'exception' : parsed.message ? 'message' : 'unknown');
        if (parsed.exception) {
          console.log('  Exception:', parsed.exception.values[0]?.type, '-', parsed.exception.values[0]?.value);
        }
        if (parsed.tags) {
          console.log('  Tags:', JSON.stringify(parsed.tags));
        }
      } catch (e) {
        console.log('  Raw data preview:', options.data.substring(0, 200) + '...');
      }
    }

    // 模拟成功响应
    setTimeout(() => {
      if (options.success) {
        console.log('  ✅ 请求成功响应 (200)');
        options.success({
          statusCode: 200,
          header: {
            'content-type': 'application/json'
          },
          data: { success: true }
        });
      }
    }, 100);
  },

  getSystemInfoSync: function () {
    return {
      brand: 'iPhone',
      model: 'iPhone 12',
      system: 'iOS 15.0',
      platform: 'ios',
      version: '8.0.5',
      SDKVersion: '2.19.4',
      screenWidth: 375,
      screenHeight: 812,
      windowWidth: 375,
      windowHeight: 812,
      statusBarHeight: 44,
      language: 'zh_CN',
      fontSizeSetting: 16,
      pixelRatio: 3
    };
  },

  // 模拟新 API 以支持 getSystemInfo 重构
  getAppBaseInfo: function () {
    return {
      version: '8.0.5',
      SDKVersion: '2.19.4',
      language: 'zh_CN',
      enableDebug: true,
      host: { env: 'WeChat' },
      theme: 'light',
      fontSizeSetting: 16
    };
  },

  getDeviceInfo: function () {
    return {
      brand: 'iPhone',
      model: 'iPhone 12',
      system: 'iOS 15.0',
      platform: 'ios',
      benchmarkLevel: 1,
      memorySize: 2048
    };
  },

  getWindowInfo: function () {
    return {
      pixelRatio: 3,
      screenWidth: 375,
      screenHeight: 812,
      windowWidth: 375,
      windowHeight: 812,
      statusBarHeight: 44,
      safeArea: {
        left: 0, right: 0, top: 44, bottom: 0, width: 375, height: 768
      },
      screenTop: 0
    };
  },

  showToast: function (options) {
    console.log('📱 wx.showToast:', options.title);
  }
};

// 加载 Sentry SDK
const Sentry = require('../dist/sentry-miniapp.cjs.js');

console.log('📱 Sentry SDK 加载成功');
console.log('可用方法:', Object.keys(Sentry).filter(key => typeof Sentry[key] === 'function'));

// 使用与示例项目相同的配置初始化 Sentry
Sentry.init({
  dsn: 'https://47703e01ba4344b8b252c15e8fd980fd@o113510.ingest.us.sentry.io/1528228',
  environment: 'debug',
  debug: true, // 启用调试模式

  // 小程序特有配置
  platform: 'wechat',
  enableSystemInfo: true,
  enableUserInteractionBreadcrumbs: true,
  enableConsoleBreadcrumbs: true,
  enableNavigationBreadcrumbs: true,

  // 采样率配置
  sampleRate: 1.0,

  // 过滤敏感信息
  beforeSend(event) {
    console.log('\n🔍 beforeSend 被调用:');
    console.log('  Event type:', event.exception ? 'exception' : event.message ? 'message' : 'unknown');
    console.log('  Event level:', event.level);
    console.log('  Event tags:', JSON.stringify(event.tags));

    // 过滤包含敏感信息的事件
    if (event.message && event.message.includes('password')) {
      console.log('  ❌ 事件被过滤 (包含敏感信息)');
      return null;
    }
    console.log('  ✅ 事件通过过滤');
    return event;
  },

  // 自定义集成
  integrations: [
    // 使用默认集成
    ...Sentry.getDefaultIntegrations(),
  ],
});

// 设置用户信息
Sentry.setUser({
  id: 'debug_user_123',
  username: 'debug_user',
});

// 设置全局标签
Sentry.setTag('app.version', '1.0.0-debug');
Sentry.setTag('miniapp.platform', 'wechat');

console.log('\n🔧 Sentry 初始化完成');

// 模拟点击测试异常捕获按钮
console.log('\n🚨 模拟点击测试异常捕获按钮...');

// 使用与示例项目相同的代码
const testException = Sentry.wrap(function () {
  try {
    // 故意抛出一个错误
    throw new Error('这是一个测试异常');
  } catch (error) {
    console.log('\n📤 调用 Sentry.captureException...');
    // 手动捕获异常
    Sentry.captureException(error, {
      tags: {
        action: 'test_exception',
        page: 'index',
      },
      extra: {
        timestamp: new Date().toISOString(),
        userAgent: 'miniapp',
      },
    });

    console.log('📱 模拟 wx.showToast: 异常已捕获并上报');
  }
});

// 执行测试
testException();

// 等待网络请求完成
setTimeout(() => {
  console.log('\n✅ 调试测试完成');
  console.log('\n📊 总结:');
  console.log('- 如果看到 wx.request 被调用，说明网络请求正常');
  console.log('- 如果没有看到 wx.request，说明事件没有被发送');
  console.log('- 检查 beforeSend 是否被调用以及返回值');
  console.log('- 检查是否有错误日志或警告信息');
}, 2000);