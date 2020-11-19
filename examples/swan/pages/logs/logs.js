//logs.js
const util = require("../../utils/util.js");

Page({
  data: {
    logs: []
  },
  onLoad: function() {
    this.setData({
      logs: (wx.getStorageSync("logs") || []).map(log => {
        return util.formatTime(new Date(log));
      })
    });

    throw new Error("this is a getCurrentPages test.");
  }
});
