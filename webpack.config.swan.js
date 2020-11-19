const path = require("path");
const merge = require("webpack-merge");
const common = require("./webpack.common.js");

module.exports = merge(common, {
  output: {
    filename: "sentry-miniapp.swan.min.js",
    path: path.resolve(__dirname, "./examples/swan/vendor"),
  },
});
