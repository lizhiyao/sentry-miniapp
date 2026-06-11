// Taro(React) 标准 Babel 配置。
// babel-preset-taro 更多选项和默认值：https://docs.taro.zone/docs/babel-config
module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
        compiler: 'webpack5',
      },
    ],
  ],
};
