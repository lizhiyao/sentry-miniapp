# 示例工程

想先确认自己的工程该在哪里初始化、如何捕获组件错误或验证上报，可以运行仓库 [`examples/`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples) 中对应的示例。

| 示例 | 技术栈 | 重点演示 |
|------|--------|----------|
| [`examples/wxapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/wxapp) | 原生微信小程序 | 异常、请求与业务性能验证；另有源码回放示例 |
| [`examples/uniapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/uniapp) | uni-app（Vue3 + Vite） | `app.config.errorHandler` 接 Vue 组件错误、网络面包屑 |
| [`examples/taro`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/taro) | Taro 4（React + TS） | React 错误边界上报组件错误、`Taro.request` 面包屑 |

示例预置同一个演示 DSN；查看演示后台需要相应权限。自行验证时，先替换为自己的 DSN，并配置对应 AppID 的 request 合法域名。框架示例使用 `app.framework` 标签区分来源。

示例为了观察效果启用了全量采样、console 面包屑和正文采集；生产接入从[最小配置](/guide/getting-started)开始，再按需要选择采集字段与采样率。

## 运行前准备

示例使用当前源码构建，不等于安装了 npm 最新版。在**仓库根目录**按[开发环境要求](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md#0-环境要求)准备 Node.js 和 Yarn，然后安装依赖：

```bash
corepack enable
yarn install
```

按项目选择构建命令，运行后在微信开发者工具打开对应项目：

| 要运行的示例 | 构建与运行 | 开发者工具打开位置 |
| --- | --- | --- |
| 原生 wxapp | 根目录 `yarn build:miniapp` | `examples/wxapp` |
| Taro | 根目录 `yarn build`，再按下方命令运行 | `examples/taro`，其配置指向 `dist/` |
| uni-app | 根目录 `yarn build`，进入 `examples/uniapp` 后 `npm install`、`npm run dev:mp-weixin` | `dist/dev/mp-weixin`；生产构建为 `dist/build/mp-weixin` |

框架示例使用 npm 安装，以应用各自的 `overrides`；完整命令及映射检查见各示例 README。

## 运行（以 Taro 为例）

```bash
yarn build          # 仓库根目录
cd examples/taro
npm install
node ../../scripts/internal/check-example-dependencies.mjs package.json
npm run dev:weapp   # 产出到 dist/，用微信开发者工具导入
```

## 确认实际结果

先发送一个带独特消息的测试错误，在自己的 Sentry 项目中找到该事件；再分别验证项目需要的组件错误、请求 span 与源码位置。示例界面的“已初始化”“已采集”和事件 ID 不能代替后台接收结果。完整步骤见[快速接入](/guide/getting-started#_3-验证是否打通)与[Source Map 验证](/guide/sourcemap#第六步-验证-source-map-是否生效)。

## 源码中的回放示例

需要观察微信页面变化时，可按[实验性回放指南](/guide/page-replay#体验示例)生成独立项目；当前 npm `2.0.2` 没有回放入口。没有云端额度时使用 `yarn build:replay-local` 和 PC 录制查看器，本地录制与播放不请求 Sentry。

## 关键集成点

- **初始化封装**：Taro / uni-app 在 `src/utils/sentry.*` 配置 SDK；原生 wxapp 在 `app.js` 初始化。
- **组件错误**：uni-app 在 `main.js` 接 `errorHandler`；Taro React 使用错误边界。详见 [uni-app 接入](/guide/uniapp)与 [Taro 接入](/guide/taro)。
