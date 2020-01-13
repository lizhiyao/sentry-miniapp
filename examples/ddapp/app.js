import * as Sentry from "./vendor/sentry-miniapp.dd.min";
console.log("Sentry", Sentry);
// 初始化 Sentry
Sentry.init({
  platform: "dd",
  dsn: "https://9d8f4b56ae4f4a48bc1e0974d7642a87@sentry.io/1534850"
});

App({
  onLaunch(options) {
    // 第一次打开
    // options.query == {number:1
    console.info("app.js", dd);
    console.info("App onLaunch");
  },
  onShow(options) {
    // 从后台被 scheme 重新打开
    // options.query == {number:1}
    Sentry.captureException(new Error("钉钉小程序"));
    Sentry.captureMessage("钉钉小程序Message");
    myrUndefinedFunctionInAsyncFunction();
  },
  onError(error) {
    console.warn("onError", error);
    Sentry.captureException(error);
  }
});
