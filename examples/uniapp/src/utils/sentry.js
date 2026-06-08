/**
 * Sentry 集成封装（uni-app 微信小程序端）
 *
 * 本示例只演示小程序端集成，因此直接引入 sentry-miniapp。
 * 若你的 uni-app 工程还要监控 H5 端，请按仓库 README 的「uni-app / Taro」一节，
 * 用条件编译按端引入：
 *   // #ifdef H5
 *   import * as Sentry from '@sentry/browser';
 *   // #endif
 *   // #ifdef MP-WEIXIN || MP-ALIPAY || MP-BAIDU || MP-TOUTIAO || MP-QQ || MP-KUAISHOU || MP-DINGTALK
 *   import * as Sentry from 'sentry-miniapp';
 *   // #endif
 */
import * as Sentry from 'sentry-miniapp';

// 与 examples/wxapp 共用同一个演示 Sentry 项目 DSN，开箱即可上报。
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

  // 事件体积保护：限制面包屑数量、裁剪过大的上下文，避免请求体过大被拒
  beforeSend(event) {
    if (event.breadcrumbs && event.breadcrumbs.length > 20) {
      event.breadcrumbs = event.breadcrumbs.slice(-20);
    }
    const size = JSON.stringify(event).length;
    if (size > 200000 && event.contexts) {
      Object.keys(event.contexts).forEach((key) => {
        if (!['device', 'app', 'os', 'miniapp', 'trace'].includes(key)) {
          delete event.contexts[key];
        }
      });
    }
    return event;
  },

  // 默认集成 + 性能监控集成
  integrations: [
    ...Sentry.getDefaultIntegrations(),
    new Sentry.Integrations.PerformanceIntegration({
      enableNavigationTiming: true,
      enableRenderTiming: true,
      enableResourceTiming: true,
      enableUserTiming: true,
      sampleRate: 1.0,
      reportInterval: 30000,
    }),
  ],
});

// 全局用户与标签（演示用，生产请按真实登录态设置）
Sentry.setUser({ id: 'uniapp-demo-user', username: 'uniapp_demo' });
Sentry.setTag('app.framework', 'uni-app');
Sentry.setTag('miniapp.platform', 'wechat');

export default Sentry;
export { Sentry };
