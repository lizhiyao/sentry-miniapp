# 跨平台差异与降级

同一份 `sentry-miniapp` 配置可以运行在多个小程序平台，但平台提供的网络、Storage、异常监听和系统信息 API 并不完全一致。本页说明 SDK 如何抹平这些差异，以及某项能力在特定平台缺失时会发生什么。

如果你只想确认某个平台是否支持异常、性能、小游戏或 Source Map，请先看[支持范围](/guide/platforms)。遇到“微信正常、支付宝或钉钉异常”这类分端问题时，再回到本页排查。

## SDK 如何处理平台差异

SDK 初始化时按当前运行时的全局对象识别平台，业务代码不需要手动传入平台名称：

| 平台 | 运行时对象 | SDK 平台标识 | 上报 API |
|------|------------|--------------|----------|
| 微信小程序 / 小游戏 | `wx` | `wechat` | `wx.request` |
| 支付宝小程序 | `my` | `alipay` | `my.httpRequest` |
| 字节跳动小程序 / 小游戏 | `tt` | `bytedance` | `tt.request` |
| 钉钉小程序 | `dd` | `dingtalk` | `dd.httpRequest` |
| QQ 小程序 | `qq` | `qq` | `qq.request` |
| 百度智能小程序 | `swan` | `swan` | `swan.request` |
| 快手小程序 | `ks` | `kuaishou` | `ks.request` |

识别完成后，SDK 的异常捕获、面包屑、transport、离线缓存等上层能力只面对统一接口。通常无需手动设置 `platform`。

