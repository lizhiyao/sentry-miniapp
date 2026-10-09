---
name: sentry-miniapp-sdk
description: Full Sentry SDK setup for Mini Programs — error monitoring, tracing, offline cache, source maps. Supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, Kuaishou and cross-platform frameworks (Taro / uni-app).
license: MIT
metadata:
  category: sdk-setup
---

# Sentry Mini Program SDK Setup

Set up Sentry error monitoring, performance tracing, and offline caching in mini program projects using [`sentry-miniapp`](https://github.com/lizhiyao/sentry-miniapp) — a community SDK built on `@sentry/core` v11.

## Invoke This Skill When

- User mentions **mini program**, **miniapp**, **小程序**, **WeChat**, **Alipay**, **ByteDance**, **Taro**, **uni-app** alongside Sentry
- User wants to add error monitoring or performance tracking to a mini program
- User asks about Sentry support for WeChat/Alipay/ByteDance mini programs
- User imports or references `sentry-miniapp` in their project

> This skill describes the 2.0 beta contract. Install `sentry-miniapp@next` to try it; an unqualified install still selects stable 1.x. Check the installed SDK version before editing a consumer. Read website/guide/migration-2.0.md for breaking changes and incomplete real-device/application-symbolication acceptance; do not apply removed APIs to 2.0.

---

## Phase 1: Detect

Run these commands to understand the project:

```bash
# Detect mini program platform
ls app.json project.config.json mini.project.json project.tt.json project.swan.json project.qq.json 2>/dev/null
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
| Which mini program platform? | Determines whether `miniappPlatform` is needed and which host APIs are used |
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

DingTalk and Kuaishou do not have a stable project-file signal in this guide.
Confirm them from platform globals, framework configuration, dependencies, or
the user's stated target instead of guessing from a filename.

---

## Phase 2: Recommend

Present this recommendation based on detection results:

**Recommended (core coverage):**

- ✅ **Error Monitoring** — always. Automatic capture of `onError`, `onUnhandledRejection`, `onPageNotFound`, `onMemoryWarning`
- ✅ **Performance Tracing** — when needed. HTTP and business spans; Performance observers and FPS are opt-in

**Recommended for production:**

- ⚡ **Source Map Upload** — when deploying to production. Maps minified stack traces back to source code
- ⚡ **Offline Cache** — when users are on unreliable networks. Caches events locally, retries when connectivity returns

**Optional:**

- ⚡ **Distributed Tracing** — when mini program calls backend APIs. Injects `sentry-trace`/`baggage` headers, and can optionally add W3C `traceparent`, to link frontend and backend spans
- ⚡ **User Feedback** — when you want to collect user-reported issues via `Sentry.captureFeedback()`

| Feature | Recommend when... |
|---------|-------------------|
| Error Monitoring | **Always** — zero-config automatic exception capture |
| Performance Tracing | When measuring latency; HTTP tracing is built-in, observers are opt-in |
| Source Map | **Production** — required to read minified stack traces |
| Offline Cache | **Weak networks** — mobile users, rural areas |
| Distributed Tracing | **API calls** — mini program talks to backend services |
| User Feedback | **User-facing** — collect bug reports from end users |

---

## Phase 3: Guide

### Step 1: Install

```bash
# npm
npm install sentry-miniapp@next

# yarn
yarn add sentry-miniapp@next
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

The SDK auto-detects the platform at runtime. When multiple platform globals are present, it uses platform-specific host names, data paths, and App IDs to disambiguate them. Set `miniappPlatform` only when those runtime signals are unavailable, conflicting, or the detected event label still does not match the release target.

If you need to override the event's miniapp platform label:

```javascript
Sentry.init({
  dsn: '...',
  miniappPlatform: 'bytedance', // 'wechat' | 'alipay' | 'bytedance' | 'qq' | 'swan' | 'dingtalk' | 'kuaishou'
  // Note: Baidu's global object is `swan`, so use 'swan' (there is no 'baidu' value).
});
```

The configured value is written to `contexts.miniapp.platform`; it does not switch the underlying runtime API. The top-level Sentry event `platform` always remains the standard value `javascript` so stack parsing, grouping, and Source Maps follow official JavaScript SDK semantics. Error handlers, requests, and storage continue using the compatible global detected automatically.

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

### Minigame (小游戏)

WeChat / ByteDance minigames have no App/Page model. The SDK uses available native lifecycle APIs for Session and foreground state. minigameIntegration() observes SDK setup to first rAF by default; this is not full cold start. FPS/jank loops default off: opt in with enableMinigameFrameRate: true. Missing rAF safely skips these measurements. Do not promise equivalent optional performance capabilities on all hosts.

### For Each Agreed Feature

Walk through features one at a time. Load the corresponding reference file:

| Feature | Reference | Load when... |
|---------|-----------|-------------|
| Error Monitoring | `references/error-monitoring.md` | Always |
| Performance Tracing | `references/tracing.md` | User agreed to tracing |
| Offline Cache | `references/offline-cache.md` | User agreed to offline cache |
| Source Map | `references/sourcemap.md` | User agreed to source maps |

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
| `stackParser` | `StackParser` | `miniappStackParser` | Custom stack parser for private runtimes or special stack formats |
| `enableOfflineCache` | `boolean` | `true` | Cache events when offline, retry when back online |
| `offlineCacheLimit` | `number` | `30` | Max events to store in offline cache |
| `offlineCacheMaxAge` | `number` | `86400000` | Drop cached events older than this (ms); default 24h |
| `requireConsent` | `boolean` | `false` | Gate outbound Sentry network sends until `Sentry.setConsent(true)` |
| `consentCacheLimit` | `number` | `100` | Max events buffered before consent; preserves oldest cold-start data |
| `consentCacheMaxBytes` | `number` | `921600` | Max consent-buffer bytes; default ~900KB due miniapp single-key storage limits |
| `consentCacheMaxAge` | `number` | `86400000` | Drop consent-buffered events older than this (ms); default 24h |
| `onConsentCacheDrop` | `function` | — | Called with `{ reason, dropped }` when consent buffer drops events |
| `enableTracePropagation` | `boolean` | `true` | Inject distributed tracing headers (`sentry-trace`/`baggage`, plus optional `traceparent`) in outgoing requests |
| `enableStandaloneHttpSpans` | `boolean` | `true` | Send parentless API requests as standalone segment spans; set false for child-only request tracing |
| `tracePropagationTargets` | `Array` | `[]` | URL allowlist for trace header injection; empty means no injection because mini programs have no reliable same-origin baseline |
| `propagateTraceparent` | `boolean` | `false` | Also inject W3C `traceparent` for OpenTelemetry / W3C Trace Context compatible backends |
| `enableAutoSessionTracking` | `boolean` | `true` | Automatic session lifecycle management |
| `enableConsoleBreadcrumbs` | `boolean` | `false` | Capture console.log/warn/error as breadcrumbs |
| `traceNetworkBody` | `boolean` | `false` | Capture request/response body in network breadcrumbs; sanitized key-by-key first, then truncated |
| `maxRequestBodySize` | `'small' \| 'medium' \| number` | `1 MB` | Byte cap per captured body (`small` = 1 KB, `medium` = 10 KB); `request_body_size` / `response_body_size` still report the full pre-truncation size |
| `sensitiveKeys` | `Array<string>` | `[]` | **Additional** key snippets masked in bodies, page `onLoad` query and launch/page query (matched case-insensitively as substrings, on top of core's built-in list) |
| `dataCollection` | `object` | see core 11 | Collection gates this SDK honors: `urlQueryParams` (URLs, `url.query`, page `onLoad` query) and `httpBodies` (body directions). `httpHeaders` / `cookies` have no effect — this SDK never captures headers or cookies |
| `enableNavigationBreadcrumbs` | `boolean` | `true` | Page lifecycle (navigation) breadcrumbs |
| `enableUserInteractionBreadcrumbs` | `boolean` | `true` | Tap / user-interaction breadcrumbs |
| `enableNetworkStatusMonitoring` | `boolean` | `true` | Real-time network monitoring; triggers offline flush on reconnect |
| `allowUrls` | `Array<string\|RegExp>` | — | Only send errors whose URL matches (others dropped) |
| `denyUrls` | `Array<string\|RegExp>` | — | Drop errors whose URL matches |
| `ignoreErrors` | `Array<string\|RegExp>` | — | Drop errors whose message/type matches |
| `transportOptions` | `object` | see below | Built-in transport safeguards and headers |
| `defaultIntegrations` | `false\|Integration[]` | all built-in default integrations | Set `false` to disable every default integration; a custom array replaces the default base |
| `integrations` | `Integration[]\|(defaults) => Integration[]` | — | An array appends to defaults (user instances win by name); a function receives defaults and returns the final list |
| `enableMinigameLifecycle` | `boolean` | minigame `true` / miniprogram `false` | SDK setup to first rAF + filtered launch context + show/hide breadcrumbs; not full cold start |
| `enableMinigameFrameRate` | `boolean` | `false` | Opt-in FPS/jank; missing rAF skips collection |
| `beforeSend` | `function` | — | Event processor for filtering/modifying events |
| `beforeSendSpan` | `function` | — | Hook to modify spans before sending. Receives `StreamedSpanJSON` (`name`, `is_segment`, `attributes` with RawAttributes (scalar or value/unit wrapper)); returning `null` is not allowed — drop spans with `ignoreSpans` |
| `ignoreSpans` | `Array<string\|RegExp>` | — | Drop spans by name; replaces core 10's `ignoreTransactions` |
| `traceLifecycle` | `'stream'` | `'stream'` | Only supported path in 2.0; explicit static throws before runtime replacement |
| `beforeSendLog` | `function` | — | Hook to filter/modify logs before sending |
| `beforeBreadcrumb` | `function` | — | Hook to filter/modify breadcrumbs before they are attached |

Core v11 requires a compatible span/v2 backend. Verify the target deployment; 2.0 does not support static or a legacy transaction downgrade path.

The built-in transport defaults to `requestTimeout: 3000` and `maxConcurrentRequests: 2` so Sentry cannot occupy all mini program network slots when the service is unavailable. Host concurrency waiting and core promise-buffer overflow are separate limits. A timed-out request is aborted when the host returns an abortable request task, then handed to offline caching. Keep these defaults unless real-device testing shows a need to adjust them; `transportOptions.headers` remains available for custom envelope headers.

### Privacy Consent Gate

For domestic mini program / mini game privacy flows, initialize with `requireConsent: true`. Before the user agrees, the SDK still collects errors, breadcrumbs, and performance data, but sends no Sentry network requests; events are buffered in miniapp storage and flushed after consent.

```javascript
Sentry.init({
  dsn: '...',
  requireConsent: true,
  consentCacheLimit: 100,
});

// After the user agrees to the privacy policy
Sentry.setConsent(true);

// If consent is revoked, block outbound sends again
Sentry.setConsent(false);
```

`requireConsent` implies local buffering even when `enableOfflineCache` is `false`; custom `transport` functions are wrapped by the consent gate too. The whole encoded container is capped at 900 KiB. There is one active persistent target; DSN/tunnel or incompatible policy changes drop old data with diagnostics. Retrying does not renew TTL. Capacity changes only trim compatible records. A replacement client does not inherit consent. Cache is best-effort, not a durable ACK or no-loss guarantee.

### Platform Compatibility

| Feature | WeChat | Alipay | ByteDance | Baidu | QQ | DingTalk | Kuaishou |
|---------|--------|--------|-----------|-------|----|----------|----------|
| Error Capture | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Offline Cache | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Distributed Tracing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Session Tracking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Source Map | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> ✅ = supported through the SDK's cross-platform abstraction, not a per-host on-device certification. Validate the target hosts and backend before production; capability fixtures are not device certification. Optional performance requires actual observer/timeOrigin/rAF capabilities.

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
     - Top-level `platform: javascript`
     - Mini program context (host platform and host SDK version)
     - App context (`app_version` from `miniProgram.version` when available)
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
| Node.js (`package.json` with server framework) | [Sentry Node SDK](https://docs.sentry.io/platforms/javascript/guides/node/) |
| Python (`requirements.txt`) | [Sentry Python SDK](https://docs.sentry.io/platforms/python/) |
| Go (`go.mod`) | [Sentry Go SDK](https://docs.sentry.io/platforms/go/) |
| Ruby (`Gemfile`) | [Sentry Ruby SDK](https://docs.sentry.io/platforms/ruby/) |
| Java (`pom.xml` / `build.gradle`) | [Sentry Java SDK](https://docs.sentry.io/platforms/java/) |

> **Tip:** Enable distributed tracing on both mini program and backend to get end-to-end request traces across services.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Events not appearing in Sentry | Check DSN is correct; verify Sentry domain is in mini program's trusted domain list |
| `sampleRate` filtering all events | Ensure `sampleRate` is not set to `0`; default is `1.0` |
| Tracing spans not appearing | Set `tracesSampleRate` > 0 (or use `tracesSampler`) — tracing is off until set; there is no default |
| Minified stack traces | Set up Source Map upload — see `references/sourcemap.md` |
| Duplicate error reports | Do NOT manually call `Sentry.captureException` in `onError` — SDK captures automatically |
| Events lost on weak networks | Enable offline cache: `enableOfflineCache: true` (default) |
| WeChat DevTools not triggering `onError` | Test on a real device; DevTools may not trigger all error handlers |
| Stack trace paths don't match source maps | Ensure `--url-prefix "app:///"` when uploading; SDK normalizes paths to `app:///` automatically |

## 2.0 ownership and data boundaries

- Named factories only; Integrations reexports the same functions. Do not use public legacy classes, shared defaultIntegrations, showReportDialog or static callbacks. Keep SpanStreaming when replacing defaults.
- One init-managed active tracing runtime; no arbitrary concurrent clients or cross-await scope isolation. SDK owner scopes are synchronous. init retires the old runtime without cancelling business HTTP.
- Manual spans supply route/network attributes at creation if needed for sampling. Stable device/app defaults fill missing keys only; do not copy all tags/context into spans.
- logger and metrics calls collect through core buffers. enableLogs is removed; beforeSendLog returning null suppresses logs. sendClientReports defaults true; failed reports do not enter offline disk.
- Dataset and arbitrary User Timing detail are not automatically copied. Business breadcrumbs use explicit allowed fields. Unknown plaintext/multipart/binary bodies are omitted, not declared sanitized.
- Explicit setUser can still enrich spans/logs/metrics when userInfo=false. Avoid setting fields or filter the corresponding telemetry callback if they must not be sent.
- Session uses foreground episodes and unhandled for JS unhandled errors; do not claim crash detection. Rebuild Release Health status filters, denominators and alert baselines.
- close(positive timeout) is one total budget; 0/undefined waits for drain. Sync hide flush can start request/storage only with idle slots and synchronous hooks. It is not proof of delivery after host freeze.
- Validate final envelopes, then real host behavior and target backend ingestion separately. Error, span/v2, logs, metrics, session, client_report and symbolication require corresponding evidence; never equate HTTP initiation with backend receipt.
