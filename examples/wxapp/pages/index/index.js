// 引用 npm 包
const Sentry = require('../../lib/sentry-miniapp.js');

Page({
  data: {
    sdkStatus: {
      connected: false,
      version: '--',
      dsnConfigured: false,
      initTime: '--',
      releaseDate: '--',
      pageVisitId: '--'
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

  pageVisitId: '',
  pageLoadSpan: null,

  createPageVisitId() {
    return `index-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },

  getScopeContext() {
    return {
      pageVisitId: this.pageVisitId,
      page: '/pages/index/index',
      sdkVersion: Sentry.SDK_VERSION || '--'
    };
  },

  trackRequest(name, url, onSuccess, onFail) {
    const span = Sentry.startInactiveSpan({
      name,
      op: 'http.client'
    });
    const startedAt = Date.now();

    wx.request({
      url,
      method: 'GET',
      success: (res) => {
        span.setStatus('ok');
        Sentry.addBreadcrumb({
          category: 'demo.api',
          message: `${name} success`,
          level: 'info',
          data: {
            pageVisitId: this.pageVisitId,
            statusCode: res.statusCode || res.status,
            durationMs: Date.now() - startedAt
          }
        });
        onSuccess(res);
      },
      fail: (err) => {
        span.setStatus('internal_error');
        Sentry.withScope((scope) => {
          scope.setLevel('warning');
          scope.setTag('page', 'index');
          scope.setTag('demo.request_name', name);
          scope.setContext('request_failure', {
            ...this.getScopeContext(),
            name,
            url,
            errMsg: err && err.errMsg ? err.errMsg : '请求失败'
          });
          return Sentry.captureMessage(`${name} 请求失败`);
        });
        onFail(err);
      },
      complete: () => {
        span.end();
      }
    });
  },

  onLoad: function () {
    this.pageVisitId = this.createPageVisitId();
    this.pageLoadSpan = Sentry.startInactiveSpan({
      name: 'index.page.load',
      op: 'ui.load',
      forceTransaction: true,
      attributes: {
        'demo.page_visit_id': this.pageVisitId
      }
    });
    Sentry.setTag('page', 'index');
    Sentry.setTag('demo.page_visit_id', this.pageVisitId);
    Sentry.setContext('index_page', this.getScopeContext());
    Sentry.addBreadcrumb({
      category: 'ui.lifecycle',
      message: 'Index page visit started',
      level: 'info',
      data: {
        pageVisitId: this.pageVisitId
      }
    });
    this.initData();
  },

  onReady() {
    if (this.pageLoadSpan) {
      this.pageLoadSpan.setAttributes({
        'ui.page': '/pages/index/index',
        'ui.page_visit_id': this.pageVisitId
      });
      this.pageLoadSpan.end();
      this.pageLoadSpan = null;
    }
    Sentry.addBreadcrumb({
      category: 'ui.lifecycle',
      message: 'Index page ready',
      level: 'info',
      data: {
        pageVisitId: this.pageVisitId
      }
    });
  },

  onShow() {
    Sentry.addBreadcrumb({
      category: 'ui.lifecycle',
      message: 'Index page show',
      level: 'info',
      data: {
        pageVisitId: this.pageVisitId
      }
    });
  },

  onUnload() {
    Sentry.addBreadcrumb({
      category: 'ui.lifecycle',
      message: 'Index page unload',
      level: 'info',
      data: {
        pageVisitId: this.pageVisitId
      }
    });
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
      'sdkStatus.version': Sentry.SDK_VERSION || '--',
      'sdkStatus.dsnConfigured': !!dsn,
      'sdkStatus.initTime': timeString,
      'sdkStatus.pageVisitId': this.pageVisitId
    });

    Sentry.setContext('index_runtime', {
      ...this.getScopeContext(),
      platform: sys.platform || '--',
      brand: sys.brand || '--',
      sdkConfigured: !!dsn
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
    this.trackRequest(
      'npm-downloads-week',
      'https://api.npmjs.org/downloads/point/last-week/sentry-miniapp',
      (res) => {
        if (res && res.data && typeof res.data.downloads === 'number') {
          this.setData({
            'usageStats.npmDownloads': res.data.downloads.toString()
          });
        }
      },
      () => {
        this.setData({ 'usageStats.npmDownloads': '获取失败' });
      }
    );

    this.trackRequest(
      'npm-downloads-month',
      'https://api.npmjs.org/downloads/point/last-month/sentry-miniapp',
      (res) => {
        if (res && res.data && typeof res.data.downloads === 'number') {
          this.setData({
            'usageStats.npmDownloadsMonth': res.data.downloads.toString()
          });
        }
      },
      () => {
        this.setData({ 'usageStats.npmDownloadsMonth': '获取失败' });
      }
    );

    this.trackRequest(
      'github-repo-stats',
      'https://api.github.com/repos/lizhiyao/sentry-miniapp',
      (res) => {
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
            this.setData(dataToUpdate);
          }
        }
      },
      () => {
        this.setData({
          'usageStats.githubStars': '获取失败',
          'usageStats.githubForks': '获取失败',
          'usageStats.githubOpenIssues': '获取失败'
        });
      }
    );
  },

  fetchReleaseInfo() {
    this.trackRequest(
      'npm-package-release',
      'https://registry.npmjs.org/sentry-miniapp',
      (res) => {
        if (res && res.data && res.data['dist-tags'] && res.data.time) {
          const latest = res.data['dist-tags'].latest;
          const releaseTime = res.data.time[latest];

          if (typeof releaseTime === 'string') {
            const dateString = releaseTime.split('T')[0];
            this.setData({
              'sdkStatus.releaseDate': dateString
            });
          }
        }
      },
      () => {
        this.setData({ 'sdkStatus.releaseDate': '获取失败' });
      }
    );
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
