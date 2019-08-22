// const HtmlWebpackPlugin = require('html-webpack-plugin');
  // const CleanWebpackPlugin = require('clean-webpack-plugin');
const webpack = require('webpack');
const path = require('path')
const WebpackDevServerOutput = require('webpack-dev-server-output');
module.exports = {
  mode: "production",
  entry: "./src/index.ts",
  output: {
    filename: "sentry-minapp.min.js",
    library: "Sentry",
    libraryTarget: "commonjs2"
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NamedModulesPlugin(),
    new WebpackDevServerOutput({
      path: './examples/weapp/vendor',
      isDel: true
    })
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  devServer: {
    hot: true, // Tell the dev-server we're using HMR
    contentBase: path.resolve(__dirname, 'examples'),
    publicPath: '/'
  }
};
