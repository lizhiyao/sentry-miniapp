// 示例：在页面中使用 sentry-miniapp
// 引用 npm 包
const Sentry = require('../../lib/sentry-miniapp.js');

console.log('页面中 Sentry SDK 已加载:', typeof Sentry);

Page({
  data: {
    clickCount: 0,
    messageCount: 0,
    stats: {
      totalDownloads: '--',
      lastMonthDownloads: '--',
      lastDayDownloads: '--',
      version: '--',
      githubStars: '--',
      githubForks: '--',
      lastUpdate: '加载中...'
    }
  },

  // 缓存管理工具函数
  cacheManager: {
    // 缓存有效期：10分钟
    CACHE_DURATION: 10 * 60 * 1000,

    // 设置缓存
    setCache: function (key, data) {
      const cacheData = {
        data: data,
        timestamp: Date.now()
      };
      try {
        wx.setStorageSync(key, JSON.stringify(cacheData));
      } catch (e) {
        console.log('设置缓存失败:', e);
      }
    },

    // 获取缓存
    getCache: function (key) {
      try {
        const cacheStr = wx.getStorageSync(key);
        if (!cacheStr) return null;

        const cacheData = JSON.parse(cacheStr);
        const now = Date.now();

        // 检查缓存是否过期
        if (now - cacheData.timestamp > this.CACHE_DURATION) {
          // 缓存过期，删除缓存
          wx.removeStorageSync(key);
          return null;
        }

        return cacheData.data;
      } catch (e) {
        console.log('获取缓存失败:', e);
        return null;
      }
    },

    // 检查缓存是否有效
    isCacheValid: function (key) {
      return this.getCache(key) !== null;
    },

    // 清除指定缓存
    clearCache: function (key) {
      try {
        wx.removeStorageSync(key);
      } catch (e) {
        console.log('清除缓存失败:', e);
      }
    }
  },

  onLoad: Sentry.wrap(function () {
    console.log('页面加载');

    // 设置页面标签
    Sentry.setTag('page', 'index');

    // 记录页面加载事件
    Sentry.addBreadcrumb({
      message: '首页加载',
      category: 'navigation',
      level: 'info',
    });

    // 页面加载性能追踪演示
    this.trackPageLoadPerformance();

    // 检查缓存并加载统计数据
    this.loadStatsWithCache();
  }),

  // 页面加载性能追踪演示
  trackPageLoadPerformance: function () {
    const pageLoadStartTime = Date.now();
    
    // 使用 Sentry 的 startSpan API 追踪页面加载性能
    Sentry.startSpan({ 
      name: '首页加载性能', 
      op: 'pageload',
      description: '追踪首页完整加载时间'
    }, (span) => {
      // 模拟页面初始化过程
      const initStartTime = Date.now();
      
      // 设置页面加载相关的标签
      span.setAttributes({
        'page.name': 'index',
        'page.type': 'home'
      });
      
      // 模拟数据初始化
      setTimeout(() => {
        const initEndTime = Date.now();
        const initDuration = initEndTime - initStartTime;
        
        // 添加初始化耗时测量
        span.setAttributes({
          'page.init_time': initDuration
        });
        
        console.log(`[性能追踪] 页面初始化耗时: ${initDuration}ms`);
        
        // 记录页面加载完成的面包屑
        Sentry.addBreadcrumb({
          message: `首页加载完成，耗时 ${Date.now() - pageLoadStartTime}ms`,
          category: 'performance',
          level: 'info',
          data: {
            loadTime: Date.now() - pageLoadStartTime,
            initTime: initDuration
          }
        });
      }, 100); // 模拟100ms的初始化时间
    });
  },

  // 智能加载统计数据（优先使用缓存）
  loadStatsWithCache: function () {
    const cacheManager = this.cacheManager || {
      isCacheValid: () => false,
      getCache: () => null,
      setCache: () => { },
      clearCache: () => { }
    };

    const npmCacheValid = cacheManager.isCacheValid('npm_stats_cache');
    const githubCacheValid = cacheManager.isCacheValid('github_stats_cache');

    console.log('缓存状态检查 - NPM:', npmCacheValid, 'GitHub:', githubCacheValid);

    // 加载NPM统计数据
    this.loadNpmStats();

    // 加载GitHub统计数据
    this.loadGithubStats();

    // 如果两个缓存都有效，显示缓存提示
    if (npmCacheValid && githubCacheValid) {
      console.log('所有数据均来自缓存，减少了网络请求');
      // 可以在这里添加一个提示，告诉用户数据来自缓存
      const now = new Date();
      const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')} (缓存)`;
      this.setData({
        'stats.lastUpdate': timeStr
      });
    }
  },

  onShow: Sentry.wrap(function () {
    console.log('页面显示');

    // 记录页面显示事件
    Sentry.addBreadcrumb({
      message: '首页显示',
      category: 'navigation',
      level: 'info',
    });
  }),

  onHide: Sentry.wrap(function () {
    console.log('页面隐藏');

    // 记录页面隐藏事件
    Sentry.addBreadcrumb({
      message: '首页隐藏',
      category: 'navigation',
      level: 'info',
    });
  }),

  // 加载 NPM 统计数据（带网络请求性能追踪演示）
  loadNpmStats: Sentry.wrap(function () {
    const packageName = 'sentry-miniapp';
    const self = this;
    const cacheKey = 'npm_stats_cache';

    // 获取缓存管理器
    const cacheManager = this.cacheManager || {
      getCache: () => null,
      setCache: () => { },
      clearCache: () => { }
    };

    // 检查缓存
    const cachedData = cacheManager.getCache(cacheKey);
    if (cachedData) {
      this.setData({
        'stats.lastDayDownloads': cachedData.lastDayDownloads || '--',
        'stats.lastMonthDownloads': cachedData.lastMonthDownloads || '--',
        'stats.totalDownloads': cachedData.totalDownloads || '--',
        'stats.version': cachedData.version || 'v1.0.0',
        'stats.lastUpdate': cachedData.lastUpdate || '缓存数据'
      });
      return;
    }

    console.log('缓存无效，重新获取NPM数据');
    const statsData = {};
    let requestCount = 0;
    const totalRequests = 4;

    // 请求完成后缓存数据
    const checkAndCache = () => {
      requestCount++;
      if (requestCount === totalRequests) {
        // 所有请求完成，缓存数据
        cacheManager.setCache(cacheKey, statsData);
        console.log('NPM数据已缓存');
      }
    };

    // 网络请求性能追踪演示 - 获取今日下载量
    Sentry.startSpan({
      name: 'NPM API - 今日下载量',
      op: 'http.client',
      description: '获取 sentry-miniapp 今日下载量'
    }, (span) => {
      const requestStartTime = Date.now();
      
      // 设置请求相关标签
      span.setAttributes({
        'http.method': 'GET',
        'http.url': `https://api.npmjs.org/downloads/point/last-day/${packageName}`,
        'api.type': 'npm_daily_downloads'
      });
      
      console.log('[性能追踪] 开始获取今日下载量');
      
      wx.request({
        url: `https://api.npmjs.org/downloads/point/last-day/${packageName}`,
        method: 'GET',
        success: function (res) {
          const requestDuration = Date.now() - requestStartTime;
          
          // 记录请求耗时
          span.setAttributes({
            'http.request_time': requestDuration,
            'http.status_code': res.statusCode
          });
          
          console.log(`[性能追踪] 今日下载量请求完成，耗时: ${requestDuration}ms`);
          
          if (res.statusCode === 200 && res.data) {
            const formattedData = self.formatNumber(res.data.downloads);
            statsData.lastDayDownloads = formattedData;
            self.setData({
              'stats.lastDayDownloads': formattedData
            });
            span.setAttributes({ 'request.success': true });
          } else {
            span.setAttributes({ 'request.success': false });
          }
          
          // 记录网络请求面包屑
          Sentry.addBreadcrumb({
            message: `NPM今日下载量请求完成，耗时${requestDuration}ms`,
            category: 'http',
            level: 'info',
            data: {
              url: `https://api.npmjs.org/downloads/point/last-day/${packageName}`,
              status: res.statusCode,
              duration: requestDuration
            }
          });
          
          checkAndCache();
        },
        fail: function (err) {
          const requestDuration = Date.now() - requestStartTime;
          
          span.setAttributes({
            'http.request_time': requestDuration,
            'request.success': false,
            'error.message': err.errMsg || 'Unknown error'
          });
          
          console.log(`[性能追踪] 今日下载量请求失败，耗时: ${requestDuration}ms`, err);
          
          // 记录失败的网络请求
          Sentry.addBreadcrumb({
            message: `NPM今日下载量请求失败，耗时${requestDuration}ms`,
            category: 'http',
            level: 'error',
            data: {
              url: `https://api.npmjs.org/downloads/point/last-day/${packageName}`,
              error: err.errMsg,
              duration: requestDuration
            }
          });
          
          checkAndCache();
        }
      });
    });

    // 获取本月下载量
    wx.request({
      url: `https://api.npmjs.org/downloads/point/last-month/${packageName}`,
      method: 'GET',
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          const formattedData = self.formatNumber(res.data.downloads);
          statsData.lastMonthDownloads = formattedData;
          self.setData({
            'stats.lastMonthDownloads': formattedData
          });
        }
        checkAndCache();
      },
      fail: function (err) {
        console.log('获取本月下载量失败:', err);
        checkAndCache();
      }
    });

    // 获取总下载量（从2015-01-10开始到现在的所有数据）
    wx.request({
      url: `https://api.npmjs.org/downloads/range/2015-01-10:${new Date().toISOString().split('T')[0]}/${packageName}`,
      method: 'GET',
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.downloads) {
          // 计算总下载量
          const totalDownloads = res.data.downloads.reduce((sum, day) => sum + day.downloads, 0);
          const formattedData = self.formatNumber(totalDownloads);
          statsData.totalDownloads = formattedData;
          self.setData({
            'stats.totalDownloads': formattedData
          });
        }
        checkAndCache();
      },
      fail: function (err) {
        console.log('获取总下载量失败，尝试使用过去一年数据:', err);
        // 回退到使用过去一年的数据
        wx.request({
          url: `https://api.npmjs.org/downloads/point/last-year/${packageName}`,
          method: 'GET',
          success: function (res) {
            if (res.statusCode === 200 && res.data) {
              const formattedData = self.formatNumber(res.data.downloads) + '+';
              statsData.totalDownloads = formattedData;
              self.setData({
                'stats.totalDownloads': formattedData
              });
            }
            checkAndCache();
          },
          fail: function (err) {
            console.log('获取过去一年下载量也失败:', err);
            checkAndCache();
          }
        });
      }
    });

    // 获取包信息（版本等）
    wx.request({
      url: `https://registry.npmjs.org/${packageName}/latest`,
      method: 'GET',
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          const versionData = `v${res.data.version}`;
          statsData.version = versionData;
          self.setData({
            'stats.version': versionData
          });
        }
        checkAndCache();
      },
      fail: function (err) {
        console.log('获取包信息失败:', err);
        checkAndCache();
      }
    });

    // 更新时间
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    statsData.lastUpdate = timeStr;
    this.setData({
      'stats.lastUpdate': timeStr
    });
  }),

  // 加载 GitHub 统计数据
  loadGithubStats: Sentry.wrap(function () {
    const repoOwner = 'lizhiyao';
    const repoName = 'sentry-miniapp';
    const self = this;
    const cacheKey = 'github_stats_cache';

    // 获取缓存管理器
    const cacheManager = this.cacheManager || {
      getCache: () => null,
      setCache: () => { },
      clearCache: () => { }
    };

    // 检查缓存
    const cachedData = cacheManager.getCache(cacheKey);
    if (cachedData) {
      this.setData({
        'stats.githubStars': cachedData.githubStars || '--',
        'stats.githubForks': cachedData.githubForks || '--'
      });
      return;
    }

    console.log('缓存无效，重新获取GitHub数据');
    const githubData = {};
    let requestCount = 0;
    const totalRequests = 1;

    // 请求完成后缓存数据
    const checkAndCache = () => {
      requestCount++;
      if (requestCount === totalRequests) {
        // 所有请求完成，缓存数据
        cacheManager.setCache(cacheKey, githubData);
        console.log('GitHub数据已缓存');
      }
    };

    // 网络请求性能追踪演示 - 获取 GitHub 仓库信息
    Sentry.startSpan({
      name: 'GitHub API - 仓库信息',
      op: 'http.client',
      description: '获取 sentry-miniapp GitHub 仓库信息'
    }, (span) => {
      const requestStartTime = Date.now();
      
      // 设置请求相关标签
      span.setAttributes({
        'http.method': 'GET',
        'http.url': `https://api.github.com/repos/${repoOwner}/${repoName}`,
        'api.type': 'github_repo_info'
      });
      
      console.log('[性能追踪] 开始获取 GitHub 仓库信息');
      
      wx.request({
        url: `https://api.github.com/repos/${repoOwner}/${repoName}`,
        method: 'GET',
        success: function (res) {
          const requestDuration = Date.now() - requestStartTime;
          
          // 记录请求耗时
          span.setAttributes({
            'http.request_time': requestDuration,
            'http.status_code': res.statusCode
          });
          
          console.log(`[性能追踪] GitHub 仓库信息请求完成，耗时: ${requestDuration}ms`);
          
          if (res.statusCode === 200 && res.data) {
            const starsValue = self.formatNumber(res.data.stargazers_count);
            const forksValue = self.formatNumber(res.data.forks_count);
            
            githubData.githubStars = starsValue;
            githubData.githubForks = forksValue;
            
            self.setData({
              'stats.githubStars': starsValue,
              'stats.githubForks': forksValue
            });
            
            span.setAttributes({
              'request.success': true,
              'repo.stars': res.data.stargazers_count,
              'repo.forks': res.data.forks_count
            });
          } else {
            // 使用默认值
            githubData.githubStars = '50+';
            githubData.githubForks = '10+';
            
            self.setData({
              'stats.githubStars': '50+',
              'stats.githubForks': '10+'
            });
            
            span.setAttributes({ 'request.success': false });
          }
          
          // 记录网络请求面包屑
          Sentry.addBreadcrumb({
            message: `GitHub仓库信息请求完成，耗时${requestDuration}ms`,
            category: 'http',
            level: 'info',
            data: {
              url: `https://api.github.com/repos/${repoOwner}/${repoName}`,
              status: res.statusCode,
              duration: requestDuration
            }
          });
          
          checkAndCache();
        },
        fail: function (err) {
          const requestDuration = Date.now() - requestStartTime;
          
          span.setAttributes({
            'http.request_time': requestDuration,
            'request.success': false,
            'error.message': err.errMsg || 'Unknown error'
          });
          
          console.log(`[性能追踪] GitHub 仓库信息请求失败，耗时: ${requestDuration}ms`, err);
          
          // 使用默认值
          githubData.githubStars = '50+';
          githubData.githubForks = '10+';
          
          self.setData({
            'stats.githubStars': '50+',
            'stats.githubForks': '10+'
          });
          
          // 记录失败的网络请求
          Sentry.addBreadcrumb({
            message: `GitHub仓库信息请求失败，耗时${requestDuration}ms`,
            category: 'http',
            level: 'error',
            data: {
              url: `https://api.github.com/repos/${repoOwner}/${repoName}`,
              error: err.errMsg,
              duration: requestDuration
            }
          });
          
          checkAndCache();
        }
      });
    });
  }),

  // 格式化数字显示
  formatNumber: function (num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    } else {
      return num.toString();
    }
  },

  // 清除统计数据缓存
  clearStatsCache: Sentry.wrap(function () {
    const cacheManager = this.cacheManager || {
      clearCache: () => { }
    };

    try {
      // 清除NPM和GitHub缓存
      cacheManager.clearCache('npm_stats_cache');
      cacheManager.clearCache('github_stats_cache');

      console.log('缓存已清除');

      // 显示提示
      wx.showToast({
        title: '缓存已清除',
        icon: 'success',
        duration: 1500
      });

      // 重新加载数据
      setTimeout(() => {
        this.loadStatsWithCache();
      }, 500);

      // 记录清除缓存事件
      Sentry.addBreadcrumb({
        message: '用户清除统计数据缓存',
        category: 'user_action',
        level: 'info',
      });

    } catch (error) {
      console.error('清除缓存失败:', error);
      wx.showToast({
        title: '清除缓存失败',
        icon: 'error',
        duration: 1500
      });

      // 记录错误
      Sentry.captureException(error);
    }
  })
});