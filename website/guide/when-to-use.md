# 它适合我吗？（选型与限制）

如果你想知道小程序用户遇到了什么错误、报错对应哪段源码，或一次操作慢在哪一步，可以用 `sentry-miniapp` 将这些数据接入 Sentry。下面按项目情况判断是否适合。

## ✅ 适合

| 你的项目或问题 | 可以怎样使用 |
| --- | --- |
| 团队已经用 Sentry 监控 Web 或后端，希望小程序问题也在同一处查看 | 将小程序 / 小游戏异常接入现有 Sentry，配置后关联前后端请求链路 |
| 用户反馈报错，却很难在本地重现 | 查看异常、设备、页面、操作与请求记录，上传对应构建的 Source Map 定位业务源码 |
| 登录、支付或页面操作慢，不清楚是请求还是业务步骤耗时 | 开启性能采样并为关键步骤添加测速，缩小需要排查的范围 |
| 用 Taro / uni-app 同时开发小程序与 H5 | 小程序端用本 SDK，并接入 React / Vue 组件错误处理；H5 端选择官方 Web SDK |
| 用户常在弱网环境使用，或监控数据需要等待隐私同意 | 配置本地缓存与同意门禁，按项目要求安排发送和重试 |
| 微信 / 抖音小游戏需要排查异常和卡顿 | 监控异常与会话，宿主支持时按需开启帧率和卡顿统计 |

支持微信、支付宝、字节跳动、钉钉、QQ、百度、快手小程序；实际采集范围取决于[平台能力](/guide/platforms)。2.x 接入需要 Sentry 官方云服务，或 **26.4.2 及以上的自建 Sentry**；已有项目升级或后台更旧时，先看[版本选择与迁移](/guide/migration-2.0#version-choice)。

## ❌ 不适合 / 该用别的

| 你的情况 | 推荐方案 |
|---|---|
| **H5 / Web 端**（含 Taro / uni-app 的 H5 产物） | 官方 [`@sentry/browser`](https://docs.sentry.io/platforms/javascript/)，功能完整、上游维护 |
| **React Native / Flutter 等原生 App** | 对应的官方 Sentry SDK |
| **不用 Sentry**（用别家监控平台） | 本 SDK 只对接 Sentry，换平台不适用 |

## ⚠️ 已知限制（务必先知道）

| 限制 | 说明 / 取舍 |
|---|---|
| **页面回放覆盖有限** | 可选的[实验性微信回放](/guide/page-replay)仅录制标记区域的采样布局，需要单独安装集成并生成标记。未标记区域、原生绘制和其它宿主不作完整复现。 |
| **SDK 会占用包体积** | 包含 `@sentry/core` 与平台适配，大小以最终构建和平台包体积分析为准；在意的话评估[分包异步加载](/guide/bundle-size)及启动监控的取舍。 |
| **不支持函数级 Profiling / 火焰图** | 小程序无底层栈采样 API。可通过实际宿主性能条目、HTTP 与业务 span 排查耗时；可选性能数据取决于宿主 API。 |
| **小游戏帧率监控依赖全局 `requestAnimationFrame`** | 默认关闭，需手动开启；缺少该 API 时跳过。普通小程序逻辑层通常不提供该能力。 |
| **框架组件内错误需接框架错误处理** | 框架可能先于宿主监听处理错误；Vue 使用 [errorHandler](/guide/uniapp)，React 使用[错误边界](/guide/taro)。 |

## 为什么可以信任它

- **已被收录进 [Sentry 官方文档](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)** 的 community-supported SDK 列表。
- 测试覆盖 Core 的真实事件处理、实际安装包及 Taro / uni-app 微信构建；检查范围和结果可在[仓库 Actions](https://github.com/lizhiyao/sentry-miniapp/actions)中查看。
- 能力说明、源码和[缺陷反馈](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose)公开维护，接入步骤与配置可以对照实现查阅。

## 判断完了？

- 适合 → 去 [快速接入](/guide/getting-started)（5 分钟跑通）。
- 用 Taro / uni-app → [Taro 接入](/guide/taro) / [uni-app 接入](/guide/uniapp)。
- 做微信 / 抖音小游戏 → [小游戏接入与性能](/guide/minigame)。
- 想先确认边界或原理 → [支持范围](/guide/platforms) / [工作原理](/guide/how-it-works)。
