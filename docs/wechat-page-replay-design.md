# 微信页面回放的职责与验证

录制器通过微信公开 SelectorQuery 读取标记节点的可见布局，生成 rrweb 标准 Meta、FullSnapshot 与点击事件。它是采样布局投影，不持有或遍历 WebView 的私有 DOM，也不包装业务 setData。

## 职责

- `src/replay/frame.ts`：读取允许的标记和样式，在进入缓冲前遮蔽文本、移除资源加载样式，生成标准 rrweb 快照。
- `src/replay/index.ts`：前台录制、单一异步查询、分段预算、错误关联和 Replay envelope。主入口不导入它。
- `MiniappClient.registerAutomaticProducer()`：复用共享 App／原生生命周期、同意更新、flush、finalizer 和 stop gate。可选入口不另装全局监听。
- Core 和现有 transport：envelope 发送、限流、队列、离线与同意策略。播放器使用官方 rrweb，不进入小程序产物。

可选构建 externalize 主 SDK，按 ESM/CJS 引用相同格式的主文件。不能只依赖源码导入检查，安装后的入口还须验证 Client 身份、Core scope 与重新初始化行为。

### 为什么按普通 integration 安装，却保留独立入口

它使用与其它集成相同的 factory、Core setup/hooks 和 `integrations` 配置；独立的是导入与发布构建。`sentry-miniapp/replay` 仍属于同一个 npm 包，共用当前 Client、transport 和关闭／同意边界。

