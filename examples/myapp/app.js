import * as Sentry from "./vendor/sentry-miniapp.my.min";

console.log(Sentry);
// 初始化 Sentry
Sentry.init({
  platform: "my",
  dsn: "https://9d8f4b56ae4f4a48bc1e0974d7642a87@sentry.io/1534850"
});

App({
  onLaunch(options) {
    // 第一次打开
    // options.query == {number:1}
    console.info("app.js", my);
    console.info("App onLaunch");

    // 测试非异步代码执行异常
    // myUndefinedFunction();

    // 测试 API 调用失败 ---> framework error: can not find page: pages/get-user-info/get-user-info---> onError 无法捕获
    // my.navigateTo({ url: '../get-user-info/get-user-info' });
  },
  onShow(options) {
    // 从后台被 scheme 重新打开
    // options.query == {number:1}

    // 测试 async 函数中异常是否可以被 onError 捕获 ---> onError 无法捕获
    // const ret = await new Promise((resolve) => {
    //   setTimeout(() => {
    //     resolve('this is await ret.');
    //   }, 2000);
    // });
    // console.log(ret);
    myrUndefinedFunctionInAsyncFunction();
  },
  onError(error) {
    console.warn("onError", error);
    Sentry.captureException(error);
  }
});
