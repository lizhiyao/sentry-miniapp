# sentry-miniapp × @sentry/core 11 架构对齐审查

> 内部工程文档，不是用户文档。用户文档见 `website/guide/`。
> 审查对象：`@sentry/core` **11.0.0**（`node_modules/@sentry/core/build/{cjs,types}`）与属性注册表
> `@sentry/conventions` 0.23.0。所有结论只看安装代码，不引用记忆中的 Sentry 文档。
> 本文基于分支 `fix/client-scoped-span-dimensions`（#423，未合并）的代码状态。

## 0. 方法与度量

- 方法：按 core 的子系统目录逐个读 `.d.ts` + 编译后的 `.js`，与 `src/` 对照，每条结论给文件行号。
- core 11 顶层导出 **206** 条；我们从 `@sentry/core` import 的不同符号 **72** 个。
- 已判定「不适用」的子系统集中记录在第 8 节，避免下轮被当成遗漏。
- 每条缺口的证据强度分三档，严重度只按**已证实**的影响给：
  **代码级**=直接读到实现与调用点；**复现级**=有可重跑的用例或探针输出；**推断**=由实现推出的后果，尚未复现。
  未标注的一律是代码级；标了「推断」的，落地前自己先复现，别当既成事实读。
- 分工：本轮只做诊断，不改代码。第 9 节给出分阶段落地顺序，每阶段可单独否掉。

## 1. 作用域 / carrier / async context（本轮已烧到过我们）

**core 的设计**

- 三个作用域：global / isolation / current。所有公开 setter（`setTag`、`setContext`、`setUser`、
  `setAttribute` …）写的都是 **isolation scope**（`cjs/exports.js:23-45`）。
- 合并顺序 global → isolation → current（`cjs/utils/scopeData.js:60-66`）。
- 事件只取 extra / tags / user / contexts / level / transactionName（`scopeData.js:9-15,67-88`）；
  **scope 的 attributes 不会进事件**。
- span 取「捕获在 span 上的作用域」的 attributes + user + release/env（`cjs/tracing/spans/captureSpan.js:16-19,58-79`），
  写入用 `safeSetSpanJSONAttributes`（`:42-49`）——**已存在的键不覆盖**。
- contexts 进 span 是白名单且仅对 `is_segment`：`scopeContextAttributes.js:4-49` 只映射
  `response.status_code` / `response.body.size`、`profile.profile_id` / `profiler_id`、
  `cloud_resource.*`、`culture.locale` / `timezone`、`state.type`、`angular.version`、`react.version`。
  **`device` / `os` / `app` / `network` / `route` 不在其中。**
- isolation scope 是**进程级单例**，不随 `init` / `dispose` 重置；`withIsolationScope` 返回同一个对象
  （`cjs/asyncContext/stackStrategy.js:95,107-121`）。core 11 已无 `bindClient`，client 只挂在 current scope
  （`cjs/sdk.js:24-26`）。

**结论**：#423 之前我们把 per-client 数据写进 isolation scope 是错的，且这个错误无法靠「用完清空」修正——
正确姿势是 client 绑定状态 + 在 span 序列化钩子填充，core 自己也是这个模式（log/metric buffer 用
`WeakMap` 挂 carrier，`types/carrier.d.ts:31-36`）。

**缺口**

| # | 缺口 | core 证据 | 我们的证据 | 级别 |
|---|---|---|---|---|
| S1 | 从不设置 async context strategy：所有 span 捕获同一个 isolation scope，异步续体互相踩 | `cjs/asyncContext/index.js:6-17`，`stackStrategy.js:30-46` | `src/sdk.ts` 无 `setAsyncContextStrategy`；`src/index.ts` 却对外导出 `withScope` / `getIsolationScope` | P1 |
| S2 | `network` / `miniapp` / `performance` 等上下文仍写共享 isolation scope，靠 `getClient() !== this._client` 当门禁 | `cjs/exports.js:23`（写 isolation）、`scopeData.js:60-66` | `src/integrations/networkstatus.ts:44,65`、`src/sdk.ts:189`、`src/integrations/performance.ts:758,772` | P1 |
| S3 | `processSpan` 晚于 core 的作用域合并，我们「只填空缺」意味着被污染的历史值优先 | `captureSpan.js:18-19,42-49` | `src/spanDimensions.ts:91,97`（#423 现状） | P2，建议改挂 `preprocessSpan`（`types/client.d.ts:254-257`）并显式覆盖 SDK 自有键 |

