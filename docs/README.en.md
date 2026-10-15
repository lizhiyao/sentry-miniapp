# Sentry Miniapp SDK — Mini Program Monitoring SDK

[![npm version](https://img.shields.io/npm/v/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads/month](https://img.shields.io/npm/dm/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/network/members)
[![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/stargazers)
![test coverage](https://img.shields.io/badge/test%20coverage-98.5%25%2B-brightgreen.svg)
[![Sentry Community SDK](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)
[![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)](../LICENSE)
[![docs](https://img.shields.io/badge/docs-sentry--miniapp.pages.dev-3eaf7c?logo=readthedocs&logoColor=white)](https://sentry-miniapp.pages.dev/)

[简体中文](../README.md) | English

Monitor **mini programs and mini games** with Sentry. Investigate production errors using device, interaction and request details; enable performance sampling as needed to measure the duration of requests and business operations.

Supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, and Kuaishou mini programs, plus WeChat and Douyin mini games. Works with native, **Taro** and **uni-app** projects.

**[Quick Start](https://sentry-miniapp.pages.dev/guide/getting-started)** · [Full Documentation](https://sentry-miniapp.pages.dev/) · [Examples](https://sentry-miniapp.pages.dev/guide/examples)

The docs site is in Chinese.

---

## ✨ Core Capabilities and Use Cases

| The problem you face | What you can do with the SDK |
| --- | --- |
| Users report production errors that are hard to reproduce locally | View errors in Sentry and use device, page, interaction and request details to reconstruct what happened |
| Stack traces show minified files and line numbers instead of your source | Upload Source Maps from the matching build to locate the original source and inspect code context |
| Login, checkout or a page action is slow, with no clear bottleneck | Enable performance sampling to measure requests and business steps; configure tracing to connect them with backend operations already instrumented with Sentry |
| A business operation fails without throwing an exception | Record searchable business logs and metrics to inspect key steps and track failure counts or duration distributions |
| A weak connection prevents monitoring requests from being delivered | Buffer eligible data in a local queue with a size limit and retry when connectivity returns |
| Monitoring data must wait for the user's privacy consent | Configure the consent gate to pause Sentry network delivery until consent, then attempt to send buffered data |
| WeChat / Douyin mini games need error and frame-rate monitoring | Monitor game errors and sessions in Sentry, with optional FPS and jank collection |

Automatic collection depends on host capabilities. React / Vue component errors require framework error handling, and mini game FPS collection requires explicit opt-in. See the [Taro](https://sentry-miniapp.pages.dev/guide/taro), [uni-app](https://sentry-miniapp.pages.dev/guide/uniapp), [mini game](https://sentry-miniapp.pages.dev/guide/minigame) and [platform support](https://sentry-miniapp.pages.dev/guide/platforms) guides (Chinese).

---

## Setup Requirements

> This README and the current docs site cover the **stable 2.x release**. Before upgrading an existing 1.x project, or if your self-hosted deployment cannot be upgraded, read the [version selection and migration guide](https://sentry-miniapp.pages.dev/guide/migration-2.0#version-choice) (Chinese).

Use Sentry SaaS or **self-hosted Sentry 26.4.2 or higher**. Older self-hosted deployments are outside the supported range for 2.x; receiving errors alone does not establish support for other monitoring features.

Mini programs are apps hosted inside platforms such as WeChat, Alipay and Douyin. Their JavaScript runtimes use platform-specific networking and lifecycle APIs rather than the browser DOM and request APIs. For H5/web builds, use the official [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/develop/packages/browser); use this SDK for mini program and mini game builds.

## 🚀 Get It Working In 5 Minutes

Before you start:

- Confirm your Sentry deployment meets the requirements above, then create a project and copy its DSN.
- Add your Sentry endpoint domain to the `request` trusted-domain list in your mini program console.
- Check [runtime compatibility](https://sentry-miniapp.pages.dev/guide/platform-compatibility) for required JavaScript capabilities, supplied standard methods, and optional instrumentation fallbacks.

Install:

```bash
npm install sentry-miniapp
```

For native WeChat projects, run **Tools → Build npm** in WeChat Developer Tools after installing or updating the SDK. See [Getting Started](https://sentry-miniapp.pages.dev/guide/getting-started#_1-安装) for directory requirements. Taro and uni-app handle dependencies through their framework builds.

> Not using npm? Download the versioned `sentry-miniapp.umd.js` asset from [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases), place it in your project's `lib/` directory, and replace the import below with `const Sentry = require('./lib/sentry-miniapp.umd.js');`. To run the WeChat example from source, generate its local bundle with `yarn build:miniapp`.

Initialize at the **top** of your entry file (`app.js` / `app.ts`), **before** `App()`:

```javascript
const Sentry = require('sentry-miniapp');

Sentry.init({
  dsn: 'YOUR_DSN', // Copy the complete DSN from your Sentry project.
  release: 'my-project@1.0.0', // match the release you upload Source Maps with
  environment: 'production',
});

App({ onLaunch() {} });
```

Verify it works:

```javascript
Sentry.captureException(new Error('sentry test'));
```

Then check the Sentry Issues list.

Once error delivery works, choose a `tracesSampleRate` appropriate for your traffic to enable performance monitoring; see [Performance and Tracing](https://sentry-miniapp.pages.dev/guide/performance-and-tracing) (Chinese). The minimal setup above does not enable tracing.

If nothing shows up, first check the DSN, trusted domain, initialization placement, and sampling config. The full checklist lives in [Getting Started](https://sentry-miniapp.pages.dev/guide/getting-started) and the [FAQ](https://sentry-miniapp.pages.dev/guide/faq#no-events).

### 🤖 AI Coding Agent Setup

Install the setup skill in your own mini program / mini game project:

```bash
npx --yes degit lizhiyao/sentry-miniapp/.agents/skills/sentry-miniapp-sdk .agents/skills/sentry-miniapp-sdk
```

Ask your agent to use `sentry-miniapp-sdk` to detect the platform and framework, initialize the SDK, and provide verification steps. If it does not auto-discover the skill, point it to `.agents/skills/sentry-miniapp-sdk/SKILL.md`; see the [skill guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/.agents/skills/sentry-miniapp-sdk/SKILL.md).

---

<span id="-configure-the-monitoring-you-need"></span>
<span id="📚-configure-the-monitoring-you-need"></span>

## 🧭 Where To Go Next

After the first event is working, pick the guide based on what you are doing next:

| I want to... | Read this |
|--------------|-----------|
| Follow the full native mini program setup | [Getting Started](https://sentry-miniapp.pages.dev/guide/getting-started) |
| Set up Taro / uni-app projects and handle component errors | [Taro](https://sentry-miniapp.pages.dev/guide/taro) / [uni-app](https://sentry-miniapp.pages.dev/guide/uniapp) |
| Set up WeChat / Douyin mini games and performance monitoring | [Mini Game Guide](https://sentry-miniapp.pages.dev/guide/minigame) |
| Add user, interaction and business log details | [Errors, Logs and Context](https://sentry-miniapp.pages.dev/guide/errors-and-context) |
| Investigate slow requests or connect backend traces | [Performance and Tracing](https://sentry-miniapp.pages.dev/guide/performance-and-tracing) |
| Configure weak-network retries or consent-gated delivery | [Reliability and Privacy Consent](https://sentry-miniapp.pages.dev/guide/reliability-and-privacy) |
| Look up public methods and initialization options | [Common APIs](https://sentry-miniapp.pages.dev/guide/api) / [Configuration Reference](https://sentry-miniapp.pages.dev/guide/configuration) |
| Upload Source Maps or troubleshoot Debug IDs and WeChat merged bundles | [Deployment Guide](https://sentry-miniapp.pages.dev/guide/sourcemap) / [Advanced Troubleshooting](https://sentry-miniapp.pages.dev/guide/sourcemap-advanced) |
| Check platform, mini program, and mini game capability differences | [Supported Scope](https://sentry-miniapp.pages.dev/guide/platforms) |
| Reduce main-package size | [Bundle Size](https://sentry-miniapp.pages.dev/guide/bundle-size) |
| See runnable examples | [Examples](https://sentry-miniapp.pages.dev/guide/examples) |
| Troubleshoot missing events or component errors | [FAQ](https://sentry-miniapp.pages.dev/guide/faq) |
| Check version history and release notes | [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases) |
| Contribute to the project | [Architecture (Chinese)](https://github.com/lizhiyao/sentry-miniapp/blob/master/ARCHITECTURE.md) / [Development Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md) / [Contributing Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/CONTRIBUTING.md) |

---

## Experimental WeChat Page Replay

To inspect UI changes before an error, opt into [WeChat page replay](https://sentry-miniapp.pages.dev/guide/page-replay). It records sampled layouts, text changes and clicks on selected pages; the build tool annotates supported nodes and static components. Use `sentry-miniapp` 2.1.0 or later, install the replay integration and generate page annotations as described in the guide. This experimental feature targets ordinary WeChat mini programs using the WebView renderer.

For Taro 4/webpack5 and uni-app Vue 3/Vite projects, use 2.2.0 or later and configure the build plugin once. Normal builds and watch mode then generate annotations automatically, without editing each page template.

The source example also supports [local recording and playback](https://sentry-miniapp.pages.dev/guide/page-replay#先在本地验证-不上传-sentry): export a recording and inspect it in a PC browser without using Sentry cloud quota.

---

## ❓ FAQ

No events, missing component errors, privacy consent and Source Map issues are covered in the [FAQ](https://sentry-miniapp.pages.dev/guide/faq) (Chinese). Start with a new test error and `Sentry.getDiagnostics()`, then check the actual request and the corresponding event in your Sentry project.

---

## 💬 Community

For setup issues or production troubleshooting, GitHub is the best first stop so answers stay searchable:

- **Bugs / no events / Source Map issues**: [open an issue](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose) with the SDK version, target platform, reproduction steps, relevant config, and `Sentry.getDiagnostics()` output.
- **Feature requests / monitoring design discussions**: [start a discussion](https://github.com/lizhiyao/sentry-miniapp/discussions) with your scenario, target platforms, and expected behavior.

Remove auth tokens, app secrets and personal data before sharing logs or configuration.

For real-time mini program / mini game monitoring discussion, you can join the WeChat group. Due to WeChat group QR code expiration (7-day limit), please add the author on WeChat (**note: sentry-miniapp**) to be invited:

<img src="https://raw.githubusercontent.com/lizhiyao/sentry-miniapp/master/docs/qrcode/zhiyao.jpeg" alt="Author WeChat QR Code" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
