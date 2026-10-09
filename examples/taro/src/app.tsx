import Sentry from './utils/sentry'; // 先初始化，再加载框架与业务模块
import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import SentryBoundary from './components/SentryBoundary';
import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    Sentry.addBreadcrumb({
      category: 'app.lifecycle',
      message: 'App onLaunch',
      level: 'info',
    });
  });

  // 用错误边界包住整个应用：React 组件渲染 / 生命周期里抛出的错误会被捕获并上报。
  // 这是 Taro(React) 对应 uni-app(Vue) errorHandler 的做法（见官网 Taro 接入指南）。
  return <SentryBoundary>{children}</SentryBoundary>;
}

export default App;