## 2. Tracing / span 生命周期

**core 的设计**（已核对，别再凭印象）

- `startSpan` / `startSpanManual` / `startInactiveSpan` 都走 `createChildOrRootSpan`（`cjs/tracing/trace.js:165`）；
  root/segment 判定看 `getRootSpan`（`spanUtils.js:241-247`），**不再** 由 `forceTransaction` 决定（已废弃）。
- `span.end()` 分岔（`cjs/tracing/sentrySpan.js:238-274`）：standalone → `sendStandaloneSpan`，**同步发 envelope、无定时器**；
  否则 `afterSpanEnd`；root 且 stream → `afterSegmentSpanEnd`；root 且 static → `captureEvent(transaction)`。
- 定时器只在缓冲路径：500 ms（`cjs/integrations/spanStreaming.js:32-41`）与按 trace 的 5 s
  （`cjs/tracing/spans/spanBuffer.js:18,40-45`），且 `safeUnref` —— **不会维持进程存活，冻结前可能永不触发**。
  `client.flush()` → `emit('flush')` → `SpanBuffer.drain()` 同步排空（`spanBuffer.js:20-24`）。
- 线上格式：item header `{type:'span', item_count, content_type:'application/vnd.sentry.items.span.v2+json'}`，
  body `{version:2, items[]}`（`cjs/tracing/spans/envelope.js:8-30`）；`ingest_settings` 只在浏览器环境出现，
  小程序不适用。
- **measurements 在 stream 下是静默 no-op**：`getSpanJSON()`（`sentrySpan.js:193-205`）不带 `_events`，
  `captureSpan.js` 全文不读 measurement。tags / extra / 面包屑同样没有 span 通道。
- `ignoreSpans` 仅在 stream 生效（`trace.js:359-362`），匹配 `name` + `op` + attributes，字符串值是大小写敏感的
  substring/RegExp（`utils/should-ignore-span.js:10`）—— 与 `tracePropagationTargets` 的**不敏感**语义相反。
- `beforeSendSpan`：static 下未包装会被跳过（`captureSpan.js:32`）；返回 `null` 无效。
- HTTP span 属性由我们自己负责：core 只在它自带的 fetch/Node http 里写 `sentry.kind`，
  我们这类自定义 instrumentation 需自带 `http.request.method` / `url.full` / `url.path` / `url.query` /
  `url.scheme` / `server.address` / `server.port` / `http.response.status_code`（`@sentry/conventions` 注册表）。

**缺口**

