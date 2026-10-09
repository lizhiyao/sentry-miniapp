# core v11 升级收尾复核（2026-10-09 至 2026-10-10）

## 结论与证据边界

审查基线为 `master fb3ab00c19097df9f73ad1b89bdfad9f198ad2e5`，SDK `2.0.0-beta.3`、精确固定 `@sentry/core 11.4.0`。当前架构的职责划分成立，但此前的绿色测试和 #428 收尾没有覆盖所有组合：本轮复现了正文 URL 排除、原生存储、页面生命周期、transport 结算和关闭后采集的遗漏，并发现了旧 tracing 诊断和文档中的过期声明。

本轮以生产入口、安装的真实 core 实现和最终 envelopes 为依据，检查 client／Session 接缝、owner／lifetime、默认集成、隐私 collector、transport／offline store、公开出口及中英文 README／官网／skill。运行测试使用可控宿主，未重新进行手机操作或目标后台遥测测试；沿用的后台结果按原 SDK 版本记录。文档修改与代码修复需经本 PR 合并，不能据此宣称已发布包或线上官网已经包含新修复。

后台验收按版本记录：beta.2 提供 spans／logs／metrics／session 的后台证据；beta.3 补验 client reports、flush／dispose 边界及微信 IDE 实际业务产物的后台符号化。未变遥测沿用 beta.2 证据，不宣称 beta.3 重跑全套后台测试。此类证据沿用和内部接缝审查属于维护记录；官网与 README 只说明用户可用能力、迁移步骤、限制和检查方法。

## 实际发现与修复

| 发现 | 触发和影响 | 修正与验证 |
| --- | --- | --- |
| P1：正文排除规则依赖正则状态 | 显式开启正文采集并配置带 `g`／`y` 的 `denyBodyUrls`；`lastIndex` 会使请求、响应或重复请求的结果变化，原本应排除的正文可进入最终 error envelope | 配置时建立不含 `g`／`y` 的独立正则，保留其它 flags 和字符串正则语义；实际请求、响应和三次重复请求均无正文，业务正则状态不变，其它 URL 仍正常采集 |
| P1：冻结正则可阻断业务请求 | 同上，且业务冻结正则；原生 `test()` 写 `lastIndex` 抛错，宿主 request 尚未执行 | 同一独立正则修复；冻结配置下业务请求及 success 回调仍执行 |
| P2：SpanStreaming 缺失诊断误导 | 替换默认集成后，诊断称无父 HTTP span 仍能直接发送 | 真实 core 下无父 HTTP 的最终 span envelope 仅在安装 SpanStreaming 时出现；修正诊断、初始化注释和官网说明 |
| P2：文档与已完成验收不一致 | README／迁移页仍称业务符号化未验收、#428 开放；首页仍承诺小游戏冷启动；开发说明遗漏源码／依赖变化触发框架门禁 | 更新中文／英文入口、迁移、架构、配置、首页、开发说明及唯一来源 skill；分别登记 beta.2 后台、beta.3 增量和 #457 真机待验证，不把首帧近似称为完整冷启动 |

修复前，新增的真实 core 测试有四处失败：两种可变正则使 canary 正文进入 envelope、冻结正则抛出 TypeError，以及旧诊断与实际发送行为矛盾。修复后通过；测试观察公开行为与最终 payload，不读取私有 Map 或复制被测匹配算法。

### 独立复核补充

在初次修复及用户文案调整后，分别对架构／运行时／用户文档做独立审查。检查当前代码与真实 core，不把前一轮绿色结果当作无缺陷证明；新增失败复现又发现以下组合：

