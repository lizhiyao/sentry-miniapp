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
 * 捕获子树渲染、构造函数和生命周期错误，记录 componentStack，并显示可理解的恢复提示。
 * 事件回调、定时器和异步错误需要业务捕获或宿主全局监听；接入方式见官网 Taro 指南。
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
          <Text>页面暂时无法显示，请重新进入。</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
