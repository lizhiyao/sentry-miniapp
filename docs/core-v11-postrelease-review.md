# beta.4 发布后的专项复核（2026-10-10）

最初审查基线是已发布的 `2.0.0-beta.4`（tag 提交 `4f36c26`）及合并后的 `master 4a33f09`，Core 仍精确固定为 `11.4.0`。下文 beta.5 发布前章节的新增修复纳入 `2.0.0-beta.5`，发布包摘要与消费检查见对应 Release 清单；发布后章节另按源码状态说明，不移动已发布的 tag。

## 新发现与修复

| 问题 | 触发与影响 | 修复及观察点 |
| --- | --- | --- |
| 小游戏自动 Session 没有原生入口 | 无 `App()` 的微信／抖音小游戏默认安装 Session，但 show→hide→show 的最终 Session envelope 数量为零；普通小程序对照正常 | Session、前后台协调器及小游戏 producer 共享原生通道。两项监听成功后建立首个前台会话，重复 show 保持 SID，hide→show 创建新 SID；makeSession／closeSession／captureSession 继续复用 Core |
| 动态安装的长期观测回调固定旧会话 | `init()` 后通过公开 `addIntegration()` 安装小游戏集成；A 退出、B 活跃时，前台面包屑 hook 捕获的事件正常发送，但 B 最终 `errors=0`。FPS 前台卡顿 hook 同样复现 | Minigame、FPS、Performance 每次观察使用当时的 isolation Session；timer／rAF 业务任务及网络请求继续固定操作开始时的会话，不能用全局切换归属解决 |
| 一个可选系统信息 API 使全部设备维度消失 | 分体 API 存在但抛错，会跳过其余可用方法及旧 API 回退；冻结的旧结果还会因版本字段写入失败而丢失信息 | 逐 API、逐字段降级，快照不修改宿主对象。真实最终事件验证七平台回退、部分成功、枚举失败的代理对象、非枚举／继承字段与只读结果 |
| 无用权限读取影响系统信息 | 授权设置、蓝牙／Wi-Fi 等开关没有当前遥测消费者，却可在读取失败时阻断整个环境快照 | 删除这两类 API 读取，保留实际使用的基础、窗口和设备信息 |
| skill 缓存参考页预算过期 | 参考页仍称所有平台 900 KiB，与支付宝／钉钉 180 KiB 的实际策略矛盾 | 修正完整容器含元数据的分平台 SDK 预算，不承诺宿主实际可用容量 |

系统信息的最初十个真实 Core 新用例在修复前全部失败；小游戏回归同样以实际 Session payload、SID、终态、帧队列及最终 span envelope 为依据。没有用私有 Map 状态或测试中自造算法代替公开行为。

## 生命周期取舍与独立复核

App 路径保持业务返回值和原异常，以及 before→业务→after→flush 次序。明确小游戏即使有第三方 App/Page shim 也使用宿主原生通道；Page 仍按游戏模型跳过。原生通道按活动 client 归属，共用一对 show/hide 监听，SDK 内部的 Session 收尾和 FPS summary 都先于最终 flush，不依赖集成安装顺序。

原生启动 show 可能已经发生且不回放，因此完整监听安装后，在 Core 公开的 `afterAllSetup` 中建立首个会话，发生在所有集成安装完成、`init()` 返回前；已经观察到 hide 时等待后续 show。缺少任一方向或注册失败不生成自动会话，并给出生命周期诊断。该选择不伪造完整冷启动，也不承诺 SDK 监听一定在业务原生监听之后。后者仍受宿主顺序控制，业务需要时显式管理 Session 或在处理器末尾 flush。

独立复核又补上安装时同步回放 hide 的帧队列停止，以及 on/off getter 中 dispose 后不继续注册。关闭／切换清空 native owner 和订阅；缺 off 的迟到监听不再读参数或采集。原来的分散解绑字段和无调用方的 registerOwnerListener 已删除，不保留两套生命周期实现。

