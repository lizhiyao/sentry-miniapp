# 微信回放框架自动接入复核

本记录对应 2026-10-15 的 [#549](https://github.com/lizhiyao/sentry-miniapp/issues/549)，在 2.1.0 发布后为 Taro / uni-app 增加一次配置的自动构建接入。它记录本轮源码候选，不表示 npm 2.1.0 已包含新插件。原生项目的独立目录 CLI 继续保留；用户指南见[页面回放](https://sentry-miniapp.pages.dev/guide/page-replay)。

## 实现与取舍

- uni-app Vue 3 / Vite：在有序、串行的 `writeBundle` 后处理最终 WXML，使用现有静态组件、循环、插槽与隐私投影。微信之外的目标不处理。
- Taro 4 / webpack5：通过公开 webpack 配置与资产 hook 处理共享模板，用静态 mark 键及实例 sid 维持查询前序的父子／组件归属；只有选定页面的模板入口传递 root 身份。保留混合项目中的普通 WXML 页面，不添加包装节点。
- Taro 细粒度文字更新需要额外适配：仅用 WXS 读取整个 `i.cn` 会在按钮文字更新后仍返回初始文字，已用官方编译器及模拟器复现。插件通过公开 EntryPlugin 注入一个复用业务项目 Taro runtime 的观测器，并启用其 MutationObserver；仅同步直接文字和三个隐私布尔开关，不获取页面 data 或输入值，不遍历子树的 textContent。每批最多处理 2000 个不同节点，重复目标合并，文字限制 256 字符；缺失能力和失败不阻断业务。
- 构建插件维护上一轮的干净输入，重复构建不叠加标记；已移除依赖恢复原模板。先完成整个标记计划，再修改输出资产。业务脚本和 Source Map 仍由原编译器生成，不事后拼接改写。
- Node 解析器不进入手机代码。主 SDK 与通用 Replay 的执行产物、预算均未变；Taro 插件另有约 2.9 KB 的观测器源码，应用还承担启用 Taro MutationObserver 与 WXML 标记的成本。不能把“主包不变”理解为选用插件的应用零成本。

Taro 的观测基于其[公开模拟 DOM](https://docs.taro.zone/docs/taro-dom)及当前固定版本的实现；不访问微信渲染层 DOM，也不依赖 renderjs。构建 hook 见 [Taro 插件文档](https://docs.taro.zone/docs/plugin-custom/)。未知模板、外部插件、动态路径与无法安全定位的插槽仍明确报错，不能用静默跳过或新增布局节点扩大支持。

## 本地验证方法

仓库真实示例使用 Taro 4.2.1 / React / webpack 5.104.1，以及 DCloud `3.0.0-5020620260917001`（编译器 5.26）/ Vue 3 / Vite 6.4.3。依赖从官方 npm registry 安装，示例 SDK 替换为同一次构建的 tarball。

1. 正常构建及 `SENTRY_REPLAY_LOCAL=1` 构建均使用原框架命令；`check-framework-replay.mjs` 核对实际入口、组件和注入代码。业务 Error 的 JS/map 坐标继续精确往返。
2. 两套真实 watch 各经历首次、修改回放页标题、恢复原文三轮；不依赖模拟编译器。对应单测保护重复写入、移除依赖、其它平台 no-op、模板实例隐私与文字更新接缝。
3. 微信官方 IDE 模拟器使用最终包的独立构建副本、既有示例 AppID 和基础库 3.17.3。只用内存 transport，禁用 SDK 持久缓存；没有 Sentry 网络上报或真机连接。
4. 操作更新按钮、重复卡片、嵌套循环和组件内滚动，导出真实分段。核对公开文案与更新后的文案、默认／显式遮蔽、输入占位、屏蔽区域、组件边界和后续公开兄弟。实际原生界面点击与 CLI 的无坐标点击分开记录；不会补造坐标事件。
5. 本机 Chrome 加载仓库提供的官方 rrweb 播放器，访问范围仅为 127.0.0.1。核对导入、实际分段、最后画面、隐私和页面错误，不加载 CDN 或登录后台。

当前公共接入范围是 Taro 4 / webpack5、uni-app Vue 3 / Vite 编译出的微信 WebView 页面；不据此承诺任意编译器、原生绘制、外部插件和组件库内部像素都能完整录制。此轮不重启用户已取消的真机／最终 Sentry 后台验收；它们继续作为真实项目反馈范围，由 [#533](https://github.com/lizhiyao/sentry-miniapp/issues/533) 跟踪。

## 本轮结果

- lint、源码／测试类型检查、1405 个单测通过。相对基线新增 3 个用例，分别保护 Vite 增量输出、Taro 文字观测与模板实例归属；复用现有框架初始化用例，不以数量验收。
- 完整构建、publint 和实际 tarball 的隔离安装消费检查通过：CJS / ESM 各覆盖 7 平台 × 15 宿主模式、UMD、74 个公共类型导出与各 22 类行为；新 Node 插件入口实际可加载。两套框架的业务错误各有 3 个坐标精确往返。
- 主 CJS 仍为 261100 B，可选 Replay CJS 仍为 27104 B，原预算未放宽。原生与其它宿主的源码运行路径未改。
- 最终包的 Taro 实录 3 段、106382 B，包含一次实际界面点击（195,149）及滚动后的公开卡片 C；uni-app 实录 3 段、152758 B，包含一次实际界面点击（195,144）、默认插槽及滚动后的公开兄弟。文字更新、显式 mask、跨 CustomWrapper 遮蔽、输入与 block 占位均有正向对照；所有 `PRIVATE_*` 示例原文均未进入文件。
- 两份录制在本机 Chrome 的官方 rrweb 播放中复核；没有外部资源请求或页面异常。没有 HTTP 2xx 或 Sentry 后台回执；本地 flush 返回 false 如实保留。

验证 tarball SHA-256：`fd146ebf5e93cedb31b1f88e695c751db85256e74265a9fb21cc0c8d119efc4b`。Taro 录制 SHA-256：`166ebc9c11f271ed8efd08987cfef1127327a425ef9fae131d575afe0e9c0d36`；uni-app 录制 SHA-256：`d1dc96871cc4591ff86724881f0c322456d108a0cebd298251dd3018a3396371`。本地原始输出及播放器截图保留在忽略的 `scratch/replay-framework-adapters-20261015/`，不把录制文件打入用户 SDK。
