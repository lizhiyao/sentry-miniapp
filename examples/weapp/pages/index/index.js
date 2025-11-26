//index.js
import * as Sentry from "../../sentry/index";
//获取应用实例
const app = getApp();

Page({
  data: {
    motto: "Hello World",
    userInfo: {},
    hasUserInfo: false,
    canIUse: wx.canIUse("button.open-type.getUserInfo")
  },
  //事件处理函数
  bindViewTap: function () {
    wx.navigateTo({
      url: "../logs/logs"
    });
  },
  onLoad: function () {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      });
    } else if (this.data.canIUse) {
      // 由于 getUserInfo 是网络请求，可能会在 Page.onLoad 之后才返回
      // 所以此处加入 callback 以防止这种情况
      app.userInfoReadyCallback = res => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
      };
    } else {
      // 在没有 open-type=getUserInfo 版本的兼容处理
      wx.getUserInfo({
        success: res => {
          app.globalData.userInfo = res.userInfo;
          this.setData({
            userInfo: res.userInfo,
            hasUserInfo: true
          });
        }
      });
    }

    // throw new Error("吼吼吼");
  },
  getUserInfo: function (e) {
    console.log(e);
    app.globalData.userInfo = e.detail.userInfo;
    this.setData({
      userInfo: e.detail.userInfo,
      hasUserInfo: true
    });
  },
  // async onLoad() {
  //   try {
  //     // 所有业务逻辑
  //   } catch (e) {
  //     Sentry.captureException(e)
  //   }
  // }

  testError() {
    throw new Error("测试错误");
  },
  
  testCapture() {
    try {
      throw new Error("捕获的错误");
    } catch (e) {
      Sentry.captureException(e);
    }
  },
  
  testAsyncError() {
    setTimeout(() => {
      throw new Error("异步错误");
    }, 1000);
  },

  testCustomEvent() {
    Sentry.captureMessage("自定义事件测试");
  }
  
});
