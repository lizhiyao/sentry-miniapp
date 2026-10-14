---
title: 微信小程序页面回放（实验性）
description: 录制关键页面的布局变化、组件状态和操作，与 Sentry 错误关联，帮助排查难以复现的微信小程序问题。
---

# 微信小程序页面回放（实验性）

用户反馈“点完按钮界面就不对了”，只有错误堆栈往往不足以说明出错前的操作。页面回放记录选定页面的**布局、文字变化和点击位置**，在 Sentry 中与错误一起查看，帮助判断问题发生在哪一步。

::: warning 可用范围
这是源码中的实验性入口，当前 npm `2.0.2` 不包含回放。仅针对微信普通小程序的 WebView 渲染；其它小程序、小游戏和 Skyline 跳过。它通过公开节点查询录制选定页面的采样布局，不是完整屏幕录像。安装方式见下文，页面与组件结构要求见[项目类型与组件边界](#项目类型与组件边界)。
:::

## 体验示例

先选择验证方式：

| 你的目标 | 使用方式 | 结果在哪里确认 |
| --- | --- | --- |
| 先观察录制与隐私，无需云端额度 | [本地验证](#先在本地验证-不上传-sentry) | PC 录制查看器及导出文件 |
| 核对 Sentry 接收、播放与错误关联 | 以下 Sentry 示例 | 自己的 Sentry 项目；须有可用 Replay 配额 |
| 接入自己的微信项目 | [安装与构建标记](#接入关键页面) | 生成项目、目标设备与目标后台分别确认 |

首次运行，在克隆的 SDK 仓库根目录安装依赖：

```bash
corepack enable
yarn install
```

Node.js 要求见[开发指南](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md#0-环境要求)。要体验 Sentry 发送，再运行：

```bash
yarn build:replay-example
```

命令构建 SDK，并生成带自动标记的独立微信项目。用微信开发者工具打开命令输出的目录，先在该项目配置自己的 DSN、AppID 及实际上报域名，再进入底部的 **页面回放**：确认订单、打开弹窗、滚动组件内的列表、切换文字遮蔽，再关联一个错误。在自己的 Sentry Replays 查看回放；无需请求 `miniapp.invalid`，它只是录制中的展示地址。

仅运行 `yarn build:miniapp` 并打开 `examples/wxapp` 时，示例仍能展示界面；没有生成标记的回放页会提示先运行上面的命令。示例使用固定演示数据，输入框不要填真实个人信息。

### 先在本地验证，不上传 Sentry

从源码仓库运行 `yarn build:replay-local`，在微信开发者工具打开输出项目。「页面回放」页会显示本地模式；SDK 使用内存 transport，所有 SDK 遥测都不会请求 Sentry，因此不消耗云服务额度。

操作页面后点击「关联测试错误并本地保存」，再点击「复制录制 JSON」；也可直接导出而不触发错误。在另一个终端运行 `yarn replay:local`，用 Chrome 打开打印的本机地址，粘贴 JSON 或选择文件。支持播放、暂停、速度、时间轴、分段跳转和多次录制选择。

工作台面向 PC 浏览器，建议窗口宽度不低于 960px。支持拖入录制文件；导入成功后收起输入区，以画面为主。可按录制序号／时长选择会话，按实际开始时间跳转分段，在「适应窗口」与「100%」之间切换画面大小，并复制关联错误 ID。焦点不在输入控件时，空格切换播放／暂停，左右方向键前后跳转 5 秒。

```bash
# 已经保存了导出文件时自动加载
yarn replay:local --file /absolute/path/recording.json
# 端口占用时
yarn replay:local --port 8772
```

该开发工具复用仓库安装的官方 rrweb，绑定本机回环地址，不上传录制、不加载 CDN；不增加 SDK 运行包。小程序内存最多保留 20 段、段数据 UTF-8 总预算 1 MiB，超限移除旧段并在播放器提示；退出小程序会丢失记录。文件导入上限 8 MiB，错误信息只导出关联 ID；公开解除遮蔽的文字仍进入文件。

本地模式使用内存 transport，禁用 SDK 持久离线缓存，也不产生 HTTP 回执。需要向 Sentry 发送时，使用普通 `yarn build:replay-example`，并配置自己的 DSN。

## 接入关键页面

先从下单、登录等需要排查的少量页面开始。接入分为初始化和构建两个步骤，无需为普通节点逐个编写文字标记。

### 1. 安装录制器

当前需从源码构建候选包。在 SDK 仓库运行：

```bash
corepack enable
yarn install
yarn build
yarn pack --out ../sentry-miniapp-replay-preview.tgz
```

然后在**业务项目**安装这份包，将路径替换为实际生成位置：

```bash
npm install /path/to/sentry-miniapp-replay-preview.tgz
```

业务项目使用 Yarn／pnpm 时，通过对应包管理器安装同一份本地包。记录源码提交和包摘要；候选包的版本号可能与已发布版本相同，不能用 `npm install sentry-miniapp@2.0.2` 代替这一步。

在 `App()` 之前初始化，可选入口不进入未使用它的主 SDK，播放器也不进入小程序。

```js
const Sentry = require('sentry-miniapp');
const { wechatPageReplayIntegration } = require('sentry-miniapp/replay');

Sentry.init({
  dsn: 'YOUR_DSN',
  integrations: [wechatPageReplayIntegration({
    sessionSampleRate: 0.1, // 随机录制 10% 的前台会话
    errorSampleRate: 1,   // 其余会话在错误发生时上传有界的前置缓冲
  })],
});
App({});
```

默认 `sessionSampleRate: 0`、`errorSampleRate: 1`：前台仅保留有界缓冲，错误触发采样后允许上传。缓冲默认最多 60 秒，并受分段字节预算约束；容量不足时从最新布局重新建立基线，不保证保留完整 60 秒的操作。两种采样率均为 0 时不自动查询节点。

错误须先通过 event processors 和 `beforeSend`，才允许错误前缓冲排放；被过滤的错误不会解锁缓冲。这不代表错误已被服务器接收。异步过滤完成前若未获发送资格的旧缓冲已被前后台切换或撤回同意清空，不再关联它，也不会解锁新的录制。

### 2. 在上传前生成页面标记

使用 npm 组件时，先安装组件并在微信开发者工具执行 **工具 → 构建 npm**。确认微信项目里已有 `miniprogram_npm`，再生成页面标记；不要直接标记 `node_modules` 中的组件源码。手动配置 npm 构建目录时，输入项目须包含实际生成的组件文件。

对微信项目或框架构建出的微信目录运行 Node 工具，输出必须是不存在的独立目录：

```bash
npx --no-install sentry-miniapp-replay-instrument \
  --input ./weapp \
  --output ./weapp-replay \
  --page pages/checkout/index
```

命令在已安装候选包的业务项目中运行，使用本地 CLI，不临时下载另一份版本；也可从业务项目的 npm script 调用 `sentry-miniapp-replay-instrument`。多个页面可重复提供 `--page`。打开、预览或上传**输出项目**。每次重新构建后重新生成，使用新的输出目录；不要把带标记的副本作为业务源码再次编译。

工具处理选定页面及其静态组件、import/include 依赖，自动加入布局、文字绑定、组件边界和点击捕获标记。业务 JS、Source Map、原有事件绑定和样式值不改。Node 编译依赖只在电脑构建时执行，不进入小程序 bundle。工具拒绝路径逃逸、符号链接、已有输出目录和保留方法 `__sentryReplayTap` 的冲突。

组件引用支持页面／组件局部声明及 `app.json` 全局声明，包括相对路径、项目根路径、目录的 `index` 入口，以及 `@vant/weapp/button/index` 这类 npm 引用。先查找本地组件，再从声明所在目录逐级查找 `miniprogram_npm`；组件必须同时具有 `.json` 和 `.wxml` 文件。查找失败会列出候选路径，并提示先构建 npm。只处理所选页面实际使用的静态依赖；使用中的插件或动态组件引用仍会明确报错。

现有容器中的 `block` 条件文字也会记录，例如订单的“待确认／已确认”；`0` 与 `false` 不会被当作空文字丢弃。工具不为这类文字插入额外布局节点。没有布局面积的组件宿主也不会自动隐藏可见的弹窗内容；真正隐藏的子树仍会跳过。

以下情况需要明确处理，工具会报出文件与原因：

- `block` 循环内直接输出裸文字：在业务源码中使用已有或新增的 `text`／`view` 界定每一项，然后重新构建。
- 结构标签上的隐私控制：把 mask／block／unmask 放到实际渲染的 `view`、`text` 或组件上；`block`、`template` 与 `slot` 本身没有可查询的隐私边界。
- 自动文字表达式调用函数、使用转义字符串或 `<text decode>`：提供明确的 `data-sentry-replay-text` 显示值，避免重复执行业务函数或错误还原特殊文字。默认遮蔽仍然生效。
- 组件标签内的裸文字（如 `<van-button>确认</van-button>`）：组件需有一个默认插槽，且该插槽是某个现有渲染容器的唯一直接子节点；文字按此容器的位置、样式和隐私设置回放。混排、多个默认插槽、循环中的插槽、插槽自身带条件或没有可查询容器时，工具会指出文件与组件，请使用原界面已有的 `text/view` 文字边界或改选页面。不会添加包装节点改变布局。具名插槽应由其实际 `text/view` 节点提供文字边界。

生成的文字绑定与小型 WXS 辅助代码会增加所选页面和依赖的 WXML 体积；主 SDK 的 JS 体积不变。上线前仍须在自己的构建与设备上比较包大小及录制开销。

### 项目类型与组件边界

| 页面或依赖 | 当前处理方式 |
| --- | --- |
| 原生普通 WXML、可读取的静态自定义／npm 组件 | 生成标记；使用 npm 组件时先完成微信 npm 构建 |
| uni-app 编译出的普通 WXML | 按编译后的静态页面与组件结构生成标记；只有 template 调用的页面按下一行处理 |
| 只有 template 调用的页面（如 Taro 递归模板入口） | 拒绝生成，需要专门的框架适配；不要仅添加一个外层 view 来消除报错 |
| 已使用的 `plugin:`／`dynamicLib:` 或动态依赖路径 | 拒绝生成，无法取得完整静态标记与隐私关系；改选不依赖它们的关键页面 |

拒绝发生在输出项目之前，并带上文件与原因；工具不会静默跳过所选页面依赖。未使用的组件声明不影响生成。普通监控支持某个框架，也不意味着它的所有页面都能回放；不依赖 renderjs 或 WebView 私有接口。

## 隐私控制

**文字默认遮蔽**。输入框、图片、Canvas、视频、地图和 WebView 等内容只保留位置与占位，不读取输入值、资源地址、像素或内部绘制。

只为确定可公开的文案解除遮蔽；控件会继承祖先区域的设置，包括自定义组件与 slot。

自动标记项目中的插槽内容按实际渲染容器继承遮蔽和屏蔽，包括静态具名插槽与组件间转发。容器缺失或关联信息无效时，回放只保留屏蔽占位，局部解除遮蔽不能越过内部祖先的设置。`name/slot` 需要静态非空名称；默认插槽省略名称属性，动态名称暂不支持。更新录制器后，用同一次构建的工具重新生成项目，避免混用标记与运行代码。

```html
<!-- 固定公开文案可以显示 -->
<view data-sentry-replay-unmask="true">
  <text>提交成功</text>
  <!-- 明确 mask 的区域及后代不会被子节点 unmask 解除 -->
  <view data-sentry-replay-mask="true">{{customerName}}</view>
</view>

<!-- 整块区域和后代仅显示占位，也不记录该区域的点击 -->
<view data-sentry-replay-block="true">{{privateContent}}</view>
```

不要在不清楚数据范围时解除整个页面的遮蔽。结构或祖先标记缺失时，编译节点保守跳过。遮蔽在录制缓冲和发送之前完成，不复制页面 data 或任意 dataset。

构建工具根据实际节点类型生成标记。输入框、媒体等私有节点已有的 `data-sentry-replay-type` 若与节点类型不符，会明确报错；删除冲突属性后重新生成，不能把输入框标成普通文字来绕过占位。

回放沿用 SDK 的自动 IP 推断设置，需要关闭时使用 `dataCollection: { userInfo: false }`；业务显式调用 `setUser()` 或解除文字遮蔽仍由业务负责。`requireConsent: true` 时，同意前不查询节点；撤回同意会取消查询并清空未发送录制。

## 能看到什么

| 可以观察 | 当前限制 |
| --- | --- |
| 普通节点、嵌套组件、重复列表实例和 slot 的布局与文字变化 | 通过公开布局与生成标记重建结构；同一容器内的混排文字位置可能不同，不等同于原生 DOM 或完整像素复现 |
| 节点出现／消失、弹窗遮罩及 scroll-view 的可见内容 | 按原生视口裁剪滚动内容，保留测得的单行文案；字体资源、复杂层叠、动画和原生绘制仍有差异 |
| 页面滚动和真实点击位置 | 默认每 500ms 查询，短暂变化可能跳过；关闭交互采集时不记录点击 |
| 已覆盖页面的错误与回放关联 | 按错误捕获时的页面和录制关联；请求成功还需后台处理与展示 |
| 输入框和媒体的位置 | 仅占位，不能用来观看用户输入或媒体内容 |

自动点击使用生成的捕获绑定及共享 Page/Component 构造观测，不包装业务 `setData`，不停止业务事件传播。缺少可安装的构造函数、冻结定义或晚初始化时，点击可能无法采集；应在实际项目核验。

## 生命周期与控制

前台开始自动采样，后台提交已获采样的尾段并取消查询；未触发上传的缓冲不发送。下一次前台使用新录制标识。达到时长上限后停止，下一次前台可自动开始新录制；手动 `stop()` 后不会自动复活。关闭或重新初始化 SDK 后，旧控制器永久失效。

```js
const { getWechatPageReplay } = require('sentry-miniapp/replay');
const replay = getWechatPageReplay();
if (!replay) return;

await replay.capture(); // 主动查询一帧
console.log(replay.getDiagnostics());
await replay.flush();   // 未触发采样时不发送；true 仅表示本次响应为 2xx
replay.stop();          // 清空未发送内容
replay.start();         // 显式开始并允许上传，不受自动采样率限制
```

一次只允许一个在途查询。超过 2 秒未返回时报告 `query_timeout`，释放旧回调持有的引用，并在时长预算内重试。没有匹配节点时报告 `no_marked_nodes`，不把该页面的错误关联到空快照。已经发送或进入 transport 的内容不会因停止从后台删除。

### 手动标记（低层接入）

无法使用构建工具时，可以手动标记有限区域：

```html
<text class="sentry-replay" data-sentry-replay-type="text"
  data-sentry-replay-text="{{status}}">{{status}}</text>
```

这条路径没有编译后的结构信息，不能获得同等的组件树、隐私继承和裁剪保证；点击复用页面交互面包屑。推荐使用构建工具，避免在业务中重复维护文字绑定。

## 参数与开销

| 参数 | 默认值 | 可用范围 |
| --- | --- | --- |
| `sessionSampleRate` | 0 | 0–1 |
| `errorSampleRate` | 1 | 0–1 |
| `bufferDurationMs` | 60000ms | 1000–60000ms |
| `selector` | 页面 `.sentry-replay` 与所选页面根节点跨组件查询的并集 | 非空，最多 256 字符 |
| `intervalMs` | 500ms | 100–10000ms |
| `flushIntervalMs` | 10000ms | 1000–60000ms |
| `maxNodes` | 200 | 1–500 |
| `maxSegmentBytes` | 128KiB | 8–512KiB，按 UTF-8 计算 |
| `maxDurationMs` | 5 分钟 | 1 秒–15 分钟 |

非法数值回落默认值；除采样率外，超出上限的数值截到上限。每个文字节点最多保留前 256 个 UTF-16 码元（一般汉字／字母各占 1，emoji 可能占多位），长文本会截断；即使提高分段预算，也不会恢复截断的部分。节点过多或单帧过大时跳过该帧。查询、序列化和上报都有开销，在目标设备观察流畅度和请求量，再决定录制页面与采样率。

## 核验 Sentry 后台

1. 改变页面、滚动和点击，再触发错误；确认诊断有节点和已提交分段。
2. 核对错误的 `replayId` 与录制标识。
3. 到目标项目的 Replays 检查实际接收、双向关联和播放。HTTP 2xx、flush 或本地播放器成功不能代替这一检查。

播放器的 `https://miniapp.invalid/` 加小程序路由是展示标识，不会发起请求，也不用配置合法域名。真实上报地址仍来自 DSN 或 tunnel，堆栈的 `app:///` 不受影响。

发送复用现有 transport 的限流、并发、离线策略与同意门禁。使用云服务或自建 Sentry 时，目标项目须启用 Replay，并具备录制接收、处理和播放能力及可用配额；仅满足 SDK 的服务端版本要求还不够。按以上步骤确认本项目的错误关联与播放结果。
