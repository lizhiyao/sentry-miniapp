// 示例：在页面中使用 sentry-miniapp
// 引用 npm 包
const Sentry = require('../../lib/sentry-miniapp.js');

console.log('页面中 Sentry SDK 已加载:', typeof Sentry);

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    canIUseGetUserProfile: false,
    canIUseOpenData: wx.canIUse('open-data.type.userAvatarUrl') && wx.canIUse('open-data.type.userNickName'),
    clickCount: 0,
    messageCount: 0
  },
  
  onLoad: Sentry.wrap(function() {
    console.log('页面加载');
    
    // 设置页面标签
    Sentry.setTag('page', 'index');
    
    // 记录页面加载事件
    Sentry.addBreadcrumb({
      message: '首页加载',
      category: 'navigation',
      level: 'info',
    });
    
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
  }),
  
  onShow: Sentry.wrap(function() {
    console.log('页面显示');
    
    // 记录页面显示事件
    Sentry.addBreadcrumb({
      message: '首页显示',
      category: 'navigation',
      level: 'info',
    });
  }),
  
  onHide: Sentry.wrap(function() {
    console.log('页面隐藏');
    
    // 记录页面隐藏事件
    Sentry.addBreadcrumb({
      message: '首页隐藏',
      category: 'navigation',
      level: 'info',
    });
  }),
  
  // 获取用户信息
  getUserProfile: Sentry.wrap(function(e) {
    var self = this;
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: function(res) {
        console.log('获取用户信息成功', res);
        
        self.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
        
        // 设置用户信息到 Sentry
        Sentry.setUser({
          id: res.userInfo.nickName,
          username: res.userInfo.nickName,
        });
        
        // 记录用户操作
        Sentry.addBreadcrumb({
          message: '用户授权获取信息',
          category: 'user',
          level: 'info',
          data: {
            nickName: res.userInfo.nickName,
          },
        });
      },
      fail: function(err) {
        console.error('获取用户信息失败', err);
        
        // 捕获错误
        Sentry.captureException(new Error('获取用户信息失败: ' + err.errMsg));
      }
    });
  }),
  
  // 测试网络请求
  testRequest: Sentry.wrap(function() {
    var self = this;
    wx.request({
      url: 'https://httpbin.org/get',
      method: 'GET',
      success: function(res) {
        console.log('网络请求成功', res);
        
        // 记录成功的网络请求
        Sentry.addBreadcrumb({
          message: '测试请求成功',
          category: 'http',
          level: 'info',
          data: {
            statusCode: res.statusCode,
            url: 'https://httpbin.org/get'
          }
        });
        
        wx.showToast({
          title: '请求成功',
          icon: 'success'
        });
      },
      fail: function(err) {
        console.error('网络请求失败', err);
        
        // 捕获网络错误
        Sentry.captureException(new Error('网络请求失败: ' + err.errMsg));
        
        wx.showToast({
          title: '请求失败',
          icon: 'error'
        });
      }
    });
  }),
  
  // 测试异常捕获
  testException: Sentry.wrap(function() {
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
          click_count: (this.data.clickCount || 0) + 1,
        },
        extra: {
          timestamp: new Date().toISOString(),
          userAgent: 'miniapp',
          clickCount: (this.data.clickCount || 0) + 1,
        },
      });
      
      // 更新点击计数
      this.setData({
        clickCount: (this.data.clickCount || 0) + 1
      });
      
      wx.showToast({
        title: `异常已捕获并上报 (${this.data.clickCount || 1})`,
        icon: 'success',
      });
    }
  }),
  
  // 测试消息捕获
  testMessage: Sentry.wrap(function() {
    // 更新消息点击计数
    const messageCount = (this.data.messageCount || 0) + 1;
    this.setData({
      messageCount: messageCount
    });
    
    // 捕获自定义消息，添加时间戳以避免去重
    const timestamp = new Date().toISOString();
    Sentry.captureMessage(`用户点击了测试按钮 - ${timestamp}`, 'info', {
      tags: {
        action: 'test_message',
        page: 'index',
        click_count: messageCount,
      },
      extra: {
        timestamp: timestamp,
        userAgent: 'miniapp',
        clickCount: messageCount,
      },
    });
    
    wx.showToast({
      title: `消息已上报 (${messageCount})`,
      icon: 'success',
    });
  }),
  
  // 测试导航
  navigateToDetail: Sentry.wrap(function() {
    wx.navigateTo({
      url: '/pages/detail/detail?id=123',
      success: function() {
        console.log('导航成功');
      },
      fail: function(err) {
        console.error('导航失败', err);
        Sentry.captureException(new Error('页面导航失败: ' + err.errMsg));
      }
    });
  }),
  
  // 测试异步错误
  testAsyncError: Sentry.wrap(function() {
    var self = this;
    setTimeout(function() {
      // 这个错误会被 TryCatch 集成自动捕获
      throw new Error('这是一个异步错误');
    }, 1000);
    
    wx.showToast({
      title: '1秒后将发生异步错误',
      icon: 'none',
    });
  }),
});