| # | 缺口 | core 证据 | 我们的证据 | 级别 |
|---|---|---|---|---|
| T1 | `setMeasurement` 在默认生命周期下不产生任何输出，帧率与冷启动指标用户当前拿不到（属性副本另说） | `sentrySpan.js:193-205`、`captureSpan.js` 无 measurement 引用 | `src/integrations/minigame-framerate.ts:378-390`、`src/integrations/minigame.ts:151` | P1：删除或明确标注「仅 static 生效」，并改用规范键 `sentry.frames.total/slow/frozen` |
| T2 | `beforeSendSpan` 只改 `description` 的思路来自 v10；stream 下要改 `span.name`，且低基数改名应走文档化路径 | `types/options.d.ts:543,552-555` | `src/integrations/networkbreadcrumbs.ts:453-454` 注释口径 | P1（文档契约） |
| T3 | 采样自己做：`Math.random() > sampleRate`，与 core 的 `sampleSpan` / `sample_rand` / DSC 脱钩 | `trace.js:261-308` | `src/integrations/performance.ts:287` | P2：交给 `tracesSampleRate` / `tracesSampler` |
| T4 | 给被忽略或未采样的 span 照样发追踪头 | `fetch.js:51`（core 会换成 scope）、`sentryNonRecordingSpan.js:20` | `src/integrations/networkbreadcrumbs.ts:485-494` | P2：加 `isRecording()` / span 有效性判定 |
| T5 | `sentry.segment.name` / release / environment 手工写，core 已在公共属性里给每个 span 注入 | `captureSpan.js:58-77` | `src/integrations/networkbreadcrumbs.ts:431-436` | P3：删掉冗余，且我们的写入会挡住 core 的 safeSet |
| T6 | HTTP 属性不全：缺 `server.port` / `url.path` / `url.query` / `url.scheme` / `http.response.status_code` | `integrations/http/get-outgoing-span-data.js:26-33`、conventions 注册表 | `src/integrations/networkbreadcrumbs.ts:437-439` | P3：补齐后 Sentry HTTP 分组才正常 |
| T7 | static 生命周期下 `deferSegmentSpanCapture` 未接，晚到的子 span 会被丢 | `sentrySpan.js:253-259`、`_INTERNAL_setDeferSegmentSpanCapture` | `src/client.ts` 无调用 | P3（仅在保留 static 支持时处理） |

## 3. Client 契约 / 事件管道 / 集成框架 / Session

**core 的设计**

- `Client` 子类**必须**实现的只有 `eventFromException` / `eventFromMessage`（`types/client.d.ts:777-781`）。
- `_prepareEvent` 是 4 参数（`cjs/client.js:520`），内部顺序见 `cjs/utils/prepareEvent.js:17-74`：
  hint 回填 → `preprocessEvent` → lastEventId → 选项套用 → sdk.integrations 元数据 → `applyFrameMetadata` →
  `applyDebugIds`（仅 error 事件）→ hint.mechanism → 事件处理器 → 合并作用域数据（含 attachments 与错误-逃逸 span 归属）
  → `applyDebugMeta` + normalize；回到 client 再 `postprocessEvent`、`contexts.trace`、DSC 注入。
- 集成框架：`setupOnce` 按名字被**进程级全局数组**门控且永不重置（`cjs/integration.js:64-67`）；
  `setup(client)` 才是 per-client 的正确位置；`beforeSetup` / `afterAllSetup` 亦存在。
- `registerCleanup` 是 base Client 的文档化空实现、专供子类覆写（`client.js:436-437`），我们那套是对的。
- 集成去重按名字、用户实例优先（`integration.js:8-19`），因此模块级 `defaultIntegrations` 快照共享实例确实是坑
  （我们已在 `src/sdk.ts:143-151` 自己标了 deprecated，与 core 判定一致）。
- v11 core **不管 session 生命周期**：选项里已无 `autoSessionTracking` / `sessionSampleRate` /
  `sendSessionReports`，只提供 `startSession` / `updateSession` / `captureSession` 原语 + 崩溃标记
  （`client.js:457-479,620-622`）。所以我们的 `SessionIntegration` 不是重复实现。

**缺口**

