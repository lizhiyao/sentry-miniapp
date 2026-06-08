<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import Sentry from './utils/sentry';

// 应用级 launchId：贯穿整个启动会话，便于在 Sentry 后台按本次启动聚合事件。
let launchId = '';
let launchSpan = null;

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

onLaunch(() => {
  launchId = genId('launch');
  Sentry.setTag('demo.launch_id', launchId);
  Sentry.setContext('app_launch', {
    launchId,
    framework: 'uni-app',
    startedAt: new Date().toISOString(),
  });
  Sentry.addBreadcrumb({
    category: 'app.lifecycle',
    message: 'App onLaunch',
    level: 'info',
    data: { launchId },
  });
  // 启动链路 span，onShow 时结束
  launchSpan = Sentry.startInactiveSpan({
    name: 'app.launch',
    op: 'app.start',
    forceTransaction: true,
    attributes: { 'demo.launch_id': launchId },
  });
});

onShow(() => {
  Sentry.addBreadcrumb({
    category: 'app.lifecycle',
    message: 'App onShow',
    level: 'info',
    data: { launchId },
  });
  if (launchSpan) {
    launchSpan.end();
    launchSpan = null;
  }
});

onHide(() => {
  Sentry.addBreadcrumb({
    category: 'app.lifecycle',
    message: 'App onHide',
    level: 'info',
    data: { launchId },
  });
});
</script>

<style lang="scss">
/* 全局样式（App.vue 的 style 在 uni-app 中作用于整个应用） */
page {
  background-color: $bg-page;
  color: $text-primary;
  font-size: 28rpx;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
}

.page-wrap {
  padding: $page-padding;
}

.card {
  background-color: $bg-card;
  border-radius: $radius-card;
  padding: $page-padding;
  margin-bottom: $gap;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
}

.card-title {
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.card-desc {
  font-size: 26rpx;
  color: $text-secondary;
  line-height: 1.6;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  background-color: $sentry-primary;
  color: #ffffff;
  border-radius: $radius-btn;
  font-size: 30rpx;
  margin-bottom: $gap;
}

.btn-primary:active {
  opacity: 0.9;
  transform: translateY(2rpx);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
}

.row-label {
  color: $text-secondary;
  font-size: 26rpx;
}

.row-value {
  font-size: 26rpx;
  font-weight: 500;
}

.badge {
  display: inline-block;
  padding: 4rpx 20rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  background-color: $sentry-primary-light;
  color: $sentry-primary;
}

.badge.ok {
  background-color: rgba(45, 169, 140, 0.12);
  color: $color-success;
}
</style>
