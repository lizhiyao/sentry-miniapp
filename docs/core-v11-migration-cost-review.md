# v1 → v2 迁移成本专项审查

本轮对照 `v1.20.4`（`74598eaf8c04790d20f24760bce60e0fb2b0f548`）与审查基线 `master a195315e9d6dc45220e238cf5e8bb91c9a37b533`，区分 Core v11 的变化与本 SDK 自主取舍。上游证据固定为 Sentry JavaScript `11.4.0`，提交 `7f13c61336918fd727f473faa341b9a24f23718e`；实际阅读本地对应源码，不按 API 名称推断旧行为。

**本轮旧配置校验和工具出口恢复纳入 `2.0.0-beta.7`；已发布的 beta.6 不包含这两项改动。** npm 发布状态以该版本的 CD 结果与 registry 为准，不以 master 合并代替。

## 已落实的窄改进

### 旧配置显式失败

Core v11 删除 `sendDefaultPii` 和 `enableLogs`，不再读取这些选项。JavaScript 项目若继续传 `sendDefaultPii: false`，原有配置会被忽略，而 `dataCollection.userInfo` 默认是 `true`；`enableLogs: false` 也不再阻止显式 logger 调用。仅靠 TypeScript 类型删除或文档提示不能保护这些项目。

当前 [选项校验](../src/client.ts)拒绝这两个键的非 `undefined` 值，包括 `true`、`false` 及与新配置混用的情况；显式 `undefined` 视为未设置。`init()` 在装配前校验，再在配置回调／getter 解析后的实际快照上复查，均早于 `initialScope`、旧 runtime 退休和新 transport 构造。[低层 client 构造](../src/client.ts)在解构原始选项前检查，再复查快照，避免原型继承的旧配置在复制时丢失，或 getter 改写配置后漏检；这些检查均早于创建环境、lifetime、同意控制器和 transport。

不做静默 alias：上游[隐私迁移说明](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/MIGRATION.md#senddefaultpii-is-replaced-by-datacollection)明确涉及多个类别，不是单纯改名。只把旧 `false` 映射到 `userInfo: false` 不能保持 v1 全部策略；自动套用完整旧基线又可能改变小程序独立的正文采集配置。用户须明确选择所需 `dataCollection` 字段；`userInfo: false` 关闭错误事件的后台 IP 自动补充，不删除显式业务用户字段。旧 `enableLogs: true` 应移除；旧 `false` 应停止 logger 调用，或明确使用 `beforeSendLog: () => null`。

本 SDK 也不能直接套用上游全类别对照表：v1 client 未设置错误事件的 `infer_ip`，自身 query／body 观测不消费 `sendDefaultPii`。对 v1.20.4 源码与真实 Core 10.74.0 的非浏览器宿主探针中，旧开关的 true／false 均保留显式业务用户，错误事件没有自动 IP 设置；旧 `enableLogs: false` 则确实阻止日志采集。新版以 `userInfo: false`、`beforeSendLog: () => null` 明确表达所需策略，不宣称复制所有旧行为。

### 保留已有的路径工具

[v1 公共集成入口](https://github.com/lizhiyao/sentry-miniapp/blob/v1.20.4/src/integrations/index.ts)导出 `normalizeMiniappFrameFilename`。v2 原先取消了重导出，但[同名函数](../src/integrations/rewriteframes.ts)实现未变，仍被 `rewriteFramesIntegration()` 使用。本轮恢复 `Sentry.Integrations.normalizeMiniappFrameFilename`，复用同一函数；不新增实现、顶层 API、公共 class 或遥测管线。

## 保留的设计取舍

| 变化                                       | 实际旧行为与当前决定                                                                                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公共 class → factories                     | SDK 自主收敛公共生命周期接口；保留 factories 及 namespace aliases，不恢复 class。Core 仍允许自定义 Integration，这不是 Core 强制禁止 class                                                                                                           |
| 共享 `Sentry.defaultIntegrations` 数组移除 | [v1 已弃用](https://github.com/lizhiyao/sentry-miniapp/blob/v1.20.4/src/sdk.ts)，数组复用会共享实例；每次调用 `getDefaultIntegrations(options)` 即可迁移。`defaultIntegrations: false/数组` 配置与 `integrations(defaults)` 回调仍保留 Core 装配语义 |
| `showReportDialog` 移除                    | v1 顶层函数及 client 方法只提示弃用并返回，不展示界面；不恢复空操作。实际反馈使用业务原生表单与 `captureFeedback()`                                                                                                                                  |
| stream-only                                | Core v11 仍保留 static transaction；本 SDK 主动只支持 stream，不恢复旧 HTTP span envelope、measurement 双写或第二套发送路径                                                                                                                          |
| Performance／FPS 默认关闭                  | SDK 自主控制自动采集成本。按需要显式安装 Performance 或启用 FPS；不恢复通用 Performance 的二次采样、原始条目缓冲、周期统计和内存轮询                                                                                                                 |
| 低层 store 必填身份                        | [store](../src/transports/offlineStore.ts)要求 `targetId`／`policyId`，避免缓存跨目标或隐私策略重放；不以固定默认身份伪装兼容。普通 `init()` 由 client 构造身份，不要求用户补这两个选项                                                              |

`withStaticSpan`／`withStreamedSpan` 在 [v1.20.4 的 sentry-miniapp 公共入口](https://github.com/lizhiyao/sentry-miniapp/blob/v1.20.4/src/index.ts)并无导出，不能列为该版本用户失去的公共能力。Core v11 的[两个 helper](https://github.com/getsentry/sentry-javascript/blob/7f13c61336918fd727f473faa341b9a24f23718e/packages/core/src/tracing/spans/beforeSendSpan.ts)仍存在，其中 `withStreamedSpan` 只返回原回调并已弃用；v2 不为了复制其它 SDK 的 API 名单增加它们。

恢复 static 只能改变性能发送模型，不能承诺旧后台兼容：Core v11 已移除旧独立 span envelope，当前 HTTP root、小游戏和 Performance attributes 不会自动还原成 v1 数据模型；Logs、Metrics、Session、隐私设置还有各自的变化。后台支持与未来过渡模式的评估条件继续按 [ARCHITECTURE.md](../ARCHITECTURE.md#版本与后台兼容的取舍)执行。

## 验证边界

相关回归入口为 [client.test.ts](../test/client.test.ts)、[diagnostics.test.ts](../test/diagnostics.test.ts)和[public-api.test.ts](../test/public-api.test.ts)：观察旧配置拒绝、原 client 仍能发送最终事件、原型配置与 getter 改值时不构造 transport、配置回调后复查，以及 namespace 工具的实际路径输出。新增断言在修复前失败，修复后通过；加强现有用例，没有增加用例或包消费场景数量。

独立 CR 的原型继承反例已修复并复跑。lint、源码／测试 typecheck、完整单测与覆盖率门禁通过；标准构建、publint、隔离 tarball 的 CJS／ESM／UMD／类型与七平台消费检查、微信 bundle／本地映射检查及官网构建通过。[包消费门禁](../scripts/internal/check-package-consumers.mjs)也检查保留的工具出口与配置拒绝后的正常发送。官网新锚点与链接已从生成 HTML 核验。

本轮没有重新进行真机或旧自建后台接收矩阵验证；保留公共工具也不表示提供 v1 全行为兼容。
