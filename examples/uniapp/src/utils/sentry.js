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

  // 网络请求面包屑默认开启（自动包裹 wx.request / uni.request，随错误事件一起上报）。
  // 这里再开 traceNetworkBody，连请求 / 响应体也记录（内置敏感字段脱敏）。
  // 若要按 URL 排除 body，可在 beforeBreadcrumb 里二次清理。
  traceNetworkBody: true,

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

// ---- 如何验证上报是否打通（自测用，验证完可删）----
//
// ⚠️ addBreadcrumb（面包屑）不会单独上报！它只是被缓存，等「下一次事件」发生时随事件一起发送。
// 只调用 addBreadcrumb 而不捕获事件，后台会一直没有数据——这不是 SDK 没生效。
//
// 要验证上报链路，必须主动捕获一个「事件」：
//
//   import Sentry from '@/utils/sentry';
//   Sentry.captureException(new Error('sentry test'));   // error 级，最直观
//   // 或 Sentry.captureMessage('sentry test', 'error'); // 注意别用默认的 info 级，可能被列表筛选挡掉
//
// 然后到 Sentry「Issues」列表查看（与「警报规则」无关，事件照样进列表）。
// 自建 Sentry / 真机时还需：把 Sentry 域名加入微信「request 合法域名」白名单
// （开发者工具可临时勾选「不校验合法域名」绕过），否则请求会被拦截、事件发不出去。
//
// ---- 验证「网络请求是否随错误一起上报」----
//
// 网络面包屑默认就开，但只有在「错误触发前真的发过请求」时才会出现。
// uni.request 最终会走到被包裹的全局 wx.request，无需额外配置。验证：
//
//   uni.request({
//     url: 'https://httpbin.org/get',
//     success() {
//       Sentry.captureException(new Error('net test')); // 上一条请求已记成 xhr 面包屑
//     },
//   });
//
// 到事件 Breadcrumbs 区应能看到 category: xhr 那条（带 url/method/status_code/duration；
// 开了 traceNetworkBody 还会带请求 / 响应体）。注意：Sentry.init 必须在请求之前执行。

export default Sentry;
export { Sentry };