初始化首会话推迟到 `afterAllSetup` 可避免默认集成保存首会话，但不足以处理公开的动态安装路径。长期 producer 的 owner 因而显式选择当前会话策略：保留安装时的 client 与 scope 数据，每次执行克隆 scope，只从当前 isolation scope 取得 Session；不从外层迟到 timer 的 scope 恢复旧 Session。单次调度和网络请求的 owner 继续默认采集时快照。已结束会话不因 FPS 收尾 hook 再次补计错误，原终态边界仍保留。

独立真实 bundle 复核中，动态 Minigame 和 FPS 的 A 最终均为 `exited/errors=0`，B 为 `exited/errors=1`，各产生一个错误事件；外层 owner 固定 A 时也不抢占 B。当前 isolation Session 为空时，长期 producer 的 hook scope 仍为空，错误事件正常发送，没有重新使用旧会话。

Performance 的 `mark` 分支原本恢复 delivery scope，参数化同一旧 timer 场景后也复现 B 漏计。该分支改为克隆 delivery scope 并使用当前 isolation Session，保留 hook 中的原 active span 和用户数据，不修改原 scope；navigation、mark 的真实最终事件及会话回归都通过。

## 离线与隐私交错

另一路独立检查通过 66 个现有相关用例及四个 beta.4 实际 bundle 探针：删除提交后、Core await 恢复前撤回同意；持久删除失败与新 owner 恢复；重试到 TTL 边界；dispose 与迟到的旧 send／flush Promise。观察到撤回阻止新 request、记录身份与原 TTL 保留、失败删除不交付，以及旧完成不覆盖新 owner。

本范围没有确认新的离线缺陷。提交删除后中断的数据损失、缺乏 durable ACK／恰好一次保证及自定义 transport 取消限制，继续作为已公开的 best-effort 边界保留；不为此增加第二个重试引擎或复制 Core buffer。

本轮验证使用真实 Core、受控宿主和本地构建产物，没有再次进行手机或目标 Sentry 后台验收。真实冻结、设备存储和业务原生监听顺序仍通过 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 收集用户证据。

## beta.5 发布前的全面复审

首轮修复合并到 `master 64a321d` 后，三路独立审查继续覆盖 Core 职责边界、运行时降级和用户文档。新增的确定问题在发布 tag 前处理：

| 问题 | 真实复现或实现证据 | 取舍与修复 |
| --- | --- | --- |
| 临时 Core scope 中初始化丢失新 runtime | A 的异步 `startSpan` 尚未完成时，在 callback 外初始化 B；Promise 完成后 Core 默认 stack 恢复 A，顶层消息被已退休的 A 拒收，B 仍存活但不可达。同步 `withScope` 与首次初始化同样受影响 | 使用 Core 公开 `getDefaultCurrentScope` 判断持久绑定入口；临时 scope 的初始化在构造和退休前拒绝，返回 `undefined` 并诊断 `init_scope_unsupported`。退出上下文后正常根初始化、切换和 `initialScope` 保留；不复制 stack 或把新 client 写进旧操作 scope |
| 不可读的 request API 阻断整个 SDK 初始化 | 平台 `request` getter 抛错，而 `httpRequest` 和自管 transport 可用；默认 NetworkBreadcrumbs 裸能力读取让 `init()` 抛错，连独立事件也无法采集 | 网络观测逐 API 安全探测，故障方法跳过，其余可用方法继续安装 |
| 观测复制失败阻断原业务请求 | 业务 options 的无关枚举 getter 抛错；原宿主只读 URL 与回调可正常执行，SDK 复制却让请求和 success 回调都没有发生 | 观测准备失败透传原 options 与 receiver 给原宿主，只调用一次；宿主本身的异常不重试，已创建的观测资源须收尾 |
| 可照搬的公开示例不符合实际语义 | `isEnabled()` 不检查 consent；请求名归一化跳过 child span；插件顶层 `urlPrefix` 不在现代插件类型中；两个示例重复手动创建自动请求的 HTTP segment | 分清启用与同意状态，归一化所有 HTTP span，移除无效插件选项，示例直接复用自动网络 span。迁移指南只保留用户行为和验收步骤，内部审查细节转入维护者入口 |