| 发现 | 影响与修复 |
| --- | --- |
| P1：对象参数 Storage 包装改变原生业务调用 | my／dd 的合法 `{ key, data }` 调用被再次包装，get 返回结构也被抹平。现在对象参数调用透明保留 receiver、参数与原始返回；只有 SDK 的字符串 key 调用做归一化 |
| P1：支付宝同步存储失败被当成成功 | 官方同步 API 以非零 `error` 返回失败。此前 push 误报持久化成功；shift 删除提交失败后仍交出旧记录，可能重复重放。归一化调用现在识别失败，复用 store 的提交失败／内存降级路径；缺失 key 与失败区分 |
| P2：缓存预算超过部分宿主额度 | SDK 的 900 KiB 容器超过支付宝单 key 200 KB 限额。支付宝／钉钉改为保守 180 KiB 写入预算，其余保留 900 KiB SDK 预算；按完整 UTF-8 容器裁剪，不改变协议解析上限或缓存身份 |
| P2：宿主响应不可读可永久挂起 transport | success／fail 先关闭超时，再读取 status／header／errMsg；getter 抛错后 Promise 不结算。结算边界现在兜底 reject，错误正规化不再次抛错；回归同时证明下一请求能获得槽位、flush 完成和计时器清理 |
| P2：缺省 Page handler 漏采页面流转 | 业务未定义 onLoad／onShow 等 handler 时，原包装不安装观察回调。改为补充中立回调，仍按当前 client／采集开关取配置；最终事件验证完整生命周期、query 脱敏与关闭后停止采集 |
| P2：关闭后新显式事件仍执行用户回调 | dispose／close 后虽不发网，但捕获入口仍进入 processor／beforeSend。三个已有公共 capture 覆写现在先检查收集窗口，保持返回 ID；不标记被拒收 Error，允许新 client 捕获；此前入队事件和同步 finalizer 保留正常收尾 |
| P2：用户示例与实现不一致 | 页面采样误用 HTTP span 名，小游戏能力表残留旧 class／jank 字段，体积数字和示例构建步骤过期。改读 attributes.route，修正字段和默认开关，调整初始化 import 顺序并补齐构建步骤；README 不再承诺所有失败都能缓存 |

