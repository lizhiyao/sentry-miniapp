# 从 1.18 升级到 1.19

1.19 不删除 1.x 已公开的初始化 API，但会把默认集成、事件字段和 tracing 行为对齐
Sentry JavaScript SDK。大多数只调用 `Sentry.init({ dsn, release })` 的项目无需修改业务代码；
依赖旧的集成装配方式、追踪头默认值或事件字段查询时，需要按本页调整。

## 升级前必须检查

### 显式配置追踪目标

`tracePropagationTargets` 默认为空时，1.19 不再向任意业务请求注入
`sentry-trace`、`baggage` 或 `traceparent`。需要串联后端链路的项目必须只加入自己控制的 API：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  tracePropagationTargets: [
    'https://api.example.com',
    /^https:\/\/gateway\.example\.com\//,
  ],
});
```

这项默认值变化会让未配置白名单的分布式链路停止串联，但不会影响业务请求本身，也不会关闭
错误上报或网络面包屑。

### 更新 integration 配置语义

`integrations` 数组现在追加到默认集合，并由同名用户实例覆盖默认实例；函数形式接收默认集合并
返回最终集合。过去依赖 `integrations: [...]` 隐式关闭默认集成的项目，应显式配置：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  defaultIntegrations: false,
  integrations: [Sentry.Integrations.globalHandlersIntegration()],
});
```

每次 `init()` 都应创建新的有状态 integration 实例。不要跨多次初始化复用
`Sentry.defaultIntegrations` 或缓存后的 `Sentry.getDefaultIntegrations()` 结果：

```js
// 推荐：省略 defaultIntegrations，SDK 会在每次 init 时创建新实例
Sentry.init({
  dsn: 'YOUR_DSN',
});
```

`Sentry.defaultIntegrations` 仅为 1.x 源码兼容保留，已弃用。旧的
`new Sentry.Integrations.Dedupe({ fuzzyMatch: true })` 仍可使用；新代码应使用
`Sentry.Integrations.dedupeIntegration()`。

### 更新 Sentry 查询和告警字段

1.19 对齐以下字段语义：

- 顶层 `event.platform` 固定为 `javascript`；微信、支付宝、字节跳动、百度、QQ、钉钉、快手等
  真实宿主位于 `contexts.miniapp.platform`。
- `contexts.app.app_version` 表示小程序自身版本，`app_identifier` 表示 AppID。
- 宿主客户端和基础库版本位于 `contexts.miniapp.host_version` 与
  `contexts.miniapp.host_sdk_version`。
- `event.sdk.packages` 使用规范包名 `npm:sentry-miniapp`。

如果面板、Discover 查询或告警规则仍筛选旧的顶层平台或 app 版本含义，请在升级前迁移。

## 性能与错误数据变化

- 普通 API 请求只在已有活跃 transaction 时创建 `http.client` 子 span，不再为每个孤立请求
  创建根 transaction。需要追踪业务流程时，用 `Sentry.startSpan()` 包裹该流程。
- Performance API 条目会转换为 Unix epoch 时间，并丢弃明显过旧、未来或异常的宿主时间值。
- 定时器和 `requestAnimationFrame` 回调中的异常捕获后仍会重新抛出，因此 mechanism 记为
  `handled: false`。升级后 crash-free 指标或相关告警可能出现一次符合真实语义的变化。
- 异常构建、LinkedErrors、Dedupe、RewriteFrames 与反馈事件使用 `@sentry/core` 官方实现；少量
  Issue 可能因更规范的堆栈或异常链重新分组。

## 推荐验证

先在测试环境或预发布版本中将 SDK 升级到 1.19，并至少完成：

1. 主动发送一个错误，确认 `platform`、`contexts.miniapp`、`contexts.app` 和 Source Map 正确。
2. 触发平台全局错误与 Promise rejection，确认没有重复事件。
3. 发起成功和失败的 API 请求，确认业务参数未被修改、网络面包屑存在，且追踪头只发往白名单。
4. 在 `Sentry.startSpan()` 内发起请求，确认服务端链路能够串联。
5. 执行一次 `close()` 后重新 `init()`，确认错误、页面和网络监听仍生效。
6. 小游戏项目额外验证冷启动、前后台切换、FPS 与 jank；普通小程序确认这些能力保持 no-op。

微信、支付宝和字节跳动建议至少各完成一次真机验证。百度、QQ、钉钉和快手走相同的跨端抽象与
降级路径，但正式上线前仍应在实际目标宿主做一次冒烟测试。
