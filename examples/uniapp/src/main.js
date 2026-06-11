import { createSSRApp } from 'vue';
import App from './App.vue';

// 在创建应用实例前导入 Sentry 封装，确保 Sentry.init 尽早执行、
// 能捕获到应用启动阶段的异常。集成细节见 ./utils/sentry.js。
import Sentry from './utils/sentry';

export function createApp() {
  const app = createSSRApp(App);

  // 关键：uni-app 底层是 Vue，组件内（render / 生命周期 / watch / 模板 @click 调用的方法）
  // 抛出的错误会被 Vue 自己的错误处理接住、只打印 console，不会冒泡到 wx.onError，
  // SDK 默认捕获不到——这是「sampleRate 设了 1 却只偶尔上报一条」的常见根因。
  // 把 Vue 的 errorHandler 接到 Sentry，组件内错误才会上报。
  // Vue2（uni-app 旧版）改用 Vue.config.errorHandler，写法见 README「常见问题」。
  app.config.errorHandler = (err, instance, info) => {
    Sentry.captureException(err, { extra: { lifecycleHook: info } });
    console.error(err); // 保留本地打印，方便开发期排查
  };

  return {
    app,
  };
}
