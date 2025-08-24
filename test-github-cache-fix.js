#!/usr/bin/env node

/**
 * 测试 GitHub 统计数据缓存修复
 * 模拟微信小程序环境中的缓存逻辑
 */

console.log('🧪 开始测试 GitHub 缓存修复...');

// 模拟微信小程序的存储API
const mockStorage = {};
const wx = {
  setStorageSync: (key, value) => {
    mockStorage[key] = value;
    console.log(`📦 设置缓存 ${key}:`, value);
  },
  getStorageSync: (key) => {
    const value = mockStorage[key];
    console.log(`📖 读取缓存 ${key}:`, value || 'null');
    return value;
  },
  removeStorageSync: (key) => {
    delete mockStorage[key];
    console.log(`🗑️ 删除缓存 ${key}`);
  },
  request: (options) => {
    // 模拟网络请求失败，触发备用方案
    console.log(`🌐 模拟网络请求: ${options.url}`);
    setTimeout(() => {
      if (options.fail) {
        console.log('❌ 模拟网络请求失败，触发备用方案');
        options.fail({ message: '模拟网络错误' });
      }
    }, 100);
  },
  showToast: (options) => {
    console.log(`🍞 Toast: ${options.title}`);
  }
};

// 模拟缓存管理器
const cacheManager = {
  CACHE_DURATION: 10 * 60 * 1000,
  
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
  
  getCache: function (key) {
    try {
      const cacheStr = wx.getStorageSync(key);
      if (!cacheStr) return null;
      
      const cacheData = JSON.parse(cacheStr);
      const now = Date.now();
      
      if (now - cacheData.timestamp > this.CACHE_DURATION) {
        wx.removeStorageSync(key);
        return null;
      }
      
      return cacheData.data;
    } catch (e) {
      console.log('获取缓存失败:', e);
      return null;
    }
  },
  
  clearCache: function (key) {
    try {
      wx.removeStorageSync(key);
    } catch (e) {
      console.log('清除缓存失败:', e);
    }
  }
};



// 模拟修复后的 loadGithubStats 函数
function loadGithubStats() {
  console.log('\n🚀 开始加载 GitHub 统计数据...');
  
  const cacheKey = 'github_stats_cache';
  const cachedData = cacheManager.getCache(cacheKey);
  
  if (cachedData) {
    console.log('✅ 使用缓存数据:', cachedData);
    return;
  }
  
  console.log('🔄 缓存无效，重新获取GitHub数据');
  const githubData = {};
  let requestCount = 0;
  const totalRequests = 2;
  
  const checkAndCache = () => {
    requestCount++;
    console.log(`📊 请求完成计数: ${requestCount}/${totalRequests}`);
    
    if (requestCount === totalRequests) {
      console.log('🎯 所有请求完成，准备缓存数据...');
      console.log('📦 最终 githubData:', githubData);
      
      // 检查数据是否为空
      if (Object.keys(githubData).length === 0) {
        console.log('❌ 问题重现：githubData 为空对象！');
      } else {
        console.log('✅ 修复成功：githubData 包含数据！');
      }
      
      cacheManager.setCache(cacheKey, githubData);
      console.log('💾 GitHub数据已缓存');
      
      // 验证缓存内容
      const verifyCache = cacheManager.getCache(cacheKey);
      console.log('🔍 验证缓存内容:', verifyCache);
    }
  };
  
  // 内部定义备用方案函数
  const loadGithubStarsDirectly = (githubData) => {
    console.log('🔄 调用备用方案: loadGithubStarsDirectly');
    
    wx.request({
      url: 'https://api.github.com/repos/lizhiyao/sentry-miniapp',
      method: 'GET',
      success: function (res) {
        let starsValue = '50+';
        if (res.statusCode === 200 && res.data) {
          starsValue = res.data.stargazers_count || '50+';
        }
        
        console.log(`⭐ 获取到 Stars 数据: ${starsValue}`);
        
        // 更新缓存数据对象 (这是修复的关键)
        if (githubData) {
          githubData.githubStars = starsValue;
          console.log('✅ 已更新 githubData.githubStars:', starsValue);
        } else {
          console.log('❌ githubData 为空，无法更新缓存数据');
        }
      },
      fail: function (err) {
        console.log('GitHub API 调用失败:', err);
        const fallbackValue = '50+';
        
        // 更新缓存数据对象 (这是修复的关键)
        if (githubData) {
          githubData.githubStars = fallbackValue;
          console.log('✅ 已更新 githubData.githubStars (fallback):', fallbackValue);
        } else {
          console.log('❌ githubData 为空，无法更新缓存数据');
        }
      }
    });
  };
  
  const loadGithubForksDirectly = (githubData) => {
    console.log('🔄 调用备用方案: loadGithubForksDirectly');
    
    wx.request({
      url: 'https://api.github.com/repos/lizhiyao/sentry-miniapp',
      method: 'GET',
      success: function (res) {
        let forksValue = '10+';
        if (res.statusCode === 200 && res.data) {
          forksValue = res.data.forks_count || '10+';
        }
        
        console.log(`🍴 获取到 Forks 数据: ${forksValue}`);
        
        // 更新缓存数据对象 (这是修复的关键)
        if (githubData) {
          githubData.githubForks = forksValue;
          console.log('✅ 已更新 githubData.githubForks:', forksValue);
        } else {
          console.log('❌ githubData 为空，无法更新缓存数据');
        }
      },
      fail: function (err) {
        console.log('GitHub API 调用失败:', err);
        const fallbackValue = '10+';
        
        // 更新缓存数据对象 (这是修复的关键)
        if (githubData) {
          githubData.githubForks = fallbackValue;
          console.log('✅ 已更新 githubData.githubForks (fallback):', fallbackValue);
        } else {
          console.log('❌ githubData 为空，无法更新缓存数据');
        }
      }
    });
  };
  
  // 模拟网络请求失败，触发备用方案
  console.log('\n🌐 尝试获取 Stars 数据...');
  loadGithubStarsDirectly(githubData);
  
  setTimeout(() => {
    checkAndCache();
  }, 200);
  
  console.log('\n🌐 尝试获取 Forks 数据...');
  loadGithubForksDirectly(githubData);
  
  setTimeout(() => {
    checkAndCache();
  }, 300);
}

// 运行测试
console.log('\n=== 测试场景：网络请求失败，触发备用方案 ===');
loadGithubStats();

// 等待异步操作完成后显示结果
setTimeout(() => {
  console.log('\n📋 测试总结:');
  console.log('- 如果看到 "修复成功：githubData 包含数据！"，说明修复有效');
  console.log('- 如果看到 "问题重现：githubData 为空对象！"，说明仍有问题');
  console.log('\n🎯 修复要点:');
  console.log('1. 备用方案函数需要接收 githubData 参数');
  console.log('2. 在备用方案中必须更新 githubData 对象');
  console.log('3. 调用备用方案时必须传入 githubData 参数');
}, 1000);