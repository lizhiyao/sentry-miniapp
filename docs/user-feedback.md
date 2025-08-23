# captureFeedback 用户反馈功能

## 概述

`sentry-miniapp` 支持用户反馈功能，允许用户向 Sentry 发送反馈信息。我们提供了灵活的 `captureFeedback` API，支持多种反馈场景。

## API 参考

### captureFeedback(params)

使用新的反馈 API 捕获用户反馈，支持更多参数和灵活性。

**参数：**

```typescript
interface SendFeedbackParams {
  message: string;                    // 反馈消息（必需）
  name?: string;                      // 用户姓名（可选）
  email?: string;                     // 用户邮箱（可选）
  url?: string;                       // 当前页面 URL（可选）
  source?: string;                    // 反馈来源（可选）
  associatedEventId?: string;         // 关联的事件 ID（可选）
  tags?: {                           // 标签（可选）
    [key: string]: string | number | boolean;
  };
}
```

**返回值：** `string` - 事件 ID

**示例：**

```javascript
// 性能反馈
Sentry.captureFeedback({
  message: '应用加载速度有点慢，希望能优化一下。',
  name: '李四',
  email: 'lisi@example.com',
  url: 'pages/index/index',
  source: 'performance_feedback',
  tags: {
    category: 'performance',
    priority: 'medium',
    platform: 'wechat'
  }
});

// 功能建议
Sentry.captureFeedback({
  message: '建议增加夜间模式功能。',
  name: '王五',
  url: 'pages/settings/settings',
  source: 'feature_request',
  tags: {
    category: 'feature_request',
    priority: 'low'
  }
});

// 与错误事件关联的反馈
const errorEventId = Sentry.captureException(new Error('网络请求失败'));
Sentry.captureFeedback({
  message: '网络连接不稳定，经常请求失败。',
  name: '赵六',
  email: 'zhaoliu@example.com',
  associatedEventId: errorEventId,
  tags: {
    category: 'network',
    severity: 'high'
  }
});

// 错误后的用户反馈（替代传统的 captureUserFeedback）
const eventId = Sentry.captureException(new Error('支付失败'));
Sentry.captureFeedback({
  message: '点击支付按钮后页面卡住了，无法完成支付。',
  name: '张三',
  email: 'zhangsan@example.com',
  associatedEventId: eventId,
  tags: {
    category: 'payment_error',
    severity: 'high'
  }
});
```

## 在小程序中的使用

### 1. 错误反馈场景

```javascript
// pages/order/order.js
Page({
  // 支付处理
  handlePayment: function() {
    try {
      // 支付逻辑
      this.processPayment();
    } catch (error) {
      const eventId = Sentry.captureException(error);
      
      // 显示反馈对话框
      wx.showModal({
        title: '支付失败',
        content: '支付过程中遇到问题，是否要发送反馈？',
        confirmText: '发送反馈',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.showFeedbackForm(eventId);
          }
        }
      });
    }
  },
  
  // 显示反馈表单
  showFeedbackForm: function(eventId) {
    // 这里可以跳转到反馈页面或显示反馈表单
    wx.navigateTo({
      url: `/pages/feedback/feedback?eventId=${eventId}`
    });
  }
});
```

### 2. 反馈页面实现

```javascript
// pages/feedback/feedback.js
Page({
  data: {
    eventId: '',
    name: '',
    email: '',
    comments: ''
  },
  
  onLoad: function(options) {
    this.setData({
      eventId: options.eventId || ''
    });
  },
  
  // 提交反馈
  submitFeedback: function() {
    const { eventId, name, email, comments } = this.data;
    
    if (!name || !comments) {
      wx.showToast({
        title: '请填写姓名和反馈内容',
        icon: 'none'
      });
      return;
    }
    
    if (eventId) {
      // 关联错误事件的反馈
      Sentry.captureFeedback({
        message: comments,
        name: name,
        email: email,
        url: this.route,
        source: 'error_feedback',
        associatedEventId: eventId,
        tags: {
          platform: 'wechat',
          category: 'error_related'
        }
      });
    } else {
      // 独立的用户反馈
      Sentry.captureFeedback({
        message: comments,
        name: name,
        email: email,
        url: this.route,
        source: 'user_feedback',
        tags: {
          platform: 'wechat',
          category: 'general'
        }
      });
    }
    
    wx.showToast({
      title: '反馈已发送',
      icon: 'success'
    });
    
    // 返回上一页
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  }
});
```

### 3. 主动收集反馈

```javascript
// pages/settings/settings.js
Page({
  // 意见反馈按钮
  onFeedbackTap: function() {
    wx.navigateTo({
      url: '/pages/feedback/feedback'
    });
  },
  
  // 快速反馈
  quickFeedback: function(e) {
    const type = e.currentTarget.dataset.type;
    
    Sentry.captureFeedback({
      message: `用户点击了快速反馈：${type}`,
      url: this.route,
      source: 'quick_feedback',
      tags: {
        feedback_type: type,
        platform: 'wechat'
      }
    });
    
    wx.showToast({
      title: '反馈已发送',
      icon: 'success'
    });
  }
});
```

## 最佳实践

### 1. 反馈时机

- **错误发生时**：在捕获异常后主动询问用户是否要提供反馈
- **用户主动反馈**：在设置页面提供反馈入口
- **特定场景**：在关键流程（如支付、登录）失败时收集反馈

### 2. 反馈内容

- **提供上下文**：包含页面 URL、操作步骤等信息
- **使用标签**：通过 tags 对反馈进行分类，便于后续分析
- **关联事件**：将反馈与具体的错误事件关联

### 3. 用户体验

- **简化表单**：只收集必要信息，降低用户填写负担
- **及时反馈**：提交后给用户明确的成功提示
- **隐私保护**：明确告知用户数据用途，保护用户隐私

## 注意事项

1. **网络环境**：确保在有网络的环境下发送反馈
2. **数据量控制**：避免发送过大的反馈数据
3. **错误处理**：处理反馈发送失败的情况
4. **用户隐私**：遵守相关隐私法规，合理收集用户信息

## 在 Sentry 控制台查看反馈

反馈发送成功后，可以在 Sentry 控制台的以下位置查看：

1. **Issues 页面**：与错误事件关联的反馈会显示在对应的 Issue 详情中
2. **Events 页面**：`captureFeedback` API 创建的反馈事件
3. **User Feedback 页面**：所有用户反馈的汇总视图

通过这些反馈信息，开发团队可以更好地了解用户遇到的问题，优化产品体验。