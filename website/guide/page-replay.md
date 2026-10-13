---
title: 微信小程序页面回放（实验性）
description: 录制已标记区域的页面变化和点击，与 Sentry 错误关联，帮助排查难以复现的微信小程序问题。
---

# 微信小程序页面回放（实验性）

用户反馈“点完按钮界面就不对了”，只有错误堆栈往往不足以说明出错前的操作。页面回放可以保留**已标记区域的布局、文本变化和点击位置**，与 Sentry 错误关联，帮助判断问题发生在哪一步。

::: warning 可用范围
这是源码中的实验性入口，当前 npm `2.0.2` 尚未提供。微信开发者工具与 Sentry 后台已验证录制、播放和错误关联；目标设备的流畅度与覆盖仍需项目自行验证。仅针对微信普通小程序的 WebView 渲染；其它小程序、小游戏和 Skyline 跳过。它需要在模板中标记允许录制的节点，**不是完整屏幕录像，也不是任意 DOM 自动采集**。
:::

## 先确认是否适合

适合先录制登录、下单等关键页面中需要观察的状态区域。没有标记的内容不会进入快照；不要把整个页面 data 或输入值放进标记。

| 可以观察 | 当前限制 |
| --- | --- |
| 标记节点的可见位置、尺寸和少量样式 | 平面布局投影，不完整重建父子结构、裁剪、字体资源或动画 |
| 显式提供的文本、节点出现或消失 | 默认遮蔽文本；内容由业务标记提供，公开 API 不读取任意文字 |
| 页面滚动后的可见布局、点击位置 | 默认每 500ms 查询一次，短于采样间隔的变化可能跳过 |
| 已覆盖页面的 Sentry 错误关联 | 按错误捕获时的页面和录制关联，保留异步处理前的归属 |
| 输入框、图片、Canvas、视频和地图的位置 | 使用占位，不读取输入值、图片地址、像素或原生组件细节 |

## 安装录制器

在 `App()` 之前初始化，并显式添加可选集成。播放器不进入小程序 bundle；主入口不会加载录制器。

```js
const Sentry = require('sentry-miniapp');
const { wechatPageReplayIntegration } = require('sentry-miniapp/replay');

Sentry.init({
  dsn: 'YOUR_DSN',
  integrations: [wechatPageReplayIntegration()],
});
App({});
```

源码微信示例运行 `yarn build:miniapp`，会同时生成 `lib/sentry-miniapp.js` 与 `lib/sentry-miniapp-replay.js`。打开实验室中的“页面回放验证”页面，可测试状态改变、节点隐藏、滚动和关联错误。

## 标记允许录制的区域

默认选择器为 `.sentry-replay`。节点只有布局，没有自动提取的文本；点击复用默认页面交互面包屑；关闭该采集或使用未被观测的框架处理函数时，不自动记录点击位置。

需要显示的文字通过 `data-sentry-replay-text` 提供。

```html
<text class="sentry-replay"
  data-sentry-replay-type="text"
  data-sentry-replay-text="{{status}}">{{status}}</text>

<button class="sentry-replay"
  data-sentry-replay-type="button"
  data-sentry-replay-text="确认订单"
  data-sentry-replay-unmask="true">确认订单</button>

<input class="sentry-replay" data-sentry-replay-type="input" />
```

第一段文字会被遮蔽；第二段明确允许显示固定按钮文案。只为确定可公开的文案设置 `data-sentry-replay-unmask="true"`。输入、图片、Canvas、视频和地图即使标记为 unmask 仍使用占位。

不要标记账号、地址、订单明细、验证码等敏感内容。遮蔽发生在录制器缓冲和发送之前；主动解除遮蔽的文字需要业务自己控制。

回放沿用 SDK 的自动 IP 推断设置。需要关闭时设置 `dataCollection: { userInfo: false }`；这不会阻止业务显式通过 `setUser()` 或文字标记提供数据。

### 自定义组件与框架

选择器遵守微信的节点作用域，不会自动穿透自定义组件。需要显式选择组件内的标记节点时，可以配置微信支持的跨组件选择器，例如 `.checkout >>> .sentry-replay`，并验证实际构建中的匹配结果。

Taro / uni-app 会生成组件层级和作用域，不能假定普通页面选择器覆盖整个页面。先在实际微信产物上确认节点数和文字标记；本入口不依赖 renderjs，也不承诺其它框架目标端支持。

## 生命周期与同意

集成在前台开始采集，进入后台时排放当前分段并停止查询；下一次进入前台使用新的录制标识。设置 `requireConsent: true` 时，同意前不执行节点查询，撤回同意清空未发送的录制并取消在途查询。重复授予同意不会重置当前录制。

手动停止后，自动前台事件不会重新启动。关闭或重新初始化 SDK 后，旧控制器永久失效。

```js
const { getWechatPageReplay } = require('sentry-miniapp/replay');
const replay = getWechatPageReplay();

// 不支持的宿主或未安装集成时可能没有控制器
if (!replay) return;

// 页面 ready 或排障时主动查询一帧
await replay.capture();
console.log(replay.getDiagnostics());

// 交给当前 transport 发送；true 仅表示这次响应为 2xx
await replay.flush();

// 丢弃未发送的内容；需要恢复时显式 start()
replay.stop();
replay.start();
```

节点查询超过 2 秒未返回时，诊断原因为 `query_timeout`；录制器释放该回调持有的引用，在时长预算内按采样间隔重试。一次只允许一个在途查询，进入后台、停止或到达时长上限后不再重试。已发送或已进入 transport 的内容不会因 `stop()` 从后台删除。

## 参数与开销

| 参数 | 默认值 | 可用范围 |
| --- | --- | --- |
| `selector` | `.sentry-replay` | 非空选择器，最多 256 字符 |
| `intervalMs` | 500ms | 100–10000ms |
| `flushIntervalMs` | 10000ms | 1000–60000ms |
| `maxNodes` | 200 | 1–500 |
| `maxSegmentBytes` | 128KiB | 8–512KiB，按 UTF-8 计算 |
| `maxDurationMs` | 5 分钟 | 1 秒–15 分钟 |

非法数值回落默认值，超出上限的数值截到上限。节点过多或单帧过大时跳过该帧；一次只允许一个在途查询。时长到达上限后停止，需显式启动新的录制。

独立入口避免让未启用的项目打包录制器，但主 SDK 仍提供共享生命周期桥接。采样会增加宿主查询、序列化和上报开销；先从少量关键节点开始，在目标设备上观察流畅度和请求量。

## 验证回放

1. 在示例或实际页面改变文本、显示或隐藏节点、滚动和点击，再触发一个 Sentry 错误。
2. 确认录制器诊断中有节点和已提交分段；确认错误事件的 `replayId` 与录制标识相同。
3. 到目标 Sentry 项目的 Replays 检查实际接收、错误关联和播放。HTTP 2xx、客户端 flush 或本地播放器成功都不能代替这一检查。

播放器中的页面地址为 `https://miniapp.invalid/` 加小程序路由，是展示标识，不会发起请求，也无需加入 request 合法域名。真实上报地址仍来自 DSN 或 tunnel；源码堆栈的 `app:///` 路径不受影响。

发送复用现有 transport 的限流、并发、离线策略和同意门禁，不另建发送队列。目标后台必须实际启用并支持 Replay；自建部署还要核验对应能力。采样遗漏、未标记区域和原生组件占位是本实现的覆盖范围，不能当作完整操作录像。
