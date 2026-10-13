---
title: 微信小程序页面回放（实验性）
description: 录制关键页面的布局变化、组件状态和操作，与 Sentry 错误关联，帮助排查难以复现的微信小程序问题。
---

# 微信小程序页面回放（实验性）

用户反馈“点完按钮界面就不对了”，只有错误堆栈往往不足以说明出错前的操作。页面回放记录选定页面的**布局、文字变化和点击位置**，在 Sentry 中与错误一起查看，帮助判断问题发生在哪一步。

::: warning 可用范围
这是源码中的实验性入口，当前 npm `2.0.2` 尚未提供。微信 IDE 与 Sentry 已验证基础录制、播放和错误关联。仅针对微信普通小程序的 WebView 渲染；其它小程序、小游戏和 Skyline 跳过。它通过公开节点查询投影页面，不是完整屏幕录像；目标设备的开销、第三方组件和框架产物仍需按实际项目验收。
:::

## 体验示例

在仓库根运行：

```bash
yarn build:replay-example
```

命令构建 SDK，并生成带自动标记的独立微信项目。用微信开发者工具打开命令输出的目录，进入底部的 **页面回放**：确认订单、打开弹窗、滚动组件内的列表、切换文字遮蔽，再关联一个错误。在 Sentry 的 Replays 查看实际回放。

仅运行 `yarn build:miniapp` 并打开 `examples/wxapp` 时，示例仍能展示界面；没有生成标记的回放页会提示先运行上面的命令。示例使用固定演示数据，输入框不要填真实个人信息。

## 接入关键页面

先从下单、登录等需要排查的少量页面开始。接入分为初始化和构建两个步骤，无需为普通节点逐个编写文字标记。

### 1. 安装录制器

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

### 2. 在上传前生成页面标记

对微信项目或框架构建出的微信目录运行 Node 工具，输出必须是不存在的独立目录：

```bash
sentry-miniapp-replay-instrument \
  --input ./weapp \
  --output ./weapp-replay \
  --page pages/checkout/index
```

多个页面可重复提供 `--page`。打开、预览或上传**输出项目**。每次重新构建后重新生成，使用新的输出目录；不要把带标记的副本作为业务源码再次编译。

工具处理选定页面及其静态组件、import/include 依赖，自动加入布局、文字绑定、组件边界和点击捕获标记。业务 JS、Source Map、原有事件绑定和样式值不改。Node 编译依赖只在电脑构建时执行，不进入小程序 bundle。工具拒绝路径逃逸、符号链接、已有输出目录和保留方法 `__sentryReplayTap` 的冲突。

普通原生 WXML 和自定义组件是当前验证范围。只有 template 调用的页面入口（例如 Taro 的递归模板）需要专门的框架适配，工具会明确报错。uni-app 的微信产物也须实际核验组件、模板和事件处理；不能把输出了标记直接当作框架回放支持已经通过。不依赖 renderjs 或 WebView 私有接口。

## 隐私控制

**文字默认遮蔽**。输入框、图片、Canvas、视频、地图和 WebView 等内容只保留位置与占位，不读取输入值、资源地址、像素或内部绘制。

只为确定可公开的文案解除遮蔽；控件会继承祖先区域的设置，包括自定义组件与 slot。

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

回放沿用 SDK 的自动 IP 推断设置，需要关闭时使用 `dataCollection: { userInfo: false }`；业务显式调用 `setUser()` 或解除文字遮蔽仍由业务负责。`requireConsent: true` 时，同意前不查询节点；撤回同意会取消查询并清空未发送录制。

## 能看到什么

| 可以观察 | 当前限制 |
| --- | --- |
| 普通节点、嵌套组件、重复列表实例和 slot 的布局与文字变化 | 通过公开布局与生成标记重建结构，不等同于原生 DOM 或完整像素复现 |
| 节点出现／消失、弹窗遮罩及 scroll-view 的可见内容 | 白名单样式和父子裁剪；字体资源、复杂层叠、动画和原生绘制仍有差异 |
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

非法数值回落默认值；除采样率外，超出上限的数值截到上限。节点过多或单帧过大时跳过该帧。查询、序列化和上报都有开销，在目标设备观察流畅度和请求量，再决定录制页面与采样率。

## 核验 Sentry 后台

1. 改变页面、滚动和点击，再触发错误；确认诊断有节点和已提交分段。
2. 核对错误的 `replayId` 与录制标识。
3. 到目标项目的 Replays 检查实际接收、双向关联和播放。HTTP 2xx、flush 或本地播放器成功不能代替这一检查。

播放器的 `https://miniapp.invalid/` 加小程序路由是展示标识，不会发起请求，也不用配置合法域名。真实上报地址仍来自 DSN 或 tunnel，堆栈的 `app:///` 不受影响。

发送复用现有 transport 的限流、并发、离线策略与同意门禁。目标 Sentry 必须实际启用并支持 Replay，自建部署需核验对应能力。未采样会话、查询遗漏和原生组件占位不应被描述为完整操作录像。
