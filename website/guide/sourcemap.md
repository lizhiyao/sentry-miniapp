# Source Map 上线指南

Source Map 让 Sentry 把线上压缩代码的堆栈还原到 `.ts`、`.tsx` 或 `.vue` 源码。第一次配置时只沿着本页主线完成：**release 一致、生成 map、同时上传 JS 与 map、真机验证**。

> 真机堆栈如果是 `app:///appservice.app.js`，或者项目使用 Cocos、Debug ID、私有引擎，请直接看 [Source Map 进阶与排障](/guide/sourcemap-advanced)。

## 先理解匹配关系

小程序堆栈通常使用平台虚拟路径。SDK 默认把它们归一为 `app:///`：

```text
appservice/pages/index.js    -> app:///pages/index.js
https://appx/pages/index.js  -> app:///pages/index.js
tt://pages/index.js          -> app:///pages/index.js
swan://pages/index.js        -> app:///pages/index.js
```

上传后的 artifact 名称必须与事件堆栈中的文件名一致，Sentry 才能找到对应 Source Map。

```text
同一次构建生成 .js + .map
        ↓
以同一个 release 上传到 Sentry，路径前缀为 app:///
        ↓
SDK 捕获错误并归一化堆栈路径
        ↓
Sentry 按 release + 文件名匹配 artifact，还原源码
```

## 前置条件

- 已有可用的 Sentry 服务和项目 DSN；
- Sentry Auth Token，可用于 CI 创建 release 和上传 artifact；
- 构建工具能够为生产构建生成独立 `.map` 文件；
- 小程序构建产物目录，例如 `dist` 或 `dist/build/mp-weixin`。

Token 建议使用 Sentry 的 CI / release 上传权限，并保存在环境变量中，不要提交到仓库。

## 第一步：SDK 配置

### 配置 `release`

SDK 初始化值必须与上传命令使用的 release **完全一致**：

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'YOUR_DSN',
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});
```

推荐在构建时注入 release，避免代码和上传脚本分别维护：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  release: SENTRY_RELEASE,
});
```

| 命名方式 | 示例 | 适合场景 |
|----------|------|----------|
| 应用名 + 语义化版本 | `my-miniapp@1.2.3` | 有明确发布版本 |
| 应用名 + Git SHA | `my-miniapp@a1b2c3d` | 持续部署 |
| 应用名 + 构建号 | `my-miniapp@build-456` | CI 构建 |

`enableSourceMap` 默认为 `true`，只控制 SDK 是否把虚拟堆栈路径归一为 `app:///`，**不会生成 `.map` 文件**。

## 第二步：安装和配置 sentry-cli

```bash
npm install @sentry/cli --save-dev
```

本地可创建不入库的 `.sentryclirc`：

```ini
[auth]
token=your-auth-token

[defaults]
org=your-org
project=your-project
```

CI 中使用环境变量：

```bash
export SENTRY_AUTH_TOKEN=your-auth-token
export SENTRY_ORG=your-org
export SENTRY_PROJECT=your-project
```

将 `.sentryclirc` 加入 `.gitignore`。自托管 Sentry 还需要按实际地址配置 `url`。

## 第三步：生成 Source Map

### Webpack / Taro

```js
// config/index.js
const config = {
  mini: {
    webpackChain(chain) {
      chain.devtool('hidden-source-map');
    },
  },
};
```

### Vite

```js
// vite.config.js
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
});
```

### uni-app

Vue CLI 项目可设置 `productionSourceMap: true` 和 `devtool: 'hidden-source-map'`；Vite 模式使用 `build.sourcemap: 'hidden'`。最终以实际小程序产物目录中同时出现 `.js` 和 `.map` 为准。

`hidden-source-map` 会生成独立 map，但不会在生产 JS 中留下可公开加载的 `sourceMappingURL`。上传完成后，不要把 `.map` 发布进小程序包。

## 第四步：上传 Source Map

使用与 SDK 完全一致的 release，并且**同时上传同一次构建的 `.js` 和 `.map`**：

