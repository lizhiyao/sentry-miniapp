import * as Sentry from "./vendor/sentry-minapp.min";

console.log(Sentry);
// 初始化 Sentry
Sentry.init({
  dsn: "https://47703e01ba4344b8b252c15e8fd980fd@sentry.io/1528228"
});

App({
  onLaunch: function () {

  }
})
