# sentry-miniapp · uni-app 集成示例

基于 **uni-app（Vue3 + Vite）** 的 `sentry-miniapp` 集成示例，演示在微信小程序端如何初始化 SDK、上报异常、追踪性能与采集用户反馈。

> 本示例只演示**小程序端**。若要同时监控 H5 端，请参考[官网 uni-app 分端接入](https://sentry-miniapp.pages.dev/guide/uniapp#_4-分端接入-同时要-h5)，用条件编译按端引入 `@sentry/browser`。

## 演示内容

| 页面 | 演示能力 |
|------|----------|
| **概览** (`pages/index`) | SDK 初始化状态、页面生命周期面包屑、自动采集 `uni.request` 的 HTTP span（成功打面包屑、失败上报消息） |
| **实验室** (`pages/test`) | `captureException`（同步/异步）、未处理 Promise 异常、`captureMessage`、`captureFeedback`、嵌套 span 性能追踪、`setUser` 设置/清除 |

应用启动（`App.vue`）会生成 `launchId` 并开启启动链路 span；每个测试事件带唯一 `demo_trigger_id` 与 `fingerprint`，便于按本次点击定位。唯一 fingerprint 仅用于验收，生产项目不要照搬，否则相同错误可能拆成多个 issue。

跨定时器创建子 Span 时，示例通过 `withActiveSpan(parent, ...)` 显式关联父级，不依赖异步上下文自动传播。

集成核心都在 [`src/utils/sentry.js`](./src/utils/sentry.js)。

示例为了观察效果启用全量采样、console 面包屑与正文采集。生产接入从[最小配置](https://sentry-miniapp.pages.dev/guide/getting-started)开始，按业务需要选择采集字段和采样率。

## 运行

```bash
# 先在仓库根执行 yarn build，再到本目录
npm install
node ../../scripts/internal/check-example-dependencies.mjs package.json

# 编译微信小程序（产出到 dist/dev/mp-weixin）
npm run dev:mp-weixin
# 或一次性构建（产出到 dist/build/mp-weixin）
npm run build:mp-weixin
```

然后用**微信开发者工具**导入产物目录（`dist/dev/mp-weixin` 或 `dist/build/mp-weixin`），即可预览。

示例固定使用 Vite `6.4.3`，并针对当前 DCloud 版本组中的具体消费者修补 PostCSS、ws 和 source-map-js；保留 npm `overrides` 并使用 npm 安装。安装后运行上面的检查，确认消费者实际解析到预期版本。当前构建验证覆盖微信生产构建、watch 首轮编译和业务映射；其他目标需另行验证。剩余框架安全公告与修补范围见[示例依赖审查](../../docs/example-dependency-security.md)。

若检查提示实际版本仍旧，已有安装锁可能保留了旧依赖；安装成功或 `npm install --package-lock-only` 成功不代表 override 已生效。只在本示例目录重新生成被忽略的 `node_modules/` 和 `package-lock.json`，再执行 `npm install` 与版本检查。不要用 `--force` 或 `--legacy-peer-deps` 跳过兼容性检查。

## DSN 配置

三个示例共用演示 DSN，查看该项目后台需要相应账号权限。要自行验证接收结果，在 `src/utils/sentry.js` 中替换为自己的 DSN，并在微信后台配置其上报域名；随后可按 `demo_trigger_id` 定位本次事件。

> uni-app 事件带 `app.framework: uni-app`，Taro 事件带 `taro-react`；wxapp 未设置此标签。使用演示后台时，可按标签区分来源。

微信开发者工具中还需把 Sentry 上报域名加入小程序后台「合法域名」（开发期可临时勾选「不校验合法域名」）。

## 本地映射与 SDK 版本

示例通过构建配置和 `--sourcemap` 保留 Vue 业务映射：JS 在 `dist/build/mp-weixin`，map 在 `dist/build/.sourcemap/mp-weixin`。先检查业务错误位置，再把两者合成上传目录；`.map` 不进入小程序发布包。具体配置见 [vite.config.js](vite.config.js)。

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

接入独立业务项目时，安装正式版 `sentry-miniapp@2` 并保留业务项目的锁文件。仓库示例的安装文件被忽略，不能用示例 fresh install 代替生产项目的依赖锁定；升级已有配置时先看[迁移说明](https://sentry-miniapp.pages.dev/guide/migration-2.0)。

## 说明

仓库的 `Framework Examples` workflow 会在 SDK 源码、依赖、构建脚本或相关示例发生变化、每周定时任务及手动触发时，用**当前仓库 tarball**执行 fresh install、消费者实际依赖版本检查、真实构建和业务异常位置映射检查。`node_modules/`、`package-lock.json`、`dist/`、`unpackage/` 已在 `.gitignore` 中忽略。
