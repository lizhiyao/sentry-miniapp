# 微信小程序示例

用这个示例先确认错误上报，再观察请求和业务耗时，或试用源码中的页面回放。它用于功能验收，启用了全量采样、console 面包屑与正文采集；生产项目从[最小配置](https://sentry-miniapp.pages.dev/guide/getting-started)开始。

## 先选体验方式

| 你想验证什么 | 在仓库根运行 | 打开哪里 |
| --- | --- | --- |
| 异常、请求和业务性能 | `yarn build:miniapp` | `examples/wxapp` |
| 本地录制与播放，不占云端额度 | `yarn build:replay-local` | 命令输出的独立项目，再用 `yarn replay:local` 启动 PC 查看器 |
| Sentry 回放与错误关联 | `yarn build:replay-example` | 命令输出的独立项目与自己的 Sentry 后台 |

首次先按[运行方式](#运行方式)安装仓库依赖。普通示例与 Sentry 回放模式会发送到配置的 DSN；本地模式的 SDK 遥测不请求 Sentry。**回放是源码实验能力，当前 npm `2.0.2` 不含该入口**，完整范围见[回放指南](https://sentry-miniapp.pages.dev/guide/page-replay)。

## 能力概览

底部导航为「概览 / 功能验证 / 页面回放」：

| 页面 | 可以怎样验证 |
| --- | --- |
| 概览（`pages/index`） | 查看初始化状态、访问标识与请求结果；在后台核对请求和业务 span |
| 功能验证（`pages/test`） | 触发异常、消息、反馈和业务操作，并按本次触发标识定位事件 |
| 页面回放（`pages/replay-components`） | 操作嵌套组件、slot、列表、弹窗与遮蔽；须生成标记后录制 |

`pages/replay` 另保留低层手动标记示例，不是自动回放 tab。初始化状态不代表后台已接收。

## 这个示例重点演示什么

### 1. 应用启动阶段

`app.js` 在 `App()` 之前初始化 SDK，并演示了这些能力：

- 初始化 `dsn`、`sampleRate`、`tracesSampleRate`
- 启用系统信息、用户交互、控制台、导航等能力
- 使用 `beforeSend` 控制事件大小，避免超大事件被服务端拒绝
- 在启动时生成唯一 `launchId`
- 通过 `setTag`、`setContext`、`addBreadcrumb` 记录启动参数与显示状态
- 通过 `startInactiveSpan` 测量业务定义的启动到首页就绪区间；它不等于宿主完整冷启动

### 2. 首页访问阶段

`pages/index/index.js` 演示一次首页访问中的上下文与网络观测：

- 为每次页面访问生成唯一 `pageVisitId`
- 在 `onLoad`、`onReady`、`onShow`、`onUnload` 中记录生命周期 Breadcrumb
- 通过 `setContext` 记录首页运行时上下文
- 由默认网络集成自动采集 npm / GitHub / registry 请求的 HTTP span
- 请求成功时写入 Breadcrumb，请求失败时上报一条 warning 级别消息
- 把 `pageVisitId` 展示在页面状态卡片中，方便和 Sentry 后台联动排查

### 3. 测试页能力演示

测试页主要用于手动验证事件上报：

- 同步异常上报
- 异步异常上报
- 自定义消息上报
- Promise 未处理异常
- 用户反馈上报
- 用户身份设置与清理
- 自定义网络/性能测试

测试页用 span 状态标记结果，并在跨回调创建子 span 时通过 `withActiveSpan` 显式指定父级。页面显示“已采集”只表示调用了采集 API；是否投递成功及还原源码，需要在自己的 Sentry 后台核对事件。

测试事件使用唯一 `triggerId`、tag 和 fingerprint，便于定位单次操作。这是验收设置，生产项目不要照搬每次变化的 fingerprint，否则相同错误也可能拆成多个 issue。

## 推荐体验路径

1. 按下方步骤构建 SDK，替换为自己的 DSN、设置 AppID 与 request 合法域名，然后在微信开发者工具打开项目。
2. 启动小程序，先观察首页的 SDK 状态、访问标识和统计数据
3. 在 Sentry 后台查看启动链路、首页网络请求和性能数据
4. 切换到测试页，逐个点击测试按钮
5. 通过 `demo.launch_id`、`demo.page_visit_id`、`demo_trigger_id` 等字段过滤事件

## 在 Sentry 后台看什么

如果你在开发者工具里看到很多请求，但后台感觉“只有少量数据”，通常需要区分以下几类：

- **Issues**：主要看错误和消息的聚合结果
- **Events**：看原始事件明细
- **Traces / Spans**：看请求和业务操作的耗时
- **Breadcrumbs / Context / Tags**：看每次访问和请求附带的上下文信息

首页里的 npm、GitHub、registry 请求本身不是“异常”，但它们会产生 Breadcrumb 和性能数据；失败时才会补充 warning 消息事件。

## 运行方式

### 1. 构建 SDK

在 SDK 仓库根目录运行；Node.js 版本见[开发环境要求](../../DEVELOPMENT.md#0-环境要求)：

```bash
corepack enable
yarn install
yarn run build:miniapp
```

该命令生成主 SDK、可选录制器及各自的 Source Map，并检查主 SDK 能否脱离仓库依赖独立加载。`lib/` 是生成目录，不提交到 Git；自动回放页面仍须另生成标记项目。

如果你在开发 SDK，本地持续构建可以运行：

```bash
yarn dev:miniapp
```

### 2. 在微信开发者工具中运行

1. 使用微信开发者工具打开 `examples/wxapp`
2. 导入项目并设置 AppID（可使用测试号）
3. 点击编译运行
4. 进入首页和测试页观察效果

真机上报前，核对这份工程实际使用的 AppID，并在对应小程序后台配置 `app.js` 中 DSN 的实际 request 合法域名；使用 tunnel 时配置 tunnel 域名。具体示例见[快速接入的域名检查](https://sentry-miniapp.pages.dev/guide/getting-started#_4-常见前置检查)。手机开启调试时可能跳过域名校验，验收应关闭调试并核对后台事件。

### 3. 调试建议

- 修改主 SDK 时可保持 `yarn dev:miniapp` 运行；它不监听回放入口。修改录制器后重新构建，自动标记项目还须重新生成
- 修改 `examples/wxapp` 示例代码后，在开发者工具中重新编译
- 需要观察原始上报时，优先看 Sentry 的事件明细而不是只看 Issues 列表

## 配置说明

在 `app.js` 中替换演示 DSN，便于在自己的 Sentry 项目确认接收结果。演示项目为了观察效果启用了全量采样、console 面包屑和正文采集；生产接入请从[最小配置](https://sentry-miniapp.pages.dev/guide/getting-started)开始，按需选择：

- `dsn`
- `environment`
- `sampleRate`
- `tracesSampleRate`
- `beforeSend`
- `integrations`

如果你需要接入自己的项目，建议把示例中的：

- 启动链路上下文
- 页面访问标识
- 请求封装埋点
- 用户身份与业务标签

作为接入模板进行裁剪。

## 页面回放示例

### 不消耗 Sentry 额度的本地验证

在仓库根目录运行 `yarn build:replay-local`，打开输出的小程序项目，进入「页面回放」tab。该副本明确显示本地模式：SDK transport 只留存内存录制，不请求 Sentry；普通 `yarn build:replay-example` 仍按现有配置发送。

确认订单、打开弹窗、滚动列表、输入非个人信息的测试文字并开启遮蔽后，点击「关联测试错误并本地保存」，再点击「复制录制 JSON」。也可不触发错误，直接复制录制；停止后已保存的段仍可导出。

在另一个终端运行 `yarn replay:local`，用 Chrome 打开命令打印的本机地址，粘贴 JSON 并导入；也可选择 JSON 文件。已保存文件可用 `yarn replay:local --file /绝对路径/录制.json` 自动加载；端口占用时加 `--port 8772`。

工作台面向 PC 浏览器，建议窗口宽度不低于 960px。支持拖入文件，导入后以居中的录制画面为主，显示录制序号／时长和分段开始时间，可切换适应窗口／100% 缩放并复制关联错误 ID。焦点不在输入控件时，空格播放／暂停，方向键跳转 5 秒。

播放器复用已安装的官方 `@rrweb/replay`，资源和录制不上传，不依赖 CDN。支持多次录制选择、播放／暂停、速度、时间轴与分段跳转；关联错误只显示本地 ID。超过保留预算时会提示缺段，不补造被移除的画面。

保留最多 20 段，段数据按 SDK UTF-8 计算总预算 1 MiB；错误 ID 最多 50 个。导出文件上限 8 MiB，错误上下文和输入值不由导出器另行复制。退出小程序会丢失内存记录；复制失败时可从开发者工具页面 data 的 `localRecording` 保存 JSON。只使用合成演示数据，解除遮蔽后的公开文字仍会进入文件。

此模式使用内存 transport，禁用 SDK 持久离线缓存，也不产生 HTTP 回执。需要向 Sentry 发送录制时，使用下一节的构建方式。

### 在 Sentry 验证

运行 `yarn build:replay-example`，在微信开发者工具打开命令输出的独立项目，配置自己的 DSN、AppID 和实际上报域名，再进入底部的“页面回放”。导航依次为“概览 / 功能验证 / 页面回放”；目标项目须有可用 Replay 配额。

页面可确认订单、打开弹窗、滚动两层自定义组件中的列表、更新 slot、切换祖先文字遮蔽、输入测试文本，并关联 Sentry 错误。布局与文字绑定由构建工具生成，不需要逐节点手写标记。输入只显示占位；发送结果区被整块屏蔽，诊断不会再递归进入录制。

仅运行 `yarn build:miniapp` 时，原始项目会生成 SDK 与可选录制器，自动回放页提示先生成标记；功能验证中的低层手动标记示例仍可使用。录制导出只用于开发验收，最多保留最近 20 个已提交分段，业务不要复制这套导出钩子。

这是实验性布局投影，不复制输入值、图片地址或页面 data，不保证原生绘制、字体与动画完全复现。使用 npm 组件时，先完成微信的 npm 构建，再对包含 `miniprogram_npm` 的项目生成回放标记。接入和限制见[回放指南](https://sentry-miniapp.pages.dev/guide/page-replay)。

示例设置 `dataCollection: { userInfo: false }` 关闭自动 IP 推断，保留其它演示中的固定 `setUser()` 调用，分别核对自动采集与显式数据。`miniapp.invalid` 仅用于展示，不需要配置合法域名。示例文案允许显示，输入框不要填写真实个人信息。

## 注意事项

### 开发者工具与真机差异

- 某些异常在开发者工具里不会完整触发底层全局错误监听
- 真机预览通常更接近真实上报结果
- 如果要验证自动异常捕获，建议同时在真机上测试

### 生产使用建议

1. 替换成你自己的真实 DSN
2. 根据业务调整采样率与性能采样率
3. 给关键页面和关键链路加上业务 tag / context
4. 配置 release 并上传 sourcemap
5. 避免把敏感信息直接写入 event、breadcrumb 或 extra

## 文件结构

```text
wxapp/
├── app.js                  # 应用入口与 SDK 初始化
├── app.json                # 应用配置
├── app.wxss                # 全局样式
├── sitemap.json            # 站点地图配置
├── project.config.json     # 微信开发者工具配置
├── lib/
│   ├── sentry-miniapp.js
│   ├── sentry-miniapp.js.map
│   ├── sentry-miniapp-replay.js
│   └── sentry-miniapp-replay.js.map
└── pages/
    ├── index/
    │   ├── index.js        # 首页监控与请求演示
    │   ├── index.wxml
    │   └── index.wxss
    ├── test/               # 异常、消息、反馈与业务性能验证
    ├── replay/             # 低层手动标记示例
    └── replay-components/  # 自动标记的页面回放 tab
```

自动回放项目由构建命令生成，包含 `components/replay-*` 的嵌套组件演示；路径以命令输出为准。
