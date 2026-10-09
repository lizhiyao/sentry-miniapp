# 示例工程

仓库 [`examples/`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples) 下提供三个可运行的集成示例，覆盖原生与两大跨端框架：

| 示例 | 技术栈 | 重点演示 |
|------|--------|----------|
| [`examples/wxapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/wxapp) | 原生微信小程序 | 最小接入、异常 / 性能 / 网络上报 |
| [`examples/uniapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/uniapp) | uni-app（Vue3 + Vite） | `app.config.errorHandler` 接 Vue 组件错误、网络面包屑 |
| [`examples/taro`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/taro) | Taro 4（React + TS） | React 错误边界上报组件错误、`Taro.request` 面包屑 |

三个示例共用同一个演示 Sentry 项目 DSN，开箱即可上报；事件分别打了 `app.framework` 标签（`uni-app` / `taro-react`），在后台可按标签过滤区分。

示例依赖当前仓库的 SDK 构建，首次运行先在仓库根目录安装依赖并构建：

```bash
corepack enable
yarn install
yarn build
```

## 运行（以 Taro 为例）

```bash
cd examples/taro
npm install
npm run dev:weapp   # 产出到 dist/，用微信开发者工具导入
```

uni-app 同样先进入 `examples/uniapp` 安装依赖，再运行 `npm run dev:mp-weixin`。原生 wxapp 则先在仓库根执行 `yarn build:miniapp`，生成它使用的独立 SDK 文件，再用微信开发者工具导入 `examples/wxapp`。各示例 `README.md` 有详细说明。

## 关键集成点

- **初始化封装**：Taro / uni-app 在 `src/utils/sentry.*` 配置 SDK；原生 wxapp 在 `app.js` 初始化。
- **组件错误**：uni-app 在 `main.js` 接 `errorHandler`；Taro React 使用错误边界。详见 [uni-app 接入](/guide/uniapp)与 [Taro 接入](/guide/taro)。
