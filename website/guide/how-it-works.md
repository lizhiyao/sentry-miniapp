# 工作原理

理解 SDK 怎么跑，能帮你更快定位「为什么没上报 / 堆栈对不上 / 上报率低」这类问题。本页讲设计，不讲 API（API 见[配置项参考](/guide/configuration)）。

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

各平台全局对象（`wx` / `my` / `tt` / `dd` / `qq` / `swan` / `ks`）和 API 命名、入参、返回结构都有差异（如支付宝是 `my.httpRequest`、状态码字段叫 `status`）。SDK 在初始化时检测平台并把它们代理成统一调用，上层逻辑只面向一套 API。差异细节见[多端兼容性报告](https://github.com/lizhiyao/sentry-miniapp/blob/master/docs/MultiPlatformCompatibilityReport.md)。

### 全局异常捕获

`init` 时劫持平台的全局错误监听（`onError` / `onUnhandledRejection` / `onPageNotFound` / `onMemoryWarning`，存在才挂）。**所以 `init` 必须在 `App()` 之前执行**——晚了就漏掉启动阶段的异常。

> 注意：用 Vue（uni-app）时，组件内错误会被 Vue 自己的 `errorHandler` 接住、**不冒泡**到 `wx.onError`，需要手动把 Vue 的 `errorHandler` 接到 Sentry（这就是「上报率低」的常见根因）。详见 [uni-app 接入](/guide/uniapp)。

### 网络面包屑与追踪

默认包裹全局 `request` / `httpRequest`，把每个请求记成 `category: xhr` 的面包屑，随**下一个错误事件**一起上报（`uni.request` / `Taro.request` 最终也会走到对应小程序端的全局请求 API，无需额外配置）。开启 `tracesSampleRate` 后，请求耗时还会作为 `http.client` span，并注入 `sentry-trace` / `baggage` 头串联后端；需要接入 OpenTelemetry / W3C Trace Context 时，可再开启 `propagateTraceparent` 追加 `traceparent` 头。

### Source Map 路径归一化

小程序错误栈里的文件路径是各平台虚拟路径（如微信 `appservice/pages/index.js`）。`RewriteFrames` 集成在上报前把它们统一重写为 `app:///` 前缀，这样你只需用 `--url-prefix "app:///"` 上传一次 Source Map 就能匹配。**真机上微信可能把逻辑层合并成单个 `appservice.app.js`**，这是另一种情况——见 [Source Map 配置](/guide/sourcemap)。

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

- [配置项参考](/guide/configuration) · [支持平台与能力](/guide/platforms) · [Source Map 配置](/guide/sourcemap)
