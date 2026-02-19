// 引用 npm 包
const Sentry = require('../../lib/sentry-miniapp.js');

Page({
  data: {
    sdkStatus: {
      connected: false,
      version: '--',
      dsnConfigured: false,
      initTime: '--',
      releaseDate: '--'
    },
    systemInfo: {
      SDKVersion: '--',
      platform: '--',
      brand: '--'
    },
    usageStats: {
      npmDownloads: '--',
      npmDownloadsMonth: '--',
      githubStars: '--',
      githubForks: '--',
      githubOpenIssues: '--'
    }
  },

  onLoad: function () {
    this.initData();
  },

  initData() {
    // 获取系统信息 (兼容新 API)
    let sys = {};
    const canUseNewApi = (wx.getAppBaseInfo && wx.getDeviceInfo) ||
      (wx.canIUse && wx.canIUse('getAppBaseInfo') && wx.canIUse('getDeviceInfo'));

    if (canUseNewApi) {
      try {
        sys = {
          ...(wx.getAppBaseInfo ? wx.getAppBaseInfo() : {}),
          ...(wx.getDeviceInfo ? wx.getDeviceInfo() : {})
        };
      } catch (e) {
        console.warn('Failed to get system info via new API', e);
      }
    }

    // 如果没有获取到足够的信息，且没有使用新API，或者新API失败
    if (!sys.SDKVersion) {
      try {
        sys = wx.getSystemInfoSync();
      } catch (e) {
        console.warn('Failed to get system info sync', e);
      }
    }

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
        SDKVersion: sys.SDKVersion || '--',
        platform: sys.platform || '--',
        brand: sys.brand || '--'
      },
      'sdkStatus.connected': isConnected,
      'sdkStatus.version': '1.1.0', // 硬编码或从 SDK 获取
      'sdkStatus.dsnConfigured': !!dsn,
      'sdkStatus.initTime': timeString
    });

    // 记录面包屑
    Sentry.addBreadcrumb({
      category: 'ui.lifecycle',
      message: 'Index page loaded',
      level: 'info'
    });

    this.fetchUsageStats();
    this.fetchReleaseInfo();
  },

  fetchUsageStats() {
    const that = this;

    wx.request({
      url: 'https://api.npmjs.org/downloads/point/last-week/sentry-miniapp',
      method: 'GET',
      success(res) {
        if (res && res.data && typeof res.data.downloads === 'number') {
          that.setData({
            'usageStats.npmDownloads': res.data.downloads.toString()
          });
        }
      }
    });

    wx.request({
      url: 'https://api.npmjs.org/downloads/point/last-month/sentry-miniapp',
      method: 'GET',
      success(res) {
        if (res && res.data && typeof res.data.downloads === 'number') {
          that.setData({
            'usageStats.npmDownloadsMonth': res.data.downloads.toString()
          });
        }
      }
    });

    wx.request({
      url: 'https://api.github.com/repos/lizhiyao/sentry-miniapp',
      method: 'GET',
      success(res) {
        if (res && res.data) {
          const stars = res.data.stargazers_count;
          const forks = res.data.forks_count;
          const openIssues = res.data.open_issues_count;

          const dataToUpdate = {};

          if (typeof stars === 'number') {
            dataToUpdate['usageStats.githubStars'] = stars.toString();
          }

          if (typeof forks === 'number') {
            dataToUpdate['usageStats.githubForks'] = forks.toString();
          }

          if (typeof openIssues === 'number') {
            dataToUpdate['usageStats.githubOpenIssues'] = openIssues.toString();
          }

          if (Object.keys(dataToUpdate).length > 0) {
            that.setData(dataToUpdate);
          }
        }
      }
    });
  },

  fetchReleaseInfo() {
    const that = this;

    wx.request({
      url: 'https://registry.npmjs.org/sentry-miniapp',
      method: 'GET',
      success(res) {
        if (res && res.data && res.data['dist-tags'] && res.data.time) {
          const latest = res.data['dist-tags'].latest;
          const releaseTime = res.data.time[latest];

          if (typeof releaseTime === 'string') {
            const dateString = releaseTime.split('T')[0];
            that.setData({
              'sdkStatus.releaseDate': dateString
            });
          }
        }
      }
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