```bash
SENTRY_RELEASE="my-miniapp@1.0.0"

npx sentry-cli releases new "$SENTRY_RELEASE"
npx sentry-cli releases files "$SENTRY_RELEASE" upload-sourcemaps ./dist \
  --url-prefix "app:///" \
  --ext js \
  --ext map \
  --validate
npx sentry-cli releases finalize "$SENTRY_RELEASE"
```

| 参数 | 作用 |
|------|------|
| `./dist` | 实际小程序构建产物目录 |
| `--url-prefix "app:///"` | 与 SDK 归一化后的路径对应 |
| `--ext js --ext map` | 上传运行时代码及对应 Source Map |
| `--validate` | 上传前检查 map 结构与引用 |

只上传 `.map` 通常不够。Sentry 需要压缩后的 JS 与对应 map 建立 artifact 关系，缺少 JS 时可能无法完成还原。

### 使用构建插件

Taro / Webpack 和 Vite 项目也可使用 `@sentry/webpack-plugin` 或 `@sentry/vite-plugin`，让插件在生产构建后注入 Debug ID、上传 artifact 并删除本地 map。

插件版本与配置项会随 Sentry 工具链更新，建议以 Sentry 官方的 [JavaScript Source Maps 文档](https://docs.sentry.io/platforms/javascript/sourcemaps/)为准。无论使用 CLI 还是插件，都必须保证上传的是最终发布的那次构建，并且 SDK 事件带有对应 release 或 Debug ID。

## 第五步：CI/CD 自动化

```yaml
name: Build and upload source maps

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - name: Build
        run: npm run build
        env:
          SENTRY_RELEASE: ${{ github.ref_name }}

      - name: Check local source maps
        run: |
          npx -p sentry-miniapp sentry-miniapp-sourcemap-doctor \
            --dist ./dist \
            --release "$SENTRY_RELEASE" \
            --strict
        env:
          SENTRY_RELEASE: ${{ github.ref_name }}

      - name: Upload source maps
        run: |
          npx sentry-cli releases new "$SENTRY_RELEASE"
          npx sentry-cli releases files "$SENTRY_RELEASE" upload-sourcemaps ./dist \
            --url-prefix "app:///" \
            --ext js --ext map \
            --validate
          npx sentry-cli releases finalize "$SENTRY_RELEASE"
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: your-org
          SENTRY_PROJECT: your-project
          SENTRY_RELEASE: ${{ github.ref_name }}
```

上传成功后再清理 `.map` 并发布小程序产物。构建、Doctor、上传和发布必须使用同一份产物，避免“map 来自上一次构建”。

## 第六步：验证 Source Map 是否生效

### 1. 检查已上传 artifact

```bash
npx sentry-cli releases files "my-miniapp@1.0.0" list
```

应能看到成对的文件：

```text
app:///pages/index.js
app:///pages/index.js.map
```

### 2. 在真机触发新错误

```js
Sentry.captureException(new Error('Source Map verification'));
```

Source Map 上传不会回溯处理上传前已经收到的旧事件，因此应在上传完成后产生一个新事件。

### 3. 检查事件

在 Sentry 事件详情中确认：

1. event release 与上传 release 一致；
2. 堆栈 `filename` 与已上传 artifact 名称一致；
3. 堆栈显示项目源码，而不是压缩后的构建代码；
4. Source Map Debug 没有提示缺文件、release 不匹配或 sourcesContent 缺失。

如果真机 filename 是 `app:///appservice.app.js`，普通分页 map 无法直接匹配，应按进阶指南处理微信两层 Source Map。

<span id="本地-source-map-doctor"></span>
<span id="debug-id-与自定义-stackparser"></span>
<span id="跨端框架的两层-source-map-串联"></span>

## 进阶场景与排障

以下内容已集中到 [Source Map 进阶与排障](/guide/sourcemap-advanced)：

- 用 `sentry-miniapp-sourcemap-doctor` 在上传前检查本地产物；
- 微信真机 `appservice.app.js` 与 Taro / uni-app 两层 map 合成；
- Cocos、小游戏虚拟路径、Debug ID 与自定义 `stackParser`；
- 上传成功但仍无法还原时的逐项排查。
