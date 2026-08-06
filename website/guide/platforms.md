# 支持范围

本页只回答“当前运行时支持哪些平台和能力”。遇到某个平台行为不同，请看[跨平台差异与降级](/guide/platform-compatibility)；要接入小游戏性能，请看[小游戏接入与性能](/guide/minigame)。

## 支持的平台

| 平台 | 标识 | 网络 API | 备注 |
|------|------|----------|------|
| 微信小程序 / 小游戏 | `wechat` | `wx.request` | 含小游戏冷启动、帧率监控 |
| 支付宝小程序 | `alipay` | `my.httpRequest` | 路径前缀 `https://appx/` 自动归一 |
| 字节跳动小程序 / 小游戏 | `bytedance` | `tt.request` | 含小游戏能力 |
| 钉钉小程序 | `dingtalk` | `dd.httpRequest` | |
| QQ 小程序 | `qq` | `qq.request` | |
| 百度小程序 | `swan` | `swan.request` | 标识与运行时全局对象保持一致，无单独 `baidu` 值 |
| 快手小程序 | `kuaishou` | `ks.request` | |

跨端框架：**Taro**（React / Vue）与 **uni-app**（Vue）均可在小程序端直接使用；H5 端请改用官方 [`@sentry/browser`](https://docs.sentry.io/platforms/javascript/)，按端条件编译引入。

## 能力矩阵

| 能力 | 小程序 | 小游戏 | 说明 |
|------|:------:|:------:|------|
| 异常 / 未处理 Promise 捕获 | ✅ | ✅ | `wx.onError` / `wx.onUnhandledRejection` |
| `setTimeout` / `setInterval` / rAF 包裹 | ✅ | ✅ | TryCatch 集成 |
| 网络请求面包屑（url / 方法 / 状态码 / 耗时） | ✅ | ✅ | 包裹 `wx.request`；可选记录 body |
| 分布式追踪（http.client span） | ✅ | ✅ | 需开启 `tracesSampleRate` |
| 性能监控（导航 / 渲染 / 资源 / 自定义） | ✅ | ➖ | 小游戏走专属指标 |
| 冷启动首帧耗时 | ➖ | ✅ | `MinigameIntegration` |
| 帧率 / 卡顿（FPS / jank） | ➖ | ✅ | `MinigameFrameRateIntegration` |
| 网络状态监控 | ✅ | ✅ | `onNetworkStatusChange` |
| 设备信息 / 上下文 | ✅ | ✅ | `getDeviceInfo` 等 |
| 页面生命周期 / 点击面包屑 | ✅ | ➖ | 小游戏无页面，自动跳过 |
| Source Map 路径归一化 | ✅ | ✅ | 各平台虚拟路径统一为 `app:///` |
| 多平台堆栈解析 | ✅ | ✅ | 支持 V8 / Safari / JavaScriptCore 格式，配合 Source Map 精准定位 |
| 弱网离线缓存重试 | ✅ | ✅ | 失败缓存到本地 Storage |
| 隐私同意前停止网络发送 | ✅ | ✅ | 开启 `requireConsent` 后进入本地缓冲 |
| Sentry Logs | ✅ | ✅ | 需开启 `enableLogs` |

> ➖ 表示该环境无对应能力，SDK 自动跳过（no-op），不会报错。

如果你正在排查某个平台独有的网络、Storage、异常监听或系统信息问题，请继续阅读[跨平台差异与降级](/guide/platform-compatibility)。小游戏冷启动、FPS、jank 和验证步骤集中在[小游戏接入与性能](/guide/minigame)。
