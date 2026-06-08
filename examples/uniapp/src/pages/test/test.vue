<script setup>
import { onLoad } from '@dcloudio/uni-app';
import Sentry from '../../utils/sentry';

// 为每个测试事件生成唯一 meta：triggerId + fingerprint，便于在后台区分每次点击
function createEventMeta(type) {
  const triggerId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    type,
    triggerId,
    occurredAt: new Date().toISOString(),
    fingerprint: ['uniapp-demo', type, triggerId],
  };
}

function applyScope(scope, meta, level) {
  scope.setFingerprint(meta.fingerprint);
  scope.setTag('page', 'test');
  scope.setTag('demo_event_type', meta.type);
  scope.setTag('demo_trigger_id', meta.triggerId);
  scope.setContext('demo_trigger', { ...meta, page: '/pages/test/test' });
  if (level) scope.setLevel(level);
}

function toast(title) {
  uni.showModal({ title: '已触发', content: title, showCancel: false });
}

// 1. 同步异常
function testException() {
  const meta = createEventMeta('sync_exception');
  Sentry.withScope((scope) => {
    applyScope(scope, meta, 'error');
    Sentry.captureException(new Error(`同步异常测试 [${meta.triggerId}]`));
  });
  toast(`captureException\n${meta.triggerId}`);
}

// 2. 异步异常
function testAsyncError() {
  const meta = createEventMeta('async_exception');
  setTimeout(() => {
    Sentry.withScope((scope) => {
      applyScope(scope, meta, 'error');
      Sentry.captureException(new Error(`异步异常测试 [${meta.triggerId}]`));
    });
  }, 300);
  toast(`异步 captureException\n${meta.triggerId}`);
}

// 3. 普通消息
function testMessage() {
  const meta = createEventMeta('message');
  Sentry.withScope((scope) => {
    applyScope(scope, meta, 'info');
    Sentry.captureMessage(`测试消息 [${meta.triggerId}]`);
  });
  toast(`captureMessage\n${meta.triggerId}`);
}

// 4. 未处理的 Promise 异常
function testUnhandledRejection() {
  const meta = createEventMeta('unhandled_rejection');
  Sentry.addBreadcrumb({
    category: 'demo.unhandled_rejection',
    message: `unhandledRejection [${meta.triggerId}]`,
    level: 'warning',
    data: { triggerId: meta.triggerId },
  });
  Promise.reject(new Error(`未处理的 Promise 异常 [${meta.triggerId}]`));
  toast(`Promise.reject\n${meta.triggerId}`);
}

// 5. 嵌套 span 性能追踪
function testPerformance() {
  const parent = Sentry.startInactiveSpan({ name: 'demo.task', op: 'task' });
  setTimeout(() => {
    const child = Sentry.startInactiveSpan({ name: 'demo.subtask', op: 'http' });
    setTimeout(() => {
      child.end();
      parent.end();
      toast('嵌套 span 已结束');
    }, 300);
  }, 200);
}

// 6. 用户反馈
function testFeedback() {
  const meta = createEventMeta('feedback_link');
  let eventId = '';
  Sentry.withScope((scope) => {
    applyScope(scope, meta, 'info');
    eventId = Sentry.captureMessage(`用户反馈关联事件 [${meta.triggerId}]`);
  });
  const feedbackId = Sentry.captureFeedback({
    message: '这是一条来自 uni-app 示例的测试反馈',
    name: '测试用户',
    email: 'test@example.com',
    associatedEventId: eventId,
  });
  toast(`captureFeedback\n${feedbackId || meta.triggerId}`);
}

// 7. 设置 / 清除用户
function setUser() {
  Sentry.setUser({ id: 'switched-user', username: 'switched_user', ip_address: '{{auto}}' });
  toast('已设置用户 switched_user');
}

function clearUser() {
  Sentry.setUser(null);
  toast('已清除用户');
}

onLoad(() => {
  Sentry.setTag('page', 'test');
  Sentry.addBreadcrumb({ category: 'ui.lifecycle', message: 'test onLoad', level: 'info' });
});
</script>

<template>
  <view class="page-wrap">
    <view class="card">
      <view class="card-title">异常捕获</view>
      <view class="btn-primary" @tap="testException">同步异常 captureException</view>
      <view class="btn-primary" @tap="testAsyncError">异步异常（setTimeout）</view>
      <view class="btn-primary" @tap="testUnhandledRejection">未处理 Promise 异常</view>
    </view>

    <view class="card">
      <view class="card-title">消息与反馈</view>
      <view class="btn-primary" @tap="testMessage">captureMessage</view>
      <view class="btn-primary" @tap="testFeedback">captureFeedback</view>
    </view>

    <view class="card">
      <view class="card-title">性能与用户</view>
      <view class="btn-primary" @tap="testPerformance">嵌套 span 性能追踪</view>
      <view class="btn-primary" @tap="setUser">设置用户</view>
      <view class="btn-primary" @tap="clearUser">清除用户</view>
    </view>

    <view class="card">
      <view class="card-desc">
        每个事件都带唯一 demo_trigger_id 与 fingerprint，可在 Sentry 后台按该标签精确定位本次点击产生的事件。
      </view>
    </view>
  </view>
</template>
