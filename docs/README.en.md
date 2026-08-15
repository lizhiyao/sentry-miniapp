# Sentry Miniapp SDK — Mini Program Monitoring SDK

[![npm version](https://img.shields.io/npm/v/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads/month](https://img.shields.io/npm/dm/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/network/members)
[![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/stargazers)
![test coverage](https://img.shields.io/badge/test%20coverage-95%25%2B-brightgreen.svg)
[![Sentry Community SDK](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)
[![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)](../LICENSE)
[![docs](https://img.shields.io/badge/docs-sentry--miniapp.pages.dev-3eaf7c?logo=readthedocs&logoColor=white)](https://sentry-miniapp.pages.dev/)

[简体中文](../README.md) | English

A **mini program monitoring SDK** built on `@sentry/core`, providing **error monitoring**, **performance monitoring**, offline caching, and distributed tracing. It supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, and Kuaishou mini programs, **WeChat / Douyin mini games**, and Taro / uni-app mini program builds.

Mini program runtimes do not provide browser APIs like `window`, `fetch`, or `XMLHttpRequest`, so this SDK uses each platform's native mini program APIs for event delivery and automatic capture. For H5/web builds, use the official [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/develop/packages/browser); for mini programs or mini games, use this SDK.

> **What are Mini Programs?** Mini programs (小程序) are lightweight apps that run inside super-apps like WeChat, Alipay, and ByteDance/Douyin. They form a massive ecosystem in China with **hundreds of millions of daily active users**, but have no direct equivalent in the Western stack — think of them as a hybrid of PWAs and native apps, hosted within a platform's sandbox.

> **📖 Setup details and production configuration**: [sentry-miniapp.pages.dev](https://sentry-miniapp.pages.dev/) — getting started, framework guides, configuration, Source Maps, FAQ, and examples live on the docs site (Chinese for now).

> **📰 Featured Article (Chinese)**: [《我给 Sentry 提了个 PR，后来 sentry-miniapp 进了官方文档》](https://juejin.cn/post/7636106283963760681) — How sentry-miniapp got listed in Sentry's official community-supported SDKs documentation. If you find this project useful, please consider giving it a ⭐ Star.

---

## ✨ Core Capabilities and Use Cases

- **Automatic error capture**: Captures global errors, Promise rejections, page errors, and memory warnings automatically, then sends them to Sentry Issues instead of leaving them only in user feedback.
- **Debugging context**: Records device info, page lifecycle, taps/touches, and network breadcrumbs to help reconstruct what happened before a user hit an error.
- **Performance and tracing**: Tracks startup, page rendering, resource loading, and API timing; with tracing enabled, requests can be reported as `http.client` spans for backend correlation.
- **Source Map friendly stacks**: Normalizes platform-specific virtual stack paths to `app:///`, supports Source Maps / Debug IDs, and exposes `stackParser` for unusual runtimes.
- **Weak-network and privacy flows**: Failed sends go into the local offline queue and retry when the network recovers; with `requireConsent`, events are buffered locally without sending to Sentry until `Sentry.setConsent(true)` is called.
- **Mini game support**: WeChat / Douyin mini games can report first frame, FPS, and jank to help diagnose slow startup and stutter.
- **Familiar Sentry APIs**: `captureException`, `setUser`, `addBreadcrumb`, `startSpan`, `captureFeedback`, `Sentry.logger.*`, and more.

---

## 🚀 Get It Working In 5 Minutes

Before you start:

- Have access to a working Sentry service (Sentry SaaS or self-hosted), then create a project in Sentry and copy its DSN.
- Add your Sentry endpoint domain to the `request` trusted-domain list in your mini program console.

Install:

```bash
npm install sentry-miniapp
```

> Not using npm? Download the versioned `sentry-miniapp.umd.js` asset from [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases). To run the WeChat example from source, generate its local bundle with `yarn build:miniapp`.

Initialize at the **top** of your entry file (`app.js` / `app.ts`), **before** `App()`:

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@<org>.ingest.sentry.io/<project>',
  release: 'my-project@1.0.0', // match the release you upload Source Maps with
  environment: 'production',
  sampleRate: 1.0, // error sample rate
  tracesSampleRate: 1.0, // performance sample rate; API requests become http.client spans
});

App({ onLaunch() {} });
```

Verify it works:

```javascript
Sentry.captureException(new Error('sentry test'));
```

Then check the Sentry Issues list.

If nothing shows up, first check the DSN, trusted domain, initialization placement, and sampling config. The full checklist lives in [Getting Started](https://sentry-miniapp.pages.dev/guide/getting-started) and the [FAQ](https://sentry-miniapp.pages.dev/guide/faq#no-events).

### 🤖 AI Coding Agent Setup

When working inside the sentry-miniapp repository, agents that support repository Agent Skills can usually auto-discover `sentry-miniapp-sdk`.

For your own mini program / mini game project, install the skill into the project's `.agents/skills/` directory so agents that support repository Agent Skills can auto-discover it:

```bash
npx --yes degit lizhiyao/sentry-miniapp/.agents/skills/sentry-miniapp-sdk .agents/skills/sentry-miniapp-sdk
```

Then say from your project:

> Use the `sentry-miniapp-sdk` skill to set up sentry-miniapp: detect the platform and framework first, then update the entry file and give me verification steps.

To reuse it across multiple projects, change the command's destination path to your agent's global skills directory. If your agent does not auto-load the skill, point it to `.agents/skills/sentry-miniapp-sdk/SKILL.md`. The agent can then follow the repo guidance to check native mini program / Taro / uni-app setup, entry-file placement, initialization order, and production configuration notes.

---

## 📚 Common APIs

```javascript
// Manual capture
Sentry.captureException(new Error('Payment API parsing failed'));
Sentry.captureMessage('User cancelled authorization', 'info');

// User & tags
Sentry.setUser({ id: 'user_12345', username: 'John Doe' });
Sentry.setTag('page_module', 'checkout');

// Breadcrumb
Sentry.addBreadcrumb({ message: 'Tapped [Confirm Payment]', category: 'action', level: 'info' });

// Sentry Logs (requires init({ enableLogs: true }))
Sentry.logger.info('User completed payment', { orderId: 'order_123' });

// Custom span
await Sentry.startSpan({ name: 'fetch-user', op: 'http.client' }, async () => { /* ... */ });

// User feedback: mini programs have no DOM, so submit from your own native form
Sentry.captureFeedback({ message: 'The page is frozen', name: 'John Doe', email: 'john@example.com' });

// Diagnostics: attach the output to issues when troubleshooting SDK setup
console.log(Sentry.getDiagnostics());

// Privacy consent: set requireConsent: true during initialization, then flush once granted
Sentry.setConsent(true);
```

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
| Contribute to the project | [Development Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md) / [Contributing Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/CONTRIBUTING.md) |

---

## ❓ FAQ

- **No events in Sentry after initialization?** Send a test event with `captureException`, then check the DSN, `request` trusted domain, whether `Sentry.init` runs before `App()`, whether `sampleRate` is too low, and whether you only called `addBreadcrumb`. Breadcrumbs are not sent alone; they ship with the next captured event.
- **Must I report manually in `onError`?** No. `Sentry.init` registers platform global error listeners automatically, as long as it runs before `App()`. If it runs too late, startup lifecycle, session, and some breadcrumbs are degraded.
- **Are network requests included with errors?** Yes. By default the SDK records `url`, `method`, status code, and duration summaries as breadcrumbs. Request / response bodies are not recorded by default; enable `traceNetworkBody` only when you also handle sanitization.
- **Why do uni-app / Taro component errors need extra wiring?** Frameworks may catch component errors before they reach the platform global `onError`. Use `app.config.errorHandler` / `Vue.config.errorHandler` for Vue, and an Error Boundary for Taro React.
- **Will it send requests before privacy consent?** By default the SDK reports normally according to your config. If your app must avoid network requests before consent, enable `requireConsent` and call `Sentry.setConsent(true)` once the user grants consent.
- **Session Replay or H5 builds?** Mini programs have no DOM, so official Session Replay is not supported. For H5 builds, use official [`@sentry/browser`](https://github.com/getsentry/sentry-javascript/tree/develop/packages/browser); keep `sentry-miniapp` for mini program builds.

> Full answers on the **[docs site · FAQ](https://sentry-miniapp.pages.dev/guide/faq)**.

---

## 💬 Community

For setup issues or production troubleshooting, GitHub is the best first stop so answers stay searchable:

- **Bugs / no events / Source Map issues**: [open an issue](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose) with the SDK version, target platform, reproduction steps, relevant config, and `Sentry.getDiagnostics()` output.
- **Feature requests / monitoring design discussions**: [start a discussion](https://github.com/lizhiyao/sentry-miniapp/discussions) with your scenario, target platforms, and expected behavior.

Please redact DSNs, tokens, and user data before sharing logs or config.

For real-time mini program / mini game monitoring discussion, you can join the WeChat group. Due to WeChat group QR code expiration (7-day limit), please add the author on WeChat (**note: sentry-miniapp**) to be invited:

<img src="https://raw.githubusercontent.com/lizhiyao/sentry-miniapp/master/docs/qrcode/zhiyao.jpeg" alt="Author WeChat QR Code" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
