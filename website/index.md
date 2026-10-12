---
layout: home
title: 小程序 Sentry 错误监控与性能排查
description: 用 sentry-miniapp 将微信等小程序、小游戏、Taro 和 uni-app 项目接入 Sentry，发现线上异常、还原源码位置、排查慢请求，并按项目需要配置弱网上报和隐私同意。
---

<HomeHero />

<div class="sm-platform-strip" aria-label="支持的小程序平台">
  <span class="sm-platform-label">一套 SDK，七个平台</span>
  <div><span>微信</span><span>支付宝</span><span>字节跳动</span><span>钉钉</span><span>QQ</span><span>百度</span><span>快手</span></div>
  <a href="/guide/platforms">查看支持范围 <span aria-hidden="true">↗</span></a>
</div>

<section class="sm-home-section" aria-labelledby="sm-benefits-title">
  <div class="sm-section-heading">
    <p class="sm-eyebrow">围绕你的排查工作</p>
    <h2 id="sm-benefits-title">少一点猜测，多一些线索。</h2>
    <p>先接通错误上报，再按项目需要补充源码定位、性能与可靠发送。</p>
  </div>
  <div class="sm-benefits">
    <div class="sm-benefit">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7L12 3Z"/><path d="m8 12 3 3 5-6"/></svg>
      <h3>报错难复现，也有迹可循</h3>
      <p>集中查看异常，结合设备、页面、操作与请求记录还原经过；上传匹配的 Source Map，找到业务源码。</p>
      <a href="/guide/errors-and-context">了解错误排查 <span aria-hidden="true">→</span></a>
    </div>
    <div class="sm-benefit">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20V10m8 10V4m8 16v-7M2 20h20"/></svg>
      <h3>操作变慢，找到耗时步骤</h3>
      <p>开启性能采样，查看请求与业务步骤耗时；配置链路追踪，关联已接入 Sentry 的后端操作。</p>
      <a href="/guide/performance-and-tracing">配置性能监控 <span aria-hidden="true">→</span></a>
    </div>
    <div class="sm-benefit">
      <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg>
      <h3>按网络与隐私要求上报</h3>
      <p>符合策略的发送失败数据可暂存并尝试补发；需要用户同意时，配置同意门禁后再发送监控数据。</p>
      <a href="/guide/reliability-and-privacy">了解发送策略 <span aria-hidden="true">→</span></a>
    </div>
  </div>
</section>

<section class="sm-home-section" aria-labelledby="sm-routes-title">
  <div class="sm-section-heading sm-section-heading-row">
    <div><p class="sm-eyebrow">选择接入方式</p><h2 id="sm-routes-title">从你的工程开始。</h2></div>
    <p>入口位置、组件错误和分端配置，<br />都在对应指南里。</p>
  </div>
  <div class="sm-route-grid">
    <a class="sm-card" href="/guide/getting-started">
      <span class="sm-kicker">01 / NATIVE</span><h3>原生小程序</h3>
      <p>通过原生入口初始化，接入七个平台的小程序工程。</p><span class="sm-link">快速接入 <span aria-hidden="true">↗</span></span>
    </a>
    <a class="sm-card" href="/guide/taro">
      <span class="sm-kicker">02 / REACT</span><h3>Taro</h3>
      <p>补充 React 组件错误上报，与 H5 分端配置。</p><span class="sm-link">Taro 接入指南 <span aria-hidden="true">↗</span></span>
    </a>
    <a class="sm-card" href="/guide/uniapp">
      <span class="sm-kicker">03 / VUE</span><h3>uni-app</h3>
      <p>接通 Vue 组件错误处理，与 H5 分端配置。</p><span class="sm-link">uni-app 接入指南 <span aria-hidden="true">↗</span></span>
    </a>
    <a class="sm-card" href="/guide/minigame">
      <span class="sm-kicker">04 / GAME</span><h3>微信 / 抖音小游戏</h3>
      <p>排查小游戏异常，按需观察帧率与卡顿。</p><span class="sm-link">小游戏接入指南 <span aria-hidden="true">↗</span></span>
    </a>
  </div>
</section>

<section class="sm-home-section sm-setup" aria-labelledby="安装并验证">
<div class="sm-setup-intro">
  <p class="sm-eyebrow">安装并验证</p>
  <h2 id="安装并验证">从第一个<br />测试事件开始。</h2>
  <p>尽早初始化，发送一个测试错误，然后到 Sentry Issues 中确认事件。</p>
  <p class="sm-setup-requirement">当前指南面向 2.x。需要 Sentry 官方云服务，或 <strong>26.4.2 及以上的自建 Sentry</strong>。已有项目升级或使用更旧的后台时，先看<a href="/guide/migration-2.0#version-choice">版本选择与迁移</a>。</p>
  <a class="sm-text-link" href="/guide/getting-started">查看完整接入步骤 <span aria-hidden="true">→</span></a>
</div>
<div class="sm-setup-code">

```bash
npm install sentry-miniapp
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

<p class="sm-code-note">原生小程序在入口顶部、<code>App()</code> 之前初始化；原生微信工程还需构建 npm。没有事件时，先检查 Sentry 上报域名是否已加入 <code>request</code> 合法域名。</p>
</div>
</section>

<section class="sm-home-section sm-next" aria-labelledby="sm-next-title">
  <div class="sm-section-heading"><p class="sm-eyebrow">基础上报之后</p><h2 id="sm-next-title">把监控带到生产环境。</h2><p>沿着实际要完成的任务，继续配置和验证。</p></div>
  <div class="sm-next-grid">
    <a href="/guide/sourcemap"><span class="sm-next-number">01</span><div><h3>让堆栈指向业务源码</h3><p>上传同一构建的 JS 与 Source Map，并验证文件、行列号。</p></div><span aria-hidden="true">↗</span></a>
    <a href="/guide/configuration"><span class="sm-next-number">02</span><div><h3>确认采样与环境配置</h3><p>设置 release 与 environment，按流量规划采样和采集范围。</p></div><span aria-hidden="true">↗</span></a>
    <a href="/guide/reliability-and-privacy"><span class="sm-next-number">03</span><div><h3>检查弱网与隐私同意</h3><p>需要授权时配置门禁，验证同意前暂停发送、同意后尝试补发。</p></div><span aria-hidden="true">↗</span></a>
    <a href="/guide/faq"><span class="sm-next-number">04</span><div><h3>没有数据？从现象排查</h3><p>检查域名、初始化和组件错误；源码不对时继续查映射。</p></div><span aria-hidden="true">↗</span></a>
  </div>
</section>

<div class="sm-community-strip">
  <div><span class="sm-status-dot" aria-hidden="true"></span><strong>开源，与你一起完善。</strong><p>已收录于 Sentry 官方文档的社区 SDK 索引。</p></div>
  <a href="https://docs.sentry.io/platforms/#sdks-supported-by-our-community">Sentry Community SDK <span aria-hidden="true">↗</span></a>
  <a href="https://github.com/lizhiyao/sentry-miniapp/issues/new/choose">提交反馈 <span aria-hidden="true">↗</span></a>
</div>
