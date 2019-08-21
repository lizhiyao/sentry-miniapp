import * as Sentry from "./vendor/sentry-minapp.min";

console.log(Sentry);
// 初始化 Sentry
Sentry.init({
  platform: 'tt',
  dsn: "https://cd7838549e0d43e1bd6a83594ac7acb8@sentry.io/1534849"
});

App({
  onLaunch: function () {
    // myUndefinedFunction();
  },
  // 头条暂时不支持使用 async
  // async onShow() {
  //   // 测试 async 函数中异常是否可以被 onError 捕获 ---> onError 无法捕获
  //   const ret = await new Promise((resolve) => {
  //     setTimeout(() => {
  //       resolve('this is await ret.');
  //     }, 2000);
  //   });
  //   console.log(ret);
  //   myrUndefinedFunctionInAsyncFunction();
  // },
  onShow() {
    // 测试 Promise 中异常是否可以被 onError 捕获 ---> onError 无法捕获
    const ret = new Promise((resolve) => {
      myrUndefinedFunctionInAsyncFunction();
    })
    // .then((res) => {
    //   console.log(res);
    // }, (error) => {
    //   console.log(error);
    //   Sentry.captureException(error);
    // })
  },
  onError(error) {
    console.warn('onError', error);
    Sentry.captureException(error);
  }
})
