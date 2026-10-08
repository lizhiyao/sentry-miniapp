# 常用 API

`sentry-miniapp` 直接导出常用的 `@sentry/core` API，并补充小程序专属的初始化、隐私同意、诊断和反馈能力。建议统一使用命名空间导入：

```js
import * as Sentry from 'sentry-miniapp';
```

本页用于快速查找常用调用。初始化参数的类型、默认值和完整说明见[配置项参考](/guide/configuration)。

## 初始化与状态

| API | 用途 |
|-----|------|
| `init(options)` | 初始化 SDK，返回当前 `MiniappClient`；不在支持的小程序运行时中返回 `undefined` |
| `isEnabled()` | 判断当前 client 是否可发送事件 |
| `getClient()` | 读取当前 client |
| `flush(timeout?)` | 等待待发送事件完成，适合应用即将退出前 |
| `close(timeout?)` | flush 后关闭 client |
| `lastEventId()` | 获取最近一次捕获事件的 id |

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});
```

## 捕获事件

| API | 适合场景 | 返回值 |
|-----|----------|--------|
| `captureException(error)` | 异常对象或未知错误值 | event id |
| `captureMessage(message, level?)` | 没有异常对象的业务告警 | event id |
| `captureEvent(event)` | 需要完全控制事件结构的高级场景 | event id |
| `captureFeedback(params)` | 原生反馈表单提交的用户反馈 | event id |

```js
Sentry.captureException(new Error('payment failed'));
Sentry.captureMessage('库存接口已降级', 'warning');
```

小程序不能使用浏览器 HTML `showReportDialog`。请自行实现原生表单，并调用：

```js
Sentry.captureFeedback({
  message: '页面一直处于加载状态',
  name: '用户昵称',
  email: 'user@example.com',
  associatedEventId: Sentry.lastEventId(),
  tags: { page: 'checkout' },
});
```

## 用户与上下文

| API | 用途 |
|-----|------|
| `setUser(user)` | 关联或清除当前用户 |
| `setTag(key, value)` / `setTags(tags)` | 添加可筛选标签，**只附在事件上**（core 11 的 span 不携带 tags） |
| `setAttribute(key, value)` / `setAttributes(attrs)` | 写在隔离作用域上的属性，会同时附到 streamed span、logs 与 metrics；需要让字段在 Performance / Traces 里可见时用它 |
| `setContext(name, context)` | 添加一组结构化上下文 |
| `setExtra(key, value)` / `setExtras(extras)` | 添加辅助调试数据 |
| `addBreadcrumb(breadcrumb)` | 记录用户操作或业务步骤 |

```js
Sentry.setUser({ id: 'user_123' });
Sentry.setTags({ channel: 'wechat', plan: 'pro' });
Sentry.setContext('order', { orderId: 'order_456', itemCount: 3 });
Sentry.addBreadcrumb({ category: 'checkout', message: '用户确认支付' });
```

`addBreadcrumb` 不会单独发送事件，只随下一次异常或消息一起发送。上下文使用方法与脱敏建议见[异常、日志与上下文](/guide/errors-and-context)。

## 临时作用域

使用 `withScope` 只给一次操作附加数据，避免污染后续事件：

```js
Sentry.withScope(scope => {
  scope.setTag('operation', 'coupon.apply');
  scope.setContext('coupon', { couponId: 'coupon_123' });
  Sentry.captureException(error);
});
```

高级场景还可使用 `getCurrentScope()`、`getIsolationScope()`、`getGlobalScope()`（对所有事件生效）和 `addEventProcessor()`。

## Logs

2.0 按 logger 调用采集，无需 enableLogs；使用 beforeSendLog 过滤或停止调用以抑制日志：

```js
Sentry.logger.trace('cache lookup', { key: 'profile' });
Sentry.logger.debug('feature decision', { variant: 'B' });
Sentry.logger.info('checkout completed', { orderId: 'order_456' });
Sentry.logger.warn('api degraded', { service: 'inventory' });
Sentry.logger.error('payment retry failed', { attempt: 3 });
Sentry.logger.fatal('bootstrap unavailable');
```

这些日志会作为独立 log 发送，不等同于 console 面包屑。

## Metrics

业务显式调用 core 的 metrics API，按需提供单位和有限维度；SDK 不默认采集 memory 或建立第二套聚合引擎：

```js
Sentry.metrics.count('checkout.completed', 1, { attributes: { channel: 'miniapp' } });
Sentry.metrics.distribution('checkout.duration', 250, { unit: 'millisecond' });
Sentry.metrics.gauge('cart.items', 3);
```

使用 `beforeSendMetric` 过滤或修改，core 负责缓冲与批处理。与 Logs 一样，需要分别验证目标后台接收；应用退后台的同步 flush 不证明所有数据已送达。避免将订单号、用户标识等高基数或敏感值用作自动维度。

## 性能 API

| API | 用途 |
|-----|------|
| `startSpan(options, callback)` | 测量一个有明确回调生命周期的操作 |
| `startInactiveSpan(options)` | 创建需要手动结束的 span |
| `spanStreamingIntegration()` | core 11 的 span 批量发送集成；已在默认集成中，仅当你自定义 `defaultIntegrations` 时需要手动加入 |
| `startSpanManual(options, callback)` | callback 接收 span 与 end 回调 |
| `withActiveSpan(span, callback)` | 在同步范围绑定活跃 span |
| `continueTrace(options, callback)` / `startNewTrace(callback)` | 显式延续或开始 trace |
| `getTraceData()` | 获取当前追踪传播数据 |
| `getPerformanceManager()` | 读取宿主小程序 Performance API 适配对象，可能为 `null` |

```js
const result = await Sentry.startSpan(
  { name: 'checkout.submit', op: 'ui.action' },
  () => submitOrder(),
);
```

使用前应开启 `tracesSampleRate` 或 `tracesSampler`。详见[性能与链路追踪](/guide/performance-and-tracing)。

## 隐私同意与诊断

| API | 用途 |
|-----|------|
| `setConsent(true)` | 放行发送并补发同意前缓冲 |
| `setConsent(false)` | 重新阻止 Sentry 网络请求，后续事件进入缓冲 |
| `getConsent()` | 读取当前同意状态 |
| `getDiagnostics()` | 获取脱敏后的平台、配置、集成、transport 与 warning 摘要 |

```js
Sentry.init({ dsn: 'YOUR_DSN', requireConsent: true });

