const path = require("path");
const merge = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  output: {
    filename: "sentry-minapp.my.min.js",
    path: path.resolve(__dirname, "./examples/myapp/vendor")
  },
});