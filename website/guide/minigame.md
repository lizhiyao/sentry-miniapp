# 小游戏接入与性能监控

`sentry-miniapp` 支持微信小游戏和抖音小游戏。小游戏没有小程序的 `App()`、`Page()` 和页面路由，但仍可使用平台异常监听、网络、Storage 和设备信息 API。

## 最小接入

在游戏入口文件最前面初始化，早于业务模块加载和首帧逻辑：

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'YOUR_DSN',
  release: 'my-game@1.0.0',
  environment: 'production',
  tracesSampleRate: 0.2,
});

Sentry.captureException(new Error('minigame sentry test'));
```

小游戏默认启用生命周期的一次首帧观察；FPS／jank 循环默认关闭，须显式配置 `enableMinigameFrameRate: true`。普通小程序不安装这些小游戏能力。

## 平台识别与游戏引擎

SDK 默认通过 `wx`、`tt` 等平台对象识别平台。多个对象共存时，还会结合宿主名称、`ttfile://` 数据路径和 `tt...` AppID 等平台专属信息自动判定抖音环境。如果宿主 API 不可用或未返回有效信息，仍可显式传入 `miniappPlatform: 'bytedance'` 作为事件标记兜底；详见[跨平台差异与降级](/guide/platform-compatibility#sdk-如何处理平台差异)。

## 能捕获什么

| 能力 | 微信小游戏 | 抖音小游戏 | 说明 |
|------|:----------:|:----------:|------|
| 全局异常与 Promise rejection | 支持 | 支持 | 以宿主实际提供的监听 API 为准 |
| 网络请求面包屑与 `http.client` span | 支持 | 支持 | 走 `wx.request` / `tt.request`，不依赖 PerformanceObserver |
| 设备信息与离线缓存 | 支持 | 支持 | 依赖宿主系统信息与 Storage API |
| 前台会话统计 | 支持 | 支持 | 默认开启，依赖可注册的 `onShow`／`onHide` |
| SDK 初始化到首帧 | 支持 | 支持 | 上报 `minigame.init_to_first_frame` |
| FPS 与卡顿 | 支持 | 支持 | 依赖全局 `requestAnimationFrame` |
| 小程序导航 / 渲染 / 资源 PerformanceObserver | 不适用 | 不适用 | 小游戏通常只有 `performance.now()`，通用 Performance 默认不安装，显式安装时按实际能力跳过 |
| 页面路由、点击面包屑 | 不适用 | 不适用 | 没有 Page 模型，自动跳过 |

自动会话从 SDK 安装时的前台运行开始，退后台时结束，再次进入前台时创建新会话；若安装时已经观察到后台，则等待下次进入前台。缺少或无法注册任一 show／hide 监听时，跳过自动会话统计，可使用 [Session API](/guide/api#session-api) 手动管理。SDK 与业务原生监听的执行顺序由宿主决定，退后台处理器里产生的错误可能晚于会话结束；事件仍会按配置发送，但不会补计到已结束的会话。

> 版本提示：`2.0.0-beta.4` 及更早的 2.0 beta 在没有 `App()` 的小游戏中不会自动发送 Session。原生会话支持将在后续 beta 发布；当前版本需要会话统计时，请使用 Session API 手动管理。

## 首帧等待时间与帧率数据在哪里看

开启 `tracesSampleRate` 或 `tracesSampler`，并显式启用需要的 FPS 能力后：

- 在 Sentry 性能页面查找 `minigame.init_to_first_frame`，查看 `minigame.init_to_first_frame_ms` 耗时。它测量 SDK 初始化到首次 `requestAnimationFrame` 回调的等待时间，不包含初始化前的启动过程，也不代表画面已完成呈现；
- FPS 与卡顿在退后台或会话结束时汇总为 `minigame.framerate.summary`；
- 汇总包含 `fps.avg`、`fps.p95`、`fps.min`、`frames.total` 与 `jank.count` 属性（分级时另有 `jank.minor` / `jank.major` / `jank.severe`），不会每个采样窗口都发送事件。

未开启 tracing 时，小游戏性能数据仍可作为上下文和面包屑附在后续错误事件上，但不会形成可聚合的独立 Performance 数据。

API 请求 span 与小游戏 Performance API 能力分开采集。即使抖音小游戏只提供 `performance.now()`、没有 `createObserver`，开启 tracing 后，无业务父 span 的 `tt.request` 仍会作为独立 segment span 上报；在 `Sentry.startSpan()` 管理的流程内则作为子 span 上报。

## 调整帧率与卡顿参数

默认值适合先跑通。确实需要调整告警阈值或汇总周期时：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  enableMinigameFrameRate: true,
  minigameFrameRateOptions: {
    fpsWarningThreshold: 30,
    longFrameThresholdMs: 50,
    reportInterval: 10000,
    maxJankBreadcrumbsPerWindow: 3,
  },
});
```

`reportInterval` 控制本地统计窗口，不代表每个窗口都会发送汇总 span。会话汇总在退后台或 `client.close()` 的同步收尾窗口产生，并由 `flush` 排出。`client.dispose()` 与集成资源 cleanup 只释放状态，不产生最后汇总。退后台会停止 SDK 自己的 rAF，回前台重建基线；重复 show 不重置正在采集的窗口。

## 按严重程度区分卡顿

需要分别统计轻微、明显和严重卡顿时使用 `jankLevels`：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  enableMinigameFrameRate: true,
  minigameFrameRateOptions: {
    jankLevels: {
      minor: 17,
      major: 33,
      severe: 100,
    },
  },
});
```

阈值单位为毫秒，并且必须满足 `minor < major < severe`。只传 `{ major, severe }` 也可以；低于最低启用档的帧不计入卡顿。设置 `jankLevels` 后会优先于 `longFrameThresholdMs`。

单帧间隔超过 5000ms 通常来自退后台或调试器暂停，SDK 会当作采样断点丢弃，不计入 jank。

## Source Map 与游戏引擎

小游戏堆栈可能使用 `tt://`、`assets/`、`chunks://` 等虚拟路径，SDK 会尽量归一化为 `app:///`。上传时应同时上传同一次构建的 `.js` 与 `.map`。

Cocos、私有引擎、Debug ID 或特殊堆栈解析属于进阶场景，请看 [Source Map 进阶与排障](/guide/sourcemap-advanced#debug-id-与自定义-stackparser)。

## 验证清单

1. 在真机主动发送测试错误，确认 Issues 中顶层 `platform=javascript`、`contexts.miniapp.platform` 与 release 正确。
2. 将 `tracesSampleRate` 临时设为 `1.0`，显式设 `enableMinigameFrameRate: true`，完整启动并运行一段时间。
3. 退到后台，确认出现 `minigame.init_to_first_frame` 和 `minigame.framerate.summary`。
4. 打开 summary span，检查是否包含 `fps.*` 与 `jank.*` 属性。
5. 上传 Source Map 后再触发一次真机错误，确认堆栈能还原到源码。

如果看不到性能 span，先检查 tracing 采样是否开启，再确认运行时存在全局 `requestAnimationFrame`。完整选项见[配置项参考 · 小游戏](/guide/configuration#小游戏)。
