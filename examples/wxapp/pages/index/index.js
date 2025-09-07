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
    },
    rateLimitStatus: {
      remaining: null,
      limit: null,
      percentage: null,
      resetTime: null,
      status: '未知'
    }
  },

  // 缓存管理工具函数
  cacheManager: {
    // 缓存有效期：1小时
    CACHE_DURATION: 60 * 60 * 1000,
    // GitHub API 专用长期缓存（6小时）
    GITHUB_CACHE_DURATION: 6 * 60 * 60 * 1000,

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

    // 获取当前速率限制状态
    this.loadRateLimitStatus();
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

  // GitHub API 轮换配置
  githubApiConfig: {
    // 可用的 API 端点列表
    endpoints: [
      {
        name: 'search_repos',
        url: 'https://api.github.com/search/repositories?q=sentry-miniapp+user:lizhiyao',
        type: 'search'
      },
      {
        name: 'primary_repo',
        url: 'https://api.github.com/repos/lizhiyao/sentry-miniapp',
        type: 'repo_info'
      },
      {
        name: 'user_repos',
        url: 'https://api.github.com/users/lizhiyao/repos',
        type: 'user_repos',
        filter: 'sentry-miniapp'
      }
    ],
    
    // 获取当前应使用的端点索引
    getCurrentEndpointIndex: function() {
      const lastUsed = wx.getStorageSync('github_api_last_endpoint') || 0;
      const failedEndpoints = wx.getStorageSync('github_api_failed_endpoints') || [];
      
      // 找到下一个可用的端点
      for (let i = 0; i < this.endpoints.length; i++) {
        const index = (lastUsed + i) % this.endpoints.length;
        if (!failedEndpoints.includes(index)) {
          return index;
        }
      }
      
      // 如果所有端点都失败，重置失败列表并使用第一个
      wx.removeStorageSync('github_api_failed_endpoints');
      return 0;
    },
    
    // 标记端点为失败
    markEndpointFailed: function(index) {
      const failedEndpoints = wx.getStorageSync('github_api_failed_endpoints') || [];
      if (!failedEndpoints.includes(index)) {
        failedEndpoints.push(index);
        wx.setStorageSync('github_api_failed_endpoints', failedEndpoints);
      }
    },
    
    // 更新最后使用的端点
    updateLastUsedEndpoint: function(index) {
      wx.setStorageSync('github_api_last_endpoint', index);
    },
    
    // 重试配置
    retryConfig: {
      maxRetries: 3,
      baseDelay: 1000, // 基础延迟 1 秒
      maxDelay: 30000,  // 最大延迟 30 秒
      
      // 计算指数退避延迟
      calculateDelay: function(retryCount) {
        const delay = this.baseDelay * Math.pow(2, retryCount);
        return Math.min(delay, this.maxDelay);
      }
    },
    
    // 获取重试计数
    getRetryCount: function(endpointIndex) {
      const retryKey = `github_api_retry_${endpointIndex}`;
      return wx.getStorageSync(retryKey) || 0;
    },
    
    // 增加重试计数
    incrementRetryCount: function(endpointIndex) {
      const retryKey = `github_api_retry_${endpointIndex}`;
      const currentCount = this.getRetryCount(endpointIndex);
      wx.setStorageSync(retryKey, currentCount + 1);
      return currentCount + 1;
    },
    
    // 重置重试计数
    resetRetryCount: function(endpointIndex) {
      const retryKey = `github_api_retry_${endpointIndex}`;
      wx.removeStorageSync(retryKey);
    }
  },

  // 加载 GitHub 统计数据
  loadGithubStats: Sentry.wrap(function (retryAttempt = 0, specificEndpointIndex = null) {
    const self = this;
    const cacheKey = 'github_stats_cache';
    
    // 获取当前要使用的 API 端点
    const endpointIndex = specificEndpointIndex !== null ? specificEndpointIndex : this.githubApiConfig.getCurrentEndpointIndex();
    const endpoint = this.githubApiConfig.endpoints[endpointIndex];
    const retryCount = this.githubApiConfig.getRetryCount(endpointIndex);
    
    console.log(`使用 GitHub API 端点: ${endpoint.name} (${endpointIndex}), 重试次数: ${retryCount}`);
    
    // 检查是否超过最大重试次数
    if (retryCount >= this.githubApiConfig.retryConfig.maxRetries) {
      console.warn(`[重试机制] 端点 ${endpoint.name} 超过最大重试次数，标记为失败`);
      this.githubApiConfig.markEndpointFailed(endpointIndex);
      this.githubApiConfig.resetRetryCount(endpointIndex);
      
      // 尝试下一个端点
      const nextEndpointIndex = this.githubApiConfig.getCurrentEndpointIndex();
      if (nextEndpointIndex !== endpointIndex) {
        setTimeout(() => self.loadGithubStats(), 1000);
        return;
      }
    }

    // 获取缓存管理器
    const cacheManager = this.cacheManager || {
      getCache: () => null,
      setCache: () => { },
      clearCache: () => { }
    };

    // 检查缓存 - 使用专用的 GitHub 缓存时间
    const cachedData = cacheManager.getCache(cacheKey);
    const cacheTimestamp = wx.getStorageSync(cacheKey + '_timestamp');
    const etag = wx.getStorageSync(cacheKey + '_etag');
    const now = Date.now();
    
    // 检查是否有有效的长期缓存
    if (cachedData && cacheTimestamp && (now - cacheTimestamp < cacheManager.GITHUB_CACHE_DURATION)) {
      console.log('使用 GitHub API 长期缓存数据');
      this.setData({
        'stats.githubStars': cachedData.githubStars || '--',
        'stats.githubForks': cachedData.githubForks || '--'
      });
      return;
    }
    
    // 如果长期缓存过期但仍有数据，先显示旧数据，然后在后台更新
    if (cachedData) {
      console.log('显示过期缓存数据，后台更新中...');
      this.setData({
        'stats.githubStars': cachedData.githubStars + ' (更新中)',
        'stats.githubForks': cachedData.githubForks + ' (更新中)'
      });
    }

    console.log('缓存无效，重新获取GitHub数据');
    const githubData = {};
    let requestCount = 0;
    const totalRequests = 1;

    // 请求完成后缓存数据
    const checkAndCache = () => {
      requestCount++;
      if (requestCount === totalRequests) {
        // 所有请求完成，缓存数据和时间戳
        cacheManager.setCache(cacheKey, githubData);
        wx.setStorageSync(cacheKey + '_timestamp', Date.now());
        console.log('GitHub数据已缓存，缓存时间:', new Date().toLocaleString());
      }
    };

    // 网络请求性能追踪演示 - 获取 GitHub 仓库信息
    Sentry.startSpan({
      name: `GitHub API - ${endpoint.name}`,
      op: 'http.client',
      description: `获取 sentry-miniapp GitHub 仓库信息 (${endpoint.type})`
    }, (span) => {
      const requestStartTime = Date.now();
      
      // 设置请求相关标签
      span.setAttributes({
        'http.method': 'GET',
        'http.url': endpoint.url,
        'api.type': endpoint.type,
        'api.endpoint_index': endpointIndex,
        'api.endpoint_name': endpoint.name
      });
      
      console.log('[性能追踪] 开始获取 GitHub 仓库信息');
      
      // 构建请求头部，包含 ETag 支持
      const requestHeaders = {};
      
      // 如果有 ETag，添加 If-None-Match 头部
      if (etag) {
        requestHeaders['If-None-Match'] = etag;
        console.log('使用 ETag 进行条件请求:', etag);
      }
      
      wx.request({
          url: endpoint.url,
          method: 'GET',
          header: requestHeaders,
        success: function (res) {
          const requestDuration = Date.now() - requestStartTime;
          
          // 记录请求耗时
          span.setAttributes({
            'http.request_time': requestDuration,
            'http.status_code': res.statusCode
          });
          
          console.log(`[性能追踪] GitHub 仓库信息请求完成，耗时: ${requestDuration}ms`);
          
          if (res.statusCode === 304) {
            // 304 Not Modified - 数据未变更，使用缓存数据
            console.log('[ETag] 数据未变更，使用缓存数据');
            if (cachedData) {
              self.setData({
                'stats.githubStars': cachedData.githubStars,
                'stats.githubForks': cachedData.githubForks
              });
              
              // 更新缓存时间戳但保持数据不变
              wx.setStorageSync(cacheKey + '_timestamp', Date.now());
            }
            
            span.setAttributes({
              'request.success': true,
              'cache.hit': true,
              'etag.used': true
            });
            
            checkAndCache();
            return;
          } else if (res.statusCode === 200 && res.data) {
             // 解析不同类型的 API 响应
             let repoData = null;
             
             if (endpoint.type === 'repo_info') {
               repoData = res.data;
             } else if (endpoint.type === 'user_repos') {
               // 从用户仓库列表中找到目标仓库
               repoData = res.data.find(repo => repo.name === endpoint.filter);
             } else if (endpoint.type === 'search') {
               // 从搜索结果中获取第一个仓库
               repoData = res.data.items && res.data.items[0];
             }
             
             if (repoData && repoData.stargazers_count !== undefined) {
               const starsValue = self.formatNumber(repoData.stargazers_count);
               const forksValue = self.formatNumber(repoData.forks_count);
               
               githubData.githubStars = starsValue;
               githubData.githubForks = forksValue;
               
               self.setData({
                 'stats.githubStars': starsValue,
                 'stats.githubForks': forksValue
               });
               
               // 标记端点使用成功并重置重试计数
                self.githubApiConfig.updateLastUsedEndpoint(endpointIndex);
                self.githubApiConfig.resetRetryCount(endpointIndex);
                
                console.log(`[API轮换] 端点 ${endpoint.name} 请求成功，重置重试计数`);
             } else {
               throw new Error('无法从响应中解析仓库数据');
             }
            
            // 保存新的 ETag（如果存在）
            if (res.header && res.header.etag) {
              wx.setStorageSync(cacheKey + '_etag', res.header.etag);
              console.log('[ETag] 保存新的 ETag:', res.header.etag);
            }
            
            // 速率限制监控 - 解析 GitHub API 响应头部
            const rateLimitInfo = self.parseRateLimitHeaders(res.header);
            if (rateLimitInfo) {
              self.updateRateLimitStatus(rateLimitInfo);
              console.log('[速率限制监控] API 配额状态:', rateLimitInfo);
            }
            
            span.setAttributes({
              'request.success': true,
              'repo.stars': res.data.stargazers_count,
              'repo.forks': res.data.forks_count,
              'etag.saved': !!res.header?.etag
            });
          } else if (res.statusCode === 403) {
            // API 速率限制处理
            console.warn(`[GitHub API] 端点 ${endpoint.name} 速率限制超出`);
            
            const currentRetryCount = self.githubApiConfig.getRetryCount(endpointIndex);
            
            // 检查是否还能重试当前端点
            if (currentRetryCount < self.githubApiConfig.retryConfig.maxRetries) {
              const newRetryCount = self.githubApiConfig.incrementRetryCount(endpointIndex);
              const delay = self.githubApiConfig.retryConfig.calculateDelay(newRetryCount - 1);
              
              console.log(`[重试机制] 端点 ${endpoint.name} 将在 ${delay}ms 后重试 (${newRetryCount}/${self.githubApiConfig.retryConfig.maxRetries})`);
              
              span.setAttributes({
                'retry.attempt': newRetryCount,
                'retry.delay': delay,
                'retry.endpoint': endpoint.name
              });
              
              // 指数退避重试
              setTimeout(() => {
                self.loadGithubStats(newRetryCount, endpointIndex);
              }, delay);
              
              return;
            } else {
              // 超过重试次数，标记端点失败并尝试下一个
              console.warn(`[重试机制] 端点 ${endpoint.name} 重试次数已用完，切换端点`);
              self.githubApiConfig.markEndpointFailed(endpointIndex);
              self.githubApiConfig.resetRetryCount(endpointIndex);
              
              // 尝试使用下一个端点
              const nextEndpointIndex = self.githubApiConfig.getCurrentEndpointIndex();
              if (nextEndpointIndex !== endpointIndex) {
                console.log(`[API轮换] 切换到端点: ${self.githubApiConfig.endpoints[nextEndpointIndex].name}`);
                setTimeout(() => self.loadGithubStats(), 1000);
                return;
              }
            }
            
            // 所有端点都失败，实施降级策略
            console.warn('[降级策略] 所有 GitHub API 端点都不可用，使用降级策略');
            
            // 优先使用过期的缓存数据
            if (cachedData && cachedData.githubStars && cachedData.githubForks) {
              console.log('[降级策略] 使用过期缓存数据');
              githubData.githubStars = cachedData.githubStars;
              githubData.githubForks = cachedData.githubForks;
              
              self.setData({
                'stats.githubStars': cachedData.githubStars + ' (离线)',
                'stats.githubForks': cachedData.githubForks + ' (离线)'
              });
              
              span.setAttributes({
                'fallback.type': 'cached_data',
                'fallback.data_age': Date.now() - (cacheTimestamp || 0)
              });
            } else {
              // 没有缓存数据，使用合理的默认值
              console.log('[降级策略] 使用默认估算值');
              githubData.githubStars = '625';
              githubData.githubForks = '144';
              
              self.setData({
                'stats.githubStars': '625 (估算)',
                'stats.githubForks': '144 (估算)'
              });
              
              span.setAttributes({
                'fallback.type': 'default_values'
              });
            }
            
            span.setAttributes({ 
              'request.success': false,
              'error.type': 'rate_limit',
              'error.message': `GitHub API rate limit exceeded on ${endpoint.name}`,
              'api.endpoint_failed': endpointIndex
            });
            
            // 记录速率限制错误
            Sentry.captureMessage(`GitHub API 端点 ${endpoint.name} 速率限制超出`, 'warning');
          } else {
            // 其他错误情况
            githubData.githubStars = '625';
            githubData.githubForks = '144';
            
            self.setData({
              'stats.githubStars': '625',
              'stats.githubForks': '144'
            });
            
            span.setAttributes({ 'request.success': false });
          }
          
          // 记录网络请求面包屑
          Sentry.addBreadcrumb({
            message: `GitHub仓库信息请求完成，耗时${requestDuration}ms`,
            category: 'http',
            level: 'info',
            data: {
              url: endpoint.url,
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
          githubData.githubStars = '625';
          githubData.githubForks = '144';
          
          self.setData({
            'stats.githubStars': '625',
            'stats.githubForks': '144'
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

  // 解析 GitHub API 速率限制头部
  parseRateLimitHeaders: function(headers) {
    if (!headers) return null;
    
    // GitHub API 速率限制头部字段
    const rateLimitRemaining = headers['x-ratelimit-remaining'] || headers['X-RateLimit-Remaining'];
    const rateLimitLimit = headers['x-ratelimit-limit'] || headers['X-RateLimit-Limit'];
    const rateLimitReset = headers['x-ratelimit-reset'] || headers['X-RateLimit-Reset'];
    const rateLimitUsed = headers['x-ratelimit-used'] || headers['X-RateLimit-Used'];
    
    if (rateLimitRemaining !== undefined) {
      return {
        remaining: parseInt(rateLimitRemaining),
        limit: parseInt(rateLimitLimit) || 60,
        used: parseInt(rateLimitUsed) || 0,
        resetTime: parseInt(rateLimitReset) ? new Date(parseInt(rateLimitReset) * 1000) : null,
        percentage: rateLimitLimit ? Math.round(((parseInt(rateLimitLimit) - parseInt(rateLimitRemaining)) / parseInt(rateLimitLimit)) * 100) : 0
      };
    }
    
    return null;
  },
  
  // 更新速率限制状态
  updateRateLimitStatus: function(rateLimitInfo) {
    const statusKey = 'github_rate_limit_status';
    const status = {
      ...rateLimitInfo,
      lastUpdated: Date.now(),
      endpoint: 'github_api'
    };
    
    wx.setStorageSync(statusKey, status);
    
    // 更新页面显示的速率限制状态
    this.setData({
      'rateLimitStatus.remaining': rateLimitInfo.remaining,
      'rateLimitStatus.limit': rateLimitInfo.limit,
      'rateLimitStatus.percentage': rateLimitInfo.percentage,
      'rateLimitStatus.resetTime': rateLimitInfo.resetTime ? rateLimitInfo.resetTime.toLocaleString() : null,
      'rateLimitStatus.status': rateLimitInfo.remaining > 10 ? '正常' : '警告'
    });
    
    // 如果剩余配额很低，发送警告
    if (rateLimitInfo.remaining < 10) {
      console.warn(`[速率限制监控] GitHub API 配额即将耗尽: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}`);
      
      Sentry.captureMessage(
        `GitHub API 配额警告: 剩余 ${rateLimitInfo.remaining}/${rateLimitInfo.limit}`,
        'warning'
      );
    }
    
    // 记录到 Sentry 性能监控
    Sentry.addBreadcrumb({
      message: 'GitHub API 速率限制状态更新',
      category: 'api.rate_limit',
      level: 'info',
      data: {
        remaining: rateLimitInfo.remaining,
        limit: rateLimitInfo.limit,
        percentage: rateLimitInfo.percentage,
        resetTime: rateLimitInfo.resetTime?.toISOString()
      }
    });
  },
  
  // 获取当前速率限制状态
  getRateLimitStatus: function() {
    const statusKey = 'github_rate_limit_status';
    return wx.getStorageSync(statusKey) || null;
  },

  // 加载并显示速率限制状态
  loadRateLimitStatus: function() {
    const rateLimitInfo = this.getRateLimitStatus();
    if (rateLimitInfo) {
      this.setData({
        'rateLimitStatus.remaining': rateLimitInfo.remaining,
        'rateLimitStatus.limit': rateLimitInfo.limit,
        'rateLimitStatus.percentage': rateLimitInfo.percentage,
        'rateLimitStatus.resetTime': rateLimitInfo.resetTime ? new Date(rateLimitInfo.resetTime).toLocaleString() : null,
        'rateLimitStatus.status': rateLimitInfo.remaining > 10 ? '正常' : '警告'
      });
    }
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