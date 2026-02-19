// 引用 npm 包
const Sentry = require('../../lib/sentry-miniapp.js');

Page({
  data: {
    sdkStatus: {
      connected: false,
      version: '--',
      dsnConfigured: false,
      initTime: '--'
    },
    systemInfo: {
      SDKVersion: '--',
      platform: '--',
      brand: '--'
    }
  },

  onLoad: function () {
    this.initData();
  },

  initData() {
    // 获取系统信息
    const sys = wx.getSystemInfoSync();

    // 检查 Sentry 状态
    // 注意：这里我们通过检查全局对象或配置来模拟状态检查
    const client = Sentry.getClient();
    const isConnected = !!client;
    // 兼容不同的 Client 实现获取 DSN
    const dsn = client ? (typeof client.getDsn === 'function' ? client.getDsn() : (client.getOptions && client.getOptions().dsn)) : null;

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    this.setData({
      systemInfo: {
        SDKVersion: sys.SDKVersion,
        platform: sys.platform,
        brand: sys.brand
      },
      sdkStatus: {
        connected: isConnected,
        version: '1.1.0', // 硬编码或从 SDK 获取
        dsnConfigured: !!dsn,
        initTime: timeString
      }
    });

    // 记录面包屑
    Sentry.addBreadcrumb({
      category: 'ui.lifecycle',
      message: 'Index page loaded',
      level: 'info'
    });
  },

  goToTest() {
    wx.switchTab({
      url: '/pages/test/test'
    });
  },

  onShareAppMessage() {
    return {
      title: 'Sentry 小程序监控示例',
      path: '/pages/index/index'
    };
  }
});
