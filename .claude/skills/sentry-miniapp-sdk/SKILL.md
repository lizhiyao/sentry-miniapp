---
name: sentry-miniapp-sdk
description: Full Sentry SDK setup for Mini Programs — error monitoring, tracing, offline cache, source maps. Supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, Kuaishou and cross-platform frameworks (Taro / uni-app).
license: Apache-2.0
category: sdk-setup
disable-model-invocation: false
---

> [All Skills](../../SKILL_TREE.md) > Mini Programs

# Sentry Mini Program SDK Setup

Set up Sentry error monitoring, performance tracing, and offline caching in mini program projects using [`sentry-miniapp`](https://github.com/lizhiyao/sentry-miniapp) — a community SDK built on `@sentry/core` v10.

## Invoke This Skill When

- User mentions **mini program**, **miniapp**, **小程序**, **WeChat**, **Alipay**, **ByteDance**, **Taro**, **uni-app** alongside Sentry
- User wants to add error monitoring or performance tracking to a mini program
- User asks about Sentry support for WeChat/Alipay/ByteDance mini programs
- User imports or references `sentry-miniapp` in their project

> **Note:** SDK versions and APIs reflect the current sentry-miniapp docs. Always verify against the [sentry-miniapp README](https://github.com/lizhiyao/sentry-miniapp) before implementing.

---

## Phase 1: Detect

Run these commands to understand the project:

```bash
# Detect mini program platform
ls app.json project.config.json mini.project.json 2>/dev/null
cat app.json 2>/dev/null | head -20

# Detect framework (Taro / uni-app / native)
cat package.json 2>/dev/null | grep -E '"@tarojs/|"@dcloudio/uni-|"sentry-miniapp"'

# Check for existing Sentry SDK
grep -r "sentry" package.json 2>/dev/null
grep -r "Sentry.init" app.js app.ts src/app.js src/app.ts 2>/dev/null

# Detect entry point
ls app.js app.ts src/app.js src/app.ts 2>/dev/null

# Detect package manager
ls yarn.lock pnpm-lock.yaml package-lock.json 2>/dev/null
```

**What to determine:**

| Question | Impact |
|----------|--------|
| Which mini program platform? | Determines `platform` option and API differences |
| Native or cross-platform framework (Taro/uni-app)? | Determines init pattern and build config |
| Is `sentry-miniapp` already installed? | Skip install if present, check version |
| Where is the app entry point? | Determines where to place `Sentry.init()` |
| Is there a build tool config (webpack/vite)? | Needed for Source Map setup |

### Platform Detection Guide

| File Present | Platform |
|-------------|----------|
| `project.config.json` | WeChat (微信) |
| `mini.project.json` | Alipay (支付宝) |
| `project.tt.json` | ByteDance (字节跳动) |
| `project.swan.json` | Baidu (百度) |
| `project.qq.json` | QQ |
| `@tarojs/*` in package.json | Taro (cross-platform) |
| `@dcloudio/uni-*` in package.json | uni-app (cross-platform) |

---

## Phase 2: Recommend

Present this recommendation based on detection results:

**Recommended (core coverage):**

- ✅ **Error Monitoring** — always. Automatic capture of `onError`, `onUnhandledRejection`, `onPageNotFound`, `onMemoryWarning`
- ✅ **Performance Tracing** — always. Navigation timing, render performance, resource loading, custom spans

**Recommended for production:**

- ⚡ **Source Map Upload** — when deploying to production. Maps minified stack traces back to source code
- ⚡ **Offline Cache** — when users are on unreliable networks. Caches events locally, retries when connectivity returns

**Optional:**

- ⚡ **Distributed Tracing** — when mini program calls backend APIs. Injects `sentry-trace`/`baggage` headers to link frontend and backend spans
- ⚡ **User Feedback** — when you want to collect user-reported issues via `Sentry.captureFeedback()`

| Feature | Recommend when... |
|---------|-------------------|
| Error Monitoring | **Always** — zero-config automatic exception capture |
| Performance Tracing | **Always** — automatic page/network/render performance |
| Source Map | **Production** — required to read minified stack traces |
| Offline Cache | **Weak networks** — mobile users, rural areas |
| Distributed Tracing | **API calls** — mini program talks to backend services |
| User Feedback | **User-facing** — collect bug reports from end users |

---

## Phase 3: Guide

### Step 1: Install

```bash
# npm
npm install sentry-miniapp

# yarn
yarn add sentry-miniapp
```

### Step 2: Initialize

Create or modify the app entry point. `Sentry.init()` **must** be called **before** `App()`.

#### Native Mini Program (app.js)

```javascript
const Sentry = require('sentry-miniapp');

Sentry.init({
  dsn: 'https://<key>@<org>.ingest.sentry.io/<project>',
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});

App({
  // Your app config...
  // No need to manually call Sentry in onError — SDK handles it automatically
});
```

#### Taro (app.js or app.ts)

```typescript
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'https://<key>@<org>.ingest.sentry.io/<project>',
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});

// Taro App component follows...
```

#### uni-app (App.vue or main.js)

```javascript
const Sentry = require('sentry-miniapp');

Sentry.init({
  dsn: 'https://<key>@<org>.ingest.sentry.io/<project>',
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});
```

### Step 3: Configure Platform (if needed)

The SDK auto-detects the platform at runtime. No explicit `platform` option is required in most cases.

If you need to force a specific platform:

```javascript
Sentry.init({
  dsn: '...',
  platform: 'wechat', // 'wechat' | 'alipay' | 'bytedance' | 'qq' | 'baidu' | 'dingtalk'
});
```

### Step 4: Add User Context

```javascript
// After user login
Sentry.setUser({
  id: 'user-123',
  username: 'zhang_san',
});

// Add custom tags
Sentry.setTag('page', 'payment');
Sentry.setContext('order', { orderId: '2024001', amount: 99.9 });
```

### For Each Agreed Feature

Walk through features one at a time. Load the corresponding reference file:

| Feature | Reference | Load when... |
|---------|-----------|-------------|
| Error Monitoring | `${SKILL_ROOT}/references/error-monitoring.md` | Always |
| Performance Tracing | `${SKILL_ROOT}/references/tracing.md` | User agreed to tracing |
| Offline Cache | `${SKILL_ROOT}/references/offline-cache.md` | User agreed to offline cache |
| Source Map | `${SKILL_ROOT}/references/sourcemap.md` | User agreed to source maps |

---

## Configuration Reference

### Key Init Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dsn` | `string` | — | Sentry DSN (required) |
| `release` | `string` | — | Release version, must match source map upload |
| `environment` | `string` | — | Environment name (production, staging, etc.) |
| `sampleRate` | `number` | `1.0` | Error event sample rate (0.0–1.0) |
| `tracesSampleRate` | `number` | — | Trace sample rate (0.0–1.0) |
| `tracesSampler` | `function` | — | Dynamic sampling function (overrides tracesSampleRate) |
| `enableSourceMap` | `boolean` | `true` | Auto-normalize stack trace paths for source map resolution |
| `enableOfflineCache` | `boolean` | `true` | Cache events when offline, retry when back online |
| `offlineCacheLimit` | `number` | `30` | Max events to store in offline cache |
| `enableTracePropagation` | `boolean` | `true` | Inject sentry-trace/baggage headers in outgoing requests |
| `tracePropagationTargets` | `Array` | `[]` | URL patterns for trace header injection (empty = all) |
| `enableAutoSessionTracking` | `boolean` | `true` | Automatic session lifecycle management |
| `enableConsoleBreadcrumbs` | `boolean` | `false` | Capture console.log/warn/error as breadcrumbs |
| `beforeSend` | `function` | — | Event processor for filtering/modifying events |

### Platform Compatibility

| Feature | WeChat | Alipay | ByteDance | Baidu | QQ | DingTalk | Kuaishou |
|---------|--------|--------|-----------|-------|----|----------|----------|
| Error Capture | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Offline Cache | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Distributed Tracing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Session Tracking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Source Map | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Verification

After setup, verify the integration:

1. **Trigger a test error:**

```javascript
// In any page
Sentry.captureException(new Error('Test error from mini program'));
```

2. **Check Sentry dashboard:**
   - Go to your Sentry project → Issues
   - You should see the test error with:
     - Device info (brand, model, OS)
     - Mini program context (platform, SDK version)
     - Breadcrumbs (page navigation, network requests)

3. **Verify automatic capture works:**
   - Throw an unhandled error in a page — it should appear in Sentry without any manual `captureException` call

---

## Phase 4: Cross-Link

After mini program setup, check for companion services:

```bash
# Check for backend services in the same workspace
ls -d ../*/package.json ../*/requirements.txt ../*/go.mod ../*/Gemfile 2>/dev/null
```

| Backend Detected | Suggest |
|-----------------|---------|
| Node.js (`package.json` with server framework) | `sentry-node-sdk` skill |
| Python (`requirements.txt`) | `sentry-python-sdk` skill |
| Go (`go.mod`) | `sentry-go-sdk` skill |
| Ruby (`Gemfile`) | `sentry-ruby-sdk` skill |
| Java (`pom.xml` / `build.gradle`) | Sentry Java SDK docs |

> **Tip:** Enable distributed tracing on both mini program and backend to get end-to-end request traces across services.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Events not appearing in Sentry | Check DSN is correct; verify Sentry domain is in mini program's trusted domain list |
| `sampleRate` filtering all events | Ensure `sampleRate` is not set to `0`; default is `1.0` |
| Minified stack traces | Set up Source Map upload — see `${SKILL_ROOT}/references/sourcemap.md` |
| Duplicate error reports | Do NOT manually call `Sentry.captureException` in `onError` — SDK captures automatically |
| Events lost on weak networks | Enable offline cache: `enableOfflineCache: true` (default) |
| WeChat DevTools not triggering `onError` | Test on a real device; DevTools may not trigger all error handlers |
| Stack trace paths don't match source maps | Ensure `--url-prefix "app:///"` when uploading; SDK normalizes paths to `app:///` automatically |