| # | 缺口 | core 证据 | 我们的证据 | 级别 |
|---|---|---|---|---|
| C1 | 覆写的 `_prepareEvent` 忽略第 4 个参数 `isolationScope`，一律回退到 `getIsolationScope()`，span 归属错误事件时会拿错作用域 | `client.js:520,598`（core 会传捕获到的 span isolation scope） | `src/client.ts:210-258` | P1 |
| C2 | client reports 永不发送：`_flushOutcomes()` 在 core 里**没有任何调用点**，需要宿主自己调 | 定义 `client.js:705`，全量 grep 无调用者 | `src/` 全量 grep 无调用 | P2：被采样/`beforeSend`/`beforeSendLog` 丢的数量在 Sentry 上完全不可见 |
| C3 | `dispose()` 只跑回调，不清 core 状态（参考实现会清 `_hooks` / `_eventProcessors` / `_integrations` / `_outcomes` / `_transport` / `_promiseBuffer`） | `cjs/server-runtime-client.js:143-149` | `src/client.ts:320-342` | P2：重初始化后钩子重复触发 |
| C4 | `event.sdk` 手写，抢在 core 的 `_metadata.sdk` 之前；envelope header 与事件体可能不一致 | `cjs/envelope.js:7-19`、`client.js:344` | `src/client.ts:230-240` | P2：改成 init 时传 `_metadata` |
| C5 | 老式类集成只在 `setupOnce` 打补丁（TryCatch 等 6 个），无 `setup(client)` 也无清理；`installedIntegrations` 是永不重置的进程级名单，同名集成第二次 init 不再执行 `setupOnce`（代码级）。「补丁被第三方恢复后再也补不上」这一后果属**推断**，未复现 | `integration.js:64-66` | `src/integrations/trycatch.ts:56-70`、`httpcontext.ts:20`、`dedupe.ts:34`、`linkederrors.ts:44`、`rewriteframes.ts:61`、`console.ts:48` | P2（迁移本身仍值得做，收益待复现） |
| C6 | 平台选项 `platform:'javascript'` 对 base Client 无意义（只有 ServerRuntimeClient 读 `_options.platform`），与事件字段两处设置易混 | `cjs/server-runtime-client.js:156` | `src/client.ts:127,227` | P3 |
| C7 | Session：`ignoreDuration: true` 让 duration 永远缺失；无会话采样，onShow/onHide 抖动即一条 session envelope | `cjs/session.js:52-59` | `src/integrations/session.ts:55` | P3 |

## 4. 数据采集与隐私（`dataCollection`）

**core 的设计**：11 个字段，默认全开（`resolveDataCollectionOptions.js:3-15`）。`CollectBehavior` 语义
（`filterKeyValueData.js:8-33`）：`false` 全不采、`true` 采但内置敏感片段被替换、`{allow}` / `{deny}` 白/黑名单；
**匹配是大小写不敏感的 substring**，脱敏是**就地替换值**为 `[Filtered]`（`filtering-snippets.js:3`）。
内置敏感片段 18 项：`auth, token, secret, session, password, passwd, pwd, key, jwt, bearer, sso, saml, csrf, xsrf,
credentials, sid, identity, set-cookie, cookie`（`:4-26`）。
判定入口统一是 `client.getDataCollectionOptions()`（`client.js:229`）；
`filterCollectedUrl(url, client?)` **不传 client 时回落 `getClient()`，取不到就硬编码 `true`**（`filterCollectedUrl.js:7-9`）。
`dataCollection` 过滤**不记** client report（只有 before_send / sample_rate / 网络等记）。

**缺口**

