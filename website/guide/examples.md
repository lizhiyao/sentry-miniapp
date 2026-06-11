# 示例工程

仓库 [`examples/`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples) 下提供三个可运行的集成示例，覆盖原生与两大跨端框架：

| 示例 | 技术栈 | 重点演示 |
|------|--------|----------|
| [`examples/wxapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/wxapp) | 原生微信小程序 | 最小接入、异常 / 性能 / 网络上报 |
| [`examples/uniapp`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/uniapp) | uni-app（Vue3 + Vite） | `app.config.errorHandler` 接 Vue 组件错误、网络面包屑 |
| [`examples/taro`](https://github.com/lizhiyao/sentry-miniapp/tree/master/examples/taro) | Taro 4（React + TS） | React 错误边界上报组件错误、`Taro.request` 面包屑 |

三个示例共用同一个演示 Sentry 项目 DSN，开箱即可上报；事件分别打了 `app.framework` 标签（`uni-app` / `taro-react`），在后台可按标签过滤区分。

## 运行（以 Taro 为例）

```bash
cd examples/taro
npm install
npm run dev:weapp   # 产出到 dist/，用微信开发者工具导入
```

uni-app 用 `npm run dev:mp-weixin`；wxapp 直接用微信开发者工具导入目录即可。各示例 `README.md` 有详细说明。

## 关键集成点

- **初始化封装**：各示例的 `src/utils/sentry.*` 是集成核心（DSN、采样、`traceNetworkBody`、标签）。
- **组件错误**：uni-app 在 `main.js` 接 `errorHandler`；Taro(React) 用 `SentryBoundary` 错误边界。详见 [常见问题 · 组件内错误](/guide/faq#组件内错误)。
