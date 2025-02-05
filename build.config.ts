import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [
    './src/index', // 确保这个路径指向你的源码入口
  ],
  outDir: 'dist',
  declaration: true, // 如果你需要生成 TypeScript 声明文件
  dependencies: ['@sentry/core', '@sentry/types', '@sentry/utils'], // 你的项目依赖的包
  rollup: {
    // emitCJS: true, // 确保生成 CommonJS 格式
    inlineDependencies: true, // 确保所有依赖都被打包进最终的输出
  },
  // failOnWarn: false, // 如果你不希望构建因警告而失败，可以设置为 false
})