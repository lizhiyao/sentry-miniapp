import { createSSRApp } from 'vue';
import App from './App.vue';

// 在创建应用实例前导入 Sentry 封装，确保 Sentry.init 尽早执行、
// 能捕获到应用启动阶段的异常。集成细节见 ./utils/sentry.js。
import './utils/sentry';

export function createApp() {
  const app = createSSRApp(App);
  return {
    app,
  };
}
