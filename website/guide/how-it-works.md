# 工作原理

理解 SDK 怎么跑，能帮你更快定位「为什么没上报 / 堆栈对不上 / 上报率低」这类问题。本页讲设计，不讲调用方式；调用方式见[常用 API](/guide/api)，初始化选项见[配置项参考](/guide/configuration)。

## 为什么不能直接用 `@sentry/browser`

官方 Web SDK 依赖浏览器环境，而小程序**没有这些**：

- 没有 `window` / `document` / DOM；
- 没有 `fetch` / `XMLHttpRequest`——网络只能走各平台自己的请求 API（如 `wx.request` / `my.httpRequest`）；
- 是**双线程架构**（渲染层 + 逻辑层），错误监听、全局对象都和浏览器不一样。

所以 `@sentry/browser` 的传输层、全局错误钩子、DOM 录制在小程序里都用不了。`sentry-miniapp` 复用 Sentry 的**核心**（`@sentry/core`：事件模型、采样、scope、集成机制），只重写「与运行环境耦合」的那一层。

## 整体架构

```
你的业务代码
      │
      ▼
sentry-miniapp（init + 默认集成）
  ├─ 全局异常捕获      劫持 wx.onError / onUnhandledRejection ...
  ├─ 网络面包屑        包裹全局 request，记 url/method/状态码/耗时
  ├─ Source Map 归一化  把各平台虚拟路径重写为 app:///
  ├─ 性能 / 追踪        请求耗时记为 http.client span，注入 trace 头
  ├─ Logs              Sentry.logger.* 独立上报业务日志
  ├─ 合规门禁          requireConsent 下同意前只写本地缓冲、不发网络
  ├─ 离线缓存          发送失败写本地 Storage，恢复后重试
  └─ 平台 API 抹平层    wx / my / tt / dd / qq / swan / ks 差异统一
      │
      ▼
@sentry/core（事件构建、采样、scope、transport 接口）
      │
      ▼
自定义 transport（走平台 request/httpRequest 把 envelope 发到 Sentry）
```

## 关键机制

### 平台 API 抹平

各平台全局对象（`wx` / `my` / `tt` / `dd` / `qq` / `swan` / `ks`）和 API 命名、入参、返回结构都有差异（如支付宝是 `my.httpRequest`、状态码字段叫 `status`）。SDK 在初始化时检测平台并把它们代理成统一调用，上层逻辑只面向一套 API。差异细节见[跨平台差异与降级](/guide/platform-compatibility)。

### 全局异常捕获

`init` 时劫持平台的全局错误监听（`onError` / `onUnhandledRejection` / `onPageNotFound` / `onMemoryWarning`，存在才挂）。**所以 `init` 必须在 `App()` 之前执行**——晚了就漏掉启动阶段的异常。

> 注意：用 Vue（uni-app）时，组件内错误会被 Vue 自己的 `errorHandler` 接住、**不冒泡**到 `wx.onError`，需要手动把 Vue 的 `errorHandler` 接到 Sentry（这就是「上报率低」的常见根因）。详见 [uni-app 接入](/guide/uniapp)。

### 网络面包屑与追踪

默认包裹全局 `request` / `httpRequest`，把每个请求记成 `category: xhr` 的面包屑，随**下一个错误事件**一起上报（`uni.request` / `Taro.request` 最终也会走到对应小程序端的全局请求 API）。开启性能采样后，活跃 transaction 内的请求会记为 `http.client` 子 span。仅对 `tracePropagationTargets` 明确授权的域名注入 `sentry-trace` / `baggage`；需要 OpenTelemetry / W3C Trace Context 时再开启 `propagateTraceparent`。

### 多次初始化与全局 instrumentation

`request`、`Page`、`console` 等宿主全局函数由 SDK 的共享 instrumentation 层统一包装一次；每个 Sentry client 只注册自己的处理器。调用发生时只分发给当前 scope 绑定的 client，client 关闭时也只退订自己的处理器。因此在热更新、微前端容器或测试环境中发生重叠 `init()` 时，旧 client 的请求体采集 / 追踪白名单不会穿透到新 client，乱序 `close()` 也不会拆掉仍在工作的全局监控。平台提供独立 `on*` / `off*` 的监听和 Performance Observer 则由各 client 自己持有，并使用同样的当前-client 门禁。

业务代码仍应在启动阶段只初始化一次；上述隔离用于保证重入和清理安全，不是鼓励为同一个小程序长期维护多个并行 client。

### Logs 与合规门禁

`Sentry.logger.*` 产生独立的 log envelope，用于业务日志查询、聚合和告警；`enableConsoleBreadcrumbs` 只会把 `console` 输出作为面包屑挂到下一次事件，两者用途不同。

开启 `requireConsent` 后，SDK 仍会采集异常、面包屑、性能和日志，但在 `Sentry.setConsent(true)` 前不会发送任何 Sentry 网络请求，事件先进入本地缓冲；同意后再补发，并恢复正常上报。

### Source Map 路径归一化

小程序错误栈里的文件路径是各平台虚拟路径（如微信 `appservice/pages/index.js`、抖音小游戏 `tt://main/index.js`、Cocos `chunks:///_virtual/runtime.js`）。`RewriteFrames` 集成在上报前把它们统一重写为 `app:///` 前缀。SDK 还会兼容 Debug ID map 被注入到非 `globalThis` 全局对象的小游戏场景；私有引擎或特殊堆栈格式可通过 `stackParser` 覆盖默认解析器。真机上微信可能把逻辑层合并成 `appservice.app.js`，详见 [Source Map 进阶与排障](/guide/sourcemap-advanced)。

### 弱网离线缓存

小程序网络不稳定。发送失败的事件会写入本地 Storage，网络恢复后静默重试，避免丢数据（缓存条数 / 过期时间可配）。

## 端到端数据流

```
运行时发生错误
      ↓
SDK 捕获 → RewriteFrames 归一化堆栈为 app:///
      ↓
@sentry/core 构建事件、按 sampleRate 采样、过 beforeSend
      ↓
自定义 transport 经平台 request/httpRequest 发 envelope（失败则进离线缓存）
      ↓
Sentry 收到 → 用 app:/// 前缀匹配 Source Map → 展示源码位置
```

## 下一步

- [常用 API](/guide/api) · [配置项参考](/guide/configuration) · [支持范围](/guide/platforms) · [Source Map 上线指南](/guide/sourcemap)
