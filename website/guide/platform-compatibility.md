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

识别完成后，SDK 的异常捕获、面包屑、transport、离线缓存等上层能力只面对统一接口。通常无需手动设置 `miniappPlatform`。

只有一个平台对象时，SDK 直接使用它。运行时同时存在多个平台对象时，SDK 会进一步读取同步宿主信息，以平台专属信号消除歧义：

- 抖音 `getSystemInfoSync()` 返回的 `appName` / `hostName`；
- `getEnvInfoSync()` 返回的 `ttfile://` 数据路径和 `tt...` AppID；
- `getAccountInfoSync()` 或 `getLaunchOptionsSync()` 返回的平台 AppID。

这些 API 不存在、调用失败、未返回明确信息或不同对象的信号互相冲突时，SDK 会按上表顺序兼容回退。此时可显式指定事件的平台标记：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  miniappPlatform: 'bytedance',
});
```

显式配置只覆盖 `contexts.miniapp.platform`，不会切换底层宿主对象。事件顶层 `platform` 始终是 `javascript`，与 Sentry 官方 JavaScript SDK 的堆栈解析和 Source Map 语义保持一致；异常监听、网络和 Storage 等能力仍使用自动检测到的平台 API。旧 `platform` 选项仍可兼容，但已弃用；两者同时传入时 `miniappPlatform` 优先，非法值会给出警告并回退自动识别。

## 网络请求差异

微信风格平台通常使用 `request`、`header` 和 `statusCode`；支付宝、钉钉则可能使用 `httpRequest`、`headers` 和 `status`。内置 transport 会同时兼容这些字段：

| 差异 | SDK 的处理方式 |
|------|----------------|
| `request` / `httpRequest` | 自动选择当前平台存在的请求方法 |
| `header` / `headers` | 发请求时同时提供两种请求头字段 |
| `statusCode` / `status` | 读取响应时自动回退 |
| `header` / `headers` 响应头 | 统一读取 Sentry 限流与重试信息 |

默认网络面包屑和 tracing 也会包裹对应平台的请求 API。使用 `Taro.request` 或 `uni.request` 时，它们在小程序端最终仍会调用宿主平台请求 API，因此通常无需重复埋点。

SDK 入口会补齐所需的 `globalThis`、`Array.includes`、`Object.entries/values/fromEntries`、`Promise.allSettled`、`String.isWellFormed/toWellFormed` 和 `URLSearchParams`，无需业务另行补充这些方法。宿主仍需提供 Promise、Symbol、Map/Set、WeakMap/WeakSet 和 typed arrays 等基础能力；仅开启 Babel 语法转换不能补齐运行时 API。缺少或不完整的 `TextEncoder` 使用 SDK 编码回退，附件发送还需宿主支持二进制请求，见[二进制请求配置](./configuration)。

包装会保留请求函数上的扩展属性及其动态更新。若运行时缺少 `Proxy` 或 `Reflect.get`，而请求函数带有框架扩展成员，SDK 会保留原函数并跳过该入口的自动面包屑和 tracing；错误上报仍使用可用的宿主请求 API。

> 小程序后台仍需把 DSN 中的实际上报域名加入 `request` 合法域名。SDK 只能适配调用方式，不能绕过平台域名白名单。

## Storage 与离线缓存

离线缓存和隐私同意前缓冲依赖平台 Storage。微信风格平台通常使用 `setStorageSync(key, value)`；支付宝和钉钉使用 `{ key, data }` 对象参数，并通过 `{ data }` 返回读取结果。

SDK 在支付宝和钉钉上只归一化内部缓存的 key-value 调用。业务原有的对象参数调用仍保留宿主返回值和调用时的 `this`，不需要改写业务 Storage 用法。

平台的单 key 容量不相同：[支付宝 `my.setStorageSync` 官方文档](https://github.com/AlipayDocs/open-docs/blob/main/mini/api/%E5%9F%BA%E7%A1%80API/%E7%BC%93%E5%AD%98/my.setStorageSync.md)列出的单 key 上限是 200 KB。SDK 为缓存记录和元数据留出余量，对支付宝采用 180 KiB 的整容器预算；钉钉采用同样的保守 SDK 预算，其余支持平台采用 900 KiB。`consentCacheMaxBytes` 默认仍是 900 KiB，实际按配置值与平台预算中的较小值执行。

支付宝同步缓存 API 也可能返回 `{ error, errorMessage }` 表示失败，而没有抛出异常。SDK 会识别这类失败并降级缓存；写入或删除失败时，不会把数据记为已经持久化或已经移除。可通过 `Sentry.getDiagnostics()` 检查实际存储状态和故障诊断。

这些数字是 SDK 的缓存策略，不等同于各宿主的全部存储额度，也不保证存储写入一定成功。调整预算仅裁剪仍兼容的缓存记录，不会把容量变化视为更换投递目标。

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

SDK 优先读取平台较新的分体 API，例如 `getAppBaseInfo`、`getWindowInfo` 和 `getDeviceInfo`。单项方法不存在或调用失败时，仍读取其它可用方法；组合结果缺少 brand、model、system 等核心字段时，再尝试 `getSystemInfoSync`。不可读的字段单独省略，宿主返回对象不会被修改。SDK 不读取没有遥测用途的授权设置和蓝牙、Wi-Fi 等系统开关。

默认环境信息在初始化时生成快照。完全无法获取信息时，对应字段留空；这个空结果不会缓存，重新初始化时会再次尝试读取。

不同平台的返回字段不完整时，事件仍会正常发送，只是对应的 device、OS 或 app context 可能缺少部分字段。支付宝、钉钉等平台返回的 `version` 会在需要时兼容映射为基础库版本字段。

## 小程序与小游戏不是同一种页面模型

小游戏虽然继续使用 `wx`、`tt` 等平台对象，但没有 `App()`、`Page()` 和页面路由。SDK 会结合 `GameGlobal` 及页面构造函数是否存在来识别小游戏：

| 能力 | 小程序 | 小游戏 |
|------|:------:|:------:|
| 全局异常、Promise rejection | 支持 | 支持 |
| 网络请求、离线缓存、设备信息 | 支持 | 支持 |
| 页面生命周期、路由、点击面包屑 | 支持 | 自动跳过 |
| SDK 初始化到首帧、FPS、jank | 不适用 | 首帧默认观察，FPS opt-in |

小游戏缺少页面 API 是运行时模型差异，不是接入失败。相关页面集成会安全 no-op，小游戏专属能力由 `minigameIntegration()` 和 `minigameFrameRateIntegration()` 提供。

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

## 验证范围

七平台能力 fixture 验证接口适配和缺失能力降级，不等于七平台真机认证。小程序无 ALS，仅承诺一个活动 tracing runtime；window 别名不代表具有 DOM。Performance observer／timeOrigin 缺失时省略相应 span，FPS 缺 rAF 时跳过。真实冻结、弱网、同意撤回和后台接收须按目标平台验收，见[2.0 迁移](/guide/migration-2.0)。
