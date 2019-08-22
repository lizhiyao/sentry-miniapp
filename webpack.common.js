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
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/
      }
    ]
  }
};
