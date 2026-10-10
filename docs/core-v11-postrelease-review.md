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

## beta.6 发布准备与真实包回归

上述 beta.5 发布后的清理和修复纳入 beta.6。发布包检查增加 CJS／ESM 各 8 个独立进程场景，通过安装包声明的公共入口验证空会话的迟到 timer／rAF／request／wrap，以及冻结 my／dd、只读 request 和不可读 Storage。断言最终事件、Session 终态、持久缓存重放和业务对象身份；普通 `startSession`／`captureException` 的统计是正向对照，最终 envelope 不含内部归属引用。相同检查在已发布 beta.5 两个入口均为 8 个失败，在 beta.6 候选包均通过，避免只检查源码而遗漏 CJS 严格模式差异。

beta.6 候选 tarball 的真实生产依赖通过官方 npm registry 安装与审计，未命中安全公告。Taro／uni-app 的实际依赖审计仍有剩余公告；构建器修补、peer 兼容取舍、两套微信生产构建／watch 首轮／各 3 处业务映射证据见[示例依赖审查](./example-dependency-security.md)。[#467](https://github.com/lizhiyao/sentry-miniapp/issues/467) 已按维护者决定关闭，剩余示例依赖警告暂缓处理，不作为 SDK 升级或发布阻塞；关闭不表示全部警告已修复。

此处记录发布准备证据，实际发版是否成功以对应 GitHub Release 和 npm registry 为准；真实设备及后台矩阵仍待 #457 用户证据。

## beta.7 发布后的维护打磨

本轮基线为 `master e8f4d98` 和已发布 beta.7 实物，检查公共入口、Core 接缝、调度包装、环境字段、生命周期及用户接入路径。以下清理属于 beta.7 之后的源码改动；本轮未发现需要改变 Core 管道或增加旧协议模式的新依据。

- 内部 `helpers.wrap` 的 `before` 参数只有一个单测消费者，唯一生产调用来自 TryCatch，始终传 `undefined`；删除该分支与占位参数。owner 归属、完成释放、业务 receiver／参数／返回值／原异常行为继续由真实 Core 回归保护。
- helpers 的旧异常测试在静态导入之后模拟已移除的 `getCurrentHub`，没有验证采集，且不需要真实计时器；改为检查原异常对象、业务 receiver／参数和仅调用一次。删除仅检查内部 class 名称／实例身份的三个 integration 用例，以及被清理分支的单测；公共 factory、环境字段与最终 envelope 的回归保留，没有新增测试。
- `httpContextIntegration()` 仍是公开入口，显式调用遵循 client 快照和 `enableSystemInfo`。本轮保留该入口，避免为删重复环境填充而制造新的用户 API 迁移；bootstrap／低层 client 的编码兜底也有不同入口消费者，不按重复名称删除。
- 修正快速接入、FAQ 与英文 README 对晚初始化的笼统描述：实际 npm beta.7 在受控原生 App 监听下，初始化即产生 `ok` Session，hide 收尾为 `exited`；不能补回初始化前的启动异常和 `onLaunch` 面包屑。该证据来自公开 CJS 入口与模拟微信宿主，未增加设备验收结论。
- 中英文 README 最小配置先验证错误上报，性能采样另按流量选择；明确旧采集开关会导致初始化报错。官网将重复的 beta 修复历史指向 Releases，集中保留早期 beta 用户必须知道的采集风险与工具出口差异；DSN 示例明确要求替换完整值，保留已有迁移片段链接。

验证通过：lint、严格类型检查、77 文件／1333 测试及覆盖率门槛（statements 98.72%、branches 95.57%、functions 99.23%、lines 99.44%）、SDK 三种产物与实际包消费、七平台 URL 降级和 CJS／ESM 各 20 个公开行为场景、文档站构建与修改页片段链接检查。测试数由 1337 降至 1333；这反映删去重复或无生产用途的断言，不是完成度指标。真实冻结、弱网及设备存储仍由 #457 跟踪。

## 自动采集开销与 URL 边界复核

基线为 `master ca8d157`，本轮检查网络自动采集、离线记录读写、正文脱敏及页面包装的运行成本。

- 网络请求为 URL、breadcrumb query 和 span 名称重复调用 Core `parseUrl`，其中 collectUrl 自身解析两次；改为一次生成内部 `collectUrlParts` 并复用。仍由 Core 处理解析、名称与键过滤，不新增 URL 算法、公共配置或全局缓存；业务 URL、正文拒绝规则和传播白名单保持原输入。
- 复现畸形 `data:image/png?access_token=canary-token;base64,...` 与 MIME 区域 fragment：Core `stripDataUrlContent` 会留下这部分 MIME 字符串，原网络／资源性能 span 的名称和 `url.full` 仍包含 canary。裁剪正文之后再调用 Core `stripUrlQueryAndFragment`，过滤所有自动采集出口。复用并加强已有数据采集、真实 Core HTTP 与 Performance 回归，合并同一边界的 URL 输入，未增加测试文件。
- 评估了离线校验延迟还原 JSON／binary 的候选实现。同机 Node 24、七轮交错的受控对照中，30 条 16 KiB JSON 和 6 条 100 KiB 附件的整批读取中位耗时分别从约 4.4／7.9 ms 上升到 5.1／8.8 ms；输出 wire 一致，但没有足够证据支持增加校验模式和内部控制分支。撤回该候选，保留现有 Store、typed record、重试身份、TTL 和先提交后交付语义。

URL 处理的本机受控对照覆盖 credentials、重复 query 键、追加敏感键、坏编码、相对路径、文件协议、data／javascript 与空 URL。已测原有 URL 场景输出保持一致；畸形 data MIME 的 query／fragment 按上述隐私修复省略。这些测量用于判断改动取舍，不代表真实设备耗时或 Sentry 后台验收。

实际 npm beta.7 的 CJS／ESM 公开入口均复现上述 data MIME 泄漏；候选构建在原生、缺失与残缺 `URL` 三种宿主模式下，两个入口的事件、两条 HTTP span 与两条资源 span 均不含 canary，原始业务请求 URL 保持一致。最终检查通过：lint、源码与测试类型、77 文件／1331 测试及原覆盖率门槛（statements 98.72%、branches 95.62%、functions 99.23%、lines 99.44%）、SDK 三种产物、实际 tarball 消费与七平台 URL 降级、微信独立 bundle 和本地映射检查。测试数比上一轮减少 2，覆盖的坏 URL 场景反而增加。本轮修复属于 beta.7 之后的源码改动，尚未发包。

## 可选性能能力的失败隔离

基线为 `master c2387e4`。本轮沿着 owner 退休、共享包装、Performance 注册与告警输出检查降级行为，确认并修复三处实际问题：

- `observe()` 部分注册后抛错，原 controller 直到 client 关闭才解除；失败后的回调仍能产生 span。改为失败时立即清理 controller，先释放 owner，再尝试 `disconnect()`；解除同步触发回调或抛错时，回调仍不读取条目，也不生成遥测。错误事件和 HTTP 集成继续运行，不关闭整个 client。
- 宿主性能 API／observer 抛错时，错误路径的 `console.warn` 也可能不可用或抛错，导致 `init()` 失败。隔离这两处告警输出；公开 `getPerformanceManager()` 在宿主 API 失败时保留 `null` 回退，并只读取一次 `getPerformance`、保留宿主 receiver。
- FPS 的非法 `jankLevels` 本应回退单档阈值，但告警抛错会阻断 factory 构造与默认初始化。隔离该告警；真实 Core 最终汇总仍按单档 50ms 回退，保留真实 jank 数而不输出非法分档属性。

改动留在各自能力边界，没有增加全局吞掉 integration 异常的逻辑、公共配置、额外遥测管道或后台协议。复用并加强五个已有测试文件；修复前 Performance 的三个用例及 FPS 的五个用例失败，修复后通过，测试总数保持 1331。架构文档记录维护约束，用户性能指南只说明失败时仍可继续错误和请求监控。

实际 npm beta.7 的 CJS／ESM 公开入口各复现五个失败场景：监听部分注册、宿主 API 与不可用／抛错控制台组合，以及 FPS 非法分档与两种控制台故障。候选 CJS／ESM 在七平台受控宿主下的 70 个对应检查通过，最终各保留一个独立事件与一个 HTTP span，失败监听不产生性能 span。此证据来自安装包入口和宿主模拟，不是设备或 Sentry 后台验收。

本地检查通过：lint、源码与测试类型、77 文件／1331 测试及原覆盖率门槛（statements 98.73%、branches 95.61%、functions 99.23%、lines 99.44%）、SDK 三种产物、实际 tarball 消费与七平台 URL 降级、微信独立 bundle 和本地映射检查、文档站构建。本轮源码修复尚未发包，真实设备反馈继续由 #457 跟踪。

## 面包屑关闭边界与跨 client 归属

基线为 `master ab3dd9e`。本轮检查数据采集、生命周期与资源释放的交叉边界，复现了关闭过程中向共享 scope 写入旧面包屑的问题：console 参数的 `toJSON`／`toString` 或 `beforeBreadcrumb` 调用 `dispose()`／`close()` 后，原条目仍进入 Core isolation scope，随后出现在新 client 的事件里；格式化还会继续读取后续参数。对已关闭 client 手动调用 `addBreadcrumb()` 也会执行用户过滤回调并留下条目。

- 在 Core 公开 `beforeBreadcrumb` 回调前后使用既有 lifetime 采集门禁，关闭后不执行用户回调，回调中关闭后返回的条目丢弃；同步 finalizer 仍可生成有效面包屑。回调执行使用现有同步临界区，拒绝在其中重入 `init()`。没有覆写 protected 方法、改写 Scope 或另建 breadcrumb 管道。
- console 按安装时的 client 检查当前绑定、启用状态及自动采集权限；在每个参数与 JSON／String 用户代码边界重新检查，退休后不读取后续参数或执行额外的字符串回退。观测仍不改变原 console 的 receiver、参数、返回身份和业务异常。
- 加强已有关闭、同步收尾、重入和正常 console 回归，新增两个关闭方式的真实 Core 用例，共覆盖八种中途退休组合。修复前五个用例失败，修复后通过；正常记录、返回 `null` 的过滤和同步收尾保留正向对照。关闭不自动清空此前已记录的面包屑，官网配置指南说明了关闭与显式清空的区别；README 的接入 API 未变，无需增加维护历史。

实际 npm beta.7 的 CJS／ESM 入口共 20 个对照场景均复现问题。候选构建及实际候选 tarball 在七平台受控宿主下，CJS／ESM、五种边界、两种关闭方式的 140 个检查全部通过，最终新 client 事件没有旧条目。证据来自公开入口、真实 Core envelope 和宿主模拟，不是设备或 Sentry 后台验收。

本地检查通过：lint、源码与测试严格类型、77 文件／1333 测试及原覆盖率门槛（statements 98.71%、branches 95.60%、functions 99.24%、lines 99.44%）、SDK 三种产物与实际包消费、微信独立 bundle 和本地映射检查、文档站构建。本轮源码修复尚未发包，真实设备反馈继续由 #457 跟踪。

## 请求快照与日志指标的晚到数据

基线为 `master 9c26592a`。本轮从公开入口追踪请求字段、Core 属性转换、批处理调度和关闭门禁，固定对照官方 `11.4.0` 的 Browser、Node、Deno、Cloudflare 与 Core 源码；取舍和直接上游链接补入[官方 SDK 对照](sdk-official-practices.md#beta7-后的请求与批处理边界对照)。

| 确定问题 | 复现与修复 |
| --- | --- |
| 属性转换在采集回调之后关闭 client，Core 重建批处理资源 | Logs／Metrics 的属性 getter 在 `beforeSendLog`／`beforeSendMetric` 之后调用 dispose；之后 Core 入 buffer，再创建 5000ms timer。属性 getter 调用 close 后立即 flush，晚到条目还会发送。补守 `afterCaptureLog`／`afterCaptureMetric`，使用公开 flush 排弃，仅屏蔽 `log`／`trace_metric` 交付；同步 finalizer 和已有异步错误保留，close 通知不重复，不访问私有 buffer。 |
| 请求包装丢失额外参数 | 宿主接收到的第二、第三参数消失，观测失败透传也受影响。改为保留完整参数数组；正常观测、失败降级和零参数调用均保留 receiver、task 和业务异常，只执行一次原请求。 |
| 字段多读导致观测与实际发送不一致 | URL getter 第一次返回白名单域名、第二次返回其它域名，追踪头却注入到第二个域名；method、data、header 和 success getter 也多次读取。单次快照同时用于白名单、脱敏、span、回调包装与宿主发送，补齐相关非枚举／继承字段，保留可枚举 Symbol 与 `__proto__` 数据字段。无法读取时透传原 options。非字符串 URL 不根据其可能变化的转换结果放行头或正文。 |
| 响应 getter 中退休后仍读后续字段 | statusCode 最多读三次，data 读两次；读取期间关闭 client 后仍可能继续读备用 headers／errorMessage。改为单读字段，并在用户代码边界检查活动状态。响应正文开关和业务 success／fail／complete 仍保留原语义，不能把观测退休变成业务回调取消。 |

已发布 npm beta.7 的 CJS／ESM 两个公开入口在九种边界的 18 个对照检查中均失败，包含晚到 `log`／`trace_metric` 的实际 envelope。候选构建及实际候选 tarball 在七平台受控宿主下，两个入口各九种边界的 126 项检查全部通过；正常白名单／白名单外请求、已接受事件排空和原业务调用有正向对照。证据来自公开安装包、真实 Core payload 和宿主模拟，没有新增真实手机或目标 Sentry 后台验收。

优先强化已有日志／指标、同步 finalizer、响应退休、请求降级和特殊输入用例，只新增两项独立测试定义，总数从 1333 到 1335。没有降低覆盖率门槛、排除新增代码或复制 Core 的批处理引擎。README 的接入 API 和版本未变；架构记录维护约束，官网只澄清处理过程中关闭 client 的用户行为。本轮修复尚未发包，真实设备反馈继续由 #457 跟踪。

最终本地检查通过：lint、源码与测试严格类型、77 文件／1335 测试及 shuffle、原覆盖率门槛（statements 98.73%、branches 95.62%、functions 99.24%、lines 99.45%）、SDK 三种产物、publint 与实际包消费、微信独立 bundle 与本地符号化、文档站构建。Core 及其它依赖版本未改。
