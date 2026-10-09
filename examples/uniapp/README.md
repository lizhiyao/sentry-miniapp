# sentry-miniapp · uni-app 集成示例

基于 **uni-app（Vue3 + Vite）** 的 `sentry-miniapp` 集成示例，演示在微信小程序端如何初始化 SDK、上报异常、追踪性能与采集用户反馈。

> 本示例只演示**小程序端**。若要同时监控 H5 端，请参考[官网 uni-app 分端接入](https://sentry-miniapp.pages.dev/guide/uniapp#_4-分端接入-同时要-h5)，用条件编译按端引入 `@sentry/browser`。

## 演示内容

| 页面 | 演示能力 |
|------|----------|
| **概览** (`pages/index`) | SDK 初始化状态、页面生命周期面包屑、自动采集 `uni.request` 的 HTTP span（成功打面包屑、失败上报消息） |
| **实验室** (`pages/test`) | `captureException`（同步/异步）、未处理 Promise 异常、`captureMessage`、`captureFeedback`、嵌套 span 性能追踪、`setUser` 设置/清除 |

应用启动（`App.vue`）会生成 `launchId` 并开启启动链路 span；每个测试事件带唯一 `demo_trigger_id` 与 `fingerprint`，便于在 Sentry 后台按本次点击精确定位。

跨定时器创建子 Span 时，示例通过 `withActiveSpan(parent, ...)` 显式关联父级，不依赖异步上下文自动传播。

集成核心都在 [`src/utils/sentry.js`](./src/utils/sentry.js)。

## 运行

```bash
# 先在仓库根执行 yarn build，再到本目录
npm install

# 编译微信小程序（产出到 dist/dev/mp-weixin）
npm run dev:mp-weixin
# 或一次性构建（产出到 dist/build/mp-weixin）
npm run build:mp-weixin
```

然后用**微信开发者工具**导入产物目录（`dist/dev/mp-weixin` 或 `dist/build/mp-weixin`），即可预览。

## DSN 配置

`src/utils/sentry.js` 里的 `DSN` 与 `examples/wxapp` **共用同一个演示 Sentry 项目**，开箱即可上报——点击实验室按钮后，可在后台按 `demo_trigger_id` 看到事件。换成你自己项目的 DSN 即可在你的后台观察数据。

> 由于两端共用同一项目，后台里 uni-app 与 wxapp 的事件会混在一起。本示例给所有事件打了 `app.framework: uni-app` 标签（wxapp 示例未设该标签），需要区分时在 Sentry 后台按 `app.framework:uni-app` 过滤即可。

微信开发者工具中还需把 Sentry 上报域名加入小程序后台「合法域名」（开发期可临时勾选「不校验合法域名」）。

## 验证当前仓库的 2.0 契约

当前固定 uni-app 工具链的生产插件会覆盖普通 build.sourcemap。示例用 --sourcemap 和提前执行的 Vite 公共 configResolved hook，在 Vue 插件读取配置前保留 hidden map 与 sourcesContent；只在输出阶段打开 map 会丢失 `.vue` 业务映射。JS 在 dist/build/mp-weixin，map 在 dist/build/.sourcemap/mp-weixin。先验证实际业务异常位置，再合成上传目录，不把 map 发布进小程序包：

```bash
node ../../scripts/internal/check-framework-sourcemaps.mjs \
  src/pages/test/test.vue dist/build/mp-weixin/pages/test/test.js \
  dist/build/.sourcemap/mp-weixin/pages/test/test.js.map
mkdir -p sentry-upload
cp -R dist/build/mp-weixin/. sentry-upload/
cp -R dist/build/.sourcemap/mp-weixin/. sentry-upload/
node ../../scripts/doctor-sourcemap.mjs --dist sentry-upload --release "$SENTRY_RELEASE" --strict
```

doctor 验证上传前产物，不能替代微信二次编译后的真机 map 或目标后台还原。

示例默认使用 `file:../..` 的仓库产物，避免新示例安装到旧的已发布 SDK。先在仓库根执行 `yarn build`，再进入示例目录安装依赖和构建。验证发布包时可在隔离副本中将依赖替换为同一次构建的 tarball；不要用旧 npm 版本证明当前源码兼容。

2.0 已提供 beta 预发布；本示例仍使用仓库构建。改为发布包时，安装 `sentry-miniapp@next` 或固定所需 beta 版本，并核对其 API 与[2.0 迁移说明](https://sentry-miniapp.pages.dev/guide/migration-2.0)。

## 说明

仓库的 `Framework Examples` workflow 会在 SDK 源码、依赖、构建脚本或相关示例发生变化、每周定时任务及手动触发时，用**当前仓库 tarball**执行 fresh install、真实构建和业务异常位置映射检查。`node_modules/`、`dist/`、`unpackage/` 已在 `.gitignore` 中忽略。
