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
    isRunning: false,
    successCount: 0,
    errorCount: 0,
    showDetailModal: false,
    detailContent: '',
    detailSections: []
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
        
        // 构造网络请求成功的详细信息
        const requestData = {
          event_type: 'network_request',
          timestamp: new Date().toISOString(),
          request: {
            url: 'https://httpbin.org/get',
            method: 'GET',
            status_code: res.statusCode,
            response_headers: res.header,
            response_data: res.data
          },
          user: this.data.userInfo,
          tags: {
            page: 'test',
            test_type: 'network_request',
            request_status: 'success'
          },
          breadcrumbs: [
            {
              message: '开始网络请求测试',
              category: 'test',
              level: 'info',
              timestamp: new Date().toISOString()
            },
            {
              message: '网络请求测试成功',
              category: 'test',
              level: 'info',
              data: { statusCode: res.statusCode },
              timestamp: new Date().toISOString()
            }
          ],
          environment: 'development',
          platform: 'javascript'
        };
        
        this.addTestResult('网络请求', '成功', `状态码: ${res.statusCode}`, requestData);

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
      
      // 构造 sentry 上报请求数据
      const sentryRequestData = {
        event_type: 'exception',
        timestamp: new Date().toISOString(),
        exception: {
          values: [{
            type: error.name,
            value: error.message,
            stacktrace: {
              frames: error.stack ? error.stack.split('\n').slice(0, 5) : []
            }
          }]
        },
        user: this.data.userInfo,
        tags: {
          page: 'test',
          test_type: 'exception'
        },
        breadcrumbs: [
          {
            message: '开始异常捕获测试',
            category: 'test',
            level: 'info',
            timestamp: new Date().toISOString()
          }
        ],
        environment: 'development',
        platform: 'javascript'
      };
      
      this.addTestResult('异常捕获', '成功', error.message, sentryRequestData);

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

    const testMessage = '这是一个测试消息';
    
    // 构造 sentry 上报请求数据
    const sentryRequestData = {
      event_type: 'message',
      timestamp: new Date().toISOString(),
      message: {
        formatted: testMessage,
        message: testMessage
      },
      level: 'info',
      user: this.data.userInfo,
      tags: {
        page: 'test',
        test_type: 'message'
      },
      breadcrumbs: [
        {
          message: '开始消息上报测试',
          category: 'test',
          level: 'info',
          timestamp: new Date().toISOString()
        }
      ],
      environment: 'development',
      platform: 'javascript'
    };

    // 发送测试消息到 Sentry
    Sentry.captureMessage(testMessage, 'info');

    this.addTestResult('消息上报', '成功', '测试消息已发送', sentryRequestData);

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
        
        // 构造 sentry 上报请求数据
        const sentryRequestData = {
          event_type: 'exception',
          timestamp: new Date().toISOString(),
          exception: {
            values: [{
              type: error.name,
              value: error.message,
              stacktrace: {
                frames: error.stack ? error.stack.split('\n').slice(0, 5) : []
              }
            }]
          },
          user: self.data.userInfo,
          tags: {
            page: 'test',
            test_type: 'async_error',
            async: true
          },
          breadcrumbs: [
            {
              message: '开始异步错误测试',
              category: 'test',
              level: 'info',
              timestamp: new Date().toISOString()
            }
          ],
          environment: 'development',
          platform: 'javascript'
        };
        
        self.addTestResult('异步错误', '成功', error.message, sentryRequestData);

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
            const feedbackData = {
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
            };
            
            // 使用新的 captureFeedback API，关联错误事件
            const feedbackId = Sentry.captureFeedback(feedbackData);
            
            // 构造详情数据
            const sentryRequestData = {
              event_type: 'user_feedback',
              feedback: feedbackData,
              user: {
                id: self.data.userInfo.nickName || 'test_user',
                username: self.data.userInfo.nickName || '测试用户',
                email: 'test@example.com'
              },
              tags: {
                page: 'test',
                test_type: 'user_feedback',
                feedback_category: 'error_feedback',
                platform: 'wechat',
                test_mode: 'true'
              },
              breadcrumbs: [
                {
                  message: '用户反馈测试开始',
                  category: 'test',
                  level: 'info',
                  timestamp: new Date().toISOString()
                },
                {
                  message: '关联异常事件创建',
                  category: 'error',
                  level: 'error',
                  data: { eventId: eventId },
                  timestamp: new Date().toISOString()
                },
                {
                  message: '用户反馈发送成功',
                  category: 'feedback',
                  level: 'info',
                  data: { feedbackId: feedbackId },
                  timestamp: new Date().toISOString()
                }
              ],
              environment: 'development',
              platform: 'javascript',
              timestamp: new Date().toISOString()
            };
            
            self.addTestResult('用户反馈', '成功', `反馈已发送，事件ID: ${feedbackId}`, sentryRequestData);
            
            wx.showToast({
              title: '反馈发送成功',
              icon: 'success'
            });
          } catch (error) {
            console.error('发送用户反馈失败:', error);
            
            // 构造错误详情数据
            const sentryRequestData = {
              event_type: 'user_feedback_error',
              exception: {
                values: [{
                  type: 'FeedbackError',
                  value: error.message,
                  stacktrace: { frames: [error.stack || '无堆栈信息'] }
                }]
              },
              user: {
                id: self.data.userInfo.nickName || 'test_user',
                username: self.data.userInfo.nickName || '测试用户'
              },
              tags: {
                page: 'test',
                test_type: 'user_feedback',
                error_type: 'feedback_send_failed',
                platform: 'wechat'
              },
              breadcrumbs: [
                {
                  message: '用户反馈测试开始',
                  category: 'test',
                  level: 'info',
                  timestamp: new Date().toISOString()
                },
                {
                  message: '用户反馈发送失败',
                  category: 'error',
                  level: 'error',
                  data: { error: error.message },
                  timestamp: new Date().toISOString()
                }
              ],
              environment: 'development',
              platform: 'javascript',
              timestamp: new Date().toISOString()
            };
            
            self.addTestResult('用户反馈', '失败', `错误: ${error.message}`, sentryRequestData);
            
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
          const feedbackData = {
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
          };
          
          // 使用新的 captureFeedback API
          const feedbackId = Sentry.captureFeedback(feedbackData);
          
          // 构造详情数据
          const sentryRequestData = {
            event_type: 'capture_feedback',
            feedback: feedbackData,
            user: {
              id: self.data.userInfo.nickName || 'test_user',
              username: self.data.userInfo.nickName || '测试用户',
              email: 'test@example.com'
            },
            tags: {
              page: 'test',
              test_type: 'capture_feedback',
              feedback_category: selectedType,
              feedback_priority: 'medium',
              platform: 'wechat',
              test_mode: 'true'
            },
            breadcrumbs: [
              {
                message: '独立反馈测试开始',
                category: 'test',
                level: 'info',
                timestamp: new Date().toISOString()
              },
              {
                message: `用户选择反馈类型: ${selectedType}`,
                category: 'user_action',
                level: 'info',
                data: { feedbackType: selectedType, message: selectedMessage },
                timestamp: new Date().toISOString()
              },
              {
                message: '独立反馈发送成功',
                category: 'feedback',
                level: 'info',
                data: { feedbackId: feedbackId, category: selectedType },
                timestamp: new Date().toISOString()
              }
            ],
            environment: 'development',
            platform: 'javascript',
            timestamp: new Date().toISOString()
          };
          
          self.addTestResult('新反馈API', '成功', `${selectedType}反馈已发送，ID: ${feedbackId}`, sentryRequestData);
          
          wx.showToast({
            title: '反馈发送成功',
            icon: 'success'
          });
        } catch (error) {
          console.error('发送反馈失败:', error);
          
          // 构造错误详情数据
          const sentryRequestData = {
            event_type: 'capture_feedback_error',
            exception: {
              values: [{
                type: 'CaptureFeedbackError',
                value: error.message,
                stacktrace: { frames: [error.stack || '无堆栈信息'] }
              }]
            },
            user: {
              id: self.data.userInfo.nickName || 'test_user',
              username: self.data.userInfo.nickName || '测试用户'
            },
            tags: {
              page: 'test',
              test_type: 'capture_feedback',
              error_type: 'feedback_send_failed',
              feedback_category: selectedType,
              platform: 'wechat'
            },
            breadcrumbs: [
              {
                message: '独立反馈测试开始',
                category: 'test',
                level: 'info',
                timestamp: new Date().toISOString()
              },
              {
                message: `用户选择反馈类型: ${selectedType}`,
                category: 'user_action',
                level: 'info',
                data: { feedbackType: selectedType },
                timestamp: new Date().toISOString()
              },
              {
                message: '独立反馈发送失败',
                category: 'error',
                level: 'error',
                data: { error: error.message, category: selectedType },
                timestamp: new Date().toISOString()
              }
            ],
            environment: 'development',
            platform: 'javascript',
            timestamp: new Date().toISOString()
          };
          
          self.addTestResult('新反馈API', '失败', `错误: ${error.message}`, sentryRequestData);
          
          wx.showToast({
            title: '反馈发送失败',
            icon: 'error'
          });
        }
      }
    });
  }),

  // 页面性能追踪测试
  testPagePerformance: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    console.log('测试页面性能追踪');

    // 记录测试开始
    Sentry.addBreadcrumb({
      message: '开始页面性能追踪测试',
      category: 'test',
      level: 'info'
    });

    const testStartTime = Date.now();

    // 使用 Sentry 的 startSpan API 追踪页面操作性能
    Sentry.startSpan({
      name: '测试页面操作性能',
      op: 'ui.action',
      description: '模拟用户在测试页面的操作流程'
    }, (span) => {
      // 设置操作相关的标签
      span.setAttributes({
        'page.name': 'test',
        'action.type': 'user_interaction',
        'test.category': 'performance'
      });

      // 模拟页面渲染过程
      const renderStartTime = Date.now();
      
      // 模拟数据处理
      setTimeout(() => {
        const renderDuration = Date.now() - renderStartTime;
        
        // 添加渲染耗时测量
        span.setAttributes({
          'page.render_time': renderDuration
        });
        
        // 模拟用户交互
        const interactionStartTime = Date.now();
        
        setTimeout(() => {
          const interactionDuration = Date.now() - interactionStartTime;
          const totalDuration = Date.now() - testStartTime;
          
          // 添加交互耗时测量
          span.setAttributes({
            'user.interaction_time': interactionDuration,
            'total.operation_time': totalDuration
          });
          
          console.log(`[性能追踪] 页面操作完成，总耗时: ${totalDuration}ms`);
          
          // 构造性能测试结果数据
          const performanceData = {
            event_type: 'performance_test',
            timestamp: new Date().toISOString(),
            performance: {
              render_time: renderDuration,
              interaction_time: interactionDuration,
              total_time: totalDuration,
              measurements: {
                'page.render_time': { value: renderDuration, unit: 'millisecond' },
                'user.interaction_time': { value: interactionDuration, unit: 'millisecond' },
                'total.operation_time': { value: totalDuration, unit: 'millisecond' }
              }
            },
            user: this.data.userInfo,
            tags: {
              page: 'test',
              test_type: 'performance',
              action_type: 'user_interaction'
            },
            breadcrumbs: [
              {
                message: '开始页面性能追踪测试',
                category: 'test',
                level: 'info',
                timestamp: new Date().toISOString()
              },
              {
                message: `页面性能追踪完成，总耗时${totalDuration}ms`,
                category: 'performance',
                level: 'info',
                data: {
                  renderTime: renderDuration,
                  interactionTime: interactionDuration,
                  totalTime: totalDuration
                },
                timestamp: new Date().toISOString()
              }
            ],
            environment: 'development',
            platform: 'javascript'
          };
          
          this.addTestResult('页面性能追踪', '成功', `总耗时: ${totalDuration}ms (渲染: ${renderDuration}ms, 交互: ${interactionDuration}ms)`, performanceData);
          
          // 记录性能测试完成的面包屑
          Sentry.addBreadcrumb({
            message: `页面性能追踪测试完成，总耗时${totalDuration}ms`,
            category: 'performance',
            level: 'info',
            data: {
              renderTime: renderDuration,
              interactionTime: interactionDuration,
              totalTime: totalDuration
            }
          });
        }, 50); // 模拟50ms的用户交互时间
      }, 100); // 模拟100ms的页面渲染时间
    });
  }),

  // 网络请求性能追踪测试
  testNetworkPerformance: Sentry.wrap(function () {
    if (!this.checkUserLogin()) return;

    console.log('测试网络请求性能追踪');

    // 记录测试开始
    Sentry.addBreadcrumb({
      message: '开始网络请求性能追踪测试',
      category: 'test',
      level: 'info'
    });

    const testApiUrl = 'https://httpbin.org/delay/1'; // 模拟1秒延迟的API

    // 使用 Sentry 的 startSpan API 追踪网络请求性能
    Sentry.startSpan({
      name: '测试API请求性能',
      op: 'http.client',
      description: '追踪测试API请求的完整性能指标'
    }, (span) => {
      const requestStartTime = Date.now();
      
      // 设置请求相关标签
      span.setAttributes({
        'http.method': 'GET',
        'http.url': testApiUrl,
        'api.type': 'performance_test',
        'test.category': 'network_performance'
      });
      
      console.log('[性能追踪] 开始网络请求性能测试');
      
      wx.request({
        url: testApiUrl,
        method: 'GET',
        timeout: 10000, // 10秒超时
        success: (res) => {
          const requestDuration = Date.now() - requestStartTime;
          
          // 记录请求耗时和状态
          const responseSize = JSON.stringify(res.data).length;
          span.setAttributes({
            'http.request_time': requestDuration,
            'http.status_code': res.statusCode,
            'request.success': true,
            'http.response_size': responseSize
          });
          
          console.log(`[性能追踪] 网络请求完成，耗时: ${requestDuration}ms，响应大小: ${responseSize} bytes`);
          
          // 构造网络性能测试结果数据
          const networkPerformanceData = {
            event_type: 'network_performance_test',
            timestamp: new Date().toISOString(),
            network: {
              request_time: requestDuration,
              response_size: responseSize,
              status_code: res.statusCode,
              url: testApiUrl,
              method: 'GET',
              measurements: {
                'http.request_time': { value: requestDuration, unit: 'millisecond' },
                'http.response_size': { value: responseSize, unit: 'byte' }
              }
            },
            user: this.data.userInfo,
            tags: {
              page: 'test',
              test_type: 'network_performance',
              http_method: 'GET',
              api_type: 'performance_test'
            },
            breadcrumbs: [
              {
                message: '开始网络请求性能追踪测试',
                category: 'test',
                level: 'info',
                timestamp: new Date().toISOString()
              },
              {
                message: `网络请求性能测试完成，耗时${requestDuration}ms`,
                category: 'http',
                level: 'info',
                data: {
                  url: testApiUrl,
                  status: res.statusCode,
                  duration: requestDuration,
                  responseSize: responseSize
                },
                timestamp: new Date().toISOString()
              }
            ],
            environment: 'development',
            platform: 'javascript'
          };
          
          this.addTestResult('网络性能追踪', '成功', `请求耗时: ${requestDuration}ms，响应大小: ${responseSize} bytes`, networkPerformanceData);
          
          // 记录网络性能测试完成的面包屑
          Sentry.addBreadcrumb({
            message: `网络请求性能测试完成，耗时${requestDuration}ms`,
            category: 'http',
            level: 'info',
            data: {
              url: testApiUrl,
              status: res.statusCode,
              duration: requestDuration,
              responseSize: responseSize
            }
          });
        },
        fail: (err) => {
          const requestDuration = Date.now() - requestStartTime;
          
          span.setAttributes({
            'http.request_time': requestDuration,
            'request.success': false,
            'error.message': err.errMsg || 'Unknown error'
          });
          
          console.log(`[性能追踪] 网络请求失败，耗时: ${requestDuration}ms`, err);
          
          this.addTestResult('网络性能追踪', '失败', `请求失败: ${err.errMsg}，耗时: ${requestDuration}ms`);
          
          // 记录失败的网络请求
          Sentry.addBreadcrumb({
            message: `网络请求性能测试失败，耗时${requestDuration}ms`,
            category: 'http',
            level: 'error',
            data: {
              url: testApiUrl,
              error: err.errMsg,
              duration: requestDuration
            }
          });
          
          // 捕获网络请求错误
          Sentry.captureException(new Error(`网络性能测试失败: ${err.errMsg}`));
        }
      });
    });
  }),

  addTestResult: function (testType, status, detail, sentryRequestData) {
    const result = {
      type: testType,
      status: status,
      detail: detail,
      timestamp: new Date().toLocaleTimeString(),
      sentryRequestData: sentryRequestData || null // 存储 sentry 上报请求的详细内容
    };

    const results = this.data.testResults;
    results.unshift(result); // 添加到数组开头
    
    // 计算统计数据
    const limitedResults = results.slice(0, 10); // 保留最近10条记录
    const successCount = limitedResults.filter(item => item.status === '成功').length;
    const errorCount = limitedResults.filter(item => item.status === '失败').length;

    this.setData({
      testResults: limitedResults,
      successCount: successCount,
      errorCount: errorCount
    });
  },

  // 清空所有测试结果
  clearResults: function () {
    this.setData({
      testResults: [],
      successCount: 0,
      errorCount: 0
    });
  },

  // 显示测试详情
  showTestDetail: function (e) {
    const index = e.currentTarget.dataset.index;
    const testResult = this.data.testResults[index];
    
    if (testResult && testResult.sentryRequestData) {
      const data = testResult.sentryRequestData;
      const sections = [];
      
      // 基本信息
      sections.push({
        key: 'basic',
        title: '📋 基本信息',
        content: `事件类型: ${data.event_type}\n时间戳: ${data.timestamp}\n环境: ${data.environment}\n平台: ${data.platform}`
      });
      
      // 网络请求信息
      if (data.request) {
        sections.push({
          key: 'request',
          title: '🌐 网络请求信息',
          content: `URL: ${data.request.url}\n方法: ${data.request.method}\n状态码: ${data.request.status_code}\n响应头: ${JSON.stringify(data.request.response_headers, null, 2)}\n响应数据: ${JSON.stringify(data.request.response_data, null, 2)}`
        });
      }
      
      // 用户反馈信息
      if (data.feedback) {
        sections.push({
          key: 'feedback',
          title: '💬 用户反馈信息',
          content: `反馈消息: ${data.feedback.message}\n用户姓名: ${data.feedback.name}\n用户邮箱: ${data.feedback.email}\n页面URL: ${data.feedback.url}\n反馈来源: ${data.feedback.source}${data.feedback.associatedEventId ? '\n关联事件ID: ' + data.feedback.associatedEventId : ''}${data.feedback.tags ? '\n反馈标签: ' + JSON.stringify(data.feedback.tags, null, 2) : ''}`
        });
      }
      
      // 异常信息或消息内容
      if (data.exception) {
        const exception = data.exception.values[0];
        sections.push({
          key: 'exception',
          title: '❌ 异常信息',
          content: `类型: ${exception.type}\n消息: ${exception.value}\n堆栈信息: ${exception.stacktrace.frames.join('\n')}`
        });
      }
      
      if (data.message) {
        sections.push({
          key: 'message',
          title: '💬 消息内容',
          content: `消息: ${data.message.formatted}`
        });
      }
      
      // 用户信息
      if (data.user && Object.keys(data.user).length > 0) {
        sections.push({
          key: 'user',
          title: '👤 用户信息',
          content: JSON.stringify(data.user, null, 2)
        });
      }
      
      // 标签信息
      if (data.tags) {
        sections.push({
          key: 'tags',
          title: '🏷️ 标签信息',
          content: Object.entries(data.tags).map(([key, value]) => `${key}: ${value}`).join('\n')
        });
      }
      
      // 面包屑记录
      if (data.breadcrumbs && data.breadcrumbs.length > 0) {
        sections.push({
          key: 'breadcrumbs',
          title: '🍞 面包屑记录',
          content: data.breadcrumbs.map(b => `[${b.level}] ${b.category}: ${b.message}`).join('\n')
        });
      }
      
      this.setData({
         showDetailModal: true,
         detailSections: sections
       });
     }
   },
 
   // 隐藏测试详情
   hideTestDetail: function () {
     this.setData({
       showDetailModal: false,
       detailContent: '',
       detailSections: []
     });
   }
 });