# Source Map 完整配置指南

## 目录

- [概述](#概述)
- [前置条件](#前置条件)
- [第一步：SDK 配置](#第一步sdk-配置)
- [第二步：安装和配置 sentry-cli](#第二步安装和配置-sentry-cli)
- [第三步：生成 Source Map](#第三步生成-source-map)
- [第四步：上传 Source Map](#第四步上传-source-map)
- [第五步：CI/CD 自动化](#第五步cicd-自动化)
- [第六步：验证 Source Map 是否生效](#第六步验证-source-map-是否生效)
- [平台特殊说明](#平台特殊说明)
- [安全注意事项](#安全注意事项)
- [常见问题排查](#常见问题排查)
- [完整配置示例](#完整配置示例)

---

## 概述

在小程序中，错误堆栈的路径通常是各平台的虚拟路径（如微信的 `appservice/pages/index.js`、支付宝的 `https://appx/pages/index.js`），这导致上传到 Sentry 的 Source Map 无法被正确匹配和解析。

**SDK 的解决方案：** `sentry-miniapp` 内置了 `RewriteFrames` 集成，在上报错误时自动将各平台虚拟路径归一化为统一的 `app:///` 前缀。例如：

```
微信:     appservice/pages/index.js    →  app:///pages/index.js
支付宝:   https://appx/pages/index.js  →  app:///pages/index.js
字节跳动: tt://pages/index.js          →  app:///pages/index.js
百度:     swan://pages/index.js        →  app:///pages/index.js
```

因此，你在上传 Source Map 时只需统一使用 `--url-prefix "app:///"` 即可，无需关心各平台差异。

**端到端流程：**

```
构建工具生成 .js + .map 文件
        ↓
sentry-cli 上传 .map 到 Sentry（url-prefix: app:///）
        ↓
小程序运行时发生错误
        ↓
SDK 捕获错误，RewriteFrames 归一化堆栈路径为 app:///
        ↓
Sentry 收到事件，匹配 app:/// 前缀找到对应 Source Map
        ↓
Sentry 面板展示原始源码位置
```

---

## 前置条件

1. **Sentry 账号**：SaaS 版（sentry.io）或自托管版均可
2. **Sentry 项目**：已创建对应的项目
3. **Auth Token**：在 Sentry 设置中创建，需具备 `project:releases` 和 `org:read` 权限
   - SaaS 版：`https://sentry.io/settings/auth-tokens/`
   - 自托管版：`https://<your-sentry>/settings/auth-tokens/`

---

## 第一步：SDK 配置

### 配置 `release`

**`release` 是 Source Map 生效的关键**——SDK 初始化时设置的 `release` 值必须与 sentry-cli 上传时使用的 release 名称**完全一致**。

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  release: 'my-miniapp@1.0.0',  // 必须与上传时的 release 名称一致
  environment: 'production',
  // enableSourceMap: true,  // 默认已开启，无需显式设置
});
```

### `release` 命名建议

| 方式 | 示例 | 适用场景 |
|------|------|---------|
| 语义化版本 | `my-miniapp@1.2.3` | 有明确版本号的项目 |
| Git Commit SHA | `my-miniapp@a1b2c3d` | 持续部署场景 |
| 构建编号 | `my-miniapp@build-456` | CI/CD 自动构建 |

### 动态注入 release

推荐在构建时通过环境变量注入，避免手动维护版本号：

**Webpack（Taro）：**

```javascript
// config/index.js
const config = {
  defineConstants: {
    SENTRY_RELEASE: JSON.stringify(process.env.SENTRY_RELEASE || 'dev'),
  },
};
```

**Vite：**

```javascript
// vite.config.js
export default defineConfig({
  define: {
    __SENTRY_RELEASE__: JSON.stringify(process.env.SENTRY_RELEASE || 'dev'),
  },
});
```

然后在代码中使用：

```javascript
Sentry.init({
  dsn: '...',
  release: SENTRY_RELEASE, // 或 __SENTRY_RELEASE__
});
```

### 关于 `enableSourceMap`

SDK 默认开启路径归一化（`enableSourceMap: true`），通常无需修改。如果你因特殊原因需要禁用：

```javascript
Sentry.init({
  enableSourceMap: false, // 禁用路径归一化
});
```

---

## 第二步：安装和配置 sentry-cli

### 安装

```bash
# 推荐：作为开发依赖安装
npm install @sentry/cli --save-dev

# 或全局安装
npm install -g @sentry/cli
```

### 配置认证

**方式一：`.sentryclirc` 文件**（推荐本地开发）

在项目根目录创建 `.sentryclirc`：

```ini
[auth]
token=your-auth-token-here

[defaults]
org=your-org-slug
project=your-project-slug
```

> **重要：** 将 `.sentryclirc` 添加到 `.gitignore`，防止 Token 泄露。

**方式二：环境变量**（推荐 CI/CD）

```bash
export SENTRY_AUTH_TOKEN=your-auth-token-here
export SENTRY_ORG=your-org-slug
export SENTRY_PROJECT=your-project-slug
```

---

## 第三步：生成 Source Map

根据你使用的构建工具，配置 Source Map 生成。

### Webpack（Taro 项目）

```javascript
// config/index.js（Taro 配置）
const config = {
  mini: {
    webpackChain(chain) {
      // 使用 hidden-source-map，避免在产物中暴露 .map 文件引用
      chain.devtool('hidden-source-map');
    },
  },
};
```

### Vite

```javascript
// vite.config.js
export default defineConfig({
  build: {
    sourcemap: 'hidden', // 生成 .map 文件但不在 .js 中添加 sourceMappingURL 注释
  },
});
```

### uni-app

**Vue CLI 模式：**

```javascript
// vue.config.js
module.exports = {
  productionSourceMap: true,
  configureWebpack: {
    devtool: 'hidden-source-map',
  },
};
```

**Vite 模式（uni-app 3.x+）：**

```javascript
// vite.config.js
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
});
```

> **提示：** 推荐使用 `hidden-source-map`（Webpack）或 `sourcemap: 'hidden'`（Vite），这样生成 `.map` 文件用于上传，但不会在产物 JS 文件中添加 `//# sourceMappingURL` 注释，避免在生产环境暴露源码映射。

---

## 第四步：上传 Source Map

### 方式一：sentry-cli 手动上传

```bash
# 定义 release 名称（与 SDK 中的 release 一致）
VERSION="my-miniapp@1.0.0"

# 1. 创建 release
npx sentry-cli releases new "$VERSION"

# 2. 上传 Source Map
npx sentry-cli releases files "$VERSION" upload-sourcemaps ./dist \
  --url-prefix "app:///" \
  --ext js --ext map

# 3. 完成 release
npx sentry-cli releases finalize "$VERSION"
```

**参数说明：**

| 参数 | 说明 |
|------|------|
| `--url-prefix "app:///"` | 与 SDK 的 RewriteFrames 归一化前缀对应，**必须设置** |
| `--ext js --ext map` | 只上传 `.js` 和 `.map` 文件 |
| `./dist` | 构建产物目录，根据实际情况调整 |

### 方式二：Webpack 插件（适用于 Taro）

```bash
npm install @sentry/webpack-plugin --save-dev
```

```javascript
// config/index.js（Taro）
const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');

const config = {
  mini: {
    webpackChain(chain) {
      chain.devtool('hidden-source-map');
      chain.plugin('sentry').use(sentryWebpackPlugin, [{
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: 'your-org',
        project: 'your-project',
        release: { name: process.env.SENTRY_RELEASE },
        urlPrefix: 'app:///',
        sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
      }]);
    },
  },
};
```

### 方式三：Vite 插件

```bash
npm install @sentry/vite-plugin --save-dev
```

```javascript
// vite.config.js
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: 'your-org',
      project: 'your-project',
      release: { name: process.env.SENTRY_RELEASE },
      urlPrefix: 'app:///',
      sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
    }),
  ],
});
```

> **提示：** 使用构建插件时，Source Map 会在构建完成后自动上传，并可通过 `filesToDeleteAfterUpload` 自动清理 `.map` 文件，避免发布到生产环境。

---

## 第五步：CI/CD 自动化

### GitHub Actions 示例

```yaml
name: Build & Upload SourceMaps

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: 安装依赖
        run: npm install

      - name: 构建（生成 Source Map）
        run: npm run build
        env:
          SENTRY_RELEASE: ${{ github.ref_name }}

      - name: 上传 Source Map 到 Sentry
        run: |
          npx sentry-cli releases new "$SENTRY_RELEASE"
          npx sentry-cli releases files "$SENTRY_RELEASE" upload-sourcemaps ./dist \
            --url-prefix "app:///" \
            --ext js --ext map
          npx sentry-cli releases finalize "$SENTRY_RELEASE"
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: your-org
          SENTRY_PROJECT: your-project
          SENTRY_RELEASE: ${{ github.ref_name }}

      - name: 清理 Source Map 文件
        run: find ./dist -name "*.map" -delete

      # 后续部署步骤...
```

### 通用 Shell 脚本

```bash
#!/bin/bash
# upload-sourcemaps.sh
set -e

VERSION=${SENTRY_RELEASE:-$(node -p "require('./package.json').version")}

echo "上传 Source Map，release: $VERSION"

npx sentry-cli releases new "$VERSION"
npx sentry-cli releases files "$VERSION" upload-sourcemaps ./dist \
  --url-prefix "app:///" \
  --ext js --ext map
npx sentry-cli releases finalize "$VERSION"

echo "上传完成，清理 .map 文件..."
find ./dist -name "*.map" -delete

echo "完成"
```

---

## 第六步：验证 Source Map 是否生效

### 1. 检查已上传的文件

```bash
npx sentry-cli releases files "my-miniapp@1.0.0" list
```

输出应包含类似条目：

```
Name                              Size
app:///pages/index.js             12.5 KB
app:///pages/index.js.map         45.2 KB
```

### 2. 触发测试错误

在小程序代码中故意抛出一个错误：

```javascript
// pages/index.js
Page({
  onLoad() {
    throw new Error('Source Map 测试错误');
  },
});
```

### 3. 在 Sentry 面板验证

1. 登录 Sentry，进入对应项目
2. 找到刚触发的错误事件
3. 查看堆栈信息——如果显示的是**原始源码**而非压缩代码，说明 Source Map 配置成功
4. 如果仍显示压缩代码，点击堆栈帧右侧的 **"Source Map Debug"** 按钮，Sentry 会告诉你匹配失败的原因

---

## 平台特殊说明

### 微信小程序

**必须关闭微信开发者工具自带的编译选项：**

- **ES6 转 ES5** → 关闭
- **代码压缩** → 关闭
- **样式补全** → 关闭（可选）

这些工作应交给 Webpack/Vite 等构建工具处理，否则会导致行列号错位，Source Map 无法正确匹配。

**路径归一化：** SDK 自动剥离 `appservice/`、`app-service/`、`WAService/` 前缀。

### 支付宝小程序

**路径归一化：** SDK 自动剥离 `https://appx/` 等 HTTP 协议前缀。

### 字节跳动小程序

**路径归一化：** SDK 自动剥离 `tt://` 协议前缀。

### 百度小程序

**路径归一化：** SDK 自动剥离 `swan://` 协议前缀。

### 其他平台

SDK 会自动剥离所有 `协议://` 格式的前缀，因此 QQ、钉钉、快手等平台的虚拟路径也能被正确处理。

---

## 安全注意事项

1. **不要将 `.map` 文件发布到生产环境**——Source Map 包含原始源码，泄露可能带来安全风险。上传到 Sentry 后应立即删除本地 `.map` 文件。
2. **不要将 Auth Token 提交到代码仓库**——使用环境变量或将 `.sentryclirc` 添加到 `.gitignore`。
3. **使用 `hidden-source-map`**——避免在产物中生成 `sourceMappingURL` 注释，防止浏览器或调试工具直接加载 `.map` 文件。

---

## 常见问题排查

### Q: 上传成功但 Sentry 仍显示压缩代码

**检查项：**
1. `release` 名称是否一致？SDK 中的 `release` 必须与 `sentry-cli releases new` 的 release 名称完全匹配
2. `--url-prefix` 是否为 `app:///`？
3. 是否禁用了微信开发者工具的 "ES6 转 ES5" 和 "代码压缩"？
4. 在 Sentry 事件详情中，点击 "Source Map Debug" 查看具体匹配失败原因

### Q: 堆栈中的文件路径与上传的文件不匹配

**排查方法：**
1. 在 Sentry 事件的原始 JSON 中查看实际的 `filename` 字段（应以 `app:///` 开头）
2. 用 `sentry-cli releases files <release> list` 查看已上传文件的名称
3. 确认两者路径完全一致

### Q: Source Map 文件太大，上传超时

**解决方案：**
- 增加超时时间：在 `.sentryclirc` 中添加 `[http]` 的 `timeout` 配置
- 拆分上传：按目录分批上传
- 检查是否有不必要的大文件被包含

### Q: CI 中上传失败

**检查项：**
1. Auth Token 是否有效且具备 `project:releases` 权限
2. `SENTRY_ORG` 和 `SENTRY_PROJECT` 是否正确
3. 网络是否能访问 Sentry 服务器（自托管需检查内网连通性）

---

## 完整配置示例

以下是一个 **Taro + Webpack** 项目的完整 Source Map 配置示例：

**1. SDK 初始化（`app.js`）：**

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  release: SENTRY_RELEASE, // 构建时注入
  environment: 'production',
  // enableSourceMap 默认为 true
});
```

**2. Taro 构建配置（`config/index.js`）：**

```javascript
const config = {
  defineConstants: {
    SENTRY_RELEASE: JSON.stringify(process.env.SENTRY_RELEASE || `my-miniapp@${require('./package.json').version}`),
  },
  mini: {
    webpackChain(chain) {
      chain.devtool('hidden-source-map');
    },
  },
};
```

**3. `.sentryclirc`（本地开发）：**

```ini
[auth]
token=sntrys_xxx

[defaults]
org=my-org
project=my-miniapp
```

**4. `.gitignore`：**

```
.sentryclirc
```

**5. 上传脚本（`package.json`）：**

```json
{
  "scripts": {
    "upload:sourcemaps": "sentry-cli releases new $npm_package_version && sentry-cli releases files $npm_package_version upload-sourcemaps ./dist --url-prefix 'app:///' --ext js --ext map && sentry-cli releases finalize $npm_package_version"
  }
}
```

**6. 构建并上传：**

```bash
SENTRY_RELEASE="my-miniapp@1.0.0" npm run build
SENTRY_RELEASE="my-miniapp@1.0.0" npm run upload:sourcemaps
```
