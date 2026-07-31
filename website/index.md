---
layout: home

hero:
  name: sentry-miniapp
  text: 跨端小程序 Sentry SDK
  tagline: 微信 / 支付宝 / 字节跳动 / 钉钉 / QQ / 百度 / 快手 + Taro / uni-app —— 异常、性能与网络监控开箱即用
  image:
    src: /logo.png
    alt: sentry-miniapp
  actions:
    - theme: brand
      text: 5 分钟接入
      link: /guide/getting-started
    - theme: alt
      text: 它适合我吗？
      link: /guide/when-to-use
    - theme: alt
      text: GitHub
      link: https://github.com/lizhiyao/sentry-miniapp

features:
  - icon: 🌐
    title: 全平台覆盖
    details: 微信、支付宝、字节跳动、钉钉、QQ、百度、快手七大平台，及 Taro / uni-app 跨端框架，统一 API，自动适配平台差异。
  - icon: 🛡️
    title: 自动异常捕获
    details: 自动劫持平台全局错误监听，未处理异常 / Promise rejection 开箱即采，配合 Source Map 还原源码堆栈。
  - icon: 📊
    title: 性能、日志与追踪
    details: 冷启动、页面渲染、网络请求耗时；支持 Sentry Logs，并可将请求作为 http.client span 串联前后端调用链。
  - icon: 🍞
    title: 丰富上下文面包屑
    details: 设备信息、用户点击 / 触摸、网络请求、页面生命周期，出错时还原用户操作现场。
  - icon: 📡
    title: 可靠上报与合规门禁
    details: 断网 / 发送失败自动缓存，恢复后静默重试；隐私合规场景可在用户同意前只采集入缓冲、不发 Sentry 网络。
  - icon: 🎮
    title: 小游戏支持
    details: 微信 / 抖音小游戏冷启动首帧耗时、帧率 / 卡顿（FPS / jank）监控，性能独立上报进 Performance 页。
---

> ✅ 已收录 [Sentry 官方文档](https://docs.sentry.io/platforms/#sdks-supported-by-our-community) 的 community SDK 列表 · 7 大平台 + Taro / uni-app · 100% 测试覆盖 · 持续活跃维护

## 近期能力

| 能力 | 适用场景 | 入口 |
|---|---|---|
| 隐私合规门禁 | 国内小程序需用户同意隐私协议后才允许 Sentry 上报 | [配置项参考 · 隐私合规](/guide/configuration#隐私合规-同意后上报) |
| Sentry Logs | 需要把业务日志作为独立 log 查询、聚合和告警 | [配置项参考 · Logs](/guide/configuration#logs) |
| W3C `traceparent` | 后端接 OpenTelemetry / W3C Trace Context，需要串联全链路 | [配置项参考 · 分布式追踪](/guide/configuration#分布式追踪) |
| Source Map Debug ID / `stackParser` | 小游戏、Cocos、私有引擎或特殊堆栈格式 | [Source Map 配置](/guide/sourcemap#debug-id-与自定义-stackparser) · [配置项参考](/guide/configuration#source-map) |

## 按你的场景接入

- **原生小程序**（微信 / 支付宝 / 字节…）→ [快速接入](/guide/getting-started)
- **Taro（React）** → [Taro 接入指南](/guide/taro)
- **uni-app（Vue）** → [uni-app 接入指南](/guide/uniapp)
- 还在评估？→ [它适合我吗？（选型与限制）](/guide/when-to-use)

## 生产接入检查

- `Sentry.init` 放在入口文件最顶部、`App()` 之前。
- 小程序后台把 Sentry 上报域名加入 `request` 合法域名。
- `release` 与 Source Map 上传时的 release 完全一致。
- Taro / uni-app 的组件错误按框架指南接入错误边界或 `errorHandler`。
- H5 端使用官方 `@sentry/browser`，小程序端使用 `sentry-miniapp`。

## 安装

```bash
npm install sentry-miniapp --save
# 或 yarn add sentry-miniapp
```

## 一分钟接入

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://your-dsn@o0.ingest.sentry.io/0',
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});

// 之后未处理异常会自动上报；也可手动：
Sentry.captureException(new Error('test'));
```

> 接入前请确保 `Sentry.init` 在 `App()` 之前执行；自托管 / 真机时把 Sentry 域名加入小程序后台「合法域名」。详见 [快速接入](/guide/getting-started)。
