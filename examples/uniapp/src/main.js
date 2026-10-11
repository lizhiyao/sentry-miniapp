// 在创建应用实例前导入 Sentry 封装，确保 Sentry.init 尽早执行、
// 早于 App 和业务模块加载。集成细节见 ./utils/sentry.js。
import Sentry from './utils/sentry';
import { createSSRApp } from 'vue';
import App from './App.vue';

export function createApp() {
  const app = createSSRApp(App);

  // Vue 处理的组件错误不一定到达宿主全局监听；在框架入口转交 Sentry。
  // 复用到已有项目时保留原 errorHandler 的业务逻辑，完整接入见官网 uni-app 指南。
  app.config.errorHandler = (err, instance, info) => {
    Sentry.captureException(err, { extra: { lifecycleHook: info } });
    console.error(err); // 保留本地打印，方便开发期排查
  };

  return {
    app,
  };
}
