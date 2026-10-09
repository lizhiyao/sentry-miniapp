# 工作原理

理解 SDK 怎么跑，能帮你更快定位「为什么没上报 / 堆栈对不上 / 上报率低」这类问题。本页讲设计，不讲调用方式；调用方式见[常用 API](/guide/api)，初始化选项见[配置项参考](/guide/configuration)。

## 为什么不能直接用 `@sentry/browser`

官方 Web SDK 依赖浏览器环境，而小程序**没有这些**：

- 没有可依赖的浏览器 DOM／`document`；部分宿主提供 `window` 别名，但它不代表浏览器能力；
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
  ├─ 同意门禁          requireConsent 下同意前不发网络，有界缓存可降级或丢弃
  ├─ 离线缓存          官方 offline 管道 + 单目标 typed Storage，best-effort 重试
  └─ 平台 API 抹平层    wx / my / tt / dd / qq / swan / ks 差异统一
      │
      ▼
@sentry/core（事件构建、采样／DSC、scope、span／Logs／metrics 批处理）
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

默认包裹全局 `request` / `httpRequest`，把每个请求记成 `category: xhr` 的面包屑，随**下一个错误事件**一起上报（`uni.request` / `Taro.request` 最终也会走到对应小程序端的全局请求 API）。开启性能采样后，请求在活跃 span 内记为 `http.client` 子 span，没有父级时记为独立 segment span；该采集不依赖宿主 `PerformanceObserver`。仅对 `tracePropagationTargets` 明确授权的域名注入 `sentry-trace` / `baggage`；需要 OpenTelemetry / W3C Trace Context 时再开启 `propagateTraceparent`。

### 多次初始化与全局 instrumentation

`request`、`Page`、`console` 等宿主全局函数由 SDK 的共享 instrumentation 层统一包装一次；每个 Sentry client 只注册自己的处理器。调用发生时只分发给当前 scope 绑定的 client，client 关闭时也只退订自己的处理器。因此在热更新、微前端容器或测试环境中发生重叠 `init()` 时，旧 client 的请求体采集 / 追踪白名单不会穿透到新 client，乱序 `close()` 也不会拆掉仍在工作的全局监控。平台提供独立 `on*` / `off*` 的监听和 Performance Observer 则由各 client 自己持有，并使用同样的当前-client 门禁。

业务代码仍应在启动阶段只初始化一次；上述隔离用于保证重入和清理安全，不是鼓励为同一个小程序长期维护多个并行 client。

性能追踪仅支持一个当前使用的 client。小程序的异步上下文能力有限：多个任务并行跨越 `await` 时，不能保证各自的请求仍关联到原来的父 span。需要页面或网络类型等属性时，在创建业务 span 时显式传入；SDK 会补充设备和应用版本等稳定信息。

### 数据处理与发送

SDK 采集小程序数据后，由 `@sentry/core` 处理事件、采样和批量发送。错误事件的 processors／`beforeSend`、日志的 `beforeSendLog` 等钩子可在发送前修改或丢弃数据，见[配置项参考](/guide/configuration)。

性能数据由默认的 `SpanStreaming` 集成批量发送。自定义 `defaultIntegrations` 时需保留 `spanStreamingIntegration()`，否则请求和业务操作的性能数据都无法发送；`Sentry.getDiagnostics()` 会提示缺失的集成。

### Logs 与合规门禁

`Sentry.logger.*` 产生独立的 log envelope，用于业务日志查询、聚合和告警；`enableConsoleBreadcrumbs` 只会把 `console` 输出作为面包屑挂到下一次事件，两者用途不同。

开启 `requireConsent` 后，SDK 仍会按配置采集遥测，但在 `Sentry.setConsent(true)` 前不会发送 Sentry 网络请求。有界缓存中的有效记录可在同意后补发；零容量、过期、存储故障或目标／不兼容策略变化可能丢弃记录。缺少 Storage 时可降级到内存，不能承诺跨进程保留。撤回同意后，排队请求不得开始；在途请求的取消取决于宿主能力。

### Source Map 路径归一化

小程序错误栈里的文件路径是各平台虚拟路径（如微信 `appservice/pages/index.js`、抖音小游戏 `tt://main/index.js`、Cocos `chunks:///_virtual/runtime.js`）。`RewriteFrames` 集成在上报前把它们统一重写为 `app:///` 前缀。SDK 还会兼容 Debug ID map 被注入到非 `globalThis` 全局对象的小游戏场景；私有引擎或特殊堆栈格式可通过 `stackParser` 覆盖默认解析器。真机上微信可能把逻辑层合并成 `appservice.app.js`，详见 [Source Map 进阶与排障](/guide/sourcemap-advanced)。

### 弱网离线缓存

小程序网络不稳定。SDK 复用 core 的 offline 管道，在符合重试与缓存条件时写入单目标 Storage，恢复后尝试补发；HTTP 响应、限流、存储故障和关闭有各自处理边界，不是所有失败都会入库。缓存受容量与 TTL 限制，读取时先持久提交删除，再交给 transport，因此仍可能丢失，不承诺 durable ACK 或恰好一次。详见[可靠性与隐私](/guide/reliability-and-privacy)。

## 端到端数据流

```
运行时发生错误
      ↓
SDK 平台错误适配 → core 构建事件、合并 scope
      ↓
client／scope processors（含 RewriteFrames）→ normalize → beforeSend → session 更新／错误采样
      ↓
core envelope → 同意／生命周期门禁 → offline／宿主 transport（按缓存条件处理失败）
      ↓
Sentry 收到 → 匹配实际 frame、同次构建的 JS／map 与 Debug ID 或 release → 展示源码位置
```

## 下一步

- [常用 API](/guide/api) · [配置项参考](/guide/configuration) · [支持范围](/guide/platforms) · [Source Map 上线指南](/guide/sourcemap)
