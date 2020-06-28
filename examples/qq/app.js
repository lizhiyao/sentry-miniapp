import * as Sentry from "./vendor/sentry-miniapp.qq.min";
// 初始化 Sentry
Sentry.init({
  dsn:
    "https://252e9b6a87d4422787ff151dc3b10a66@o113510.ingest.sentry.io/5299999",
});

App({
  onLaunch: function () {
    // 展示本地存储能力
    var logs = qq.getStorageSync("logs") || [];
    logs.unshift(Date.now());
    qq.setStorageSync("logs", logs);

    // 登录
    qq.login({
      success: (res) => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      },
    });
    // 获取用户信息
    qq.getSetting({
      success: (res) => {
        if (res.authSetting["scope.userInfo"]) {
          // 已经授权，可以直接调用 getUserInfo 获取头像昵称，不会弹框
          qq.getUserInfo({
            success: (res) => {
              // 可以将 res 发送给后台解码出 unionId
              this.globalData.userInfo = res.userInfo;

              // 由于 getUserInfo 是网络请求，可能会在 Page.onLoad 之后才返回
              // 所以此处加入 callback 以防止这种情况
              if (this.userInfoReadyCallback) {
                this.userInfoReadyCallback(res);
              }
            },
          });
        }
      },
    });

    myUndefinedFunction();
  },
  globalData: {
    userInfo: null,
  },
});
