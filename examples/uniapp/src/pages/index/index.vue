<script setup>
import { ref, reactive } from 'vue';
import { onLoad, onReady, onShow, onUnload } from '@dcloudio/uni-app';
import Sentry from '../../utils/sentry';

// 每次进入页面生成唯一 pageVisitId，便于后台按本次访问聚合
let pageVisitId = '';
let pageSpan = null;

const status = reactive({
  connected: false,
  dsn: '',
  visitId: '',
});

const requests = ref([
  { name: 'npm-周下载量', url: 'https://api.npmjs.org/downloads/point/last-week/sentry-miniapp', state: 'idle', detail: '' },
  { name: 'npm-月下载量', url: 'https://api.npmjs.org/downloads/point/last-month/sentry-miniapp', state: 'idle', detail: '' },
  { name: 'github-仓库信息', url: 'https://api.github.com/repos/lizhiyao/sentry-miniapp', state: 'idle', detail: '' },
]);

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function refreshStatus() {
  const client = Sentry.getClient();
  status.connected = !!client;
  const dsn = client && client.getDsn ? client.getDsn() : null;
  status.dsn = dsn ? `${dsn.host}/${dsn.projectId}` : '未配置';
  status.visitId = pageVisitId;
}

// 把一次网络请求包进 span，并在成功/失败时打面包屑、失败时上报
function trackRequest(item) {
  const span = Sentry.startInactiveSpan({ name: item.name, op: 'http.client' });
  const startedAt = Date.now();
  item.state = 'loading';

  uni.request({
    url: item.url,
    method: 'GET',
    success: (res) => {
      span.setStatus('ok');
      item.state = 'ok';
      item.detail = `HTTP ${res.statusCode} · ${Date.now() - startedAt}ms`;
      Sentry.addBreadcrumb({
        category: 'demo.api',
        message: `${item.name} success`,
        level: 'info',
        data: { pageVisitId, statusCode: res.statusCode, durationMs: Date.now() - startedAt },
      });
    },
    fail: (err) => {
      span.setStatus('internal_error');
      item.state = 'fail';
      item.detail = (err && err.errMsg) || '请求失败';
      Sentry.withScope((scope) => {
        scope.setLevel('warning');
        scope.setTag('page', 'index');
        scope.setTag('demo.request_name', item.name);
        scope.setContext('request_failure', { name: item.name, url: item.url, errMsg: item.detail, pageVisitId });
        Sentry.captureMessage(`${item.name} 请求失败`);
      });
    },
    complete: () => {
      span.end();
    },
  });
}

function runAllRequests() {
  requests.value.forEach((item) => trackRequest(item));
}

onLoad(() => {
  pageVisitId = genId('visit');
  pageSpan = Sentry.startInactiveSpan({
    name: 'index.page.load',
    op: 'ui.load',
    forceTransaction: true,
    attributes: { 'demo.page_visit_id': pageVisitId },
  });
  Sentry.setTag('page', 'index');
  Sentry.setTag('demo.page_visit_id', pageVisitId);
  Sentry.addBreadcrumb({ category: 'ui.lifecycle', message: 'index onLoad', level: 'info', data: { pageVisitId } });
  refreshStatus();
});

onReady(() => {
  Sentry.addBreadcrumb({ category: 'ui.lifecycle', message: 'index onReady', level: 'info', data: { pageVisitId } });
  if (pageSpan) {
    pageSpan.end();
    pageSpan = null;
  }
});

onShow(() => {
  Sentry.addBreadcrumb({ category: 'ui.lifecycle', message: 'index onShow', level: 'info', data: { pageVisitId } });
});

onUnload(() => {
  Sentry.addBreadcrumb({ category: 'ui.lifecycle', message: 'index onUnload', level: 'info', data: { pageVisitId } });
});
</script>

<template>
  <view class="page-wrap">
    <view class="card">
      <view class="card-title">SDK 状态</view>
      <view class="row">
        <text class="row-label">连接状态</text>
        <text class="badge" :class="{ ok: status.connected }">{{ status.connected ? '已初始化' : '未连接' }}</text>
      </view>
      <view class="row">
        <text class="row-label">DSN</text>
        <text class="row-value">{{ status.dsn }}</text>
      </view>
      <view class="row">
        <text class="row-label">本次访问 ID</text>
        <text class="row-value">{{ status.visitId }}</text>
      </view>
    </view>

    <view class="card">
      <view class="card-title">网络请求（含 span 追踪）</view>
      <view class="card-desc">每个请求都被包进 http.client span，成功/失败打面包屑，失败自动上报。</view>
      <view class="btn-primary" @tap="runAllRequests">发起全部请求</view>
      <view v-for="item in requests" :key="item.name" class="row">
        <text class="row-label">{{ item.name }}</text>
        <text class="row-value">{{ item.state === 'idle' ? '—' : (item.state === 'loading' ? '请求中…' : item.detail) }}</text>
      </view>
    </view>
  </view>
</template>
