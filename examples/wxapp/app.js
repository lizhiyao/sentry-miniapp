// 示例：在微信小程序中使用 sentry-miniapp
// 引用 npm 包
const Sentry = require('./lib/sentry-miniapp.js');

console.log('Sentry SDK 已加载:', typeof Sentry);

// 在 App() 之前初始化 Sentry
Sentry.init({
  dsn: 'https://47703e01ba4344b8b252c15e8fd980fd@o113510.ingest.us.sentry.io/1528228',
  environment: 'production',
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

App({
  onLaunch: function () {
    console.log('小程序启动');

    // 记录应用启动事件
    Sentry.addBreadcrumb({
      message: '小程序启动',
      category: 'app',
      level: 'info',
    });
  },

  onShow: function (options) {
    console.log('小程序显示', options);

    // 记录应用显示事件
    Sentry.addBreadcrumb({
      message: '小程序显示',
      category: 'app',
      level: 'info',
      data: {
        scene: options.scene,
        path: options.path,
        query: options.query,
      },
    });
  },

  onHide: function () {
    console.log('小程序隐藏');

    // 记录应用隐藏事件
    Sentry.addBreadcrumb({
      message: '小程序隐藏',
      category: 'app',
      level: 'info',
    });
  },

  onError: function (msg) {
    console.error('小程序发生脚本错误或 API 调用失败', msg);

    // 注意：不需要手动捕获错误，TryCatch 集成会自动捕获
    // 避免重复上报，这里只记录日志
  },

  globalData: {
    userInfo: null
  }
});