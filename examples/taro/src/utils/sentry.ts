/**
 * Sentry 集成封装（Taro + React，微信小程序端）
 *
 * 本示例只演示小程序端集成，直接引入 sentry-miniapp。
 * 若 Taro 工程还要监控 H5 端，请按仓库根 README 的「uni-app / Taro」一节，
 * 用 `process.env.TARO_ENV === 'h5'` 判断分端引入 `@sentry/browser`。
 */
import * as Sentry from 'sentry-miniapp';

// 与 examples/wxapp、examples/uniapp 共用同一个演示 Sentry 项目 DSN，开箱即可上报。
// 换成你自己项目的 DSN 后，即可在你的后台观察数据。
const DSN = 'https://47703e01ba4344b8b252c15e8fd980fd@o113510.ingest.us.sentry.io/1528228';

Sentry.init({
  dsn: DSN,
  environment: 'production',
  debug: false,

  // 小程序平台标识
  platform: 'wechat',
  enableSystemInfo: true,
  enableUserInteractionBreadcrumbs: true,
  enableConsoleBreadcrumbs: true,
  enableNavigationBreadcrumbs: true,

  // 采样率：示例里全量采集，生产建议按量调低
  sampleRate: 1.0,
  tracesSampleRate: 1.0,

  // 网络请求面包屑默认开启（自动包裹 wx.request；Taro.request 最终也走它）。
  // 这里再开 traceNetworkBody，连请求 / 响应体也记录（内置敏感字段脱敏；可用 denyBodyUrls 排除指定 URL）。
  traceNetworkBody: true,

  // 事件体积保护：限制面包屑数量、裁剪过大的上下文，避免请求体过大被拒
  beforeSend(event) {
    if (event.breadcrumbs && event.breadcrumbs.length > 20) {
      event.breadcrumbs = event.breadcrumbs.slice(-20);
    }
    const contexts = event.contexts;
    const size = JSON.stringify(event).length;
    if (size > 200000 && contexts) {
      Object.keys(contexts).forEach((key) => {
        if (!['device', 'app', 'os', 'miniapp', 'trace'].includes(key)) {
          delete contexts[key];
        }
      });
    }
    return event;
  },
});

// 默认集成已包含：自动异常捕获、性能监控、Source Map 路径归一化、网络面包屑、
// Session 与网络状态监控。无需手动传 integrations；只有完全接管集成列表时才传（会覆盖默认）。

// 全局用户与标签（演示用，生产请按真实登录态设置）
Sentry.setUser({ id: 'taro-demo-user', username: 'taro_demo' });
Sentry.setTag('app.framework', 'taro-react');
Sentry.setTag('miniapp.platform', 'wechat');

export default Sentry;
export { Sentry };
