# Sentry Miniapp SDK — Mini Program Monitoring SDK

![npm version](https://img.shields.io/npm/v/sentry-miniapp)
![npm downloads/month](https://img.shields.io/npm/dm/sentry-miniapp)
![github forks](https://img.shields.io/github/forks/lizhiyao/sentry-miniapp?style=social)
![github stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp?style=social)
![test coverage](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg)
![license](https://img.shields.io/github/license/lizhiyao/sentry-miniapp)

[简体中文](./README.md) | English

A **mini program monitoring SDK** built on `@sentry/core` (v10.45.0), providing **error monitoring**, **performance monitoring**, offline caching, and distributed tracing. Supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, Kuaishou mini programs and cross-platform frameworks (Taro / uni-app).

> **What are Mini Programs?** Mini programs (小程序) are lightweight apps that run inside super-apps like WeChat, Alipay, and ByteDance/Douyin. They form a massive ecosystem in China with **hundreds of millions of daily active users**, but have no direct equivalent in the Western tech stack. Think of them as a hybrid between PWAs and native apps, but hosted within a platform's sandbox.

> **Version Notes**
>
> - `v1.x.x`: New architecture based on Sentry V10 core. Full support for WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, Kuaishou mini programs and cross-platform frameworks (Taro / uni-app).
> - `v0.x.x`: Legacy version, no longer maintained.

---

## Core Features

- **Modern Architecture**: Built on the latest Sentry JavaScript V10 SDK core modules.
- **True Multi-Platform Support**: Built-in API abstraction engine — one codebase seamlessly supports **WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, and Kuaishou** mini program platforms.
- **Automatic Exception Capture**: No business code intrusion required. Automatically hooks into lifecycle error listeners (`onError`, `onUnhandledRejection`, `onPageNotFound`, `onMemoryWarning`).
- **Rich Context Breadcrumbs**: Automatically records device info, user tap/touch interactions, network requests (XHR/Fetch), and page navigation paths.
- **Built-in SourceMap Path Normalization**: Handles virtual stack paths across WeChat, Alipay, ByteDance and other platforms. Works with sentry-cli for seamless SourceMap resolution.
- **Offline Caching for Weak Networks**: Designed for mini program network conditions. Automatically caches events to local storage on network failure, silently retries when connectivity is restored.
- **Deep Performance Monitoring**: Integrates mini program Performance API for navigation timing (FCP/LCP), render performance, resource loading, and custom performance marks.
- **Smart Deduplication & Filtering**: Built-in error deduplication and sample rate controls to prevent log storms.
- **Cross-Platform Framework Friendly**: Works seamlessly with Taro, uni-app, and other cross-platform compilation frameworks.
- **Distributed Tracing**: Automatically injects `sentry-trace` / `baggage` headers into network requests, connecting mini program and backend service call chains.
- **Session Health Monitoring**: Automatic session lifecycle management with crash rate and session health data in the Sentry Release Health dashboard.
- **Network Status Monitoring**: Real-time tracking of network changes (WiFi/4G/offline) to help diagnose network-related exceptions.
- **Stack Trace Parsing**: Built-in multi-platform stack parser supporting V8/Safari/JavaScriptCore formats for precise error location with SourceMap.

---

## Installation

```bash
npm install sentry-miniapp --save
```

> **Note:** Starting from `v1.1.0`, the build strategy has been optimized (dependencies are inlined), so there is **no need** to install `@sentry/core` separately.

*Tip: If you don't use npm, you can also copy `examples/wxapp/lib/sentry-miniapp.js` from this repository directly into your mini program project.*

---

## Quick Start

### 1. Prerequisites

1. Ensure you have a Sentry account ([Sentry SaaS](https://sentry.io/) or self-hosted).
2. **Important**: Add your Sentry reporting endpoint domain to the `request` trusted domain list in your mini program platform's admin console.

### 2. Initialize the SDK

Initialize Sentry at the **top** of your mini program entry file (e.g., `app.js` or `app.ts`), **before** calling `App()`.

```javascript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@sentry.io/<project>',
  environment: 'production',
  release: 'my-project-name@1.0.0',

  // --- Mini Program Configuration ---
  platform: 'wechat', // Current platform (wechat | alipay | bytedance | dd | swan, etc.)
  enableSystemInfo: true, // Auto-collect system and device info
  enableUserInteractionBreadcrumbs: true, // Auto-record user tap events
  enableNavigationBreadcrumbs: true, // Auto-record page navigation
  traceNetworkBody: true, // Record request/response bodies in breadcrumbs (default: false)

  // --- Offline Cache & Reliability ---
  enableOfflineCache: true, // Enable offline caching with retry (default: true)
  offlineCacheLimit: 30, // Max cached events (default: 30)

  // --- SourceMap Support ---
  enableSourceMap: true, // Normalize virtual stack paths for SourceMap resolution

  // --- Sampling ---
  sampleRate: 1.0, // Error reporting sample rate (0.0 - 1.0)

  // --- Distributed Tracing ---
  enableTracePropagation: true, // Auto-inject sentry-trace/baggage headers (default: true)
  tracePropagationTargets: ['api.example.com'], // Only inject tracing headers for specified domains

  // --- Session & Network Monitoring ---
  enableAutoSessionTracking: true, // Auto session lifecycle management (default: true)
  enableNetworkStatusMonitoring: true, // Real-time network status monitoring (default: true)

  // Optional: Performance monitoring
  integrations: [
    Sentry.performanceIntegration({
      enableNavigation: true, // Navigation timing
      enableRender: true, // Render timing
      enableResource: true, // Resource loading timing
    }),
  ]
});

App({
  onLaunch() {
    // ...
  }
});
```

---

## Advanced Usage

After initialization, the SDK works automatically in the background. You can also use the following APIs for manual instrumentation.

### Manual Exception & Message Reporting

```javascript
// Manually capture and report an Error
try {
  throw new Error('Payment API parsing failed');
} catch (error) {
  Sentry.captureException(error);
}

// Log a message
Sentry.captureMessage('User cancelled authorization', 'info');
```

### Context Enrichment (Context & Breadcrumbs)

```javascript
// Set current user info
Sentry.setUser({
  id: 'user_12345',
  username: 'John Doe'
});

// Set global tags for filtering and analytics
Sentry.setTag('page_module', 'checkout_counter');

// Manually add a breadcrumb
Sentry.addBreadcrumb({
  message: 'User tapped [Confirm Payment] button',
  category: 'action',
  level: 'info',
  data: { cartId: 'c_888' }
});
```

### Custom Performance Measurement

```javascript
// Mark start point
Sentry.addPerformanceMark('api-request-start');
// ... perform operation
Sentry.addPerformanceMark('api-request-end');

// Measure the interval
Sentry.measurePerformance('fetch-user-data', 'api-request-start', 'api-request-end');
```

### Dynamic Sampling (tracesSampler)

Beyond the global `sampleRate`, you can use the `tracesSampler` callback for fine-grained, per-page sampling control:

```javascript
Sentry.init({
  dsn: '...',
  tracesSampler: ({ name, inheritOrSampleWith }) => {
    // 100% sampling for critical pages
    if (name.includes('pages/index') || name.includes('pages/pay')) {
      return 1;
    }
    // Lower sampling for low-priority pages
    if (name.includes('pages/about') || name.includes('pages/settings')) {
      return 0.1;
    }
    // Inherit upstream decision or fall back to 50%
    return inheritOrSampleWith(0.5);
  },
});
```

> **Note:** When `tracesSampler` is set, `tracesSampleRate` is ignored. `tracesSampler` takes priority.

---

## SourceMap Support

The SDK includes built-in multi-platform stack path normalization (`enableSourceMap: true`, enabled by default), automatically converting platform-specific virtual paths to the `app:///` prefix for seamless SourceMap resolution with sentry-cli.

**Quick upload example:**

```bash
sentry-cli releases files "my-miniapp@1.0.0" upload-sourcemaps ./dist \
  --url-prefix "app:///" \
  --ext js --ext map
```

> For a complete end-to-end setup guide (build tool configs, CI/CD integration, verification & troubleshooting), see **[Source Map Configuration Guide](./docs/SOURCEMAP_GUIDE.md)**.

---

## User Feedback

In web environments, Sentry provides a built-in `showReportDialog()` popup. However, mini programs have no DOM, so this method is **not available**.

Instead, build a **native mini program form or modal** to collect user feedback, then submit it via `Sentry.captureFeedback()`:

```javascript
const userMessage = 'The page is frozen, nothing responds';
const userName = 'John Doe';
const userEmail = 'john@example.com';

Sentry.captureFeedback({
  message: userMessage,
  name: userName,
  email: userEmail,
  // Optional: associate with a specific error event
  // associatedEventId: 'abc123xyz...'
});
```

---

## Bundle Size Optimization (Zero Main Package Overhead)

Mini program "main package" size is limited (typically 2MB). `sentry-miniapp` includes the full `@sentry/core` engine and multi-platform adapters, totaling ~100KB.

If main package size is a concern, use **subpackage async loading** or **dynamic loading** to move the SDK entirely into a subpackage.

### Option A: WeChat / Alipay (Recommended)

WeChat and Alipay natively support [subpackage async loading](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html).

```javascript
// app.js
App({
  onLaunch() {
    require.async('./subpackageA/sentry-miniapp.js').then((Sentry) => {
      Sentry.init({
        dsn: 'https://xxxxxxxx@sentry.io/12345',
        // ...other options
      });
      console.log('Sentry loaded and initialized successfully');
    }).catch(err => {
      console.error('Failed to load Sentry', err);
    });
  }
});
```

*This way, Sentry's ~100KB is counted against `subpackageA`'s size — zero main package overhead!*

### Option B: Other Platforms (ByteDance, Baidu, etc.)

For platforms that don't support `require.async`, use **subpackage predownload + dynamic loading**:

```javascript
// ByteDance mini program example
App({
  onLaunch() {
    const loadTask = tt.loadSubpackage({
      name: 'subpackageA',
      success: () => {
        const Sentry = require('./subpackageA/sentry-miniapp.js');
        Sentry.init({ dsn: '...' });
      }
    });
  }
});
```

*Note: If using Taro / uni-app, you can use `import('sentry-miniapp')` dynamic import syntax — the framework handles cross-platform differences at compile time.*

---

## FAQ

### 1. Do I need to manually report errors in `onError`?

**No.** `sentry-miniapp` automatically hooks into platform-level global error listeners (e.g., `wx.onError`) during initialization. As long as `Sentry.init` is called **before** `App()`, it captures all unhandled JS exceptions automatically.

If errors are not being reported, check:
1. Whether the Sentry domain is in the mini program's trusted domain list.
2. Whether `sampleRate` is set too low.
3. Some WeChat DevTools environments don't trigger `onError` — test on a **real device**.

### 2. Does this SDK support Session Replay?

**Not currently.** Sentry's official Replay feature relies on standard browser DOM (via rrweb recording). Mini programs use a dual-thread architecture without standard DOM access. We recommend using **Breadcrumbs** combined with **custom logging** to reconstruct user action sequences.

---

## Documentation

| Document | Description |
|----------|-------------|
| [SourceMap Configuration Guide](./docs/SOURCEMAP_GUIDE.md) | End-to-end SourceMap setup, build tools, CI/CD, verification & troubleshooting |
| [Multi-Platform Compatibility Report](./docs/MultiPlatformCompatibilityReport.md) | Platform API compatibility matrix and differences |
| [Example Project](./examples/wxapp/) | Complete WeChat mini program integration example |
| [Development Guide](./DEVELOPMENT.md) | Local development setup and debugging |
| [Contributing Guide](./CONTRIBUTING.md) | How to contribute to the project |

---

## Community

Have questions or want to discuss mini program monitoring? Join our community.

Due to WeChat group QR code expiration (7-day limit), please add the author on WeChat (**note: sentry-miniapp**) to be invited to the group:

<img src="docs/qrcode/zhiyao.jpeg" alt="Author WeChat QR Code" width="200" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />

---

## License

[MIT](./LICENSE)
