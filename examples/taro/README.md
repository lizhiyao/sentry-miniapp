# sentry-miniapp · Taro(React) 集成示例

基于 **Taro 4（React + TypeScript，webpack5）** 的 `sentry-miniapp` 集成示例，演示在微信小程序端如何初始化 SDK、上报异常、追踪性能、采集网络面包屑，并用 **React 错误边界** 捕获组件渲染错误。

> 本示例只演示**小程序端**（`weapp`）。Taro 默认用 React；若你的 Taro 工程用 Vue，集成方式与 [`examples/uniapp`](../uniapp) 一致（`app.config.errorHandler`）。要同时监控 H5 端，请参考仓库根 `README.md` 的「uni-app / Taro」一节，用 `process.env.TARO_ENV === 'h5'` 按端引入 `@sentry/browser`。

## 演示内容

| 页面 | 演示能力 |
|------|----------|
| **概览** (`pages/index`) | SDK 初始化、页面生命周期面包屑、`Taro.request` 走包裹后的 `wx.request` 产生 `xhr` 网络面包屑 |
| **实验室** (`pages/test`) | `captureException`（同步）、未处理 Promise 异常、`captureMessage`、以及**组件渲染错误 → React 错误边界 → 上报** |

集成核心都在 [`src/utils/sentry.ts`](./src/utils/sentry.ts)；错误边界在 [`src/components/SentryBoundary.tsx`](./src/components/SentryBoundary.tsx)，于 [`src/app.tsx`](./src/app.tsx) 包住整个应用。

## 重点：Taro(React) 的组件错误用「错误边界」上报

Taro 默认是 **React**，不是 Vue。React 不像 Vue 那样静默吞掉组件错误（未捕获的渲染错误会向上抛），但**用错误边界（Error Boundary）能把渲染错误更完整地上报**（带 `componentStack`）、并避免整页白屏：

```tsx
class SentryBoundary extends Component {
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }
  render() {
    return this.state.hasError ? <View>页面出错了，已上报</View> : this.props.children;
  }
}
// 用它包住根组件：<SentryBoundary>{children}</SentryBoundary>
```

> 错误边界只能捕获**渲染期**错误；事件回调 / `setTimeout` / 异步里的错误捕获不到——那些直接 `try/catch` 后 `Sentry.captureException`，或交给 SDK 的全局 / TryCatch 集成。这与 uni-app(Vue) 的 `app.config.errorHandler` 是同一思路的两个框架版本（见仓库根 README「常见问题」第 5 条）。

## 运行

```bash
# 在本目录下
npm install

# 编译微信小程序（产出到 dist/，--watch 持续编译）
npm run dev:weapp
# 或一次性构建
npm run build:weapp
```

然后用**微信开发者工具**导入本目录（`project.config.json` 的 `miniprogramRoot` 指向 `dist/`），即可预览。点按钮后到 Sentry「Issues」/「Performance」查看事件与面包屑。

> `project.config.json` 里 `es6` / `minified` 设为 `false`：交给 Taro 编译，避免微信开发者工具二次压缩导致 Source Map 错位（见仓库 `docs/SOURCEMAP_GUIDE.md`）。

## DSN 配置

`src/utils/sentry.ts` 里的 `DSN` 与 `examples/wxapp`、`examples/uniapp` **共用同一个演示 Sentry 项目**，开箱即可上报。换成你自己项目的 DSN 即可在你的后台观察数据。

> 三个示例共用同一项目，后台事件会混在一起。本示例给所有事件打了 `app.framework: taro-react` 标签，需要区分时在 Sentry 后台按 `app.framework:taro-react` 过滤即可。

微信开发者工具中还需把 Sentry 上报域名加入小程序后台「合法域名」（开发期可临时勾选「不校验合法域名」）。

## Source Map（真机）

Taro 真机错误栈是微信合并后的 `appservice.app.js`，**分页 Source Map 解不出**，需要两层 map 串联。详见仓库 [`docs/SOURCEMAP_GUIDE.md`](../../docs/SOURCEMAP_GUIDE.md) 的「跨端框架的两层 Source Map 串联」一节与 [`scripts/merge-sourcemap.mjs`](../../scripts/merge-sourcemap.mjs)。

## 用本地源码而非已发布版

示例默认依赖已发布的 `sentry-miniapp`（`package.json` 中 `"sentry-miniapp": "^1.11.0"`）。
若想验证仓库当前源码，先在仓库根执行 `yarn build`，再把本目录依赖改为：

```jsonc
"sentry-miniapp": "file:../.."
```

重新 `npm install` 即可。

## 说明

本示例工程作为参考工程独立维护，不接入仓库 CI；`node_modules/`、`dist/`、锁文件等已在 `.gitignore` 中忽略，`fresh npm install` 即可运行。