平台契约依据为[支付宝同步写入文档](https://github.com/AlipayDocs/open-docs/blob/main/mini/api/%E5%9F%BA%E7%A1%80API/%E7%BC%93%E5%AD%98/my.setStorageSync.md)及[单 key 限额说明](https://miniprogram.alipay.com/docs/miniprogram/mpdev/api_storage_setstoragesync)。钉钉采用保守 SDK 预算，不把 180 KiB 称为官方额度；其他平台的 900 KiB 同样是 SDK 策略，未宣称逐端证明了完整存储规格。

Session 的迟到异步错误是保留的统计边界：前台会话已结束时，错误事件仍按配置发送，但 core 不重开终态会话，也不会把错误计入新会话。受控 Promise 回归明确旧会话仅 ok→exited、错误数不补改、事件仍发送，新会话不受污染。官网说明对 Release Health 的影响，不为补计数复制 core 状态算法。

beta.4 发布前的独立 bundle 检查又复现关闭后反馈／Session 捕获仍执行 hook、Session 的 init／environment 被修改，虽然最终发送为零。补齐两个 SDK 反馈入口的采集窗口守卫，公开 captureSession 仅在 closed 时返回；closing 中保留 core 的在途 Session 更新和同步 finalizer。真实 core 回归覆盖关闭／废弃后的零 hook 与对象不变、closing 新反馈拒收，以及 finalizer 反馈／Session 和异步错误的 Session 更新。未增加 protected 接缝或复制 core 算法。

## 架构取舍复核

| 边界 | 当前实现与维护选择 |
| --- | --- |
| 事件处理 | core 管 prepare／processors／normalize／beforeSend／采样；宿主环境通过 processor 补缺失字段，Debug ID 用 preprocessEvent，不恢复 prepare/process 覆写 |
| Session | capture 保存捕获时 Session，postprocess／beforeSend 结果通过 WeakMap 关联；窄 `_updateSessionFromEvent` 只选引用后调用 super；没有重新实现状态算法 |
| JS 未处理状态 | `_unhandledSessionStatus` 选择 unhandled，避免把可继续运行的 JS 错误计为原生 crash；终态收尾不重复提交，统计基线按迁移文档调整 |
| close／dispose | core 保有 processing／buffers；有限 `_isClientDoneProcessing` tick 提供取消检查，公开 flush 只调用一次 core hook；不用私有 processing 计数，也不以反复 flush 轮询 |
| reports | 公开 recordDroppedEvent 累计、createClientReportEnvelope 组装、sendEnvelope 发送；计数交换及同意门是宿主职责，不操作 core `_outcomes` |
| trace | 复用采样／DSC／SpanStreaming 的有界批处理；无父 HTTP 是 segment，仍需要集成发送。单活动 runtime 和同步 owner 是正式范围，不模拟任意多 client／跨 await 隔离 |
| 自动数据 | query／body 独立，未知正文省略，dataset／任意 detail 不自动复制；手动业务属性由调用者提供，设备／应用稳定字段仅填缺失项 |
| offline | 一个 core offline 层、一个活动持久目标、有界 typed codec；先提交删除再重放，TTL 不续期；存储故障可诊断，不承诺 durable ACK 或恰好一次 |
| 跨平台／性能 | 宿主能力检测、统一 request／Storage 抽象；Performance／FPS 可选，缺可靠时钟或 API 跳过，不伪造七平台等价测量 |

三个 protected 接缝及唯一内部键过滤入口仍有具体宿主需求和回归约束。维护者每次移动 core pin 时须检查其调用顺序与语义差异；若上游增加可满足这些契约的公开接口，应替换相应接缝。当前不需要引入 core fork、第二套 span buffer、采样或多租户缓存。

## 无效代码与测试清理

- 删除 `collectBody` 从不读取的 client 参数，正文格式／脱敏只接收实际使用的输入；query／httpBodies 的独立门禁仍由真实 core 集成测试覆盖。
- 将仅改变这个无效参数的三次单测合并为一次正文格式测试，避免把相同执行路径当作三种策略的证明。
- 删除 HttpContext、GlobalHandlers、TryCatch、Session 的空 setupOnce 及仅验证空方法的测试／调用；实际资源安装与清理仍由 setup(client) 行为回归覆盖。
- 删除 EnvironmentState 无调用方的 setTag 方法，将仅构造期使用的 hostPlatform 改为局部值。
- 保留有意义的 factories namespace、owner 清理和可选性能能力；删减以职责和引用为依据，不以行数作为目标。
- 源码以 noUnusedLocals／noUnusedParameters 再查一遍，无未引用局部或参数；不将公共导出误当成死代码删除。

## 开发工具链依赖复查

官方 npm audit 对当前生产依赖未报告安全告警；发布包生产依赖只有 `@sentry/core 11.4.0`。包含开发依赖的根锁文件则确认 7 条安全公告（2 critical／3 high／2 moderate），涉及 VitePress 的 Vue SSR、glob 展开的 brace-expansion，以及发布工具的 Handlebars，不能将它们误归为示例旧锁文件。

公告对应[Vue SSR 属性名验证](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6)、[brace-expansion 拒绝服务](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)、[Handlebars AST 输入](https://github.com/advisories/GHSA-8r5x-fm3f-whwj)与[模板原型访问](https://github.com/advisories/GHSA-p8wg-vrv2-v86f)。当前构建输入和模板受仓库控制，未发现这些公告要求的不可信输入入口；仍应定向更新到修补版本，而非仅凭目前利用条件不匹配忽略告警。

已定向更新根锁文件：Vue 与其同版本包 3.5.35→3.5.42、brace-expansion 5.0.9→5.0.12、Handlebars 4.7.9→4.7.10。Vue 新声明要求 Babel parser／types 7.29.8，新增并存锁记录，其他链的 7.29.7 保留；PostCSS 等其他实际锁定版本不变。未修改 package.json 的依赖范围或 core pin。隔离环境启用安装脚本后 `yarn install --immutable` 通过；`yarn npm audit --recursive --all --no-deprecations` 及限制到 production 的查询均未报告安全公告。排除弃用提示仅为区分维护提示与安全公告，不代表旧发布工具链的维护成本已经消失；新旧 peer 检查未满足项相同。

GitHub 推送时提示默认分支 23 条告警，本轮没有与其 alert ID 逐条对账。npm audit 的结果只覆盖审计时当前锁文件与数据库；不能宣称所有 GitHub 告警或未知依赖风险已经清零。

## 交付与剩余范围

本 PR 保留 beta.3 包版本，不移动已发布 tag，不把本轮改动称为已发布。合并后应通过正常 release PR 发布下一 beta，试用者才能获得这些修复。真机冻结／恢复、弱网、存储、同意／撤回及平台覆盖继续在 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 收集证据；稳定版前复核，缺失项保持待验证。

本轮本地 Node 24.21.0／Yarn 4.16.0 的最终检查：

- `yarn run lint`、`yarn run typecheck`、源码 `noUnusedLocals`／`noUnusedParameters` 通过。
- `yarn run test:coverage --maxWorkers=2`：68 文件／1167 测试通过；statements 98.73%、branches 95.47%、functions 99.38%、lines 99.43%，门槛未放宽。
- client-lifecycle／page-data-collection／transport／crossPlatform／offlineStore／session／reinit 的随机顺序验证：7 文件／198 测试，seed 428，通过；前一轮 network／client-state 86 测试也已通过。
- `yarn run build`：CJS／ESM／UMD／类型入口和七平台 × 两种 URL 能力模式消费通过。
- `yarn run build:miniapp`：独立微信 bundle、无 Node／DOM 依赖及本地符号化检查通过。
- `yarn run docs:build` 与 `git diff --check` 通过。

定向修补开发工具链锁文件后，再次运行 lint、typecheck、完整 coverage、发布包消费、微信 bundle／映射及官网构建，结果仍通过。

PR CI 另验证 Node 20／22／24 及 Taro／uni-app；结果以对应 PR run 为准。本轮没有证明所有未知 bug 都已消失；有效改进是把具体漏测组合变成失败复现和持续回归，同时使对外文档与实际支持、版本及证据一致。
