# 异常、日志与上下文

把错误发进 Sentry 只是第一步。真正能缩短排查时间的是：自动捕获没有被业务代码处理的异常，并在事件上附带用户、页面、操作和网络上下文。

## 默认会捕获什么

`Sentry.init()` 会按宿主实际提供的能力注册监听，不需要在每个 `onError` 中重复调用 `captureException`。

| 信号 | 默认行为 | 缺少宿主 API 时 |
|------|----------|-----------------|
| 未处理 JavaScript 异常 | 监听平台 `onError` | 跳过，可继续手动捕获 |
| 未处理 Promise rejection | 监听 `onUnhandledRejection` | 跳过对应监听 |
| 页面不存在 | 监听 `onPageNotFound` | 跳过对应监听 |
| 内存告警 | 监听 `onMemoryWarning` | 跳过对应监听 |
| 定时器回调异常 | 默认 TryCatch 集成包裹 | 不影响其它捕获能力 |

初始化必须尽可能早。原生小程序应在入口文件顶部、`App()` 之前执行；小游戏应放在游戏入口最前面。

> Taro / uni-app 的组件错误可能先被 React 或 Vue 接住，不再冒泡到宿主全局监听。请分别按照 [Taro 错误边界](/guide/taro#_4-组件错误-用-react-错误边界)或 [uni-app errorHandler](/guide/uniapp#_3-main-js-尽早初始化-接-vue-errorhandler-关键) 接入。

## 主动上报已处理的问题

当业务代码已经捕获异常，但仍希望记录到 Sentry 时，主动调用上报 API：

```js
try {
  await submitOrder();
} catch (error) {
  Sentry.captureException(error);
  showRetryMessage();
}

Sentry.captureMessage('库存接口连续降级', 'warning');
```

不要在平台全局 `onError` 中再次上报同一个错误，否则可能与 SDK 自动捕获产生重复事件。

## 给事件补充排查上下文

### 用户、标签与业务数据

```js
Sentry.setUser({ id: 'user_123' });
Sentry.setTag('miniapp.channel', 'wechat-search');
Sentry.setContext('order', {
  orderId: 'order_456',
  paymentMethod: 'balance',
});
```

- `setUser`：关联当前用户，退出登录后可用 `Sentry.setUser(null)` 清除。
- `setTag` / `setTags`：适合可筛选、可聚合的短值。
- `setContext` / `setExtra`：适合辅助理解问题的结构化数据。

不要写入密码、访问令牌、完整身份证号等敏感信息。需要全局脱敏时使用 `beforeSend`。

### 面包屑

SDK 默认记录页面生命周期、点击 / 触摸和网络请求摘要。业务关键动作可以手动补充：

```js
Sentry.addBreadcrumb({
  category: 'checkout',
  message: '用户确认支付',
  level: 'info',
  data: { orderId: 'order_456' },
});
```

`addBreadcrumb` **不会单独发送网络请求**。它只会随下一次异常或消息事件一起发送，因此不能用它验证接入是否成功。

网络面包屑默认包含 URL、方法、状态码和耗时，不记录请求体与响应体。确实需要 body 时再开启 `traceNetworkBody`，并通过 `beforeBreadcrumb` 删除敏感字段。

## 独立业务日志

需要在 Sentry Logs 中单独检索、聚合或告警时，开启 Logs：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  enableLogs: true,
});

Sentry.logger.info('checkout completed', {
  orderId: 'order_456',
  durationMs: 380,
});
```

| 方式 | 是否独立发送 | 适合用途 |
|------|:------------:|----------|
| `Sentry.logger.*` | 是 | 业务日志查询、聚合、告警 |
| `console.*` + `enableConsoleBreadcrumbs` | 否 | 随错误还原附近的控制台输出 |
| `addBreadcrumb` | 否 | 描述用户操作与业务步骤 |

可用级别为 `trace`、`debug`、`info`、`warn`、`error`、`fatal`。用 `beforeSendLog` 修改或丢弃不应发送的日志。

## 收集用户反馈

小程序没有浏览器 DOM，不能使用 Sentry 默认 HTML 反馈弹窗。请用原生组件实现表单，再提交数据：

```js
const eventId = Sentry.lastEventId();

Sentry.captureFeedback({
  message: '点击支付后页面一直加载',
  name: '用户昵称',
  associatedEventId: eventId,
  tags: { page: 'checkout' },
});
```

`showReportDialog` 仅为兼容旧代码保留，当前会提示弃用且不会展示界面。

## 控制噪声与敏感数据

优先使用声明式过滤；需要按业务逻辑处理时再使用钩子：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  ignoreErrors: [/request:fail abort/i],
  denyUrls: [/vendor\/unstable-plugin/],
  beforeSend(event) {
    if (event.user) delete event.user.email;
    return event;
  },
});
```

完整过滤项与钩子签名见[配置项参考 · 过滤与钩子](/guide/configuration#过滤与钩子)。

## 验证清单

1. 主动调用一次 `captureException`，确认 Sentry Issues 中出现事件。
2. 检查事件是否包含 release、environment、用户、标签和预期面包屑。
3. 在框架组件内主动抛错，确认 React Error Boundary 或 Vue errorHandler 生效。
4. 开启 Logs 后发送一条 `logger.info`，到 Sentry Logs 单独确认。
5. 真机与开发者工具都验证一次；宿主监听和网络行为可能不同。

接下来可查看[常用 API](/guide/api)、[性能与链路追踪](/guide/performance-and-tracing)或[常见问题](/guide/faq)。
