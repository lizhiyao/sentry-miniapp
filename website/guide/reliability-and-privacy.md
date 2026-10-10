# 可靠上报与隐私同意

小程序可能在弱网、断网或授权弹窗出现前产生事件。SDK 用一层 core offline 管道处理弱网与同意等待；两种状态共享一个有界容器，不是两套独立重试引擎。

## 两种缓冲分别解决什么

| 能力 | 什么时候进入缓冲 | 什么时候补发 | 默认状态 |
|------|------------------|--------------|----------|
| 弱网离线缓存 | Sentry 请求发送失败或当前离线 | 网络恢复后自动重试 | 开启 |
| 隐私同意门禁 | 开启 `requireConsent` 后，用户尚未同意 | 调用 `setConsent(true)` 后 | 关闭，按需开启 |

未启用 `requireConsent` 时，内置弱网缓存使用 `offlineCache*` 配置。开启后，同意等待与授权后的弱网重试始终共用 `consentCache*` 上限，并优先保留最早记录；授权不会切换为 `offlineCache*`。

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

当宿主网络槽满时，新请求进入 miniapp transport 队列，实际出队再次检查 consent／lifetime。core promise buffer 的在途容量另有上限；其溢出记为 queue_overflow，不等同于宿主并发排队。通常保持较短超时和较小并发。

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

符合存储策略的失败 envelope 会写入 Storage；网络恢复或后续 flush 唤醒重放。记录保留原始时间，retry 不续 TTL；client_report 失败不落盘。写入失败有诊断，不冒称持久化成功。

离线重试与同意等待共用一个缓存，按当前 Sentry 投递目标保存数据。SDK 将包含元数据的整个容器限制在支付宝／钉钉 180 KiB、其余平台 900 KiB 以内；这是 SDK 的保守预算，详见[跨平台 Storage 差异](/guide/platform-compatibility#storage-与离线缓存)。更换 DSN／tunnel、读取旧格式或使用不兼容的隐私／存储策略时，会丢弃旧数据并记录诊断；只调整容量或过期时间时，会裁剪仍兼容的记录。

重放前需要从缓存移除记录；删除保存失败时，该记录不会发送。移除成功后若进程中断，记录仍可能丢失。限流、容量淘汰、关闭和存储故障也可能丢弃数据，因此缓存只能尽力补发，不能保证不丢失、不重复或后台接收成功。

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

之后的新数据不发 Sentry 网络，排队请求不得启动；在途请求在宿主提供能力时 abort。`Sentry.getConsent()` 读取当前 client 状态；未启用 requireConsent 时恒为 true。缺 Storage 可降级为有界内存；条数／字节上限为 0 时不缓存。

> `requireConsent` 是网络发送门禁，不是采样开关。要减少上报量，请配置 `sampleRate`、`tracesSampleRate` 或过滤规则。

## 开启同意门禁后的缓存上限

同意等待期可能比短时断网更长，因此默认允许缓存更多记录。这组上限在授权后的弱网重试中继续生效，丢弃时也会调用 `onConsentCacheDrop`：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  requireConsent: true,
  consentCacheLimit: 100,
  consentCacheMaxBytes: 900 * 1024, // 配置上限；支付宝／钉钉实际最多 180 KiB
  consentCacheMaxAge: 24 * 60 * 60 * 1000,
  onConsentCacheDrop({ reason, dropped }) {
    console.warn('Sentry consent cache dropped', reason, dropped);
  },
});
```

当前同意缓冲与弱网缓存使用同一个 Storage key。`consentCacheMaxBytes` 默认是 921600 字节（900 KiB），实际取配置值与平台 SDK 预算中的较小值：支付宝／钉钉为 184320 字节（180 KiB），其余平台为 921600 字节（900 KiB）。增加配置不能突破平台预算；容器元数据也计入预算，能保留多少条事件还取决于单条数据大小。

条数按 envelope（一次上报批次）计算，一条记录可能包含多条日志、指标或 span。撤回授权或关闭 client 不会自动清空已保存的记录；它们仍受缓存容量与过期时间限制，重新初始化的 client 也不会继承旧授权。

使用自定义 `transport` 时，未开启 `requireConsent` 的缓存与重试由该实现负责；开启后，SDK 会统一处理同意等待和离线缓存，即使 `enableOfflineCache: false`。自定义通道应避免重复添加离线重试，并自行控制内部队列的实际发送与取消。常规接入使用 `Sentry.init()`；直接构造 `MiniappClient` 不会接管持久缓存重放。实现职责见仓库[架构说明](https://github.com/lizhiyao/sentry-miniapp/blob/master/ARCHITECTURE.md)。

## 上线前怎样验证

1. 清空本地 Storage，重新启动应用且暂不点击同意。
2. 主动调用 `captureException`，确认没有 Sentry 网络请求。
3. 检查平台 Storage 中出现缓冲数据。
4. 调用 `setConsent(true)`，确认缓冲事件被补发并能在 Sentry 中看到。
5. 断网再触发一个事件，恢复网络后确认弱网缓存也能补发。
6. 打印 `getDiagnostics()`，检查 consent、离线缓存和 warnings 是否符合预期。

合规要求会因应用、地区和数据类型而异。SDK 只提供技术门禁，项目仍需根据自己的隐私政策决定何时初始化、采集哪些字段以及何时调用 `setConsent(true)`。

完整参数见[配置项参考 · 离线缓存](/guide/configuration#离线缓存-弱网可靠性)和[配置项参考 · 隐私合规](/guide/configuration#隐私合规-同意后上报)。