本次取舍允许在根控制流中替换一个活动 runtime，不提供任意异步 context 中的初始化，也不支持自定义 async context strategy。scope 中的事件捕获和业务数据仍使用 Core；拒绝初始化不会退休原 client、执行新 transport 构造或应用 `initialScope`。

架构复核继续保留两处窄 protected 适配：Core 在异步事件完成后优先使用当时 scope 的 Session，SDK 因而仅选择采集时引用再委托 Core 更新；Core 的无期限 processing 等待没有公开取消入口，SDK 按 Core tick 检查 dispose 终态。两者都有具体调用链与真实回归，删除后再复制 Core 算法并非改进。Page、Console、Network 的 `setupOnce` 有实际生产消费者，未按名称删 hook。

关闭期间手动创建 span 的 Core 行为保留，用户需先停止业务 trace；SDK 自动 producer 与异常／消息／事件／反馈入口仍停止，最终发送受关闭状态和期限限制。非阻塞清理候选是 Session／TryCatch 内部仅供旧单测调用的 aggregate `cleanup()`；对应 lifetime 资源清理仍有生产消费者，未确认泄漏，后续须先迁移到公开 dispose 回归再逐项删除，不能整类删清理方法。

## 最终检查

- lint 与严格源码／测试类型检查通过。
- 完整 coverage：72 文件／1226 测试通过；statements 98.72%、branches 95.53%、functions 99.23%、lines 99.44%，原门槛全部通过，没有排除新增代码。
- 新增 26 个原生 Session／生命周期、7 个长期观测与操作会话归属、12 个系统信息、5 个初始化 scope 与 9 个网络降级真实 Core 用例；移除的空 hook 存在断言由实际资源与最终数据回归取代。观测准备中的无实际触发路径收尾分支已删除，没有为覆盖率制造私有状态测试。
- CJS／ESM／UMD 与声明入口构建、publint、实际 tarball 消费检查通过：68 个导出、七平台各两种 URL 能力模式与类型入口。
- 微信示例独立 bundle 的运行与本地符号化检查通过；用户文档站构建通过。两者都不代表完成新的目标后台或真机验收。

## beta.5 发布后的内部清理

上述非阻塞候选按调用方逐项收尾：Session／TryCatch 的聚合 `cleanup()` 只有旧单测直接调用，Core 集成契约与生产路径不调用这两个入口。删除聚合方法和对应 Set，保留每个 client 的实际 cleanup 闭包、lifetime stop／finalizer、公开 `registerCleanup()` 与 owner 释放，不按方法名称批量删除其它集成的清理。

原有用例迁到公开 `client.dispose()`，观察重复关闭后的宿主 wrapper 恢复、已注册 App 的迟到事件不再建立 Session、已调度业务任务仍运行并保留原异常且不新增遥测。同一 Session 集成对象跨 A／B 复用的替换回归继续保护 B 和业务手动会话。验证对象是实际 Core 的事件／Session envelope 与宿主函数身份，不以私有 Set 断言代替资源行为。

这是 beta.5 之后的源码清理；已发布版本的验收基线与上文历史证据仍按各自 tag 理解。

本轮 lint、严格类型检查、完整覆盖率与 SDK／文档站构建通过：72 文件／1226 测试；statements 98.72%、branches 95.53%、functions 99.23%、lines 99.43%，原门槛不变。原异常对象身份的强化断言另经对应 13 个 TryCatch 用例验证。

## beta.5 发布后的全面多维度复审

本轮以 `master e535028` 为基线，独立检查当前源码、固定 Core `11.4.0` 与已发布 beta.5 实物。新增修复在 beta.5 tag 之后，不能据此宣称已发布 beta.5 没有这些缺陷；后续 beta 应纳入修复。

