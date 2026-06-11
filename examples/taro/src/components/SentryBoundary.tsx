import { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text } from '@tarojs/components';
import Sentry from '../utils/sentry';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * React 错误边界：捕获子树「渲染 / 生命周期」里抛出的错误，转交 Sentry 上报，并给用户兜底 UI。
 *
 * 为什么需要它：Taro 默认用 React。React 不像 Vue 那样静默吞掉组件错误（未捕获的渲染错误会
 * 向上抛），但用错误边界能把渲染错误更完整地上报（带 componentStack），并避免整页白屏。
 * 这是 Taro(React) 对应 uni-app(Vue) `app.config.errorHandler` 的做法（见仓库 README「常见问题」）。
 *
 * 注意：错误边界只能捕获「渲染期」错误，捕获不到事件回调 / setTimeout / 异步里的错误——
 * 那些请直接 try/catch 后 `Sentry.captureException`，或交给 SDK 的全局 / TryCatch 集成。
 */
export default class SentryBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    // 保留本地打印，方便开发期排查
    console.error(error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={{ padding: '40rpx', color: '#c0392b' }}>
          <Text>页面渲染出错，已上报 Sentry。</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
