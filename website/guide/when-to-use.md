# 它适合我吗？（选型与限制）

花 1 分钟判断 `sentry-miniapp` 是不是你要的工具——我们更希望你**用对**，而不是装了才发现不合适。

## ✅ 适合

- 你在用 **Sentry**（官方 SaaS 或私有化），想把**小程序 / 小游戏**也纳入同一套错误与性能监控。
- 你做**微信 / 支付宝 / 字节 / 钉钉 / QQ / 百度 / 快手**中任意一端或多端，想要一套代码统一接入。
- 你用 **Taro / uni-app**，需要在小程序端可靠上报（H5 端见下）。
- 你需要：自动异常捕获、网络面包屑、**Source Map 还原堆栈**、弱网离线缓存、分布式追踪、Sentry Logs、隐私同意门禁，或小游戏首帧等待时间 / 帧率监控。

## ❌ 不适合 / 该用别的

| 你的情况 | 推荐方案 |
|---|---|
| **H5 / Web 端**（含 Taro / uni-app 的 H5 产物） | 官方 [`@sentry/browser`](https://docs.sentry.io/platforms/javascript/)，功能完整、上游维护 |
| **React Native / Flutter 等原生 App** | 对应的官方 Sentry SDK |
| **不用 Sentry**（用别家监控平台） | 本 SDK 只对接 Sentry，换平台不适用 |

## ⚠️ 已知限制（务必先知道）

| 限制 | 说明 / 取舍 |
|---|---|
| **不支持 Session Replay** | Sentry 官方 Replay 依赖浏览器 DOM（rrweb），小程序双线程、无开放 DOM，无法复用。用**丰富面包屑**还原现场。 |
| **SDK 会占用包体积** | 包含 `@sentry/core` 与平台适配，大小以最终构建和平台包体积分析为准；在意的话评估[分包异步加载](/guide/bundle-size)及启动监控的取舍。 |
| **不支持函数级 Profiling / 火焰图** | 小程序无底层栈采样 API。已有页面 / 组件级性能监控覆盖大部分场景。 |
| **小游戏帧率监控依赖全局 `requestAnimationFrame`** | 默认关闭，需手动开启；缺少该 API 时跳过。普通小程序逻辑层通常不提供该能力。 |
| **框架组件内错误需接框架错误处理** | Vue（uni-app）会吞组件错误，需接 `errorHandler`；React（Taro）建议加错误边界。详见各[接入指南](/guide/taro)。 |

> 我们把限制讲在前面，是因为**知道边界比功能清单更省你时间**。

## 为什么可以信任它

- **已被收录进 [Sentry 官方文档](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)** 的 community-supported SDK 列表。
- 覆盖 **7 大平台 + Taro / uni-app**，通过自动化测试和 GitHub Actions 持续验证。
- 有真实社区在用（微信交流群、GitHub fork / star）。

## 判断完了？

- 适合 → 去 [快速接入](/guide/getting-started)（5 分钟跑通）。
- 用 Taro / uni-app → [Taro 接入](/guide/taro) / [uni-app 接入](/guide/uniapp)。
- 做微信 / 抖音小游戏 → [小游戏接入与性能](/guide/minigame)。
- 想先确认边界或原理 → [支持范围](/guide/platforms) / [工作原理](/guide/how-it-works)。
