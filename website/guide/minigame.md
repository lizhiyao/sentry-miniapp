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

小游戏运行时会自动启用生命周期和帧率集成；普通小程序中默认关闭。通常不需要手动传 `integrations`。

## 平台识别与游戏引擎

SDK 默认通过 `wx`、`tt` 等宿主对象自动识别平台。如果抖音小游戏事件被识别为 `wechat`，可显式传入 `platform: 'bytedance'`，将事件的 `contexts.miniapp.platform` 标为 `bytedance`。底层异常监听和网络请求仍使用自动检测到的平台 API；详见[跨平台差异与降级](/guide/platform-compatibility#sdk-如何处理平台差异)。

## 能捕获什么

| 能力 | 微信小游戏 | 抖音小游戏 | 说明 |
|------|:----------:|:----------:|------|
| 全局异常与 Promise rejection | 支持 | 支持 | 以宿主实际提供的监听 API 为准 |
| 网络请求面包屑与 `http.client` span | 支持 | 支持 | 走 `wx.request` / `tt.request` |
| 设备信息与离线缓存 | 支持 | 支持 | 依赖宿主系统信息与 Storage API |
| 冷启动首帧 | 支持 | 支持 | 上报 `minigame.coldstart` |
| FPS 与卡顿 | 支持 | 支持 | 依赖全局 `requestAnimationFrame` |
| 页面路由、点击面包屑 | 不适用 | 不适用 | 没有 Page 模型，自动跳过 |

## 冷启动与帧率数据在哪里看

开启 `tracesSampleRate` 或 `tracesSampler` 后：

- 冷启动作为 `minigame.coldstart` transaction 上报，包含 `cold_start` measurement；
- FPS 与卡顿在退后台或会话结束时汇总为 `minigame.framerate.summary`；
- 汇总包含 `fps_avg`、`fps_p95`、`fps_min` 和 `jank_count`，不会每个采样窗口都发送事件。

未开启 tracing 时，小游戏性能数据仍可作为上下文和面包屑附在后续错误事件上，但不会形成可聚合的独立 Performance 数据。

## 调整帧率与卡顿参数

默认值适合先跑通。确实需要调整告警阈值或汇总周期时：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  minigameFrameRateOptions: {
    fpsWarningThreshold: 30,
    longFrameThresholdMs: 50,
    reportInterval: 10000,
    maxJankBreadcrumbsPerWindow: 3,
  },
});
```

`reportInterval` 控制本地统计窗口，不代表每个窗口都会发送 transaction。会话汇总仍在退后台或会话结束时发送。

## 按严重程度区分卡顿

需要分别统计轻微、明显和严重卡顿时使用 `jankLevels`：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
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

1. 在真机主动发送测试错误，确认 Issues 中的 `platform` 与 release 正确。
2. 将 `tracesSampleRate` 临时设为 `1.0`，完整启动并运行一段时间。
3. 退到后台，确认出现 `minigame.coldstart` 和 `minigame.framerate.summary`。
4. 检查 summary 是否包含 FPS 与 jank measurements。
5. 上传 Source Map 后再触发一次真机错误，确认堆栈能还原到源码。

如果没有性能 transaction，先检查 tracing 采样是否开启，再确认运行时存在全局 `requestAnimationFrame`。完整选项见[配置项参考 · 小游戏](/guide/configuration#小游戏)。
