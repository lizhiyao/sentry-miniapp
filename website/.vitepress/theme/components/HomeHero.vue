<template>
  <section class="sm-hero" aria-labelledby="sm-hero-title">
    <div class="sm-hero-copy">
      <p class="sm-eyebrow">
        <span class="sm-status-dot" aria-hidden="true"></span>开源 · 小程序与小游戏监控
      </p>
      <h1 id="sm-hero-title">小程序出了问题，<br /><span>找到排查的线索。</span></h1>
      <p class="sm-hero-description">
        把线上异常、操作经过和源码位置串起来。用 Sentry
        排查难复现的报错，也能按需找出慢请求与业务操作的耗时。
      </p>
      <div class="sm-hero-actions">
        <a class="sm-button sm-button-primary" href="/guide/getting-started"
          >开始接入 <span aria-hidden="true">↗</span></a
        >
        <a class="sm-button sm-button-secondary" href="/guide/when-to-use"
          >先确认是否适用 <span aria-hidden="true">→</span></a
        >
      </div>
      <p class="sm-hero-caption">原生小程序 · Taro · uni-app · 微信 / 抖音小游戏</p>
    </div>
    <figure class="sm-investigation" aria-labelledby="sm-investigation-caption">
      <div class="sm-investigation-bar">
        <span><span class="sm-status-dot" aria-hidden="true"></span>从报错到源码</span
        ><span class="sm-preview-label">流程示意</span>
      </div>
      <div class="sm-issue-preview">
        <span class="sm-error-icon" aria-hidden="true">!</span>
        <div>
          <span class="sm-preview-category">异常</span><strong>支付操作失败</strong
          ><span class="sm-preview-meta">结合上下文，了解发生了什么</span>
        </div>
        <span class="sm-issue-mark" aria-hidden="true">↗</span>
      </div>
      <div class="sm-preview-timeline" aria-label="操作记录示意">
        <span>进入页面</span><i aria-hidden="true"></i><span>发起请求</span
        ><i aria-hidden="true"></i><span>捕获异常</span>
      </div>
      <div class="sm-source-preview">
        <div class="sm-source-heading">
          <span class="sm-file-mark" aria-hidden="true">TS</span><span>pages/checkout/index.ts</span
          ><span class="sm-source-badge">源码定位</span>
        </div>
        <pre
          aria-label="业务源码示意"
        ><code><span><em>18</em><b>async function</b> submitOrder() {</span><span><em>19</em>  <b>const</b> result = <b>await</b> pay();</span><span class="sm-source-error"><em>20</em>  <b>throw new</b> Error(<i>'支付失败'</i>);</span><span><em>21</em>}</span></code></pre>
      </div>
      <figcaption id="sm-investigation-caption">
        <span class="sm-caption-mark" aria-hidden="true">↳</span> 上传同一构建的 Source
        Map，定位原始源码
      </figcaption>
    </figure>
  </section>
</template>
