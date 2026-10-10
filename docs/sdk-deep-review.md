# beta.6 发布后的三轮深度审查（2026-10-10）

基线是 `master fdb7ac9` 与已发布的 `2.0.0-beta.6`，`@sentry/core` 精确固定为 `11.4.0`。本次修复位于 beta.6 tag 之后，不移动 tag，也不代表已发布 beta.6 包含这些修复。示例应用安全依赖按维护者决定暂缓，本轮集中于 SDK 架构、运行时缺陷、内部清理和用户文档。

## 三轮分别验证什么

1. **独立发现与失败复现。** 分别检查 Core 装配与事件归属、跨平台观测降级、用户文档。新增真实 Core 回归先在原实现失败，再验证最终事件、span 和业务对象身份；平台探测与初始化问题另在已发布 beta.6 包复现。
2. **交叉审查与反例。** 换审查者读修复，检查可选 getter 同步关闭 client、注册途中退休、晚回调、业务 hook 故障与原异常对象。原实现与新实现使用同一受控宿主，避免将无效 DSN、fake timer 未推进等 fixture 问题当作缺陷证据。另逐项查清理入口的生产消费者。
3. **实际包与接入说明。** 通过安装包声明的 CJS／ESM 入口重复公开行为回归；检查打包、类型、七平台请求隔离和微信独立 bundle。文档用实际 pipeline 核对 hook 与配置含义，再从普通接入者视角检查说明，内部审查记录留在仓库。

## 确认的问题及修复

| 问题                               | 原实现的触发与影响                                                                                                                                             | 修复和对照                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初始化途中丢失新 client            | 从默认 scope 调用 `init()`，但 `integrations`、`initialScope` 或 transport 构造回调留下未完成的异步 span；Core 恢复 stack 后，新 client 不再可达，顶层事件丢失 | 配置解析后及公开构造器前后重查同一根 scope。配置阶段拒绝保留旧 client；旧 runtime 已退休的阶段不复活它，构造出的未绑定 client 立即 dispose。已绑定后的 integration setup 异步 span 正常交付是正向对照 |
| 平台探测丢弃其它可用证据           | 一个候选全局或嵌套平台信号 getter 抛错，阻断后续可用宿主及默认 transport                                                                                       | 单字段读取失败只跳过该字段，保留候选优先级、宿主接收者、平台判断和可用设备信息                                                                                                                        |
| 可选网络解绑阻断订阅               | `offNetworkStatusChange` 不可读，但 `onNetworkStatusChange` 可用；原实现未安装监听，网络上下文、面包屑与重连恢复缺失                                           | 注册不依赖可选 off；清理时尝试解绑。七平台真实 Core 最终事件、重连 flush 和晚回调门禁均验证                                                                                                           |
| 页面业务零参数变成一个 undefined   | 交互 callback 用 `(event, ...rest)` 再拼数组调用原函数，改变 `arguments.length`                                                                                | 使用原始 rest 参数执行业务，只读第一个参数供观测。零参数、显式 undefined、多参数、receiver、返回值与原异常身份均保留                                                                                  |
| 小游戏两种帧观测被可选取消能力阻断 | rAF 可用，但 `cancelAnimationFrame` getter 抛错；首帧和 FPS 均无采样                                                                                           | 分开探测调度与取消能力，无法取消的晚帧受 owner 门禁。getter 中同步 dispose 后不得继续调度或注册。真实最终首帧／FPS span 与资源停止检查共同验证                                                        |

## Core 边界与长期取舍

初始化继续调用公开 `initAndBind`，不复制 Core scope stack，也不将新 client 强绑到旧业务 fork。配置回调应保持同步；检测到未结束上下文时返回 `undefined`，业务等待该操作完成后从默认 scope 重试。该约束与一个活动自动 runtime 的模型一致，不扩展为任意异步 context 中的初始化。

最后一轮反例又发现候选修复的异常路径：首次初始化没有旧 owner，`console.warn` getter 或调用失败会先抛错，挡住构造后的清理。真实 Core 探针确认该未绑定 client 仍可发送事件，因此不能只保证正常拒绝路径。诊断改为尽力输出，两种失败均须返回 `undefined`、清理未绑定实例；等待上下文结束后的根初始化仍能交付。这是本轮候选实现的交叉修正，不将它计成已发布 beta.6 的新增缺陷。

