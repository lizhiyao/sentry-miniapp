# Sentry Miniapp SDK — Mini Program Monitoring SDK

[![npm version](https://img.shields.io/npm/v/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads/month](https://img.shields.io/npm/dm/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/network/members)
[![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/stargazers)
![test coverage](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg)
[![Sentry Community SDK](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)
[![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-sentry--miniapp.pages.dev-3eaf7c?logo=readthedocs&logoColor=white)](https://sentry-miniapp.pages.dev/)

[简体中文](./README.md) | English

A **mini program monitoring SDK** built on `@sentry/core`, providing **error monitoring**, **performance monitoring**, offline caching, and distributed tracing. Supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, Kuaishou mini programs, **WeChat / Douyin mini games**, and cross-platform frameworks (Taro / uni-app).

> **What are Mini Programs?** Mini programs (小程序) are lightweight apps that run inside super-apps like WeChat, Alipay, and ByteDance/Douyin. They form a massive ecosystem in China with **hundreds of millions of daily active users**, but have no direct equivalent in the Western stack — think of them as a hybrid of PWAs and native apps, hosted within a platform's sandbox.

> **📖 Full docs live on the documentation site**: [sentry-miniapp.pages.dev](https://sentry-miniapp.pages.dev/) — getting started, capability matrix, per-framework setup, FAQ, Source Map config, and examples, with nav and search (Chinese for now). This README is a quick overview and entry point.

> **📰 Featured Article (Chinese)**: [《我给 Sentry 提了个 PR，后来 sentry-miniapp 进了官方文档》](https://juejin.cn/post/7636106283963760681) — How sentry-miniapp got listed in Sentry's official community-supported SDKs documentation. If you find this project useful, please consider giving it a ⭐ Star.

<details>
<summary><b>🆕 What's New: v1.3 → v1.11 (click to expand)</b></summary>

| Version | Highlights |
|---|---|
| **v1.11** | Mini-game performance data reported as **independent transactions** (Sentry Performance page); API requests reported as `http.client` spans; launched the [documentation site](https://sentry-miniapp.pages.dev/), added Taro / uni-app examples and a [two-layer Source Map merge script](./scripts/merge-sourcemap.mjs) |
| **v1.10** | 🎮 **Mini game support**: auto-detects mini-game environments; adds cold-start first-frame timing and frame-rate / jank (FPS) monitoring |
| **v1.8.0** | AI-assisted integration skill — auto onboarding via Claude Code / Cursor |
| **v1.7.0** | New `tracesSampler` for dynamic sampling; complete Source Map configuration guide |
| **v1.6.0** | 13 enhancements + 16 fixes; build output minification — bundle size reduced by ~**59%** |
| **v1.5.0** | Performance enhancements (configurable thresholds / slow `setData` detection / memory sampling); new page lifecycle, user interaction, and Console breadcrumbs |
| **v1.4.0** | `NetworkBreadcrumbs` captures Request / Response body; configurable offline cache limit |
| **v1.3.0** | 🎯 Build pipeline rewrite (Vite + bundle-inline): **zero external deps**, resolves the `miniprogram_npm` module-resolution issue; built-in Source Map path normalization |

See [CHANGELOG.md](./CHANGELOG.md) for full details.

</details>

---

## ✨ Core Features

- **🚀 Modern Architecture**: Built on the latest Sentry JavaScript V10 SDK core modules.
- **📱 True Multi-Platform Support**: Built-in API abstraction engine — one codebase supports **WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, and Kuaishou** mini programs.
- **🎮 Mini Game Support**: Auto-detects mini-game environments — error / network / device monitoring out of the box, plus mini-game-specific **cold-start first-frame timing** and **frame-rate / jank monitoring**.
- **🎯 Automatic Exception Capture**: No business code intrusion. Hooks into lifecycle error listeners (`onError`, `onUnhandledRejection`, `onPageNotFound`, `onMemoryWarning`).
- **🍞 Rich Context Breadcrumbs**: Auto-records device info, user tap/touch, network requests (XHR), and page lifecycle.
- **🗺️ Built-in SourceMap Path Normalization**: Unifies virtual stack paths across platforms; works with sentry-cli for seamless resolution.
- **📡 Offline Caching for Weak Networks**: Caches events to local storage on failure, silently retries when connectivity returns.
- **⚡ Deep Performance Monitoring**: Navigation timing (FCP/LCP), render performance, resource loading, and custom marks.
- **🔗 Distributed Tracing**: Injects `sentry-trace` / `baggage` headers and reports API timing as `http.client` spans, connecting mini program and backend call chains.
- **📊 Session Health** & **📶 Network Status Monitoring**: Session lifecycle management + real-time network change tracking (WiFi/4G/offline).
- **🛡️ Smart Deduplication & Filtering**: Built-in dedup and sample rate controls to prevent log storms.

---

## 📦 Installation

```bash
npm install sentry-miniapp
```

> Not using npm? Copy `examples/wxapp/lib/sentry-miniapp.js` from this repo directly into your project.

### 🤖 AI-Assisted Setup

With [Claude Code](https://claude.ai/code) or [Cursor](https://cursor.com), get AI-guided setup:

```bash
npx skills add https://github.com/lizhiyao/sentry-miniapp --skill sentry-miniapp-sdk
```

Then just ask "help me set up Sentry monitoring" in your AI editor.

---

## 🚀 Quick Start

**Prerequisites**: ① a Sentry account ([SaaS](https://sentry.io/) or self-hosted); ② add your Sentry endpoint domain to the `request` trusted-domain list in your mini program console.

Initialize at the **top** of your entry file (`app.js` / `app.ts`), **before** `App()`:

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
  release: 'my-project@1.0.0', // match the release you upload Source Maps with
  environment: 'production',
  sampleRate: 1.0, // error sample rate
  tracesSampleRate: 1.0, // performance sample rate; API requests become http.client spans
});

App({ onLaunch() {} });
```

Do not put `Sentry.init` inside `App.onLaunch`: by then `App()` has already been registered, so the SDK cannot wrap that first `onLaunch` call. App lifecycle breadcrumbs, the first session start, and cold-start timing which depends on the `onLaunch` start point may be missing. If you only need later errors, network breadcrumbs, and manual capture, initializing in `onLaunch` still works, but startup instrumentation is degraded.

Default integrations already include **exception capture, performance monitoring, Source Map path normalization, network breadcrumbs, session and network status monitoring** — you usually don't pass `integrations` (doing so replaces the defaults). Full options (offline cache, trace propagation, breadcrumb toggles) are on the [docs site · Configuration](https://sentry-miniapp.pages.dev/guide/configuration).

**Verify it works** — capture an event and check the Sentry "Issues" list:

```javascript
Sentry.captureException(new Error('sentry test'));
```

> ⚠️ `addBreadcrumb` is not reported on its own — it only ships with the next event. Calling it without capturing an event leaves your dashboard empty.

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

// Custom span
await Sentry.startSpan({ name: 'fetch-user', op: 'http.client' }, async () => { /* ... */ });

// Privacy consent: after init({ requireConsent: true }), flush buffered events once granted
Sentry.setConsent(true);
```

For per-page / per-scenario sampling use the `tracesSampler` callback (it overrides `tracesSampleRate`); see the [docs site · Configuration](https://sentry-miniapp.pages.dev/guide/configuration).

For privacy-compliance flows, initialize with `requireConsent: true`: before consent the SDK keeps collecting but sends no network requests, storing events locally. Call `Sentry.setConsent(true)` after the user agrees, or `Sentry.setConsent(false)` if consent is revoked.

---

## 🗺️ Source Map

The SDK normalizes platform virtual stack paths to the `app:///` prefix by default (`enableSourceMap: true`). Upload with sentry-cli:

```bash
sentry-cli releases files "my-miniapp@1.0.0" upload-sourcemaps ./dist \
  --url-prefix "app:///" --ext js --ext map
```

> Full end-to-end setup (build tools, CI/CD, two-layer map merging for cross-platform frameworks, verification) is in the **[Source Map Configuration Guide](./docs/SOURCEMAP_GUIDE.md)**.

---

## 🎮 Mini Game Support

`sentry-miniapp` also works in WeChat / Douyin **mini games**: auto-detects the environment, error / network / device monitoring out of the box, plus **cold-start first-frame timing** and **frame-rate / jank monitoring**. Initialization is identical to mini programs; with `tracesSampleRate` enabled, performance data is reported as independent transactions on the Performance page.

> Capability matrix and performance-reporting details: [docs site · Platforms & Capabilities](https://sentry-miniapp.pages.dev/guide/platforms).

## 📦 Bundle Size Optimization

The SDK is ~100KB. If main-package size matters, use platform "subpackage async" / "dynamic loading" to move the SDK into a subpackage and reduce main-package overhead; platforms with cross-subpackage async loading can reach zero main-package overhead.

> WeChat subpackage async loading and cross-platform verification guidance: [docs site · Bundle Size](https://sentry-miniapp.pages.dev/guide/bundle-size).

---

## 💬 User Feedback

Mini programs have no DOM, so `showReportDialog()` is deprecated. Build a native form to collect feedback, then submit via `Sentry.captureFeedback()`:

```javascript
Sentry.captureFeedback({ message: 'The page is frozen', name: 'John Doe', email: 'john@example.com' });
```

---

## ❓ FAQ (quick reference)

- **Must I report manually in `onError`?** No — `init` hooks the global error listeners automatically.
- **Are network requests included with errors?** Yes, on by default — recorded as `category: xhr` breadcrumbs shipped with the error.
- **uni-app (Vue) component errors rarely reported?** Vue swallows component errors; wire `app.config.errorHandler`. Taro (React) uses an Error Boundary.
- **Session Replay?** Not supported (no DOM); reconstruct via breadcrumbs.
- **H5 build?** Use official `@sentry/browser`, branched via conditional compilation.

> Full answers on the **[docs site · FAQ](https://sentry-miniapp.pages.dev/guide/faq)**.

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Documentation site](https://sentry-miniapp.pages.dev/) | Getting started / capability matrix / FAQ / Source Map / examples (recommended, with search) |
| [Taro guide](https://sentry-miniapp.pages.dev/guide/taro) · [uni-app guide](https://sentry-miniapp.pages.dev/guide/uniapp) | Cross-platform framework setup & component error handling |
| [Source Map Configuration Guide](./docs/SOURCEMAP_GUIDE.md) | End-to-end setup, build tools, CI/CD, verification |
| [Multi-Platform Compatibility Report](./docs/MultiPlatformCompatibilityReport.md) | Platform API differences |
| [Examples](./examples/) | wxapp (native) / taro (React) / uniapp (Vue) runnable examples |
| [Development Guide](./DEVELOPMENT.md) · [Contributing Guide](./CONTRIBUTING.md) | Local dev, debugging & contributing |

---

## 💬 Community

Have questions or want to discuss mini program monitoring? Due to WeChat group QR code expiration (7-day limit), please add the author on WeChat (**note: sentry-miniapp**) to be invited to the group:

<img src="docs/qrcode/zhiyao.jpeg" alt="Author WeChat QR Code" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />

---

## License

[MIT](./LICENSE)
