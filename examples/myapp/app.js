import * as Sentry from "./vendor/sentry-minapp.min";

console.log(Sentry);
// 初始化 Sentry
Sentry.init({
  platform: 'my',
  dsn: 'https://9d8f4b56ae4f4a48bc1e0974d7642a87@sentry.io/1534850'
});

App({
  onLaunch(options) {
    // 第一次打开
    // options.query == {number:1}
    console.info('App onLaunch');

    myUndefinedFunction();
  },
  onShow(options) {
    // 从后台被 scheme 重新打开
    // options.query == {number:1}
  },
  onError(error) {
    console.warn('onError', error);
    Sentry.captureException(error);
  }
});
