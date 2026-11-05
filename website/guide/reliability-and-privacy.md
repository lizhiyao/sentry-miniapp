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

更多 Sentry 请求会等待 SDK 的发送槽位。等待队列仍受 Core 的有界发送缓冲限制，溢出时会记录 `queue_overflow`；通常保持较短超时和较小并发，不通过无限排队保护上报。

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

符合缓存条件的失败数据会写入 Storage，网络恢复或后续 `flush()` 时尝试补发。重试保留原始过期时间；client reports 发送失败不入库。可通过诊断信息查看存储故障。

离线重试与同意等待共用一个缓存，按当前 Sentry 投递目标保存数据。SDK 将包含元数据的整个容器限制在支付宝／钉钉 180 KiB、其余平台 900 KiB 以内；这是 SDK 的保守预算，详见[跨平台 Storage 差异](/guide/platform-compatibility#storage-与离线缓存)。更换 DSN／tunnel、读取旧格式或使用不兼容的隐私／存储策略时，会丢弃旧数据并记录诊断；只调整容量或过期时间时，会裁剪仍兼容的记录。

### 配置变化后，哪些历史缓存会失效

本节的有效隐私策略比较与 `cachePrivacyVersion` 从 **2.3.1** 提供。升级已有项目时，先看 [2.3.x 升级说明](/guide/migration-2.0#upgrade-2-3-1)，确认旧缓存的处理方式。

SDK 只重放目标和有效隐私策略相同的缓存。重新 `init()` 时，收紧或放宽 query 规则、修改用户信息／IP 推断策略、正文采集方向或有效正文上限、`sensitiveKeys`，都会使旧缓存整批失效，并记录 `policy_changed`。旧 envelope 不会重新执行新 client 的 `beforeSend`，因此不能用它补救历史缓存中的字段。

省略默认值与显式默认值、大小写不敏感片段的大小写变化、集合重排或重复，按同一策略处理。正文关闭时未生效的正文上限不影响身份。只改缓存条数、总字节预算或过期时间会裁剪兼容记录，不重置最初时间。

query 配置同时包含 allow／deny 时，以 deny 作为实际采集与缓存策略；只改被忽略的 allow 不会使缓存失效。空 deny 与 `true` 等价，空 allow 与它们不等价。

自定义 `beforeSend`、event processor、integration（包括自定义网络集成的正文 URL 排除规则）或 Replay 隐私规则变化时，SDK 无法比较函数／外部配置的实际含义。请更改稳定的业务隐私修订号：

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  cachePrivacyVersion: 'privacy-2026-11',
  dataCollection: { urlQueryParams: false },
});
```

`cachePrivacyVersion` 默认为空字符串，作用于 SDK 管理的弱网和同意缓存；每次启动使用相同值，隐私策略变化时再更新，不要使用随机值或启动时间。配置按初始化快照生效，改变策略请重新 `init()`，不要原地修改旧配置数组。

删除失败时，新策略不会重放不兼容数据，SDK 会诊断并降级到内存；这不代表磁盘已清除。如果之后恢复旧策略，未能删除的磁盘残留仍可能再次匹配。关闭离线缓存或撤回同意也不等于物理清除。此契约不撤销已发送、在途请求或旧实例正常 closing drain 的数据，也不清理业务仍保留在 Scope 中的旧面包屑或显式字段；应用改变其隐私规则时须自行清理这些状态。未经过 SDK offline 层的自定义 transport 自管缓存。

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

之后的新数据只进入允许的本地缓冲，排队请求停止启动；在途请求在宿主支持时尝试取消，已经传输的字节无法撤回。`getConsent()` 读取当前 client 状态，未启用 `requireConsent` 时为 `true`。缺少 Storage 时使用有界内存，条数或字节上限为 0 时不缓存。

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

使用自定义 `transport` 时，未开启 `requireConsent` 的缓存与重试由该实现负责；开启后，SDK 会统一处理同意等待和离线缓存，即使 `enableOfflineCache: false`。自定义通道应避免重复添加离线重试，并自行控制内部队列的实际发送与取消。常规接入使用 `Sentry.init()`；直接构造 `MiniappClient` 不会接管持久缓存重放。相关用法见[集成与高级扩展](/guide/api#集成与高级扩展)。

## 上线前怎样验证

1. 在隔离测试项目中清理 SDK 缓存，重新启动且暂不点击同意；不要清空生产项目的业务 Storage。
2. 主动调用 `captureException`，确认没有 Sentry 网络请求。
3. 检查平台 Storage 中出现缓冲数据。
4. 调用 `setConsent(true)`，确认缓冲事件被补发并能在 Sentry 中看到。
5. 断网再触发一个事件，恢复网络后确认弱网缓存也能补发。
6. 打印 `getDiagnostics()`，检查 consent、离线缓存和 warnings 是否符合预期。

合规要求会因应用、地区和数据类型而异。SDK 只提供技术门禁，项目仍需根据自己的隐私政策决定何时初始化、采集哪些字段以及何时调用 `setConsent(true)`。

完整参数见[配置项参考 · 离线缓存](/guide/configuration#离线缓存-弱网可靠性)和[配置项参考 · 隐私合规](/guide/configuration#隐私合规-同意后上报)。
