# 快速接入

本页对应 2.0 beta，试用安装 `sentry-miniapp@next`。默认安装仍获取 1.x 稳定版，已稳定使用 1.x 的项目无须为了版本号升级。接入前先看[如何选择版本](/guide/migration-2.0#version-choice)，其中也提供 1.x 文档归档；选择 2.0 后，再阅读迁移变更与试用检查步骤。仓库示例默认使用当前构建产物。

`sentry-miniapp` 是基于 [`@sentry/core`](https://github.com/getsentry/sentry-javascript) 的跨端小程序 Sentry SDK，覆盖微信、支付宝、字节跳动、钉钉、QQ、百度、快手，并兼容 Taro / uni-app。

> 本页是**原生小程序**的最短接入路径。Taro、uni-app 或小游戏请直接进入 [Taro](/guide/taro)、[uni-app](/guide/uniapp)或[小游戏](/guide/minigame)指南。

## 1. 安装

```bash
npm install sentry-miniapp@next --save
# 或 yarn add sentry-miniapp@next
```

## 2. 初始化

**务必让 `Sentry.init` 在 `App()` 调用之前执行**，这样才能捕获到应用启动阶段的异常、并在业务请求之前装好网络面包屑。

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://your-dsn@o0.ingest.sentry.io/0',

  // release 是 Source Map 生效的关键，需与上传 Source Map 时的 release 完全一致
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});
```

::: warning 初始化时序
不要把 `Sentry.init` 放进 `App.onLaunch` 里：此时 `App()` 已注册完成，SDK 无法再提前包装本次 `onLaunch`。这会导致 App 生命周期面包屑、首次 Session 启动，以及依赖 `onLaunch` 起点的冷启动耗时缺失。若只关心后续异常、网络面包屑和手动上报，放在 `onLaunch` 内仍可工作，但启动阶段能力会降级。
:::

默认初始化路径已包含自动异常捕获、Source Map 路径归一化、网络面包屑、Session 与网络状态；通用 Performance／FPS 需显式启用。通常无需手动传 `integrations`。

先用最小配置跑通事件，再按需要开启性能采样、Logs、隐私同意或其它能力。全部选项见[配置项参考](/guide/configuration)。

## 3. 验证是否打通

主动捕获一个事件，然后到 Sentry「Issues」列表查看：

```js
Sentry.captureException(new Error('sentry test'));
// 或 Sentry.captureMessage('sentry test', 'error');
```

::: warning 注意
`addBreadcrumb`（面包屑）**不会单独上报**——它只在「下一次事件」发生时随事件一起发送。只调用 `addBreadcrumb` 而不捕获事件，后台会一直没有数据，这不是 SDK 没生效。
:::

## 4. 常见前置检查

- **合法域名**：在实际运行的 AppID 所对应的小程序后台，把实际上报地址的协议、域名及端口（如有）加入「request 合法域名」。Sentry SaaS 与自托管部署都需要配置；默认取 DSN 的上报地址，配置 `tunnel` 时取 tunnel 地址。
- **关闭调试后验收**：手机调试模式与开发者工具的「不校验合法域名」会跳过域名校验。验收时关闭这些选项，核对实际请求结果和后台事件；采集提示或 `flush` 完成不能代替后台接收证据。
- **真机 vs 开发者工具**：微信开发者工具某些环境下的报错不会触发底层 `wx.onError`，建议在真机预览下测试。
- **uni-app / Taro 框架**：组件内的错误可能被框架接住、不冒泡到 `wx.onError`，需接框架的错误处理。详见 [Taro 接入指南](/guide/taro)、[uni-app 接入指南](/guide/uniapp) 或 [常见问题](/guide/faq#component-errors)。

例如，DSN 为 `https://public-key@o123.ingest.us.sentry.io/456` 时，填写 `https://o123.ingest.us.sentry.io`，保留 `.us` 等实际域名部分。Sentry 控制台的网址、DSN 中的 key 和项目路径都不填入域名配置。

仍然没有数据时，按 [FAQ · 初始化后没有数据](/guide/faq#no-events) 的完整清单逐项排查。

## 下一步

- 让线上堆栈还原到源码：[Source Map 上线指南](/guide/sourcemap)
- 配置错误上下文和 Logs：[异常、日志与上下文](/guide/errors-and-context)
- 开启性能数据和请求链路：[性能与链路追踪](/guide/performance-and-tracing)
- 处理弱网和隐私授权：[可靠上报与隐私同意](/guide/reliability-and-privacy)
- 查调用方式或参数：[常用 API](/guide/api) · [配置项参考](/guide/configuration)
