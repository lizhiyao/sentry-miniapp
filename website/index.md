---
layout: home
title: 小程序 Sentry 错误监控与性能排查
description: 用 sentry-miniapp 将微信等小程序、小游戏、Taro 和 uni-app 项目接入 Sentry，发现线上异常、还原源码位置、排查慢请求，并按项目需要配置弱网上报和隐私同意。

hero:
  name: sentry-miniapp
  text: 小程序监控 SDK
  tagline: 用户报错难复现、线上堆栈找不到源码、请求变慢不知道卡在哪？把小程序和小游戏接入 Sentry，结合出错记录、操作上下文与源码位置排查问题。支持微信等七个平台、Taro 和 uni-app。
  image:
    src: /logo.png
    alt: sentry-miniapp
  actions:
    - theme: brand
      text: 开始接入
      link: /guide/getting-started
    - theme: alt
      text: 先确认是否适用
      link: /guide/when-to-use
    - theme: alt
      text: 查看支持范围
      link: /guide/platforms

features:
  - icon: 🛡️
    title: 线上报错，知道从哪里查
    details: 在 Sentry 集中查看异常，结合设备、页面、操作和请求记录还原经过；上传对应构建的 Source Map，找到原始源码位置。
  - icon: 📊
    title: 操作变慢，找出耗时步骤
    details: 开启性能采样后查看请求与业务步骤的耗时；配置链路追踪后，关联已接入 Sentry 的后端操作，缩小排查范围。
  - icon: 📡
    title: 按网络和隐私要求安排上报
    details: 将符合策略的发送失败数据暂存并尝试补发；配置同意门禁，让监控数据在用户同意隐私协议后再发送。
---

<div class="sm-trust-strip" aria-label="项目支持范围与维护状态">
  <a href="https://docs.sentry.io/platforms/#sdks-supported-by-our-community" target="_blank" rel="noreferrer">
    <strong>Sentry Community SDK</strong>
    <span>已收录进 Sentry 官方文档索引</span>
  </a>
  <span>
    <strong>7 大小程序平台</strong>
    <span>微信 / 支付宝 / 字节 / 钉钉 / QQ / 百度 / 快手</span>
  </span>
  <span>
    <strong>微信 / 抖音小游戏</strong>
    <span>异常、首帧等待时间、可选帧率与卡顿统计</span>
  </span>
  <span>
    <strong>持续自动化验证</strong>
    <span>GitHub Actions 覆盖多 Node.js 版本</span>
  </span>
</div>

<section class="sm-home-section">
  <div class="sm-section-heading">
    <p class="sm-eyebrow">选择接入方式</p>
    <h2>从你的工程类型开始</h2>
    <p>先进入对应框架的接入页，再完成初始化和测试事件验证。框架组件错误、入口位置和条件编译会在各自指南中说明。</p>
  </div>
  <div class="sm-route-grid">
    <a class="sm-card" href="/guide/getting-started">
      <span class="sm-kicker">Native</span>
      <h3>原生小程序</h3>
      <p>微信、支付宝、字节跳动、钉钉、QQ、百度和快手原生工程。</p>
      <span class="sm-link">快速接入</span>
    </a>
    <a class="sm-card" href="/guide/taro">
      <span class="sm-kicker">React</span>
      <h3>Taro</h3>
      <p>接入 Taro 小程序错误监控，补充 React 组件错误上报，并与 H5 分端配置。</p>
      <span class="sm-link">查看 Taro 指南</span>
    </a>
    <a class="sm-card" href="/guide/uniapp">
      <span class="sm-kicker">Vue</span>
      <h3>uni-app</h3>
      <p>接入 uni-app 小程序错误监控，补上 Vue 组件错误，并与 H5 分端配置。</p>
      <span class="sm-link">查看 uni-app 指南</span>
    </a>
    <a class="sm-card" data-tone="source" href="/guide/minigame">
      <span class="sm-kicker">Game</span>
      <h3>微信 / 抖音小游戏</h3>
      <p>集中排查小游戏异常，按需观察帧率与卡顿，了解运行是否流畅。</p>
      <span class="sm-link">查看小游戏指南</span>
    </a>
  </div>
</section>

## 安装并验证

本页面向 2.x。接入需要 Sentry 官方云服务，或 **26.4.2 及以上的自建 Sentry**。已有项目升级或使用更旧的后台时，先看[版本选择与迁移](/guide/migration-2.0#version-choice)。

尽早初始化并主动发送一个测试错误；确认 Sentry Issues 中能看到事件，再继续配置生产环境能力。

```bash
npm install sentry-miniapp --save
# 或 yarn add sentry-miniapp
```

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'YOUR_DSN', // 替换为 Sentry 项目中的完整 DSN
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});

Sentry.captureException(new Error('sentry-miniapp test'));
```

> 原生小程序应在入口文件顶部、`App()` 之前初始化。真机没有事件时，先检查 Sentry 上报域名是否已加入小程序后台的 `request` 合法域名。完整步骤见[快速接入](/guide/getting-started)。

<section class="sm-home-section sm-check-panel">
  <div>
    <p class="sm-eyebrow">生产上线</p>
    <h2>基础上报打通后，再完成四项检查</h2>
    <p>把生产配置放在验证之后，可以更快区分“接入链路没通”和“高级能力配置不完整”。</p>
  </div>
  <ol class="sm-check-list">
    <li><span>1</span><p>设置稳定的 <code>release</code> 与 <code>environment</code>，并规划错误和性能采样率。</p></li>
    <li><span>2</span><p>上传与当前构建匹配的 <code>.js</code> 和 <code>.map</code>，在真机验证源码堆栈。</p></li>
    <li><span>3</span><p>确认框架组件错误、小游戏性能或链路追踪等项目实际需要的能力已经启用。</p></li>
    <li><span>4</span><p>需要隐私授权时开启同意门禁，并验证同意前不发网络、同意后能够补发。</p></li>
  </ol>
</section>

<section class="sm-home-section">
  <div class="sm-section-heading">
    <p class="sm-eyebrow">继续配置</p>
    <h2>按当前任务进入文档</h2>
    <p>能力指南讲使用场景与验证方法；API 和配置页负责查参数；排障页从现象出发定位问题。</p>
  </div>
  <div class="sm-card-grid">
    <a class="sm-card" href="/guide/errors-and-context">
      <span class="sm-kicker">能力</span>
      <h3>异常、日志与上下文</h3>
      <p>还原用户出错前的操作经过，查询关键业务步骤的日志。</p>
      <span class="sm-link">查看能力指南</span>
    </a>
    <a class="sm-card" data-tone="trace" href="/guide/performance-and-tracing">
      <span class="sm-kicker">性能</span>
      <h3>性能与链路追踪</h3>
      <p>查看慢请求与业务步骤耗时，关联小程序和后端的请求链路。</p>
      <span class="sm-link">配置追踪</span>
    </a>
    <a class="sm-card" data-tone="source" href="/guide/sourcemap">
      <span class="sm-kicker">上线</span>
      <h3>Source Map</h3>
      <p>让 Sentry 把压缩后的线上堆栈还原到原始源码位置。</p>
      <span class="sm-link">完成上传</span>
    </a>
    <a class="sm-card" href="/guide/faq">
      <span class="sm-kicker">排障</span>
      <h3>没有数据或堆栈不对</h3>
      <p>按 DSN、合法域名、初始化时机、采样和诊断信息逐项确认。</p>
      <span class="sm-link">开始排查</span>
    </a>
  </div>
</section>
