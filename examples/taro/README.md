# sentry-miniapp · Taro(React) 集成示例

基于 **Taro 4（React + TypeScript，webpack5）** 的 `sentry-miniapp` 集成示例，演示在微信小程序端如何初始化 SDK、上报异常、追踪性能、采集网络面包屑，并用 **React 错误边界** 捕获组件渲染错误。

> 本示例只演示**小程序端**（`weapp`）。Taro 默认用 React；若你的 Taro 工程用 Vue，组件错误处理参照 [`examples/uniapp`](../uniapp) 的 `app.config.errorHandler`。要同时监控 H5 端，请参考[官网 Taro 分端接入](https://sentry-miniapp.pages.dev/guide/taro#_5-分端接入-同时要-h5)，用 `process.env.TARO_ENV === 'h5'` 按端引入 `@sentry/browser`。

## 演示内容

| 页面 | 演示能力 |
|------|----------|
| **概览** (`pages/index`) | SDK 初始化、页面生命周期面包屑、`Taro.request` 走包裹后的 `wx.request` 产生 `xhr` 网络面包屑 |
| **实验室** (`pages/test`) | `captureException`（同步）、未处理 Promise 异常、`captureMessage`、以及**组件渲染错误 → React 错误边界 → 上报** |

集成核心都在 [`src/utils/sentry.ts`](./src/utils/sentry.ts)；错误边界在 [`src/components/SentryBoundary.tsx`](./src/components/SentryBoundary.tsx)，于 [`src/app.tsx`](./src/app.tsx) 包住整个应用。

示例为了观察效果启用全量采样、console 面包屑与正文采集。生产接入从[最小配置](https://sentry-miniapp.pages.dev/guide/getting-started)开始，按业务需要选择采集字段和采样率。

## 重点：Taro(React) 的组件错误用「错误边界」上报

本示例使用 React。错误边界捕获子树的渲染、构造和生命周期错误，附加 `componentStack` 后交给 Sentry，同时展示备用界面。

```tsx
class SentryBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }
  render() {
    return this.state.hasError ? <View>页面暂时无法显示，请重新进入。</View> : this.props.children;
  }
}
// 用它包住根组件：<SentryBoundary>{children}</SentryBoundary>
```

> 错误边界不能捕获事件处理器、定时器或一般异步任务。业务已处理的异常用 `captureException()` 主动记录；未处理异常由 SDK 按宿主能力监听。更多说明见[官网组件错误排查](https://sentry-miniapp.pages.dev/guide/faq#component-errors)。

## 运行

```bash
# 先在仓库根执行 yarn build，再到本目录
npm install
node ../../scripts/internal/check-example-dependencies.mjs package.json

# 编译微信小程序（产出到 dist/，--watch 持续编译）
npm run dev:weapp
# 或一次性构建
npm run build:weapp
```

然后用**微信开发者工具**导入本目录（`project.config.json` 的 `miniprogramRoot` 指向 `dist/`），即可预览。点按钮后到 Sentry「Issues」/「Performance」查看事件与面包屑。

示例固定使用 webpack `5.104.1`，通过 npm `overrides` 统一 Taro 声明的旧版本；保留该配置并使用 npm 安装。当前验证目标是微信小程序构建和 watch，其他目标需另行验证。示例框架依赖仍有上游安全公告，具体范围与处理记录见[示例依赖审查](../../docs/example-dependency-security.md)。

> `project.config.json` 里 `es6` / `minified` 设为 `false`：交给 Taro 编译，避免微信开发者工具二次压缩导致 Source Map 错位（见[文档站 · Source Map 配置](https://sentry-miniapp.pages.dev/guide/sourcemap)）。

## DSN 配置

三个示例共用演示 DSN，查看该项目后台需要相应账号权限。要自行验证接收结果，在 `src/utils/sentry.ts` 中替换为自己的 DSN，并在微信后台配置其上报域名。

> 三个示例共用同一项目，后台事件会混在一起。本示例给所有事件打了 `app.framework: taro-react` 标签，需要区分时在 Sentry 后台按 `app.framework:taro-react` 过滤即可。

微信开发者工具中还需把 Sentry 上报域名加入小程序后台「合法域名」（开发期可临时勾选「不校验合法域名」）。

## Source Map（真机）

示例用 `hidden-source-map` 生成上传前 JS／map。固定的 Taro 工具链中，`comp.js` 无 map、`taro.js.map` 有部分缺失 `sourcesContent`，Doctor 会给出相应警告。业务页面映射可单独验证；框架文件的限制不应被构建成功掩盖。

若微信真机栈指向二次合并后的 `appservice.app.js` 或 `app-service.js`，分页 Source Map 不能直接解释该文件。先检查微信最终 map 是否已映射到原始源码；尚未合成时，再与框架 map 串联。以实际 frame 和宿主产物为准，详见[Source Map 进阶与排障](https://sentry-miniapp.pages.dev/guide/sourcemap-advanced#微信真机的两层-source-map)与 [`scripts/merge-sourcemap.mjs`](../../scripts/merge-sourcemap.mjs)。

## 本地映射与 SDK 版本

示例默认使用 `file:../..` 的仓库产物，避免新示例安装到旧的已发布 SDK。先在仓库根执行 `yarn build`，再进入示例目录安装依赖和构建。验证发布包时可在隔离副本中将依赖替换为同一次构建的 tarball；不要用旧 npm 版本证明当前源码兼容。

构建后检查业务异常在实际产物中的位置能否还原，不以 map 文件存在代替映射正确：

```bash
node ../../scripts/internal/check-framework-sourcemaps.mjs \
  src/pages/test/test.tsx dist/pages/test/test.js dist/pages/test/test.js.map
```

2.0 已提供 beta 预发布；本示例仍使用仓库构建。改为发布包时，安装 `sentry-miniapp@next` 或固定所需 beta 版本，并核对其 API 与[2.0 迁移说明](https://sentry-miniapp.pages.dev/guide/migration-2.0)。

## 说明

仓库的 `Framework Examples` workflow 会在 SDK 源码、依赖、构建脚本或相关示例发生变化、每周定时任务及手动触发时，用**当前仓库 tarball**执行 fresh install、消费者实际依赖版本检查、真实构建和业务异常位置映射检查。`node_modules/`、`dist/`、锁文件等已在 `.gitignore` 中忽略。
