# 可靠上报与隐私同意

小程序可能在弱网、断网或授权弹窗出现前产生事件。SDK 提供两种本地缓冲，但它们解决的问题不同。

## 两种缓冲分别解决什么

| 能力 | 什么时候进入缓冲 | 什么时候补发 | 默认状态 |
|------|------------------|--------------|----------|
| 弱网离线缓存 | Sentry 请求发送失败或当前离线 | 网络恢复后自动重试 | 开启 |
| 隐私同意门禁 | 开启 `requireConsent` 后，用户尚未同意 | 调用 `setConsent(true)` 后 | 关闭，按需开启 |

它们复用平台 Storage 和离线 transport，但策略与上限可以分别配置。

## 不让监控请求占满业务并发

小程序宿主会限制同时进行的网络请求数。内置 transport 默认只允许最多 `2` 个 Sentry 请求同时在途，并把单次上报超时设为 `3000ms`：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  transportOptions: {
    requestTimeout: 3000,
    maxConcurrentRequests: 2,
  },
});
```

Sentry 服务不可达或长时间无响应时，SDK 除了把超时传给平台请求 API，还会启动自己的计时器；到时会主动调用宿主 `RequestTask.abort()`（宿主提供该能力时），尽快释放网络槽位。发送失败的事件随后进入离线缓存，等待网络恢复后重试。

当已有 `2` 个 Sentry 请求未结束时，新事件会先在 `@sentry/core` 的有界缓冲中等待；只有缓冲也达到上限时才会记为 `queue_overflow` 并丢弃。这样既优先保障正常业务请求，也能承接短时间的 Sentry 上报峰值。可以通过 `transportOptions` 调整超时和网络并发，但通常应保持较短超时和较小并发。

## 弱网离线缓存

默认配置已经适合大多数项目：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  enableOfflineCache: true,
  offlineCacheLimit: 30,
  offlineCacheMaxAge: 24 * 60 * 60 * 1000,
});
```

发送失败的事件会写入本地 Storage；网络恢复或后续 flush 时静默重试。超过条数或有效期的事件会被淘汰，避免长期占用用户存储空间。

如果宿主缺少必要的 Storage API，SDK 仍可初始化并尝试实时上报，但持久化重试会降级。可通过 `Sentry.getDiagnostics()` 查看 transport 状态。

## 用户同意前不发送 Sentry 网络

需要先取得隐私授权的项目，在初始化时开启门禁：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  requireConsent: true,
});
```

这时 SDK 仍会监听异常、记录面包屑和构建事件，但在用户同意前不会向 Sentry 发请求，事件先写入本地缓冲。

用户明确同意后调用：

```js
Sentry.setConsent(true);
```

SDK 会开始补发同意前的缓冲事件，并恢复后续实时上报。用户撤回同意时可调用：

```js
Sentry.setConsent(false);
```

之后的新事件会再次只进入本地缓冲，不发 Sentry 网络。`Sentry.getConsent()` 可读取当前状态；没有开启 `requireConsent` 时恒为 `true`。

> `requireConsent` 是网络发送门禁，不是采样开关。要减少上报量，请配置 `sampleRate`、`tracesSampleRate` 或过滤规则。

## 控制同意前缓冲上限

同意等待期可能比短时断网更长，因此默认允许缓存更多事件：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  requireConsent: true,
  consentCacheLimit: 100,
  consentCacheMaxBytes: 900 * 1024,
  consentCacheMaxAge: 24 * 60 * 60 * 1000,
  onConsentCacheDrop({ reason, dropped }) {
    console.warn('Sentry consent cache dropped', reason, dropped);
  },
});
```

当前同意缓冲与弱网缓存使用同一个 Storage key。受部分小程序单 key 容量限制影响，`consentCacheMaxBytes` 不建议超过默认约 900KB。

传入自定义 `transport` 时，SDK 仍会在外层应用 consent 门禁；开启 `requireConsent` 也会隐含启用同意前缓冲，即使 `enableOfflineCache` 设置为 `false`。

## 上线前怎样验证

1. 清空本地 Storage，重新启动应用且暂不点击同意。
2. 主动调用 `captureException`，确认没有 Sentry 网络请求。
3. 检查平台 Storage 中出现缓冲数据。
4. 调用 `setConsent(true)`，确认缓冲事件被补发并能在 Sentry 中看到。
5. 断网再触发一个事件，恢复网络后确认弱网缓存也能补发。
6. 打印 `getDiagnostics()`，检查 consent、离线缓存和 warnings 是否符合预期。

合规要求会因应用、地区和数据类型而异。SDK 只提供技术门禁，项目仍需根据自己的隐私政策决定何时初始化、采集哪些字段以及何时调用 `setConsent(true)`。

完整参数见[配置项参考 · 离线缓存](/guide/configuration#离线缓存-弱网可靠性)和[配置项参考 · 隐私合规](/guide/configuration#隐私合规-同意后上报)。
