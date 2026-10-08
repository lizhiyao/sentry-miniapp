import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// 当前 uni-app 的小程序插件在生产 config 阶段会关闭 sourcemap。
// 在 Vue 插件读取配置前，用 Vite 公共 configResolved hook 保留 hidden map。
// 仅在 post 阶段恢复输出会丢失 .vue 业务映射，不伪造 HBuilderX console 能力。
// --sourcemap 让 uni 插件将 map 移到 dist/build/.sourcemap/mp-weixin。
export default defineConfig({
  plugins: [
    uni(),
    {
      name: 'sentry-example-sourcemap',
      enforce: 'pre',
      configResolved(config) {
        config.build.sourcemap = 'hidden';
        const output = config.build.rollupOptions.output;
        for (const entry of Array.isArray(output) ? output : [output]) {
          if (entry) entry.sourcemapExcludeSources = false;
        }
      },
    },
  ],
  build: {
    sourcemap: 'hidden',
    rollupOptions: { output: { sourcemapExcludeSources: false } },
  },
});
