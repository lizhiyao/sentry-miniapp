import { View, Text, Button } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import Sentry from '../../utils/sentry';

export default function Index() {
  useLoad(() => {
    Sentry.addBreadcrumb({
      category: 'page.lifecycle',
      message: 'index onLoad',
      level: 'info',
    });
  });

  // Taro.request 最终走被包裹的全局 wx.request，会记成 xhr 面包屑（随下一个错误事件上报）。
  const sendRequest = () => {
    Taro.request({
      url: 'https://httpbin.org/get',
      success: () => {
        Sentry.captureMessage('网络请求成功——到 Sentry 事件的 Breadcrumbs 看 xhr 那条', 'info');
        Taro.showToast({ title: '已上报，看后台', icon: 'none' });
      },
      fail: () => {
        Taro.showToast({ title: '请求失败（也会记面包屑）', icon: 'none' });
      },
    });
  };

  return (
    <View style={{ padding: '32rpx' }}>
      <Text style={{ fontSize: '32rpx', fontWeight: 'bold' }}>sentry-miniapp · Taro(React) 集成示例</Text>
      <View style={{ marginTop: '16rpx', color: '#666' }}>
        <Text>SDK 已在 src/utils/sentry.ts 初始化，下面的操作都会在 Sentry 后台留下事件 / 面包屑。</Text>
      </View>

      <Button style={{ marginTop: '32rpx' }} onClick={sendRequest}>
        发一个网络请求（演示 xhr 面包屑）
      </Button>
      <Button style={{ marginTop: '16rpx' }} onClick={() => Taro.navigateTo({ url: '/pages/test/test' })}>
        去「实验室」试各种上报
      </Button>
    </View>
  );
}