两处 protected 方法继续保留：[Session 归属选择与 processing 等待](../ARCHITECTURE.md)。前者只在 Core 更新前选择采集时 Session，再调用 Core 原算法；后者逐 tick 委托 Core 等待，在 dispose 后终止无期限 poll。当前公开 hook 没有等价替代。减少 protected 数量不能以复制 Session、事件或 buffer 算法为代价。

同意等待和弱网重试继续使用一个 Core offline 管道与同一 typed store。开启 `requireConsent` 时，授权前后均受 `consentCache*` 限制；不为修正文档引入第二个重试引擎或授权后的隐式策略切换。持久删除成功后进程中断仍可能丢数据，自定义 transport 的内部队列仍由接入者控制。

## 无用代码按消费者清理

Console、PageBreadcrumbs、NetworkBreadcrumbs 和 NetworkStatus 的聚合 `cleanup()` 与 Set 仅由旧测试调用，公共 factory 只承诺 Core `Integration`。删除这些入口，保留每个 client 注册的幂等 cleanup 闭包、lifetime stop、owner 释放和精准 wrapper 恢复。旧 fixture 改执行实际 `client.registerCleanup` 登记的回调；真实 Core 的重复关闭、跨 client 资源隔离和迟到业务路径继续约束行为。

GlobalHandlers、Minigame、FPS、Performance 的 controller 清理有生产调用，保留；Page／Console／Network 的 `setupOnce` 有真实 instrumentation 消费者，保留。公开兼容 factory 与 helper 不能因使用频率低而删除，本轮未发现其它有证据可删的 Core 适配 helper。

## 用户文档纠正

- 追踪头配置匹配完整 URL。字符串是包含匹配，不能把裸域名字符串描述为严格域名白名单；限定受控 API 用锚定 origin 正则，Core 匹配算法保持不变。
- `beforeSend` 只处理错误／消息事件；独立日志、span、metrics 使用各自 hook，反馈在采集前过滤输入。
- `wrap` 捕获并重新抛出同步异常，保留原 Promise 身份，不额外接管异步 rejection。
- 性能能力来自宿主实际条目、HTTP 与业务 span，不承诺自动 React／Vue 组件耗时。
- 同意缓存条数按 envelope 记录计数，授权后仍使用同一配置，不能描述为只影响同意等待期。
- uni-app Source Map 配置说明对齐现有构建脚本；官网保留用户限制、操作与排障，移走 typed codec、private queue、public recorder 等内部装配术语。

README 与英文入口仍作为简明接入入口，具体配置和迁移说明在官网；不为增加改动量重复写实现流水账。

## 验证边界

- lint、源码与测试的严格 TypeScript 检查通过。
- 完整 coverage 与随机顺序：76 个文件、1292 个测试全部通过。statements 98.72%、branches 95.50%、functions 99.23%、lines 99.43%；保留原门槛，没有排除新增代码。初次 coverage 提示语句门槛不足后，将 getter 中同步 dispose 的公开行为反例纳入正式真实 Core 回归，再次通过。
- 实际发布包对照：官方 beta.6 的 CJS／ESM 各 8 个原有场景通过、9 个新增场景失败；重建候选包各 17 个场景全部通过。诊断失败路径另在修复前的候选包中，getter／调用 × 两个入口四项均失败，最终候选的同一控制全部通过。
- CJS／ESM／UMD、68 个公共导出与 TypeScript 入口、七平台各两种 URL 能力模式全部通过；微信独立 bundle 的运行与本地符号化检查通过。
- 文档站构建通过；178 个本地链接目标和 33 个指南锚点有效。

本轮使用真实 Core、受控宿主、当前源码与实际构建包，不重新声称目标 Sentry 后台或真实手机验收完成。设备冻结、真实弱网和宿主存储仍通过 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 收集用户证据。审查能证明已覆盖路径的行为，不能证明不存在所有隐藏 bug。
