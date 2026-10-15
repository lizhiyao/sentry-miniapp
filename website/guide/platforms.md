# 支持范围

本页只回答“当前运行时支持哪些平台和能力”。遇到某个平台行为不同，请看[跨平台差异与降级](/guide/platform-compatibility)；要接入小游戏性能，请看[小游戏接入与性能](/guide/minigame)。

## 支持的平台

| 平台 | 标识 | 网络 API | 备注 |
|------|------|----------|------|
| 微信小程序 / 小游戏 | `wechat` | `wx.request` | 小游戏可观察首帧等待时间，帧率监控需手动开启 |
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
| 异常 / 未处理 Promise 捕获 | ✅ | ✅ | 按宿主可用的 `onError`／`onUnhandledRejection` 监听 |
| `setTimeout` / `setInterval` / rAF 包裹 | ✅ | ✅ | TryCatch 集成 |
| 网络请求面包屑（URL / 方法 / 状态码 / 耗时） | ✅ | ✅ | 包裹宿主 `request`／`httpRequest`，正文需手动开启 |
| 分布式追踪（http.client span） | ✅ | ✅ | 需开启性能采样；后端关联还须配置追踪头白名单与后端 SDK |
| 宿主性能条目（导航 / 渲染 / 资源 / User Timing） | ✅ | ➖ | 需安装 `performanceIntegration()`，以宿主实际提供的 observer 和时间戳为准 |
| 自定义业务 span | ✅ | ✅ | 通过 `startSpan` 等 API 测量，需开启性能采样 |
| SDK 初始化到首次帧回调 | ➖ | ✅ | 默认观察；需要全局 rAF，不代表完整冷启动或画面完成呈现 |
| 帧率 / 卡顿（FPS / jank） | ➖ | ✅ | 配置 `enableMinigameFrameRate: true`，需要全局 rAF |
| 网络状态监控 | ✅ | ✅ | `onNetworkStatusChange` |
| 设备信息 / 上下文 | ✅ | ✅ | `getDeviceInfo` 等 |
| 页面生命周期 / 点击面包屑 | ✅ | ➖ | 小游戏无页面，自动跳过 |
| Source Map 路径归一化 | ✅ | ✅ | 各平台虚拟路径统一为 `app:///` |
| 多平台堆栈解析 | ✅ | ✅ | 解析常见 V8 / Safari / JavaScriptCore 格式；源码定位仍需同一构建的 JS／map 与后台匹配 |
| 弱网离线缓存重试 | ✅ | ✅ | 符合策略的失败数据有界缓存并尝试补发；缺少 Storage 时降级内存 |
| 隐私同意前停止网络发送 | ✅ | ✅ | 开启 `requireConsent` 后进入本地缓冲 |
| Sentry Logs／Metrics | ✅ | ✅ | 显式调用 logger／metrics；目标 Sentry 须支持对应数据 |
| 实验性微信页面回放 | 微信 WebView | ➖ | 需 `sentry-miniapp` 2.1.0 或更新版本，显式安装集成并生成页面标记；[覆盖范围与接入](/guide/page-replay) |

> ✅ 表示 SDK 提供对应接入能力，不代表每个平台、基础库或设备都有全部宿主 API。缺少所需 API 时跳过相应采集；➖ 表示该环境通常不提供对应能力。

如果你正在排查某个平台独有的网络、Storage、异常监听或系统信息问题，请继续阅读[跨平台差异与降级](/guide/platform-compatibility)。小游戏首帧等待时间、帧率、卡顿和验证步骤集中在[小游戏接入与性能](/guide/minigame)。