| 维度                | 核对与结论                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core 架构           | 逐项核对 scope／Session、事件处理顺序、公开 hook 与生命周期归属。保留两处窄 protected 适配，只选择归属或取消等待后委托 Core，不复制事件、采样、Session 或 buffer 算法                |
| 跨端与业务透明性    | 检查七平台请求、Storage、生命周期和降级；新的冻结 my／dd、可选 getter、只读属性回归验证剩余能力仍工作，原生函数身份、receiver、业务返回和原异常保留                                  |
| 离线与隐私          | Store 消费入口调整参数适配，仍使用原 target／policy／TTL／写前裁剪和先提交后交付协议。冻结宿主持久缓存、授权重放、不可读 Storage 内存降级通过；没有添加重试引擎                      |
| 公共 API 与无用代码 | 四个 factory 返回 Core `Integration`，不把内部控制器方法暴露为声明承诺。删除 request 别名、Storage 原地包装和可写标记；保留实际资源清理、公开 factory 和 Core 委托                   |
| 测试有效性          | 新增用例先复现旧代码失败；从真实公共入口观察最终事件／Session／span。替换只截取手工 span 的示例测试，验证一条请求只产生一条自动 HTTP span，成功／失败业务结果均保留                  |
| 包产物与依赖        | CJS／ESM／UMD、声明与实际 tarball 消费通过；68 个导出，七平台各两种 URL 能力模式。根锁文件全依赖及生产依赖官方审计无安全公告；旧发布工具的弃用提示仍存在，未宣称 GitHub 全仓告警清零 |
| 用户文档与示例      | 核对中文／英文 README、官网、微信／Taro／uni-app 与自带 skill 的实际 API、默认值和版本语义；修正可复制错误、排障承诺和编译说明，将维护者执行细节移出官网用户流程                     |

本轮确定问题及修复：

| 问题                         | 复现与修复                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 空会话操作误计后来会话       | timer／rAF／request 观测及公开 `wrap()` 在没有 Session 时开始，之后 B 创建，迟到异常会令 B 变为出错。操作快照通过 Core 公开 scope metadata 保留明确的空引用；普通业务 scope 仍按 Core 次序回落 isolation，长期 producer／Performance mark 显式选择当前策略。最终 envelope 不含 Session 引用、Symbol 或 processing metadata |
| 平台归一化使初始化失败       | my.request getter、冻结 my／dd、dd Storage getter 的四个公开初始化探针均失败。平台解析改为返回真实宿主，Storage 参数只在 store 消费入口适配；可用 httpRequest 仍能交付实际事件，冻结宿主也能持久缓存并在授权后重放                                                                                                         |
| 可选观测能力阻断独立采集     | 不可读 Page／console 方法、只读 Error.stackTraceLimit 阻断初始化；不可读 offError 使可用 onError 也无法注册。读写失败只跳过相关观测或调优，off 仅在需要解除时安全读取；非函数导航属性不再被伪造成函数                                                                                                                      |
| factory 类型暴露内部清理入口 | Console／Page／Performance／FPS factory 的返回类型仍是内部 class，声明透出 cleanup。统一为 Core Integration，运行实例和实际资源回收不变，并由严格公开类型检查约束                                                                                                                                                          |
| 示例与文档遗漏               | 原生实验室页一条请求生成两个 HTTP segment；页面采样按 HTTP 名判断永远回退；Taro README 的 Error Boundary 未初始化 state。移除多余 HTTP span、改读 route、补初始状态；纠正诊断含 Logs、缺性能能力排障、微信编译必须全关及 CSS 设置与 JS map 的错误关联                                                                      |

独立交叉复核已覆盖空快照标记与 Core metadata merge／clone、当前策略覆盖、宿主不改写、存储错误返回和门禁，以及安全包装与公共类型收敛。Core 升级须重跑这些行为回归；细节和升级条件已登记在 [架构说明](../ARCHITECTURE.md)。

最终本地检查：lint、源码与测试严格类型检查、74 文件／1244 测试及完整覆盖率通过；statements 98.72%、branches 95.46%、functions 99.23%、lines 99.43%，原门槛不变。SDK 构建、文档站构建、微信独立 bundle 运行与本地映射检查通过；官网 20 页的 311 个内部路由／片段链接有效。

本轮没有重跑手机和目标 Sentry 后台验收。真实冻结恢复、弱网、设备存储和最终部署产物的后台映射仍由 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 收集真实用户证据；本地函数调用或映射结果不作为交付证明。
