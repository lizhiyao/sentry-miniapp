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

Replay 与错误使用官方的 `event.tags.replayId` 关联；已有标识不覆盖。`preprocessEvent` 将捕获时的录制标识绑定到 EventHint 的 WeakMap，`postprocessEvent` 在 scope 合并之后写入标签，避免异步 processor 把旧错误归到新录制。只有 afterSendEvent 返回 2xx 的错误 ID 才进入录制 metadata。Replay event 与 recording 组成一个 envelope；recording 为 segment header 换行加 rrweb 数组，header length 使用 UTF-8 字节数。

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

Node 工具使用 htmlparser2 解析 WXML、Babel Parser 验证绑定边界、entities 编码 XML 属性，不 eval 业务表达式。只输出独立项目副本，保留业务 JS/map、原绑定和样式；解析依赖及其许可证归入独立 Node 构建产物，不进入小程序执行代码。静态组件图按 app/局部 usingComponents、import/include 解析；模板型框架入口明确拒绝，不能无证据扩大框架覆盖。

组件路径解析以微信已经构建的项目为输入，遵循本地文件／目录入口优先、再逐级查找 `miniprogram_npm` 的顺序，并要求组件的 JSON 与 WXML 均存在；不替代微信 npm 构建，也不读取或复制 `node_modules`。声明保留自己的来源文件，避免全局引用被错误解释成页面相对路径；只有实际出现的组件标签才解析依赖。npm 内部组件与独立分包不继承 app 的全局声明，import/include 继续继承引用处的组件环境，相同模板被不同组件绑定引用时明确拒绝。读取依赖前检查源项目中的符号链接，拒绝外部资源、路径逃逸和被排除目录。

微信实际查询证明 mark 只保留当前组件内的祖先，进入组件内部会重置。生成标记包含来源、直接父节点和组件目标来源闭包；查询前序用于进入新组件实例，局部 mark 注册表区分重复列表，slot 返回声明它的作用域。父信息缺失时保守跳过；遮蔽与 block 在读取后代文字前继承。快照按 rrweb 的标准 childNodes 重建树，位置相对父盒子和边框，scroll-view 的 overflow 用于裁剪与点击可见范围。私人输入和媒体无论 unmask 均使用占位。

点击捕获复用共享函数 instrumentation 的 client 参数观察者。观察者不能执行或重试业务原函数，与主 handler 共用一个包装和最后退订恢复；中性 Page/Component 方法在调用时读取当前录制器，退休 client 不持有组件回调。已有业务 capture 绑定和保留方法不覆盖；冻结定义或无法包装的构造入口安全降级。

自动 session/error 采样只决定本录制器发送资格，不替代 Core 的错误采样。默认 session=0、error=1，未触发的缓冲受 60 秒与 UTF-8 字节预算限制，截断时重建完整基线。错误捕获时抽样及固定身份，metadata 的 error_ids 仍只接受 2xx 回执，异步 processor 不转移录制归属。后台或时长结束不发送未抽中的缓冲；手动停止不能被前台事件复活。

内联 text 按测量的内容高度（扣除 padding 和 border）判断单行，单行保留不换行，多行保留自然换行与显式换行。宿主与播放器的字体度量不同，不能按盒子总高度把单行标签误判为多行。

本轮主 CJS 261100 B（主预算 261120 B 保持不变），可选 CJS 25076 B（gzip 9140 B），比基础入口增加 5711 B，覆盖组件树、裁剪、隐私继承、构造观测和错误前缓冲。可选入口预算调整为 26 KiB，保留约 1.5 KiB 修复余量；Node 工具约 423 KiB、gzip 109 KiB，不计小程序运行包，但计入 npm 安装大小。未启用项目只承担主文件的共享观察桥接增量，未增加第二条 SDK 发行线。
