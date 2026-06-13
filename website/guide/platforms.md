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
| 帧率 / 卡顿（FPS / jank） | ➖ | ✅ | `MinigameFrameRateIntegration` |
| 网络状态监控 | ✅ | ✅ | `onNetworkStatusChange` |
| 设备信息 / 上下文 | ✅ | ✅ | `getDeviceInfo` 等 |
| 页面生命周期 / 点击面包屑 | ✅ | ➖ | 小游戏无页面，自动跳过 |
| Source Map 路径归一化 | ✅ | ✅ | 各平台虚拟路径统一为 `app:///` |
| 多平台堆栈解析 | ✅ | ✅ | 支持 V8 / Safari / JavaScriptCore 格式，配合 Source Map 精准定位 |
| 弱网离线缓存重试 | ✅ | ✅ | 失败缓存到本地 Storage |

> ➖ 表示该环境无对应能力，SDK 自动跳过（no-op），不会报错。

完整的平台 API 差异报告见仓库 [`docs/MultiPlatformCompatibilityReport.md`](https://github.com/lizhiyao/sentry-miniapp/blob/master/docs/MultiPlatformCompatibilityReport.md)。

## 小游戏：性能数据独立上报

小游戏的冷启动与帧率数据**不只挂在 error 事件上**——开启 tracing 后会作为独立 transaction 上报，可在 Sentry **Performance 页**做跨会话的趋势 / 分布 / P95 聚合：

- **冷启动** → `minigame.coldstart` transaction（含 `cold_start` measurement）。
- **帧率 / 卡顿** → 会话维度累积，在**退后台（onHide）/ 会话结束**时发一个 `minigame.framerate.summary` transaction（含 `fps_avg` / `fps_p95` / `fps_min` / `jank_count` measurements）——不每窗口发事件，配额友好。

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 1.0, // 启用性能采样（与 error 的 sampleRate 解耦）
});
```

> 需设置 `tracesSampleRate`（或 `tracesSampler`）才会上报性能 transaction，其采样**独立于** error 的 `sampleRate`。未启用 tracing 时退化为原有行为：性能数据仅作为 `minigame` / `minigame.framerate` 上下文 + 面包屑挂在 error 事件上。

帧率监控依赖全局 `requestAnimationFrame`：小游戏有（绑定真实渲染帧），小程序为双线程架构、逻辑层没有，因此小程序中即使开启也会安全 no-op。