| # | 缺口 | core 证据 | 我们的证据 | 级别 |
|---|---|---|---|---|
| D1 | 路由跳转把 `navigateTo` / `redirectTo` / `switchTab` / `reLaunch` 的 `options.url` **原样**写进面包屑 `data.to` / `message` / `tag route` / `context navigation.to`，不经 `urlQueryParams` 过滤（代码级）。小程序这些 url 常带 query（`/pages/detail/detail?id=…&token=…`），故 sensitive query 会入档——具体是否含敏感值取决于业务，但**开关完全不起作用**是确定的。`src/router.test.ts` 里所有用例的 url 都不带 query，因此这条路径零覆盖 | 所有 URL 生产者都过滤：`fetch.js:87`、`get-outgoing-span-data.js:28`、`requestdata.js:113` | `src/integrations/router.ts:81,156-179,188-207`（已核对） | **P1**（配置失效 + 无测试覆盖） |
| D2 | 我们的敏感键匹配是 `keys.includes(key.toLowerCase())` **全等**，`accessToken` / `id_token` / `x-api-key` / `sid` 全漏 | `filterKeyValueData.js:14`、`filtering-snippets.js:4-26` | `src/integrations/networkbreadcrumbs.ts:383`（已核对） | **P1 隐私** |
| D3 | 面包屑 `data.url` 保留（部分过滤后的）query，而 core 的口径是 url 只到 path、query 单列 `url.query` | `utils/url.js:133-136`、`fetch.js:83-88` | `src/integrations/networkbreadcrumbs.ts:216-219,273` | P2 |
| D4 | 请求/响应体无大小上限，core 有 small/medium/1 MB 上限 | `utils/request.js:11-23,103-108` | `src/integrations/networkbreadcrumbs.ts:231,258` | P2 |
| D5 | `filterCollectedUrl` 调用点必须带 client，否则多 client 时读错开关 | `filterCollectedUrl.js:7-9`（docblock 明确） | `src/integrations/networkbreadcrumbs.ts:203` | P3（当前恒有 client，属加固） |

**明确不适用**（core 里零生产者，无需接线，但要在用户文档写「本 SDK 无作用对象」）：
`httpHeaders`、`cookies`、`graphQL`、`genAI`、`databaseQueryData`、`queues`、`stackFrameVariables`、
`frameContextLines`。`userInfo` 由 core 在 logs / metrics / span envelope 内部消费，我们免费获得。
注意：`src/integrations/console.ts:75-88` 序列化任意 console 参数，core 同样不 gate console —— 只能靠
`beforeBreadcrumb`，属文档责任。

## 5. Envelope / transport / 重试 / 离线

- Transport 契约：`send(Envelope) → PromiseLike<TransportMakeRequestResponse>`；core 按**名字**读
  `headers['x-sentry-rate-limits']` 与 `headers['retry-after']`（`ratelimit.js:27-28`），429/`retry-after` 分别限到
  `span` 与 `log_item`/`log_byte` 独立类目（`utils/envelope.js:113-131`）。**reject 是有语义的**：
  触发 `network_error` 计数并让 `makeOfflineTransport` 落盘（`offline.js:88-96`）。
- 缓冲只有大小上限、没有并发上限（`base.js:9-12`、`promisebuffer.js:15-26` 立即起任务），
  所以我们的 `maxConcurrentRequests: 2` 是小程序必需的自研能力，不是重复实现。
- 序列化往返：`parseEnvelope` 只在 item header 带数值 `length` 时按二进制处理，且 `length` 是**字节**长度；
  span/v2、log 这类多 item 容器无 `length`，走 JSON 往返（`utils/envelope.js:38-112`）。
  隐患：任何 `Uint8Array` payload 能过 `serializeEnvelope`，过不了我们的 JSON 存储。
- `makeOfflineTransport` 只有 `createStore` / `flushAtStartup` / `shouldStore` / `shouldSend` 四个旋钮，退避
  5s→×2→1h、成功路径 100 ms、≥400 直接不重试（`offline.js:11-118`）；maxAge/字节上限归 store。

**缺口**：E1 `src/transports/xhr.ts` 未确认 `retry-after` / `x-sentry-rate-limits` 是否原样回传（P2，需实测）；
E2 存储路径要加断言防二进制 payload 静默丢失（P3）。核心结论：这一层我们的自研是**正确的**，不要为了「用 core
能力」而丢掉并发闸与同意门。

## 6. 错误与堆栈管道

- v11 的 `hint.mechanism` 施加到**被捕获异常**（`values.find(v => v.mechanism?.exception_id === 0) ?? values[0]`，
  `misc.js:69-76` + `prepareEvent.js:34-36`），而 `preprocessEvent`（集成挂载点）在 `prepareEvent` 之前，
  LinkedErrors 已把 cause 前置为 `chained`。任何按 `values[0].mechanism.type` 判定的代码都会跑偏
  —— core 自己的 dedupe 也是这样（`integrations/dedupe.js:108-110`）。
