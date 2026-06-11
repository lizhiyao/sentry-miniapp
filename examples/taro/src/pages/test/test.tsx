import { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import Sentry from '../../utils/sentry';
import SentryBoundary from '../../components/SentryBoundary';

// 一个在「渲染时」抛错的组件，用来演示 SentryBoundary 捕获组件错误并上报。
function Boom() {
  throw new Error('Taro 组件渲染错误（应被 SentryBoundary 捕获并上报）');
  // eslint-disable-next-line no-unreachable
  return null;
}

export default function Test() {
  const [boom, setBoom] = useState(false);

  const captureSync = () => {
    Sentry.captureException(new Error('手动 captureException（同步）'));
    Taro.showToast({ title: '已上报 exception', icon: 'none' });
  };

  const unhandledRejection = () => {
    // 未处理的 Promise 异常：由 SDK 的全局 onUnhandledRejection 捕获
    Promise.reject(new Error('未处理的 Promise 异常'));
    Taro.showToast({ title: '已触发未处理 rejection', icon: 'none' });
  };

  const captureMsg = () => {
    Sentry.captureMessage('captureMessage 测试（error 级）', 'error');
    Taro.showToast({ title: '已上报 message', icon: 'none' });
  };

  return (
    <View style={{ padding: '32rpx' }}>
      <Text style={{ fontSize: '30rpx', fontWeight: 'bold' }}>实验室：各种上报方式</Text>

      <Button style={{ marginTop: '24rpx' }} onClick={captureSync}>
        captureException（同步异常）
      </Button>
      <Button style={{ marginTop: '16rpx' }} onClick={unhandledRejection}>
        未处理 Promise 异常
      </Button>
      <Button style={{ marginTop: '16rpx' }} onClick={captureMsg}>
        captureMessage
      </Button>
      <Button style={{ marginTop: '16rpx' }} type="warn" onClick={() => setBoom(true)}>
        触发组件渲染错误（走 Error Boundary）
      </Button>

      <View style={{ marginTop: '24rpx', color: '#888', fontSize: '24rpx' }}>
        <Text>
          最后一个按钮：点了之后下方的 Boom 在渲染时抛错 → 被这里的 SentryBoundary 捕获并
          captureException，仅该区域显示兜底 UI、整页仍可用。这演示了「组件渲染错误」如何上报。
        </Text>
      </View>

      {/* 局部错误边界：只兜住 Boom 这块，便于演示而不影响整页 */}
      <SentryBoundary>{boom ? <Boom /> : null}</SentryBoundary>
    </View>
  );
}
