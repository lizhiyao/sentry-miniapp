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

Experimental WeChat page replay is available in source builds through a separate entry, with build-generated annotations for selected pages and static components. Build WeChat npm components before generating annotations. Template-only entry points, plugins and dynamic libraries are not supported by the annotation tool; device overhead and self-hosted Replay still need validation. npm `2.0.2` does not include it. See the [guide](https://sentry-miniapp.pages.dev/guide/page-replay), [#530](https://github.com/lizhiyao/sentry-miniapp/issues/530) for existing implementation and backend evidence, and [#533](https://github.com/lizhiyao/sentry-miniapp/issues/533) for component compatibility and remaining acceptance work.

The source example also supports [local replay validation](https://sentry-miniapp.pages.dev/guide/page-replay#先在本地验证-不上传-sentry): export a recording and inspect it on your computer without using Sentry cloud quota. Local playback and backend acceptance are recorded separately.

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

## 📚 Configure The Monitoring You Need

Once error delivery works, [add user and business context or record logs](https://sentry-miniapp.pages.dev/guide/errors-and-context), or [measure requests and business operations](https://sentry-miniapp.pages.dev/guide/performance-and-tracing). If delivery must wait for user consent, configure and verify the [consent gate](https://sentry-miniapp.pages.dev/guide/reliability-and-privacy). See the [API](https://sentry-miniapp.pages.dev/guide/api) and [configuration reference](https://sentry-miniapp.pages.dev/guide/configuration) for methods and options (Chinese).

---

## 🧭 Where To Go Next

After the first event is working, pick the guide based on what you are doing next:

| I want to... | Read this |
|--------------|-----------|
| Follow the full native mini program setup | [Getting Started](https://sentry-miniapp.pages.dev/guide/getting-started) |
| Set up Taro / uni-app projects and handle component errors | [Taro](https://sentry-miniapp.pages.dev/guide/taro) / [uni-app](https://sentry-miniapp.pages.dev/guide/uniapp) |
| Set up WeChat / Douyin mini games and performance monitoring | [Mini Game Guide](https://sentry-miniapp.pages.dev/guide/minigame) |
| Configure error context, Logs, performance, tracing, or privacy consent | [Capability Guides](https://sentry-miniapp.pages.dev/guide/errors-and-context) |
| Look up public methods and initialization options | [Common APIs](https://sentry-miniapp.pages.dev/guide/api) / [Configuration Reference](https://sentry-miniapp.pages.dev/guide/configuration) |
| Upload Source Maps or troubleshoot Debug IDs and WeChat merged bundles | [Deployment Guide](https://sentry-miniapp.pages.dev/guide/sourcemap) / [Advanced Troubleshooting](https://sentry-miniapp.pages.dev/guide/sourcemap-advanced) |
| Check platform, mini program, and mini game capability differences | [Supported Scope](https://sentry-miniapp.pages.dev/guide/platforms) |
| Reduce main-package size | [Bundle Size](https://sentry-miniapp.pages.dev/guide/bundle-size) |
| See runnable examples | [Examples](https://sentry-miniapp.pages.dev/guide/examples) |
| Check version history and release notes | [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases) |
| Contribute to the project | [Architecture (Chinese)](https://github.com/lizhiyao/sentry-miniapp/blob/master/ARCHITECTURE.md) / [Development Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md) / [Contributing Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/CONTRIBUTING.md) |

---

## ❓ FAQ

- **No events in Sentry after initialization?** Send a test event with `captureException`, then check the DSN, `request` trusted domain, whether `Sentry.init` runs before `App()`, whether `sampleRate` is too low, and whether you only called `addBreadcrumb`. Breadcrumbs are not sent alone; they ship with the next captured event.
- **Must I report manually in `onError`?** No. `Sentry.init` registers available platform global error listeners automatically. Initialize before `App()` to observe startup. Late initialization cannot recover earlier startup errors or `onLaunch` breadcrumbs; native foreground/background listeners can still support sessions after initialization when both are available. Check `getDiagnostics()` for lifecycle warnings.
- **Are network requests included with errors?** Yes, as breadcrumbs containing a filtered URL, method, status and duration. Bodies are off by default. Enabling `traceNetworkBody` collects recognized JSON/form data, filters sensitive keys and applies the size limit; it does not sanitize manual application data.
- **Are trace headers sent to every API by default?** No. Mini programs have no reliable same-origin baseline, so an empty `tracePropagationTargets` list injects nothing. Allowlist only backend origins you control.
- **Why do uni-app / Taro component errors need extra wiring?** Frameworks may catch component errors before they reach the platform global `onError`. Use `app.config.errorHandler` / `Vue.config.errorHandler` for Vue, and an Error Boundary for Taro React.
- **Will it send requests before privacy consent?** By default the SDK reports normally according to your config. If your app must avoid network requests before consent, enable `requireConsent` and call `Sentry.setConsent(true)` once the user grants consent.
- **Can I disable automatic IP enrichment for error events?** Set `dataCollection: { userInfo: false }`. Explicit `setUser()` fields remain; filter them before capture when needed. Existing applications should follow the [migration guide](https://sentry-miniapp.pages.dev/guide/migration-2.0) before updating.
- **Session Replay or H5 builds?** Mini program logic cannot directly access the rendering layer's DOM, so official browser Session Replay cannot run there. Source builds provide [experimental WeChat layout replay](https://sentry-miniapp.pages.dev/guide/page-replay) through public node queries, with limited coverage. For H5 builds, use official [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/develop/packages/browser); keep `sentry-miniapp` for mini program builds.

> Full answers on the **[docs site · FAQ](https://sentry-miniapp.pages.dev/guide/faq)**.

---

## 💬 Community

For setup issues or production troubleshooting, GitHub is the best first stop so answers stay searchable:

- **Bugs / no events / Source Map issues**: [open an issue](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose) with the SDK version, target platform, reproduction steps, relevant config, and `Sentry.getDiagnostics()` output.
- **Feature requests / monitoring design discussions**: [start a discussion](https://github.com/lizhiyao/sentry-miniapp/discussions) with your scenario, target platforms, and expected behavior.

Remove auth tokens, app secrets and personal data before sharing logs or configuration.

For real-time mini program / mini game monitoring discussion, you can join the WeChat group. Due to WeChat group QR code expiration (7-day limit), please add the author on WeChat (**note: sentry-miniapp**) to be invited:

<img src="https://raw.githubusercontent.com/lizhiyao/sentry-miniapp/master/docs/qrcode/zhiyao.jpeg" alt="Author WeChat QR Code" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
