# Taro 接入指南

Taro 默认使用 **React**（也可通过 `framework` 配置切换到 Vue3 / Vue）。本页以最常见的 **Taro 4 + React + TypeScript、编译到微信小程序**为例，给出从安装到组件错误上报的完整接入。可运行示例见 [`examples/taro`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/taro)。

## 为什么不能直接用 `@sentry/browser`

很多人第一反应是装官方的 `@sentry/browser` 或 `@sentry/react`，但**在小程序端跑不起来**：

- 小程序可能提供 `window` 别名，但通常缺少 DOM、浏览器 `fetch` 和 `XMLHttpRequest`；仅有别名不能满足官方 Web SDK 的运行条件；
- 小程序是双线程架构、网络只能走平台请求 API（如微信 `wx.request`、支付宝 `my.httpRequest`），需要专门的 transport 与平台适配。

`sentry-miniapp` 正是补齐这一层：自定义 transport（走各端 request/httpRequest）、小程序全局异常捕获、Source Map 路径归一化、网络面包屑等。**Taro 小程序端用 `sentry-miniapp`，H5 端才用 `@sentry/browser`**（见下文「分端接入」）。

## 1. 安装

```bash
npm install sentry-miniapp@next --save
```

## 2. 初始化封装

新建 `src/utils/sentry.ts`，集中放初始化（DSN、采样、标签）：

```ts
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'YOUR_DSN', // 替换为 Sentry 项目中的完整 DSN
  release: 'my-taro-app@1.0.0', // 与上传 Source Map 时的 release 完全一致
  environment: 'production',
});

Sentry.setTag('app.framework', 'taro-react');

export default Sentry;
```

平台会自动识别。默认初始化路径已含自动异常捕获、Source Map 路径归一化、网络面包屑、Session 与网络状态监控，通常无需手动传 `integrations`。

## 3. 尽早初始化

在 `src/app.tsx` 顶部引入封装（引入即执行 `init`），确保先于业务请求、能捕获启动阶段异常：

```tsx
import './utils/sentry'; // 保留初始化副作用，放在业务模块之前
import type { PropsWithChildren } from 'react';
import SentryBoundary from './components/SentryBoundary';

function App({ children }: PropsWithChildren) {
  return <SentryBoundary>{children}</SentryBoundary>;
}

export default App;
```

## 4. 组件错误：用 React 错误边界

React 错误边界可以捕获子树渲染、构造和生命周期中的错误，附加 `componentStack` 并展示备用界面。它不能覆盖事件处理器与任意异步任务；详见 [React 错误边界说明](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)。新建 `src/components/SentryBoundary.tsx`：

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
          <Text>页面暂时无法显示，请重新进入。</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
```

::: warning 错误边界的范围
事件处理器、定时器和一般异步任务不在错误边界范围内。业务已捕获的异常可主动调用 `captureException()`；未处理异常由宿主全局监听或 TryCatch 集成按能力捕获。
:::

> 这是 Taro(React) 对应 uni-app(Vue) `errorHandler` 的做法。对比见 [常见问题 · 组件内错误](/guide/faq#component-errors)。

## 5. 分端接入（同时要 H5）

若 Taro 工程还编译 H5，用 `process.env.TARO_ENV` 分端引入——小程序用 `sentry-miniapp`，H5 用功能完整、官方维护的 `@sentry/browser`：

用下方片段替换初始化封装中的 SDK 导入，再对选出的 SDK 调用 `init()`。DSN、release 和 environment 可共用；平台专属选项放在对应分支。

```bash
npm install sentry-miniapp@next @sentry/browser --save
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

- **网络**：`Taro.request` 最终走对应小程序端被包裹的全局请求 API，请求会自动记成 `xhr` 面包屑、随错误事件上报，无需额外配置。
- **性能与追踪**：需要独立性能数据时再设置采样率，见[性能与链路追踪](/guide/performance-and-tracing)。
- **Source Map**：Taro 经过编译，错误栈是编译后代码，需上传 Source Map 才能还原。配置见 [Source Map 上线指南](/guide/sourcemap)。

## 下一步

- [示例工程](/guide/examples) · [异常、日志与上下文](/guide/errors-and-context) · [常见问题](/guide/faq)
