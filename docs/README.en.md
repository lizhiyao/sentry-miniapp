# Sentry Miniapp SDK — Mini Program Monitoring SDK

[![npm version](https://img.shields.io/npm/v/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads/month](https://img.shields.io/npm/dm/sentry-miniapp)](https://www.npmjs.com/package/sentry-miniapp)
[![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/network/members)
[![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)](https://github.com/lizhiyao/sentry-miniapp/stargazers)
![test coverage](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg)
[![Sentry Community SDK](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)
[![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)](../LICENSE)
[![docs](https://img.shields.io/badge/docs-sentry--miniapp.pages.dev-3eaf7c?logo=readthedocs&logoColor=white)](https://sentry-miniapp.pages.dev/)

[简体中文](../README.md) | English

`sentry-miniapp` is a Sentry SDK for **mini program runtimes**. These runtimes do not provide browser APIs like `window`, `fetch`, or `XMLHttpRequest`, so this SDK uses each platform's native mini program APIs to capture errors, send events, trace performance, record network breadcrumbs, retry offline events, and normalize stack paths for Source Maps.

It supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, and Kuaishou mini programs, **WeChat / Douyin mini games**, and Taro / uni-app mini program builds. For H5/web builds, use the official `@sentry/browser`; for mini programs or mini games, use this SDK.

> **What are Mini Programs?** Mini programs (小程序) are lightweight apps that run inside super-apps like WeChat, Alipay, and ByteDance/Douyin. They form a massive ecosystem in China with **hundreds of millions of daily active users**, but have no direct equivalent in the Western stack — think of them as a hybrid of PWAs and native apps, hosted within a platform's sandbox.

> **📖 Setup details and production configuration**: [sentry-miniapp.pages.dev](https://sentry-miniapp.pages.dev/) — getting started, framework guides, configuration, Source Maps, FAQ, and examples live on the docs site (Chinese for now).

> **📰 Featured Article (Chinese)**: [《我给 Sentry 提了个 PR，后来 sentry-miniapp 进了官方文档》](https://juejin.cn/post/7636106283963760681) — How sentry-miniapp got listed in Sentry's official community-supported SDKs documentation. If you find this project useful, please consider giving it a ⭐ Star.

See [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases) for version history.

---

## ✨ What It Helps With

- **Automatic error capture**: Global errors, Promise rejections, page errors, and memory warnings.
- **Useful debugging context**: Device info, page lifecycle, taps/touches, and network requests are recorded as breadcrumbs and sent with errors.
- **Performance and tracing**: Startup, page rendering, resource loading, and API requests; requests can be reported as `http.client` spans for backend trace correlation.
- **Source Map friendly stacks**: Platform-specific virtual paths are normalized to `app:///`, with Debug ID support and custom `stackParser` support for unusual runtimes.
- **Weak-network and privacy flows**: Offline or failed sends are cached and retried; `requireConsent` can buffer events before user consent without sending network requests.
- **Mini game support**: WeChat / Douyin mini games can report first frame, FPS, and jank.
- **Familiar Sentry APIs**: `captureException`, `setUser`, `addBreadcrumb`, `startSpan`, `captureFeedback`, `Sentry.logger.*`, and more.

---

## 🚀 Get It Working In 5 Minutes

Before you start:

- Create a Sentry project (SaaS or self-hosted).
- Add your Sentry endpoint domain to the `request` trusted-domain list in your mini program console.

Install:

```bash
npm install sentry-miniapp
```

> Not using npm? Copy `examples/wxapp/lib/sentry-miniapp.js` from this repo directly into your project.

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

If nothing shows up, check these first:

- `Sentry.init` must run before `App()`; putting it in `App.onLaunch` degrades startup instrumentation.
- Default integrations already include exception capture, performance monitoring, Source Map path normalization, network breadcrumbs, session, and network status monitoring. You usually don't need to pass `integrations`.
- `addBreadcrumb` is not reported on its own. It only ships with the next captured event.
- `release` must exactly match the release used for Source Map upload, otherwise source stack traces cannot be resolved.

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

// Privacy consent: after init({ requireConsent: true }), flush buffered events once granted
Sentry.setConsent(true);
```

---

## 🧭 Where To Go Next

After the first event is working, pick the guide based on what you are doing next:

| I want to... | Read this |
|--------------|-----------|
| Follow the full native mini program setup | [Getting Started](https://sentry-miniapp.pages.dev/guide/getting-started) |
| Integrate Taro / uni-app, especially component errors | [Taro](https://sentry-miniapp.pages.dev/guide/taro) / [uni-app](https://sentry-miniapp.pages.dev/guide/uniapp) |
| Configure Source Maps, Debug IDs, or unresolved stacks | [Source Map Configuration](https://sentry-miniapp.pages.dev/guide/sourcemap) |
| Configure sampling, Logs, privacy consent, `traceparent`, or custom transport | [Configuration Reference](https://sentry-miniapp.pages.dev/guide/configuration) |
| Check platform, mini program, and mini game capability differences | [Platforms & Capabilities](https://sentry-miniapp.pages.dev/guide/platforms) |
| Reduce main-package size | [Bundle Size](https://sentry-miniapp.pages.dev/guide/bundle-size) |
| See runnable examples | [Examples](https://sentry-miniapp.pages.dev/guide/examples) |
| Contribute to the project | [Development Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/DEVELOPMENT.md) / [Contributing Guide](https://github.com/lizhiyao/sentry-miniapp/blob/master/CONTRIBUTING.md) |

---

## 🤖 AI-Assisted Setup

With [Claude Code](https://claude.ai/code) or [Cursor](https://cursor.com), get AI-guided setup:

```bash
npx skills add https://github.com/lizhiyao/sentry-miniapp --skill sentry-miniapp-sdk
```

Then just ask "help me set up Sentry monitoring" in your AI editor.

---

## ❓ FAQ

- **Must I report manually in `onError`?** No — `init` hooks the global error listeners automatically.
- **Are network requests included with errors?** Yes, on by default — recorded as `category: xhr` breadcrumbs shipped with the error.
- **uni-app (Vue) component errors rarely reported?** Vue swallows component errors; wire `app.config.errorHandler`. Taro (React) uses an Error Boundary.
- **Session Replay?** Not supported (no DOM); reconstruct via breadcrumbs.
- **H5 build?** Use official `@sentry/browser`, branched via conditional compilation.

> Full answers on the **[docs site · FAQ](https://sentry-miniapp.pages.dev/guide/faq)**.

---

## 💬 Community

Have questions or want to discuss mini program monitoring? Due to WeChat group QR code expiration (7-day limit), please add the author on WeChat (**note: sentry-miniapp**) to be invited to the group:

<img src="https://raw.githubusercontent.com/lizhiyao/sentry-miniapp/master/docs/qrcode/zhiyao.jpeg" alt="Author WeChat QR Code" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />

---

## License

[MIT](../LICENSE)
