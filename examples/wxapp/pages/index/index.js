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

    // 检查缓存并加载统计数据
    this.loadStatsWithCache();
  }),

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

  // 获取用户信息






  // 加载 npm 包统计数据
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

    // 获取今日下载量
    wx.request({
      url: `https://api.npmjs.org/downloads/point/last-day/${packageName}`,
      method: 'GET',
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          const formattedData = self.formatNumber(res.data.downloads);
          statsData.lastDayDownloads = formattedData;
          self.setData({
            'stats.lastDayDownloads': formattedData
          });
        }
        checkAndCache();
      },
      fail: function (err) {
        console.log('获取今日下载量失败:', err);
        checkAndCache();
      }
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
          self.setData({
            'stats.totalDownloads': formattedData
          });
        }
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
              self.setData({
                'stats.totalDownloads': formattedData
              });
            }
          },
          fail: function (err) {
            console.log('获取过去一年下载量也失败:', err);
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
    const totalRequests = 2;

    // 请求完成后缓存数据
    const checkAndCache = () => {
      requestCount++;
      if (requestCount === totalRequests) {
        // 所有请求完成，缓存数据
        cacheManager.setCache(cacheKey, githubData);
        console.log('GitHub数据已缓存');
      }
    };

    // 使用 GitHub 徽章 API 获取数据（无需认证，限制更宽松）
    // 方法1：尝试使用 shields.io 的 endpoint API

    // 获取 Stars 数据
    wx.request({
      url: `https://img.shields.io/github/stars/${repoOwner}/${repoName}`,
      method: 'GET',
      header: {
        'Accept': 'application/json'
      },
      success: function (res) {
        console.log('GitHub Stars API 响应:', res);
        if (res.statusCode === 200) {
          let starsData = '--';
          // 如果返回JSON格式
          if (res.data && res.data.message) {
            starsData = res.data.message;
          }
          // 如果返回SVG，尝试解析
          else if (typeof res.data === 'string') {
            const match = res.data.match(/>(\d+[k]?)</i);
            if (match && match[1]) {
              starsData = match[1];
            } else {
              // 备用方案：直接调用GitHub API（可能会遇到限流）
              self.loadGithubStarsDirectly(githubData);
              checkAndCache();
              return;
            }
          } else {
            self.loadGithubStarsDirectly(githubData);
            checkAndCache();
            return;
          }

          githubData.githubStars = starsData;
          self.setData({
            'stats.githubStars': starsData
          });
        } else {
          self.loadGithubStarsDirectly(githubData);
        }
        checkAndCache();
      },
      fail: function (err) {
        console.log('获取 GitHub Stars 数据失败:', err);
        self.loadGithubStarsDirectly(githubData);
        checkAndCache();
      }
    });

    // 获取 Forks 数据
    wx.request({
      url: `https://img.shields.io/github/forks/${repoOwner}/${repoName}`,
      method: 'GET',
      header: {
        'Accept': 'application/json'
      },
      success: function (res) {
        console.log('GitHub Forks API 响应:', res);
        if (res.statusCode === 200) {
          let forksData = '--';
          if (res.data && res.data.message) {
            forksData = res.data.message;
          }
          else if (typeof res.data === 'string') {
            const match = res.data.match(/>(\d+[k]?)</i);
            if (match && match[1]) {
              forksData = match[1];
            } else {
              self.loadGithubForksDirectly(githubData);
              checkAndCache();
              return;
            }
          } else {
            self.loadGithubForksDirectly(githubData);
            checkAndCache();
            return;
          }

          githubData.githubForks = forksData;
          self.setData({
            'stats.githubForks': forksData
          });
        } else {
          self.loadGithubForksDirectly(githubData);
        }
        checkAndCache();
      },
      fail: function (err) {
        console.log('获取 GitHub Forks 数据失败:', err);
        self.loadGithubForksDirectly(githubData);
        checkAndCache();
      }
    });
  }),

  // 备用方案：直接调用GitHub API获取Stars
  loadGithubStarsDirectly: function (githubData) {
    const self = this;
    wx.request({
      url: 'https://api.github.com/repos/lizhiyao/sentry-miniapp',
      method: 'GET',
      success: function (res) {
        let starsValue = '50+';
        if (res.statusCode === 200 && res.data) {
          starsValue = self.formatNumber(res.data.stargazers_count);
        }

        // 更新页面数据
        self.setData({
          'stats.githubStars': starsValue
        });

        // 更新缓存数据对象
        if (githubData) {
          githubData.githubStars = starsValue;
        }
      },
      fail: function (err) {
        console.log('GitHub API 调用失败:', err);
        const fallbackValue = '50+';
        self.setData({
          'stats.githubStars': fallbackValue
        });

        // 更新缓存数据对象
        if (githubData) {
          githubData.githubStars = fallbackValue;
        }
      }
    });
  },

  // 备用方案：直接调用GitHub API获取Forks
  loadGithubForksDirectly: function (githubData) {
    const self = this;
    wx.request({
      url: 'https://api.github.com/repos/lizhiyao/sentry-miniapp',
      method: 'GET',
      success: function (res) {
        let forksValue = '10+';
        if (res.statusCode === 200 && res.data) {
          forksValue = self.formatNumber(res.data.forks_count);
        }

        // 更新页面数据
        self.setData({
          'stats.githubForks': forksValue
        });

        // 更新缓存数据对象
        if (githubData) {
          githubData.githubForks = forksValue;
        }
      },
      fail: function (err) {
        console.log('GitHub API 调用失败:', err);
        const fallbackValue = '10+';
        self.setData({
          'stats.githubForks': fallbackValue
        });

        // 更新缓存数据对象
        if (githubData) {
          githubData.githubForks = fallbackValue;
        }
      }
    });
  },

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