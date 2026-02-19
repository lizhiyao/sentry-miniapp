// test.js
const Sentry = require('../../lib/sentry-miniapp.js');

Page({
  data: {
    userInfo: null,
    hasUserInfo: false
  },

  onLoad() {
    Sentry.setTag('page', 'test');
    Sentry.addBreadcrumb({
      category: 'ui.lifecycle',
      message: 'Test page loaded',
      level: 'info'
    });
  },

  // --- 用户身份 ---

  getUserProfile() {
    wx.getUserProfile({
      desc: '用于展示 Sentry 用户追踪功能',
      success: (res) => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });

        // 设置 Sentry 用户上下文
        Sentry.setUser({
          id: 'u_' + Math.floor(Math.random() * 10000),
          username: res.userInfo.nickName,
          ip_address: '{{auto}}'
        });

        wx.showToast({ title: '已模拟登录', icon: 'success' });
      },
      fail: (err) => {
        // 即使用户拒绝，也模拟一个匿名用户方便测试
        const mockUser = { nickName: '访客用户', avatarUrl: '' };
        this.setData({
          userInfo: mockUser,
          hasUserInfo: true
        });
        Sentry.setUser({ id: 'anon_guest' });
        wx.showToast({ title: '已作为访客登录', icon: 'none' });
      }
    });
  },

  clearUserProfile() {
    this.setData({
      userInfo: null,
      hasUserInfo: false
    });
    Sentry.setUser(null);
    wx.showToast({ title: '已清除用户', icon: 'none' });
  },

  // --- 错误捕获测试 ---

  testException() {
    try {
      throw new Error('Sentry 测试异常: ' + new Date().toLocaleTimeString());
    } catch (e) {
      Sentry.captureException(e);
      console.error(e);
      wx.showToast({ title: '异常已捕获', icon: 'success' });
    }
  },

  testAsyncError() {
    setTimeout(() => {
      try {
        throw new Error('Sentry 异步异常测试');
      } catch (e) {
        Sentry.captureException(e);
        console.error(e);
        wx.showToast({ title: '异步异常已捕获', icon: 'success' });
      }
    }, 500);
  },

  testMessage() {
    Sentry.captureMessage('这是一条测试消息', 'info');
    wx.showToast({ title: '消息已上报', icon: 'success' });
  },

  // --- 性能与网络测试 ---

  testRequest() {
    const span = Sentry.startInactiveSpan({
      name: 'testRequest',
      op: 'http.client'
    });

    wx.request({
      url: 'https://api.github.com/zen',
      success: (res) => {
        console.log('Request success:', res.data);
        span.setStatus('ok');
      },
      fail: (err) => {
        console.error('Request failed:', err);
        span.setStatus('internal_error');
      },
      complete: () => {
        span.end();
        wx.showToast({ title: '请求监控完成', icon: 'success' });
      }
    });
  },

  testNetworkPerformance() {
    const span = Sentry.startInactiveSpan({
      name: 'network_test',
      op: 'task'
    });

    setTimeout(() => {
      // 模拟子操作
      const childSpan = Sentry.startInactiveSpan({
        name: 'GET /api/test',
        op: 'http'
      });

      setTimeout(() => {
        childSpan.end();
        span.end();
        wx.showToast({ title: '性能数据已上报', icon: 'success' });
      }, 500);
    }, 200);
  },

  // --- 高级功能 ---

  testUserFeedback() {
    const eventId = Sentry.captureMessage('User Feedback Event');

    // 模拟弹窗收集反馈
    wx.showModal({
      title: '提交反馈',
      content: '是否对此错误提交反馈？',
      editable: true,
      placeholderText: '请输入您的反馈意见',
      success: (res) => {
        if (res.confirm && res.content) {
          // 注意：Sentry 小程序 SDK 可能没有内置 UserFeedback API，
          // 这里通常是发送一个新的 Message 包含反馈内容，或者调用 Sentry API
          // 这是一个模拟实现
          Sentry.captureMessage(`User Feedback: ${res.content}`, {
            level: 'info',
            tags: { eventId: eventId }
          });
          wx.showToast({ title: '反馈已提交', icon: 'success' });
        }
      }
    });
  }
});