Cocos 等游戏引擎的适配层可能暴露跨平台兼容对象，例如抖音小游戏运行时首先被识别为 `wx`。如果事件的平台标记不正确，可显式指定：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  platform: 'bytedance',
});
```

显式配置会覆盖事件顶层 `platform` 与 `contexts.miniapp.platform`，但不会切换底层宿主对象。异常监听、网络和 Storage 等能力仍使用自动检测到的兼容 API，避免破坏引擎适配层原本可用的上报链路。如果需要让 Sentry 按 JavaScript 事件处理 Source Map，可继续在 `beforeSend` 中将顶层 `event.platform` 改为 `javascript`；`contexts.miniapp.platform` 仍会保留真实小游戏平台。

## 网络请求差异

微信风格平台通常使用 `request`、`header` 和 `statusCode`；支付宝、钉钉则可能使用 `httpRequest`、`headers` 和 `status`。内置 transport 会同时兼容这些字段：

| 差异 | SDK 的处理方式 |
|------|----------------|
| `request` / `httpRequest` | 自动选择当前平台存在的请求方法 |
| `header` / `headers` | 发请求时同时提供两种请求头字段 |
| `statusCode` / `status` | 读取响应时自动回退 |
| `header` / `headers` 响应头 | 统一读取 Sentry 限流与重试信息 |

默认网络面包屑和 tracing 也会包裹对应平台的请求 API。使用 `Taro.request` 或 `uni.request` 时，它们在小程序端最终仍会调用宿主平台请求 API，因此通常无需重复埋点。

> 小程序后台仍需把 DSN 中的实际上报域名加入 `request` 合法域名。SDK 只能适配调用方式，不能绕过平台域名白名单。

## Storage 与离线缓存

离线缓存和隐私同意前缓冲依赖平台 Storage。微信风格平台通常使用 `setStorageSync(key, value)`；支付宝和钉钉使用 `{ key, data }` 对象参数，并通过 `{ data }` 返回读取结果。

SDK 会在支付宝和钉钉运行时做一次幂等包装，把它们转换成统一的 key-value 调用。上层离线缓存、`requireConsent` 和恢复补发逻辑无需区分平台。

如果某个平台没有提供所需 Storage API，SDK 不会因此阻断初始化，但依赖本地持久化的能力会降级。可以打印 `Sentry.getDiagnostics()`，检查 transport、离线缓存和 consent 状态。

## 异常监听按能力启用

全局异常捕获会分别检查以下宿主 API 是否存在：

| 宿主 API | 捕获内容 | 缺失时的行为 |
|----------|----------|--------------|
| `onError` | 未处理的 JavaScript 异常 | 跳过该监听，可继续手动 `captureException` |
| `onUnhandledRejection` | 未处理的 Promise rejection | 跳过该监听 |
| `onPageNotFound` | 页面不存在 | 跳过该监听 |
| `onMemoryWarning` | 内存告警 | 跳过该监听 |

SDK 不会假设每个平台、每个基础库版本都提供完整监听集合。缺少某个 API 时只跳过对应能力，不会因为调用不存在的方法而使应用启动失败。钉钉等宿主的页面不存在和内存告警 API 覆盖可能有限，应以目标平台及基础库的实际能力为准。

框架组件错误是另一层问题：Vue 或 React 可能先于平台全局监听接住错误。uni-app 需要接入 Vue `errorHandler`，Taro React 建议使用 Error Boundary，分别参见 [uni-app 接入](/guide/uniapp)和 [Taro 接入](/guide/taro)。

## 系统与设备信息

SDK 优先读取平台较新的分体 API，例如 `getAppBaseInfo`、`getWindowInfo` 和 `getDeviceInfo`。如果这些方法不存在，或者组合结果缺少 brand、model、system 等核心字段，则回退到 `getSystemInfoSync`。读取过程中发生异常时，本次设备信息会留空；空结果不会被缓存，后续事件会再次尝试读取。

不同平台的返回字段不完整时，事件仍会正常发送，只是对应的 device、OS 或 app context 可能缺少部分字段。支付宝、钉钉等平台返回的 `version` 会在需要时兼容映射为基础库版本字段。

## 小程序与小游戏不是同一种页面模型

小游戏虽然继续使用 `wx`、`tt` 等平台对象，但没有 `App()`、`Page()` 和页面路由。SDK 会结合 `GameGlobal` 及页面构造函数是否存在来识别小游戏：

| 能力 | 小程序 | 小游戏 |
|------|:------:|:------:|
| 全局异常、Promise rejection | 支持 | 支持 |
| 网络请求、离线缓存、设备信息 | 支持 | 支持 |
| 页面生命周期、路由、点击面包屑 | 支持 | 自动跳过 |
| 冷启动首帧、FPS、jank | 不适用 | 支持 |

小游戏缺少页面 API 是运行时模型差异，不是接入失败。相关页面集成会安全 no-op，小游戏专属能力由 `MinigameIntegration` 和 `MinigameFrameRateIntegration` 提供。

## Source Map 路径归一化

不同平台的堆栈文件路径可能分别表现为 `appservice/`、`https://appx/`、`tt://`、`swan://` 或小游戏虚拟 chunk。默认 `RewriteFrames` 会移除这些平台前缀，并统一改写为 `app:///`：

```text
appservice/pages/index.js  -> app:///pages/index.js
https://appx/pages/a.js    -> app:///pages/a.js
tt://pages/b.js            -> app:///pages/b.js
```

上传 Source Map 时仍需保证 `release` 与 SDK 初始化值完全一致。微信真机合并脚本、Debug ID、自定义 `stackParser` 等情况见 [Source Map 进阶与排障](/guide/sourcemap-advanced)。

## 分端问题怎么排查

1. 确认问题发生在原生小程序、Taro、uni-app 还是小游戏，以及具体宿主平台和基础库版本。
2. 用 `Sentry.captureException(new Error('sentry test'))` 验证最小上报链路。
3. 打印 `Sentry.getDiagnostics()`，检查平台识别、初始化选项、集成、transport 与 warnings。
4. 对照本页确认目标能力依赖的宿主 API 是否存在，并在真机上验证；开发者工具的行为可能不同。
5. 仍无法定位时提交 Issue，附 SDK 版本、目标平台、复现步骤、关键配置和脱敏后的诊断输出。

## 下一步

- [支持范围](/guide/platforms)
- [配置项参考](/guide/configuration)
- [常见问题](/guide/faq)
