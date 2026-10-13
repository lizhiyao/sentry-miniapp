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

默认只读取 `.sentry-replay` 的位置、尺寸、白名单样式和明确的文字标记。输入、图片与原生绘制内容使用占位；不复制页面 data、任意 dataset 或输入值。Meta 的路由去掉 query/fragment。

每个异步查询固定开始时的页面与录制 generation，提交前再次核对活动 client 和页面。查询超时、后台、停止、同意撤回及 client 关闭会结清等待；留在宿主中的旧回调释放 Recorder 和 Promise resolver 引用。销毁控制器清空 client 引用；公开 start 不能复活已替换的实例。

Replay 与错误使用官方的 `event.tags.replayId` 关联；已有标识不覆盖。`preprocessEvent` 将捕获时的录制标识绑定到 EventHint 的 WeakMap，`postprocessEvent` 在 scope 合并之后写入标签，避免异步 processor 把旧错误归到新录制。只有 afterSendEvent 返回 2xx 的错误 ID 才进入录制 metadata。Replay event 与 recording 组成一个 envelope；recording 为 segment header 换行加 rrweb 数组，header length 使用 UTF-8 字节数。

## 预算

单一在途查询，默认 500ms 采样、10 秒排放、200 节点、128KiB 分段、5 分钟时长。内容未变化时不追加快照。每段以完整快照作为基线；新关键帧可替换未变动的基线，点击必须保留基线。容量排放后再次核对预算与活动身份。

这里没有自动 DOM 树、任意文本、图像像素、动画或原生组件绘制的保证；父子裁剪和层叠通过平面可见盒子近似。Skyline、其它宿主和小游戏明确跳过。自定义组件需要使用宿主允许的显式跨组件选择器。

## 验证接缝

- 真实 Core：错误关联、Replay item 类型/length、同意、关闭、重入、查询超时和预算。
- 官方 rrweb：重建快照、点击、布局变化和节点消失。
- 安装后的 npm 包：ESM/CJS 共享主入口、NodeNext 声明、主包和可选包预算。
- 微信开发者工具／目标设备：真实节点字段、作用域、性能及平台覆盖。
- 目标 Sentry：实际接收、关联和播放。协议构建、本地播放和 HTTP 成功分别记录。

实际微信 CLI 已验证标记布局、状态变化、节点消失、滚动和输入占位，并导出录制让官方 rrweb 在 jsdom 重建。CLI 的 Element.tap 交付的事件没有坐标，不补造点击位置来声称真实点击通过；坐标接缝以官方事件定义和 Core 用例验证，原生点击仍待验收。示例导出仅包含本页面的录制、分段元数据和关联错误回执；错误 HTTP 200 仍不代表后台回放播放通过。

实施与验收证据持续维护在 [#530](https://github.com/lizhiyao/sentry-miniapp/issues/530)。未完成后台验收时不把本地结果写成已支持的后台能力。
