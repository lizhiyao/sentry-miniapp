import * as Sentry from "./vendor/sentry-minapp.min";

console.log(Sentry);
// 初始化 Sentry
Sentry.init({
  platform: 'tt',
  dsn: "https://cd7838549e0d43e1bd6a83594ac7acb8@sentry.io/1534849"
});

App({
  onLaunch: function () {
    myUndefinedFunction();
  },
  onError(error) {
    console.warn('onError', error);
    Sentry.captureException(error);
  }
})