// 用户完成隐私授权后
Sentry.setConsent(true);

console.log(Sentry.getDiagnostics());
```

诊断信息不会发送事件，也不会暴露完整 DSN。提交 Issue 时建议附上脱敏后的输出。

## 集成与高级扩展

| API / 导出 | 用途 |
|------------|------|
| `getDefaultIntegrations(options?)` | 根据初始化选项获取一份新的完整默认集成列表 |
| `addIntegration(integration)` | 初始化后追加集成 |
| `Integrations` | 小程序集成命名空间 |
| `Transports` | 内置 transport 与离线 store 命名空间 |
| `miniappStackParser` | 默认小程序堆栈解析器 |
| `wrap(fn)` | 包裹函数，捕获后继续抛出异常 |

2.0 的顶层与 `Integrations` namespace 仅提供同一组 named factories，删除公共 class 与共享默认数组。迁移清单见[升级到 2.0](/guide/migration-2.0)。

`integrations` 数组会追加到默认集合，同名时用户实例优先。显式启用可选性能集成时无需手动展开默认集合：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  integrations: [
    Sentry.performanceIntegration({
      enableNavigation: true,
      enableRender: true,
      enableResource: true,
      enableUserTiming: true,
    }),
  ],
});
```

需要删除某个默认集成时，传入函数并返回修改后的集合；需要完全关闭默认集合时，使用 `defaultIntegrations: false`。这与 Sentry 官方 JavaScript SDK 的配置语义一致。

自定义 transport、集成或 `stackParser` 会扩大维护范围，只有默认能力无法覆盖目标运行时时再使用。相关配置见[配置项参考 · 集成](/guide/configuration#集成)与 [Source Map 进阶](/guide/sourcemap-advanced#debug-id-与自定义-stackparser)。

## Session API

SDK 默认启用自动 Session Tracking，大多数项目不需要手动管理。确实需要时仍可使用 `startSession`、`endSession`、`captureSession`，以及底层的 `makeSession`、`updateSession`、`closeSession`。

不确定某个 API 是否适合当前问题时，先从[能力指南](/guide/errors-and-context)按任务选择，避免为了调用 API 而关闭默认自动能力。
