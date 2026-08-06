---
layout: home

hero:
  name: sentry-miniapp
  text: 小程序监控 SDK
  tagline: 一个基于 @sentry/core 构建的小程序监控 SDK，覆盖异常、性能、日志、离线缓存与链路追踪；支持微信、支付宝、字节跳动、百度、QQ、钉钉、快手等小程序，以及微信 / 抖音小游戏，并兼容 Taro / uni-app。
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
    title: 发现并还原线上问题
    details: 自动捕获未处理异常、Promise rejection 和内存告警，结合用户操作、页面与网络上下文定位问题。
  - icon: 📊
    title: 看懂性能与请求链路
    details: 采集启动、渲染、资源和请求耗时，可通过 http.client span 与追踪头串联服务端调用链。
  - icon: 📡
    title: 面对弱网与隐私要求
    details: 发送失败后写入本地缓存并自动重试；需要用户授权时，可在同意前采集但不发送网络请求。
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
    <span>异常、冷启动、帧率与卡顿监控</span>
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
      <p>处理入口初始化、React 错误边界以及小程序 / H5 分端接入。</p>
      <span class="sm-link">查看 Taro 指南</span>
    </a>
    <a class="sm-card" href="/guide/uniapp">
      <span class="sm-kicker">Vue</span>
      <h3>uni-app</h3>
      <p>处理 main.js 初始化、Vue errorHandler 与条件编译。</p>
      <span class="sm-link">查看 uni-app 指南</span>
    </a>
    <a class="sm-card" data-tone="source" href="/guide/minigame">
      <span class="sm-kicker">Game</span>
      <h3>微信 / 抖音小游戏</h3>
      <p>接入异常监控，并采集冷启动首帧、FPS 和卡顿汇总。</p>
      <span class="sm-link">查看小游戏指南</span>
    </a>
  </div>
</section>

## 安装并验证

第一次接入只做两件事：尽早初始化，然后主动发送一个测试错误。确认 Sentry Issues 中能看到事件后，再继续配置生产环境能力。

```bash
npm install sentry-miniapp --save
# 或 yarn add sentry-miniapp
```

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://your-dsn@o0.ingest.sentry.io/0',
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
      <p>确认自动捕获范围，并补充用户、标签、面包屑和独立 Logs。</p>
      <span class="sm-link">查看能力指南</span>
    </a>
    <a class="sm-card" data-tone="trace" href="/guide/performance-and-tracing">
      <span class="sm-kicker">性能</span>
      <h3>性能与链路追踪</h3>
      <p>配置采样、请求 span、追踪目标和 W3C traceparent。</p>
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
