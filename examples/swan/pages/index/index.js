//index.js
//获取应用实例
const app = getApp();

Page({
  data: {
    motto: "Hello World",
    userInfo: {},
    hasUserInfo: false,
    canIUse: swan.canIUse("button.open-type.getUserInfo")
  },
  //事件处理函数
  bindViewTap: function () {
    swan.navigateTo({
      url: "../logs/logs"
    });
  },
  onLoad: function () {
    throw new Error("吼吼吼");
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
});