- `createStackParser` 按**数字升序**尝试且命中即短路（`utils/stacktrace.js:8` + `:22-28`）。
- `debugIdsIntegration` 在 v11 已不存在：`applyDebugIds` 无条件在 `prepareEvent.js:31,68` 执行，
  且同时读 `_sentryDebugIds` 与 `_debugIds`（`utils/debug-ids.js:11-12`）；`debug_meta.images.code_file`
  取 RewriteFrames **之后**的 `abs_path || filename`。
- 宿主特有错误串（`MiniProgramError\n…`）没有官方解析钩子，我们预解析是对的（`types/client.d.ts:777-781` 的
  `eventFromException` 就是留给平台的口子）。

**缺口**

| # | 缺口 | 证据 | 级别 |
|---|---|---|---|
| R1 | 我们的优先级数字与 core 约定相反：`createStackParser` 按**升序**尝试且命中即短路，于是 `[70 simple]` 先跑（代码级）。但**实测目前无信息损失**，见 6.1 | core `utils/stacktrace.js:8,22-28`；我们 `src/stacktrace.ts:178-181` | **P3（由 P1 下调）**：数字改成与约定一致并补一条锁格式断言，防以后加解析器时抢命中 |
| R2 | dedupe 比较 `values[0]`，v11 下那是最深 cause | core `integrations/dedupe.js:109`；我们 `src/integrations/dedupe.ts:215,246` | P2 |
| R3 | 平台栈首行非「message 行」时 `skipFirstLines=1` 会吃掉真实帧 | core `eventbuilder.js:8-10`；我们 `src/integrations/globalhandlers.ts:38` | P2 |
| R4 | RewriteFrames 用 `iteratee` 绕开 core 的 root/server 分支，不产出 `abs_path`，导致 `debug_meta.images.code_file` 与实际 source map 键对不上 | core `prepareEvent.js:111-116`、`integrations/rewriteframes.js:53-74`；我们 `src/integrations/rewriteframes.ts:26-31` | P2（影响符号化成功率） |
| R5 | 仍导出 v11 已 `@deprecated`、v12 计划删除的 `withStreamedSpan` | `types/tracing/spans/beforeSendSpan.d.ts:26-32`；我们 `src/index.ts:65` | P3：撤掉，或保留但在文档标注 |

### 6.1 R1 探针（复现级）

在装有依赖的 worktree 里临时加 `expect(miniappStackParser(stack, 1)).toBe('PRINTME')`，四种行式实际产出：

| 输入行 | 产出 |
|---|---|
| `    at fn (https://usr/app/pages/index.js:12:34)` | `function:'fn'`、`lineno:12`、`colno:34`、`in_app:true` |
| `    at async fn (https://usr/app/pages/a.js:5:6)` | `function:'async fn'`、`lineno:5`、`colno:6` |
| `fn@https://usr/app/pages/b.js:7:8` | `function:'fn'`、`lineno:7`、`colno:8` |
| `    at https://usr/app/pages/c.js:9:10` | `function:'?'`、`lineno:9`、`colno:10` |

simple 先跑没丢信息，R1 只剩「与约定不一致 + 未来加解析器的抢命中风险」。

> 复核时踩到的坑，记录以免重演：docs 分支的 worktree 没装 `node_modules`，在它里面跑 vitest 会因加载不到
> `vitest/config` 而**静默无输出**——没有输出不等于没有失败。探针必须在装好依赖的 worktree 里跑。

## 7. core 11 集成清单（对我们有用的部分）

- 已在用：`functionToString`、`eventFilters`（注意：没有它 `allowUrls` / `denyUrls` / `ignoreErrors` 全为 no-op，
  `types/types/options.d.ts:296-301`）、`dedupe`、`linkedErrors`、`rewriteFrames`、`spanStreaming`。
