# Taro 接入指南

Taro 默认使用 **React**（也可通过 `framework` 配置切换到 Vue3 / Vue）。本页以最常见的 **Taro 4 + React + TypeScript、编译到微信小程序**为例，给出从安装到组件错误上报的完整接入。可运行示例见 [`examples/taro`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/taro)。

## 为什么不能直接用 `@sentry/browser`

很多人第一反应是装官方的 `@sentry/browser` 或 `@sentry/react`，但**在小程序端跑不起来**：

- 小程序没有浏览器的 `window` / `fetch` / `XMLHttpRequest`，官方 Web SDK 的传输层和全局错误钩子都依赖这些；
- 小程序是双线程架构、网络只能走 `wx.request`，需要专门的 transport 与平台适配。

`sentry-miniapp` 正是补齐这一层：自定义 transport（走 `wx.request`）、小程序全局异常捕获、Source Map 路径归一化、网络面包屑等。**Taro 小程序端用 `sentry-miniapp`，H5 端才用 `@sentry/browser`**（见下文「分端接入」）。

## 1. 安装

```bash
npm install sentry-miniapp --save
```

## 2. 初始化封装

新建 `src/utils/sentry.ts`，集中放初始化（DSN、采样、标签）：

```ts
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://your-dsn@o0.ingest.sentry.io/0',
  release: 'my-taro-app@1.0.0', // 与上传 Source Map 时的 release 完全一致
  environment: 'production',

  platform: 'wechat',
  sampleRate: 1.0, // error 采样率
  tracesSampleRate: 1.0, // 性能采样率；开启后 API 请求会作为 http.client span 上报

  // 网络面包屑默认开启（自动包裹 wx.request；Taro.request 最终也走它，无需额外配置）。
  // 开 traceNetworkBody 连请求 / 响应体也记录（内置脱敏）。
  traceNetworkBody: false,
});

Sentry.setTag('app.framework', 'taro-react');

export default Sentry;
```

默认集成已含：自动异常捕获、性能监控、Source Map 路径归一化、网络面包屑、Session 与网络状态监控。**通常无需手动传 `integrations`**——只有完全接管集成列表时才传（会覆盖默认）。

## 3. 尽早初始化

在 `src/app.tsx` 顶部引入封装（引入即执行 `init`），确保先于业务请求、能捕获启动阶段异常：

```tsx
import type { PropsWithChildren } from 'react';
import Sentry from './utils/sentry'; // 引入即执行 Sentry.init
import SentryBoundary from './components/SentryBoundary';

function App({ children }: PropsWithChildren) {
  return <SentryBoundary>{children}</SentryBoundary>;
}

export default App;
```

## 4. 组件错误：用 React 错误边界

React 不像 Vue 那样静默吞掉组件错误，但**渲染期错误若不接住会整页白屏**。用错误边界把渲染错误更完整地上报（带 `componentStack`）并兜底 UI。新建 `src/components/SentryBoundary.tsx`：

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text } from '@tarojs/components';
import Sentry from '../utils/sentry';

export default class SentryBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    console.error(error);
  }

  render() {
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
```

::: warning 错误边界只接「渲染期」错误
事件回调 / `setTimeout` / 异步里的错误，错误边界捕获不到——那些请直接 `try/catch` 后 `Sentry.captureException`，或交给 SDK 的全局 / TryCatch 集成。
:::

> 这是 Taro(React) 对应 uni-app(Vue) `errorHandler` 的做法。对比见 [常见问题 · 组件内错误](/guide/faq#组件内错误)。

## 5. 分端接入（同时要 H5）

若 Taro 工程还编译 H5，用 `process.env.TARO_ENV` 分端引入——小程序用 `sentry-miniapp`，H5 用功能完整、官方维护的 `@sentry/browser`：

```bash
npm install sentry-miniapp @sentry/browser --save
```

```ts
let Sentry;
if (process.env.TARO_ENV === 'h5') {
  Sentry = require('@sentry/browser'); // H5 端
} else {
  Sentry = require('sentry-miniapp'); // 小程序端
}
```

## 6. 其它

- **网络**：`Taro.request` 最终走被包裹的全局 `wx.request`，请求会自动记成 `xhr` 面包屑、随错误事件上报，无需额外配置。
- **Source Map**：Taro 经过编译，错误栈是编译后代码，需上传 Source Map 才能还原。配置见 [Source Map 配置](/guide/sourcemap)。

## 下一步

- [示例工程](/guide/examples) · [常见问题](/guide/faq) · [支持平台与能力](/guide/platforms)
