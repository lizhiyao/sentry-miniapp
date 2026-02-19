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

  showReportModal(title, details) {
    const content = Object.entries(details)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

    wx.showModal({
      title,
      content: content || '暂无可展示的上报信息',
      showCancel: false
    });
  },

  // --- 用户身份 ---

  getUserProfile() {
    wx.getUserProfile({
      desc: '用于展示 Sentry 用户追踪功能',
      success: (res) => {
        console.log("getUserProfile", res)
        const nickname = res.userInfo && res.userInfo.nickName ? res.userInfo.nickName : '微信用户';
        this.setData({
          userInfo: {
            ...res.userInfo,
            id: nickname
          },
          hasUserInfo: true
        });

        // 设置 Sentry 用户上下文
        Sentry.setUser({
          id: nickname,
          username: nickname,
          ip_address: '{{auto}}'
        });

        wx.showToast({ title: '已模拟登录', icon: 'success' });
      },
      fail: (err) => {
        // 即使用户拒绝，也模拟一个匿名用户方便测试
        const mockUser = { nickName: '访客用户', avatarUrl: '', id: '访客用户' };
        this.setData({
          userInfo: mockUser,
          hasUserInfo: true
        });
        Sentry.setUser({ id: '访客用户' });
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
      const eventId = Sentry.captureException(e);
      console.error(e);
      this.showReportModal('异常已上报', {
        type: 'exception',
        message: e.message,
        eventId: eventId || '未知',
        time: new Date().toLocaleString()
      });
    }
  },

  testAsyncError() {
    setTimeout(() => {
      try {
        throw new Error('Sentry 异步异常测试');
      } catch (e) {
        const eventId = Sentry.captureException(e);
        console.error(e);
        this.showReportModal('异步异常已上报', {
          type: 'exception',
          message: e.message,
          eventId: eventId || '未知',
          time: new Date().toLocaleString()
        });
      }
    }, 500);
  },

  testMessage() {
    const message = '这是一条测试消息';
    const eventId = Sentry.captureMessage(message, 'info');
    this.showReportModal('消息已上报', {
      type: 'message',
      message,
      level: 'info',
      eventId: eventId || '未知',
      time: new Date().toLocaleString()
    });
  },

  // --- 性能与网络测试 ---

  testRequest() {
    const span = Sentry.startInactiveSpan({
      name: 'testRequest',
      op: 'http.client'
    });
    const startTime = Date.now();
    let requestStatus = 'pending';
    let responsePreview = '';
    let requestError = '';

    wx.request({
      url: 'https://api.github.com/zen',
      success: (res) => {
        console.log('Request success:', res.data);
        span.setStatus('ok');
        requestStatus = 'ok';
        responsePreview = typeof res.data === 'string' ? res.data.slice(0, 80) : JSON.stringify(res.data).slice(0, 80);
      },
      fail: (err) => {
        console.error('Request failed:', err);
        span.setStatus('internal_error');
        requestStatus = 'error';
        requestError = err && err.errMsg ? err.errMsg : '请求失败';
      },
      complete: () => {
        span.end();
        const durationMs = Date.now() - startTime;
        this.showReportModal('请求监控完成', {
          type: 'http',
          name: 'testRequest',
          status: requestStatus,
          duration: `${durationMs}ms`,
          response: responsePreview,
          error: requestError
        });
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
        this.showReportModal('性能数据已上报', {
          type: 'performance',
          transaction: 'network_test',
          childSpan: 'GET /api/test',
          time: new Date().toLocaleString()
        });
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
          const feedbackEventId = Sentry.captureMessage(`User Feedback: ${res.content}`, {
            level: 'info',
            tags: { eventId: eventId }
          });
          this.showReportModal('反馈已提交', {
            type: 'user_feedback',
            relatedEventId: eventId || '未知',
            eventId: feedbackEventId || '未知',
            content: res.content,
            time: new Date().toLocaleString()
          });
        }
      }
    });
  }
});
