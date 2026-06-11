# 支持平台与能力

## 支持的平台

| 平台 | 标识 | 网络 API | 备注 |
|------|------|----------|------|
| 微信小程序 / 小游戏 | `wechat` | `wx.request` | 含小游戏冷启动、帧率监控 |
| 支付宝小程序 | `alipay` | `my.httpRequest` | 路径前缀 `https://appx/` 自动归一 |
| 字节跳动小程序 / 小游戏 | `bytedance` | `tt.request` | 含小游戏能力 |
| 钉钉小程序 | `dingtalk` | `dd.httpRequest` | |
| QQ 小程序 | `qq` | `qq.request` | |
| 百度小程序 | `baidu` | `swan.request` | |
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
| 帧率 / 卡顿（FPS / jank） | ➖ | ✅ | `FrameRateIntegration` |
| 网络状态监控 | ✅ | ✅ | `onNetworkStatusChange` |
| 设备信息 / 上下文 | ✅ | ✅ | `getDeviceInfo` 等 |
| 页面生命周期 / 点击面包屑 | ✅ | ➖ | 小游戏无页面，自动跳过 |
| Source Map 路径归一化 | ✅ | ✅ | 各平台虚拟路径统一为 `app:///` |
| 弱网离线缓存重试 | ✅ | ✅ | 失败缓存到本地 Storage |

> ➖ 表示该环境无对应能力，SDK 自动跳过（no-op），不会报错。

完整的平台兼容性报告见仓库 [`docs/MultiPlatformCompatibilityReport.md`](https://github.com/lizhiyao/sentry-miniapp/blob/master/docs/MultiPlatformCompatibilityReport.md)。
