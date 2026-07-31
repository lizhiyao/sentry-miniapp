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
      text: 开始接入
      link: /guide/getting-started
    - theme: alt
      text: 生产配置
      link: /guide/configuration
    - theme: alt
      text: Source Map
      link: /guide/sourcemap

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

<div class="sm-trust-strip" aria-label="项目可信度">
  <a href="https://docs.sentry.io/platforms/#sdks-supported-by-our-community" target="_blank" rel="noreferrer">
    <strong>官方 Community SDK</strong>
    <span>已收录进 Sentry 官方文档索引</span>
  </a>
  <span>
    <strong>7 大小程序平台</strong>
    <span>微信 / 支付宝 / 字节 / 钉钉 / QQ / 百度 / 快手</span>
  </span>
  <span>
    <strong>Taro / uni-app</strong>
    <span>小程序端直接接入，H5 端使用 @sentry/browser</span>
  </span>
  <span>
    <strong>100% 测试覆盖</strong>
    <span>GitHub Actions 持续验证 Node 20 / 22</span>
  </span>
</div>

<section class="sm-home-section">
  <div class="sm-section-heading">
    <p class="sm-eyebrow">近期能力</p>
    <h2>上线前最常查的四件事</h2>
    <p>把合规、日志、追踪和 Source Map 的入口放到首页，不用在长文档里翻。</p>
  </div>
  <div class="sm-card-grid">
    <a class="sm-card" href="/guide/configuration#隐私合规-同意后上报">
      <span class="sm-kicker">合规</span>
      <h3>隐私同意门禁</h3>
      <p>用户同意前只写本地缓冲，不发 Sentry 网络；同意后补发并恢复上报。</p>
      <span class="sm-link">查看配置</span>
    </a>
    <a class="sm-card" href="/guide/configuration#logs">
      <span class="sm-kicker">日志</span>
      <h3>Sentry Logs</h3>
      <p>把业务日志作为独立 log 查询、聚合和告警，避免只依赖错误事件上下文。</p>
      <span class="sm-link">查看配置</span>
    </a>
    <a class="sm-card" data-tone="trace" href="/guide/configuration#分布式追踪">
      <span class="sm-kicker">追踪</span>
      <h3>W3C traceparent</h3>
      <p>后端接 OpenTelemetry 或 W3C Trace Context 时，可串联小程序到服务端调用链。</p>
      <span class="sm-link">查看配置</span>
    </a>
    <a class="sm-card" data-tone="source" href="/guide/sourcemap#debug-id-与自定义-stackparser">
      <span class="sm-kicker">还原</span>
      <h3>Debug ID / stackParser</h3>
      <p>适配小游戏、Cocos、私有引擎或特殊堆栈格式，提升线上源码还原稳定性。</p>
      <span class="sm-link">查看指南</span>
    </a>
  </div>
</section>

<section class="sm-home-section">
  <div class="sm-section-heading">
    <p class="sm-eyebrow">接入路径</p>
    <h2>按你的工程类型进入</h2>
    <p>原生、Taro、uni-app 和选型判断分开走，减少接入时来回切文档。</p>
  </div>
  <div class="sm-route-grid">
    <a class="sm-card" href="/guide/getting-started">
      <span class="sm-kicker">Native</span>
      <h3>原生小程序</h3>
      <p>微信、支付宝、字节跳动、钉钉、QQ、百度、快手等平台的基础接入。</p>
      <span class="sm-link">快速接入</span>
    </a>
    <a class="sm-card" href="/guide/taro">
      <span class="sm-kicker">React</span>
      <h3>Taro</h3>
      <p>覆盖入口初始化、组件错误边界、请求链路与平台差异处理。</p>
      <span class="sm-link">查看指南</span>
    </a>
    <a class="sm-card" href="/guide/uniapp">
      <span class="sm-kicker">Vue</span>
      <h3>uni-app</h3>
      <p>说明 main.js、Vue errorHandler、条件编译和 H5 端 SDK 分流。</p>
      <span class="sm-link">查看指南</span>
    </a>
    <a class="sm-card" data-tone="source" href="/guide/when-to-use">
      <span class="sm-kicker">Decision</span>
      <h3>选型与限制</h3>
      <p>确认当前端形态是否适合 sentry-miniapp，以及哪些场景应使用官方 Web SDK。</p>
      <span class="sm-link">先判断</span>
    </a>
  </div>
</section>

<section class="sm-home-section sm-check-panel">
  <div>
    <p class="sm-eyebrow">发布检查</p>
    <h2>生产接入前别漏这几项</h2>
    <p>这些问题通常不是 SDK 代码错误，却会直接影响是否能在 Sentry 看到事件、日志和源码堆栈。</p>
  </div>
  <ol class="sm-check-list">
    <li><span>1</span><p><code>Sentry.init</code> 放在入口文件最顶部、<code>App()</code> 之前。</p></li>
    <li><span>2</span><p>小程序后台把 Sentry 上报域名加入 <code>request</code> 合法域名。</p></li>
    <li><span>3</span><p><code>release</code> 与 Source Map 上传时的 release 完全一致。</p></li>
    <li><span>4</span><p>Taro / uni-app 的组件错误按框架指南接入错误边界或 <code>errorHandler</code>。</p></li>
    <li><span>5</span><p>H5 端使用官方 <code>@sentry/browser</code>，小程序端使用 <code>sentry-miniapp</code>。</p></li>
  </ol>
</section>

## 安装

```bash
npm install sentry-miniapp --save
# 或 yarn add sentry-miniapp
```

<p class="sm-install-note">首次接入建议先跑通异常上报，再补 release、Source Map、Logs 与 Trace 配置。</p>

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

> 自托管 / 真机调试时，把 Sentry 域名加入小程序后台「合法域名」。详见 [快速接入](/guide/getting-started)。
