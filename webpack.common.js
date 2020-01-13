module.exports = {
  mode: "production",
  entry: "./src/index.ts",
  output: {
    filename: "sentry-miniapp.min.js",
    library: "Sentry",
    libraryTarget: "commonjs2"
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  },
  watchOptions: {
    ignored: /node_modules|examples/, //忽略不用监听变更的目录
    aggregateTimeout: 300, // 文件发生改变后多长时间后再重新编译（Add a delay before rebuilding once the first file changed ）
    poll: 1000 //每秒询问的文件变更的次数
  },
  plugins: [],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  devtool: "source-map"
};
