import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// uni-app(Vue3) 标准 Vite 配置。
// sourcemap: 'hidden' —— 生成 .map 供上传 Sentry，但不在产物里写
// //# sourceMappingURL 注释，避免线上暴露源码映射（见仓库 docs/SOURCEMAP_GUIDE.md）。
export default defineConfig({
  plugins: [uni()],
  build: {
    sourcemap: 'hidden',
  },
});
