// test.js
const Sentry = require('../../lib/sentry-miniapp.js');

Page({
  data: {
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    canIUseGetUserProfile: false,
    canIUseOpenData: wx.canIUse('open-data.type.userAvatarUrl') && wx.canIUse('open-data.type.userNickName'),
    testResults: [],
    isRunning: false
  },

  onLoad: Sentry.wrap(function (options) {
    console.log('测试页面加载');

    // 设置页面标签
    Sentry.setTag('page', 'test');

    // 记录页面加载事件
    Sentry.addBreadcrumb({
      message: '测试页面加载',
      category: 'navigation',
      level: 'info',
    });

    // 检查是否支持getUserProfile
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
  }),

  // 获取用户信息
  getUserProfile: Sentry.wrap(function (e) {
    var self = this;
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: function (res) {
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

        // 显示登录成功提示
        wx.showToast({
          title: '登录成功！',
          icon: 'success',
          duration: 2000
        });
      },
      fail: function (err) {
        console.error('获取用户信息失败', err);

        // 捕获错误
        Sentry.captureException(new Error('获取用户信息失败: ' + err.errMsg));

        // 显示错误提示
        wx.showToast({
          title: '登录失败',
          icon: 'error',
          duration: 2000
        });
      }
    });
  }),

  // 检查用户是否已登录
  checkUserLogin: function () {
    if (!this.data.hasUserInfo) {
      wx.showModal({
        title: '需要登录',
        content: '请先登录以体验 SDK 功能',
        showCancel: false,
        confirmText: '知道了'
      });
      return false;
    }
    return true;
  },

  // 网络请求测试
  testRequest: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    console.log('测试网络请求');

    // 记录测试开始
    Sentry.addBreadcrumb({
      message: '开始网络请求测试',
      category: 'test',
      level: 'info'
    });

    wx.request({
      url: 'https://httpbin.org/get',
      method: 'GET',
      success: (res) => {
        console.log('网络请求成功:', res);
        this.addTestResult('网络请求', '成功', res.statusCode);

        // 记录成功事件
        Sentry.addBreadcrumb({
          message: '网络请求测试成功',
          category: 'test',
          level: 'info',
          data: { statusCode: res.statusCode }
        });
      },
      fail: (err) => {
        console.error('网络请求失败:', err);
        this.addTestResult('网络请求', '失败', err.errMsg);

        // 捕获错误
        Sentry.captureException(new Error(`网络请求失败: ${err.errMsg}`));
      }
    });
  }),

  // 异常捕获测试
  testException: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    console.log('测试异常捕获');

    // 记录测试开始
    Sentry.addBreadcrumb({
      message: '开始异常捕获测试',
      category: 'test',
      level: 'info'
    });

    try {
      // 故意抛出一个错误
      throw new Error('这是一个测试异常');
    } catch (error) {
      console.error('捕获到异常:', error);
      this.addTestResult('异常捕获', '成功', error.message);

      // 上报异常到 Sentry
      Sentry.captureException(error);

      // 记录异常处理
      Sentry.addBreadcrumb({
        message: '异常捕获测试完成',
        category: 'test',
        level: 'info',
        data: { errorMessage: error.message }
      });
    }
  }),

  // 消息上报测试
  testMessage: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    console.log('测试消息上报');

    // 记录测试开始
    Sentry.addBreadcrumb({
      message: '开始消息上报测试',
      category: 'test',
      level: 'info'
    });

    // 发送测试消息到 Sentry
    Sentry.captureMessage('这是一个测试消息', 'info');

    this.addTestResult('消息上报', '成功', '测试消息已发送');

    // 记录完成
    Sentry.addBreadcrumb({
      message: '消息上报测试完成',
      category: 'test',
      level: 'info'
    });
  }),

  // 异步错误测试
  testAsyncError: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    console.log('测试异步错误');

    // 记录测试开始
    Sentry.addBreadcrumb({
      message: '开始异步错误测试',
      category: 'test',
      level: 'info'
    });

    const self = this;
    setTimeout(() => {
      try {
        throw new Error('这是一个异步错误');
      } catch (error) {
        console.error('异步错误:', error);
        self.addTestResult('异步错误', '成功', error.message);

        // 捕获异步错误
        Sentry.captureException(error);

        // 记录异步错误处理
        Sentry.addBreadcrumb({
          message: '异步错误测试完成',
          category: 'test',
          level: 'info',
          data: { errorMessage: error.message }
        });
      }
    }, 1000);
  }),

  // 添加测试结果}),

  // 测试用户反馈功能（使用新的 captureFeedback API）
  testUserFeedback: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    const self = this;
    
    // 先触发一个异常来获取事件ID
    const eventId = Sentry.captureException(new Error('测试用户反馈关联的异常'));
    
    // 显示反馈输入框
    wx.showModal({
      title: '用户反馈测试',
      content: '这是一个测试反馈，模拟用户遇到问题后的反馈场景',
      confirmText: '发送反馈',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          try {
            // 使用新的 captureFeedback API，关联错误事件
            const feedbackId = Sentry.captureFeedback({
              message: '这是一个测试反馈，用于验证 captureFeedback 功能是否正常工作。',
              name: self.data.userInfo.nickName || '测试用户',
              email: 'test@example.com',
              url: 'pages/test/test',
              source: 'error_feedback_test',
              associatedEventId: eventId,
              tags: {
                category: 'error_feedback',
                test_mode: true,
                platform: 'wechat'
              }
            });
            
            self.addTestResult('用户反馈', '成功', `反馈已发送，事件ID: ${feedbackId}`);
            
            wx.showToast({
              title: '反馈发送成功',
              icon: 'success'
            });
          } catch (error) {
            console.error('发送用户反馈失败:', error);
            self.addTestResult('用户反馈', '失败', `错误: ${error.message}`);
            
            wx.showToast({
              title: '反馈发送失败',
              icon: 'error'
            });
          }
        }
      }
    });
  }),

  // 测试新的 captureFeedback API
  testCaptureFeedback: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    const self = this;
    
    // 显示反馈类型选择
    wx.showActionSheet({
      itemList: ['性能问题', '界面问题', '功能建议', '发现Bug'],
      success: function(res) {
        const feedbackTypes = ['performance', 'ui', 'feature', 'bug'];
        const feedbackMessages = [
          '应用加载速度有点慢，希望能优化一下',
          '某些界面元素显示不正常',
          '建议增加夜间模式功能',
          '发现了一个可能的Bug'
        ];
        
        const selectedType = feedbackTypes[res.tapIndex];
        const selectedMessage = feedbackMessages[res.tapIndex];
        
        try {
          // 使用新的 captureFeedback API
          const feedbackId = Sentry.captureFeedback({
            message: selectedMessage,
            name: self.data.userInfo.nickName || '测试用户',
            email: 'test@example.com',
            url: 'pages/test/test',
            source: 'user_feedback_test',
            tags: {
              category: selectedType,
              priority: 'medium',
              platform: 'wechat',
              test_mode: true
            }
          });
          
          self.addTestResult('新反馈API', '成功', `${selectedType}反馈已发送，ID: ${feedbackId}`);
          
          wx.showToast({
            title: '反馈发送成功',
            icon: 'success'
          });
        } catch (error) {
          console.error('发送反馈失败:', error);
          self.addTestResult('新反馈API', '失败', `错误: ${error.message}`);
          
          wx.showToast({
            title: '反馈发送失败',
            icon: 'error'
          });
        }
      }
    });
  }),

  addTestResult: function (testType, status, detail) {
    const result = {
      type: testType,
      status: status,
      detail: detail,
      timestamp: new Date().toLocaleTimeString()
    };

    const results = this.data.testResults;
    results.unshift(result); // 添加到数组开头

    this.setData({
      testResults: results.slice(0, 10) // 保留最近10条记录
    });
  },

  // 清空所有测试结果
  clearResults: function () {
    this.setData({
      testResults: []
    });
  }
});