- 值得评估补齐：`extraErrorData`（cause 图与 props，小程序场景有用）、`consoleIntegration`
  （与我们自研 ConsoleBreadcrumbs 重叠，需二选一以免双写）、`moduleMetadata`（依赖构建插件，配合 R4 才有价值）、
  `createFetchIntegration`（仅当宿主存在全局 `fetch`，如部分开发者工具/小游戏环境）。
- v11 里**根本不存在**、只能我们自研：`globalHandlersIntegration`、`debugIdsIntegration`、`httpIntegration`、
  `browserApiErrorsIntegration`、`spotlight`、Replay、OTel 桥。
- v10→v11 已被移除/废弃、我们仍可能踩到的：`inboundFiltersIntegration`、`enableLogs`（只剩 `beforeSendLog`）、
  `forceTransaction`、`experimental.standalone`、`withStreamedSpan`、`attachStacktrace` 默认改 `true`。
  其中 `enableLogs` 我们仍当作自有选项保留（`src/types.ts:54,182`、`src/client.ts:131`）——合理，但注释与文档必须说清
  「core 不再实现，门禁由我们提供」。

## 8. 明确不做（附理由）

`requestData` / `integrations/http/*`（Node `http` 模块）、`supabase`、`zodErrors`、`thirdPartyErrorFilter`
（需 bundler `applicationKey`）、`featureFlags` / `growthbook`、`conversationId`、`mcp-server`、`spotlight`、
Replay / `replay` 相关钩子、`metrics`（core 内只有命名空间与 Node 侧生产者）、OTel / orchestrion /
`build-time-plugins`（小程序无对应构建期注入点）、`asyncContext/tracing-channel-binding`（需 `AsyncLocalStorage`）、
`ingest_settings`（`isBrowser()` 判定）、`browser.d.ts` / `server.d.ts` 入口专属导出。
判定依据：本轮逐个读实现确认其触发条件在小程序运行时不成立，而不是「看起来像服务端用的」。

## 9. 落地顺序（每阶段可单独否掉）

- **Phase 0（进行中，#423）**：per-client span 维度、route 实时取值、文档与测试缺口。
- **Phase 1 — 隐私与正确性，必须进 2.0**：D1（router URL 过滤）、D2（敏感片段 substring 匹配）、
  D3/D4（url/query 口径与体积上限）、C1（`_prepareEvent` 4 参数）、C5（老式集成迁到 `setup(client)` + 清理）。
  R1 已移出本阶段，降为 P3 的顺序规范化 + 锁格式断言。
- **Phase 2 — 与框架对齐，内部重构**：S3（改挂 `preprocessSpan` 并显式覆盖自有键）、S2（去掉共享作用域写入，
  context 改由 client 侧填）、C2（`_flushOutcomes` 接上，让 drop 统计可见）、C3（`dispose` 清 core 状态）、
  C4（`_metadata.sdk` 取代手写 `event.sdk`）、T3/T4（采样与追踪头交给 core）。
- **Phase 3 — 能力补齐，需产品决策**：S1（自定义 async context strategy，按页面/任务栈给隔离作用域）、
  T1（帧率指标改用规范属性键 `sentry.frames.*`，并决定 measurements 的去留）、R2/R4（dedupe、符号化）、
  第 7 节的补齐集成评估、E1/E2（transport 与离线往返加固）。
- **不做**：第 8 节。

## 10. 仍未验证

- 真机：微信 / 抖音 / 支付宝小程序与小游戏各跑一次，看 Sentry 侧 span、维度属性、session、client reports 是否齐全。
  本轮全部结论来自安装代码与本地测试，没有真机证据。
- Sentry 后端对 span/v2 + 我们自填属性的聚合表现（尤其 T6 未补齐属性时的分组差异）。
- 2.0 发布节奏与迁移文档归属，属你的决定，不在本诊断内。
