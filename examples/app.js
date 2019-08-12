import * as Sentry from "./vendor/sentry-minapp.min";

// console.log(Sentry);
// 初始化 Sentry
Sentry.init({
  dsn: "https://cafa852f9f9947b18b01346c0595d19d@sentry-f2e.dxy.net/102"
});

App({
  globalData: {
    userInfo: null
  },
  onLaunch: function() {
    // 展示本地存储能力
    var logs = wx.getStorageSync("logs") || [];
    logs.unshift(Date.now());
    wx.setStorageSync("logs", logs);

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    });
    // 获取用户信息
    wx.getSetting({
      success: res => {
        if (res.authSetting["scope.userInfo"]) {
          // 已经授权，可以直接调用 getUserInfo 获取头像昵称，不会弹框
          wx.getUserInfo({
            success: res => {
              // 可以将 res 发送给后台解码出 unionId
              this.globalData.userInfo = res.userInfo;

              // 由于 getUserInfo 是网络请求，可能会在 Page.onLoad 之后才返回
              // 所以此处加入 callback 以防止这种情况
              if (this.userInfoReadyCallback) {
                this.userInfoReadyCallback(res);
              }
            }
          });
        }
      }
    });

    // 测试 onError
    // throw new Error("this is a test error.");
    // throw new Error("lalalalalala");
  }
  // 不需要显示调用 Sentry.captureException(error)
  // onError(error) {
  //   console.warn(error);
  //   Sentry.captureException(error);
  // },
  // onPageNotFound(res) {
  //   console.warn(res);
  // }
});
