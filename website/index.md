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
      text: 快速接入
      link: /guide/getting-started
    - theme: alt
      text: 支持平台与能力
      link: /guide/platforms
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
    title: 性能与分布式追踪
    details: 冷启动、页面渲染、网络请求耗时；请求自动记为面包屑，并可作为 http.client span 串联前后端调用链。
  - icon: 🍞
    title: 丰富上下文面包屑
    details: 设备信息、用户点击 / 触摸、网络请求、页面生命周期，出错时还原用户操作现场。
  - icon: 📡
    title: 弱网离线缓存
    details: 断网或发送失败时自动缓存事件到本地 Storage，网络恢复后静默重试，确保数据不丢。
  - icon: 🎮
    title: 小游戏支持
    details: 微信 / 抖音小游戏冷启动首帧耗时、帧率 / 卡顿（FPS / jank）监控，性能独立上报进 Performance 页。
---

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