[官方 Browser npm 入口](https://github.com/getsentry/sentry-javascript/blob/11.6.0/packages/browser/src/index.ts)从根重导出 Replay，但其 [npm 构建](https://github.com/getsentry/sentry-javascript/blob/11.6.0/packages/browser/rollup.npm.config.mjs)保留模块、包标记 `sideEffects: false`；[浏览器 bundle](https://github.com/getsentry/sentry-javascript/blob/11.6.0/packages/browser/rollup.bundle.config.mjs)分别提供普通和包含 Replay 的构建。这里的主 CJS/UMD 已预先合并，根导出会让不启用回放的单文件消费端也携带录制器。

2026-10-13 使用同一 Vite 配置比较，仅改变入口导出、不计 Source Map：

| 产物 | 独立入口时的主文件 | 根导出回放的主文件 | 增加 |
| --- | --- | --- | --- |
| CJS | 260620 B | 272299 B | 11679 B，gzip 增加 4007 B |
| UMD | 260425 B | 272092 B | 11667 B，gzip 增加 4004 B |

独立 CJS 回放入口约 19 KiB，含自身 helper 与声明注释；启用它时两个文件的总量会高于合并构建，因此独立入口的收益主要属于不启用回放的用户。当前采用按需入口，避免新增 lite/full 发行线。若以后主包改为模块化分发，应重新评估根导出，不能仅凭源码 import 断言消费端已经裁剪。

## 数据与归属

默认查询页面标记与所选页面根节点跨组件标记的并集，读取位置、尺寸、白名单样式、mark 与生成的文字绑定。输入、图片与原生绘制内容使用占位；不复制页面 data、任意 dataset 或输入值。Meta 的路由去掉 query/fragment。

回放的页面地址使用保留域名 `https://miniapp.invalid/` 加实际路由，只用于播放器展示，不执行网络请求。Sentry 播放器按标准 URL 的 origin 展示页面，使用自定义协议会出现 `null` 前缀。堆栈与 Source Map 的 `app:///` 路径保持原有职责。

每个异步查询固定开始时的页面与录制 generation，提交前再次核对活动 client 和页面。查询超时、后台、停止、同意撤回及 client 关闭会结清等待；留在宿主中的旧回调释放 Recorder 和 Promise resolver 引用。销毁控制器清空 client 引用；公开 start 不能复活已替换的实例。

Replay 与错误使用官方的 `event.tags.replayId` 关联；已有标识不覆盖。`preprocessEvent` 将捕获时的录制身份与错误采样结果绑定到 EventHint 的 WeakMap，`postprocessEvent` 在 scope 合并之后写入可用身份，避免异步 processor 把旧错误归到新录制。采样判断不直接赋予缓冲发送资格：通过 event processors 和 `beforeSend` 后，公开 `beforeSendEvent` 才允许同一活动录制排放。已退休或撤回同意的未授权缓冲不再关联，也不能由迟到错误解锁新录制；已获发送资格的旧录制仍保留捕获时关联。后台等待中的同一录制可在过滤完成后提交已有尾段，不重新启动查询。

只有 afterSendEvent 返回 2xx 的错误 ID 才进入录制 metadata。与[官方错误关联处理](https://github.com/getsentry/sentry-javascript/blob/11.6.0/packages/replay-internal/src/coreHandlers/handleGlobalEvent.ts)及[接收后处理](https://github.com/getsentry/sentry-javascript/blob/11.6.0/packages/replay-internal/src/coreHandlers/handleAfterSendEvent.ts)一样，采样、事件关联和 HTTP 回执是不同阶段。本 SDK 在 Core 完成过滤后允许缓冲进入同一 transport，沿用离线与生命周期门禁；该许可不代表服务器接收成功。Replay event 与 recording 组成一个 envelope；recording 为 segment header 换行加 rrweb 数组，header length 使用 UTF-8 字节数。

Envelope 头复用 Core 的 `createEventEnvelopeHeaders` 与 `getSdkMetadataForEnvelopeHeader`，遵循官方 Replay 的 SDK／tunnel 字段处理。Replay payload 携带当前 Client 的 SDK metadata，其中自动 IP 推断沿用 `dataCollection.userInfo` 对应的 `infer_ip`；模板文字的显式解除遮蔽仍由业务控制。

## 预算

单一在途查询，默认 500ms 采样、10 秒排放、200 节点、128KiB 分段、5 分钟时长。内容未变化时不追加快照。每段以完整快照作为基线；新关键帧可替换未变动的基线，点击必须保留基线。容量排放后再次核对预算与活动身份。

这里没有自动 DOM 树、任意文本、图像像素、动画或原生组件绘制的保证；父子结构和滚动裁剪通过编译元数据、组件作用域和宿主查询前序重建；复杂层叠仍有近似。Skyline、其它宿主和小游戏明确跳过。编译后的所选页面使用默认跨组件查询。

## 验证接缝

- 真实 Core：错误关联、Replay item 类型/length、同意、关闭、重入、查询超时和预算。
- 官方 rrweb：重建快照、点击、布局变化和节点消失。
- 安装后的 npm 包：ESM/CJS 共享主入口、NodeNext 声明、主包和可选包预算。
- 微信开发者工具／目标设备：真实节点字段、作用域、性能及平台覆盖。
- 目标 Sentry：实际接收、关联和播放。协议构建、本地播放和 HTTP 成功分别记录。

2026-10-13 微信开发者工具 Stable 2.02.2608080／基础库 3.17.4 验证了实际标记布局、状态变化、节点消失、滚动和输入占位。CLI 的 Element.tap 不提供坐标，后续使用原生 UI 控件点击取得真实坐标，没有注入替代位置。最终录制 `98250ea5bfb94a0597139c99c5ee5593` 导出 20 个事件／8 个快照，官方 rrweb 在 jsdom 可重建上述变化；实际测试输入未进入录制。

同一录制已在 Sentry Replay 列表和播放器读回：初始布局、状态更新、节点消失、点击指针与输入占位可见，页面地址正常展示。错误 `3a045f435bf8493281e368885d070e14` 已列入录制活动，错误详情可反向打开同一回放。设置 `dataCollection.userInfo: false` 后，实际分段携带 `infer_ip: never`，后台显示匿名用户。示例仍保留 `setUser()` 的固定演示值，不将自动 IP 开关描述为删除所有业务显式数据。

以上证据来自 IDE 模拟器与 Sentry SaaS；iPhone 真机、设备性能、其它基础库、跨组件框架产物和自建 Sentry 部署未作验收保证。已有实现与验收证据保留在 [#530](https://github.com/lizhiyao/sentry-miniapp/issues/530)，后续任务统一由 [#533](https://github.com/lizhiyao/sentry-miniapp/issues/533) 跟踪。


## 构建适配与复杂组件

Node 工具使用 htmlparser2 解析 WXML、Babel Parser 验证绑定边界、entities 编码静态 XML 属性，不 eval 业务表达式。只输出独立项目副本，保留业务 JS/map、原绑定和样式；解析依赖及其许可证归入独立 Node 构建产物，不进入小程序执行代码。静态组件图按 app/局部 usingComponents、import/include 解析；模板型框架入口明确拒绝，不能无证据扩大框架覆盖。

私有节点的类型由实际 WXML 标签确定。已有 `data-sentry-replay-type` 只有与输入／媒体节点的真实类型相符时才保留，冲突或动态覆盖明确拒绝；不能借普通文字标记绕过运行时私有类型占位。业务 value、原绑定和其它属性不改写。

条件 `block` 的文字按 if／elif／else 顺序合并到现有容器的标记，保留绑定作用域；渲染子节点的文字单独投影，避免把 mask 子节点复制到公开祖先。生成的文字属性用固定前缀强制宿主执行文字插值，录制端只在专属格式标记存在时移除前缀，保留 0、false 与 null 的宿主显示语义。每个来源文件按需生成 WXS 字符串常量；include 不保留被引用文件的 WXS 声明，因此引用者带齐其静态模板闭包。新增模块没有外部依赖与业务函数调用，但属于实际 WXML/WXS 包增量。

WXML 绑定中的运算符不能按静态 XML 内容转义，原 class 追加保留原引号与绑定源码。复制的文字表达式将普通字符串移入来源专属常量，避免属性引号和实体编码改变语义；含转义字符串、函数调用或 text decode 的自动文字明确拒绝，要求提供显式显示值。结构循环内裸文字和结构标签上的隐私设置也明确拒绝，不能把不存在的布局节点当作可靠的隐私／重复实例边界。

零面积宿主与整棵树隐藏分别处理：可见后代仍可投影；显式 block 的可见后代只贡献裁剪后的几何占位，不读取文字。屏蔽占位拒绝命中坐标，不能依赖近似层叠顺序假定其它节点遮住敏感区域。

组件路径解析以微信已经构建的项目为输入，遵循本地文件／目录入口优先、再逐级查找 `miniprogram_npm` 的顺序，并要求组件的 JSON 与 WXML 均存在；不替代微信 npm 构建，也不读取或复制 `node_modules`。声明保留自己的来源文件，避免全局引用被错误解释成页面相对路径；只有实际出现的组件标签才解析依赖。npm 内部组件与独立分包不继承 app 的全局声明，import/include 继续继承引用处的组件环境，相同模板被不同组件绑定引用时明确拒绝。读取依赖前检查源项目中的符号链接，拒绝外部资源、路径逃逸和被排除目录。

微信实际查询证明 mark 只保留当前组件内的祖先，进入组件内部会重置。生成标记包含来源、直接父节点和组件目标来源闭包；查询前序用于进入新组件实例，局部 mark 注册表区分重复列表，slot 返回声明它的作用域。父信息缺失时保守跳过；遮蔽与 block 在读取后代文字前继承。快照按 rrweb 的标准 childNodes 重建树，位置相对父盒子和边框。scroll-view 按原生视口语义裁剪，即使公开的外层 overflow 为 visible，也保留后代与点击的可见边界；其它盒子按实际 overflow 处理。私人输入和媒体无论 unmask 均使用占位。

调用处的裸默认插槽文字没有自己的 SelectorQuery 盒子；画在组件宿主上会被内部背景覆盖，且无法正确遵守插槽容器的隐私。工具识别唯一默认插槽的现有直接渲染容器，运行时将宿主已遮蔽文字交给该容器，再应用内部 mask／block；不插入包装节点或改写事件。混排、多个默认插槽、循环／条件 slot、顶层 slot 或经其它组件转发的裸文字没有确定的原生布局边界，生成前明确报错。调用处已有的 text/view 节点保留自身查询与隐私路径，手动组件文字仍是显式盒子内容。

显式节点的声明父节点与渲染父节点分开处理：mark 与原父标记仍验证声明作用域；静态槽名按宿主实例查找实际容器，沿默认／具名转发链连接到其布局与隐私祖先。槽名编码只在 Node 工具执行；容器与转发共用一份长度有界元数据，运行时只处理字符串关系。未知容器／名称类型或元数据超限时使用屏蔽占位，不读取实际文字；关联遍历以原始节点数为上限，不持有跨帧槽位缓存。Vant Field→Cell 的具名转发属于同一通用路径，不对库名做条件处理。

点击捕获复用共享函数 instrumentation 的 client 参数观察者。观察者不能执行或重试业务原函数，与主 handler 共用一个包装和最后退订恢复；中性 Page/Component 方法在调用时读取当前录制器，退休 client 不持有组件回调。已有业务 capture 绑定和保留方法不覆盖；冻结定义或无法包装的构造入口安全降级。

自动 session/error 采样只决定本录制器发送资格，不替代 Core 的错误采样。默认 session=0、error=1，未触发的缓冲受 60 秒与 UTF-8 字节预算限制，截断时重建完整基线。错误捕获时抽样及固定身份，Core 过滤通过后才允许错误缓冲排放；metadata 的 error_ids 仍只接受 2xx 回执，异步处理不转移录制归属。后台或时长结束不发送未获许可的缓冲；手动停止不能被前台事件复活。

所有带文字的容器（包括 text、view 和 button）按测量的内容高度（扣除 padding 和 border）判断单行，单行保留不换行，多行保留自然换行与显式换行。宿主与播放器的字体度量不同，不能按标签类型或盒子总高度把单行标签误判为多行；此规则不复制字体资源。

可选录制器的原始字节预算为 26.5 KiB，标准构建与微信独立 bundle 均检查；主 CJS 的 255 KiB 预算不因回放放宽。Node 工具包含解析器与独立许可文件，只计入 npm 安装大小；生成的 WXML/WXS 标记仍须计入实际小程序包增量。未启用回放的单文件消费端不携带录制器，项目不增加第二条 SDK 发行线。具体构建、项目包与设备开销证据由 [#533](https://github.com/lizhiyao/sentry-miniapp/issues/533) 跟踪。

静态插槽的容器／转发关联增加了必要的隐私与位置处理。共享组件作用域创建和布局样式计算后，微信录制器实测 26821 B，比不含此关联的构建增加 281 B；预算仅增加 512 B，主 SDK 预算与实际大小保持原值。该体积与真机查询开销分别验收，不以字节变化替代设备性能测量。
