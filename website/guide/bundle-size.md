# 主包体积优化

<span id="主包体积优化-分包异步加载"></span>

小程序「主包体积」很宝贵。`sentry-miniapp` 包含 `@sentry/core` 引擎与多端适配，实际占用随 SDK 版本、构建格式和打包方式变化，应以项目的最终产物和平台包体积分析为准；gzip 后的大小不能代替小程序包体积。如果你很在意主包体积，可以把 SDK 放到分包并异步初始化。

## 先确认实际占用

- npm 展示的解包总量包含 ESM／CommonJS／UMD、类型声明和 Source Map，不代表小程序需要打入的体积；项目只应使用所需的构建格式。
- 用平台开发者工具或框架构建分析查看最终 JS 属于主包还是分包，并检查是否出现 SDK 或 Core 的重复副本。
- 关闭性能、日志等可选采集会改变运行行为，不保证对应代码从产物中移除。ESM 的按需裁剪取决于打包器和实际引用；完整 CommonJS 入口／独立 UMD 文件包含完整 SDK。

## 框架项目先检查 ESM 按需打包

Taro、uni-app 等构建项目，先确认打包器实际使用 ESM 入口，再查看最终包分析。明确引用使用的 API；需要宿主性能条目时才添加 `performanceIntegration()`。没有使用的 Performance API、HTTP 上下文集成可以被支持 tree-shaking 的打包器移除，已有的默认集成和跨端回退仍会保留。

```javascript
import { init, performanceIntegration } from 'sentry-miniapp';

init({
  dsn: 'YOUR_DSN',
  integrations: [performanceIntegration()], // 需要宿主性能条目时添加
});
```

不需要该能力时移除这项导入和配置。避免通过动态属性名读取整个 SDK 或集成命名空间，这可能让打包器保留所有出口。不同工具链的结果可能不同，仍须以最终小程序产物为准；这项裁剪不会让独立 CommonJS 文件变成按需版本。

## 已有兼容能力的项目使用精简入口

::: warning 发布状态
`/lite` 入口已在源码中实现，将随下一次 SDK 发布提供。npm 的 `2.0.0` 不包含此入口；使用前确认所安装版本提供 `sentry-miniapp/lite` 导出。
:::

如果项目已统一补齐标准方法，或目标设备本身具备所需能力，可以使用 `sentry-miniapp/lite`，避免 SDK 再打入一套 core-js 兼容代码。精简入口保留相同的监控 API、默认集成、宿主降级和字节编码回退；它不是只采集错误的功能裁剪版。

```javascript
// 该模块由应用维护，须先在 SDK 使用的全局环境中安装必要能力。
import './runtime-polyfills';
import * as Sentry from 'sentry-miniapp/lite';

Sentry.init({ dsn: 'YOUR_DSN' });
```

CommonJS 项目同样先 `require('./runtime-polyfills')`，再 `require('sentry-miniapp/lite')`。`runtime-polyfills` 是应用自己的模块名称，不是 SDK 提供的文件；如果宿主已经具备全部能力，可以省略它。

加载前须具备 `globalThis`、`Array.prototype.includes`、`Object.entries`／`values`／`fromEntries`、`Promise.allSettled`、`String.prototype.isWellFormed`／`toWellFormed`，以及能序列化 record、通过 `keys()` 解码字符串参数名的 `URLSearchParams`。`Promise`、`Symbol`、Map／Set、WeakMap／WeakSet 和 typed arrays 等[基础能力](/guide/platform-compatibility)也仍由宿主提供。不要求完整 `URL`、浏览器请求 API 或原生 `TextEncoder`。

入口在加载 Core 前检查列出的标准方法和查询参数接缝，缺失时抛出包含能力名称的错误。检查不安装 polyfill，也不是对所有标准行为的完整验收。安装了 Babel 或 core-js 不代表条件已经满足：Babel 的语法转换不会自动提供标准方法；应用使用 pure 模式的局部函数，也不等于全局 API 已可用。应用须保证补齐代码先执行，且框架的小程序构建确实包含这些能力；仅根据浏览器目标生成的 polyfill 列表不能证明小程序宿主兼容。

同一模块格式下，默认入口与精简入口共享 SDK 实现、client 类及监听状态；若任何代码仍引用默认入口，兼容层会被保留，体积收益也会降低。项目应统一导入方式，并避免混用 ESM、CommonJS 或不同 SDK 副本。

npm 入口会引用包内共享文件，安装及构建时保留完整包目录；不要只复制 `dist/sentry-miniapp*.js`。直接下载单文件的项目继续使用 Release 的 `sentry-miniapp.umd.js`，它自带兼容实现。

精简入口实测能减少约 37–40 KiB 的完整入口 JS，具体数字及消费端按需打包结果见[维护者体积记录](https://github.com/lizhiyao/sentry-miniapp/blob/master/docs/bundle-size-review.md)。如果应用此前没有这些 polyfill，新加的应用兼容代码也要计入最终产物；不能把成本移动到应用后当作净减重。

## 方案 A：微信原生分包异步化

微信原生支持[分包异步化](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html)，可用 `require.async` 跨分包加载 SDK。

1. 把 `sentry-miniapp` 的 npm 包或构建产物放进某个分包目录（如 `subpackageA`）。
2. 在 `app.js` 中用 `require.async` 异步加载并初始化：

```javascript
// app.js
App({
  onLaunch() {
    require.async('./subpackageA/sentry-miniapp.js')
      .then((Sentry) => {
        Sentry.init({ dsn: 'YOUR_DSN' /* ...其他配置 */ });
      })
      .catch((err) => console.error('Sentry 加载失败', err));
  },
});
```

确认生成的 SDK 文件被归入 `subpackageA` 后，它的体积会计入分包，主包不再同步加载 SDK。用开发者工具的包体积分析核对结果，避免打包器仍在主包保留副本。

## 方案 B：其他平台 / 跨端框架

支付宝、字节、百度、Taro、uni-app 等项目要以各自平台和框架的分包能力为准。通用原则是：**确保 SDK 的实际产物被打进分包，并在分包加载完成后再执行 `Sentry.init`**。不同工具链对 `import('sentry-miniapp')` 是否拆包、拆到哪个包，规则并不一致，不能只看源码写法。

建议每次调整后检查构建产物：

- 主包目录里不应出现 `sentry-miniapp` / `@sentry/core` 相关大块代码；
- 分包目录里能找到 SDK 产物或对应 chunk；
- 真机预览验证：分包加载完成后主动 `captureException(new Error('sentry test'))`，确认能上报。

::: tip 权衡
异步加载会让 SDK 晚于主包就绪，**分包加载完成前的异常和请求无法自动补采**；初始化时 `App()` 已注册，首次 Session、启动面包屑等能力也可能缺失，详见[初始化时序](/guide/getting-started#_2-初始化)。需要完整的启动阶段监控时，把 SDK 同步放在主包并在 `App()` 前初始化。
:::
