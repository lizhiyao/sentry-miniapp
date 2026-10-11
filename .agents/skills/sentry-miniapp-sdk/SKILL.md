---
name: sentry-miniapp-sdk
description: Set up or troubleshoot Sentry error monitoring, tracing, offline cache and source maps in native mini programs, Taro or uni-app. Supports WeChat, Alipay, ByteDance, Baidu, QQ, DingTalk, Kuaishou and WeChat/ByteDance minigames.
license: MIT
metadata:
  category: sdk-setup
---

# Sentry Mini Program SDK Setup

Use this skill when a user wants to integrate or troubleshoot `sentry-miniapp` in a consumer application. Discover the application's runtime, installed SDK and entry point before choosing code. This guide covers the 2.0 beta contract.

## 1. Inspect the consumer

Read project instructions and inspect the relevant application directory. Prefer `rg`; exclude generated bundles and dependencies when searching source.

```bash
rg --files -g 'package.json' -g '*lock*' -g '*project*.json' -g 'app.json' \
  -g '*app.{js,ts,tsx,vue}' -g '*main.{js,ts}' \
  -g '*config.{js,ts,mjs}' -g '!node_modules' -g '!dist'
rg -n 'sentry-miniapp|@tarojs/|@dcloudio/uni-' package.json
rg -n 'Sentry\.init|sentry-miniapp|errorHandler|componentDidCatch' \
  src app.js app.ts -g '!node_modules' -g '!dist'
```

Adjust search roots to files that exist; these commands illustrate discovery, not a required directory layout.

Determine:

- **Installed version and package manager.** Read the lockfile and installed package metadata; a manifest range alone may not identify the resolved version.
- **Release targets.** Read framework configuration and platform globals. WeChat's `project.config.json`, Alipay's `mini.project.json`, ByteDance's `project.tt.json` and Baidu's `project.swan.json` are useful clues. Confirm QQ, DingTalk and Kuaishou from actual target configuration.
- **Framework and entry.** Native apps commonly use `app.js`/`app.ts`; Taro uses `src/app.tsx` or its configured entry; Vue 3 uni-app usually initializes from `src/main.js`/`main.ts`.
- **Existing monitoring and privacy policy.** Preserve working error handlers, integrations, sampling and consent requirements.
- **Sentry deployment and build pipeline.** Version support and final JS/map matching affect which features can be verified.

## 2. Choose the SDK version and features

An unqualified install selects stable 1.x; `@next` selects 2.0 beta. Do not silently migrate an existing 1.x application. Use the [version and migration guide](https://sentry-miniapp.pages.dev/guide/migration-2.0#version-choice), including its fixed 1.x documentation archive.

2.0 uses Core v11 and stream spans. Check the target Sentry deployment against the guide's support baseline; successful error ingestion alone does not prove support for spans, Logs, Metrics or Sessions.

Implement the requested coverage. Resolve routine setup choices from the project and user intent; ask only for missing information that affects the result.

| Coverage | When to add it | Reference |
| --- | --- | --- |
| Error monitoring and framework handlers | Basic integration or missing errors | [error-monitoring.md](references/error-monitoring.md) |
| HTTP and business tracing | Latency measurement or backend trace correlation | [tracing.md](references/tracing.md) |
| Offline cache and consent | Weak networks or a stated privacy requirement | [offline-cache.md](references/offline-cache.md) |
| Source Map upload | Readable stacks from deployed builds | [sourcemap.md](references/sourcemap.md) |

Load only the references needed for the work. Automatic capture depends on available host APIs; optional Performance observers and FPS are not universal platform capabilities.

## 3. Install and initialize

Use the consumer's existing package manager. For a chosen 2.0 beta, pin the resolved version and retain the lockfile:

```bash
npm install --save-exact sentry-miniapp@next
# Or, in a Yarn project:
yarn add --exact sentry-miniapp@next
```

Copy the complete DSN from the target Sentry project; do not construct its hostname. Configure the exact envelope request host as a legal request domain, or configure the chosen tunnel's host. Verify with device debugging and domain-check bypass disabled.

Initialize once, as early as practical, before native `App()` registration and business requests. In framework projects, put initialization in a dedicated module imported before the application module. Do not put `init()` inside a temporary scope or an unfinished async span.

```js
// Native app.js
const Sentry = require('sentry-miniapp');

Sentry.init({
  dsn: 'YOUR_DSN', // Copy the complete project DSN.
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});

App({
  // Existing application configuration.
});
```

For Taro and uni-app, follow their actual entry and preserve existing framework error handling:

- [Taro initialization and React Error Boundary](https://sentry-miniapp.pages.dev/guide/taro)
- [uni-app initialization and Vue errorHandler](https://sentry-miniapp.pages.dev/guide/uniapp)

H5 needs the official browser/framework SDK through target-specific imports. `sentry-miniapp` does not provide browser DOM or fetch/XHR instrumentation.

### Platform labels and minigames

Runtime APIs come from the detected host. Set `miniappPlatform` only to correct an ambiguous event label; it does not switch the host API. Values are `wechat`, `alipay`, `bytedance`, `qq`, `swan`, `dingtalk` and `kuaishou`. The event's top-level `platform` stays `javascript`.

WeChat/ByteDance minigames have no App/Page model. Automatic Session tracking requires both native show/hide listeners to register successfully; missing capabilities produce diagnostics. First frame measures SDK installation to the first rAF, not full cold start. FPS/jank defaults off; opt in with `enableMinigameFrameRate: true` only when needed. See the [minigame guide](https://sentry-miniapp.pages.dev/guide/minigame).

### Configuration decisions

Use the [configuration reference](https://sentry-miniapp.pages.dev/guide/configuration) for the complete option list. Apply these boundaries when choosing settings:

- Errors use `sampleRate`; traces use `tracesSampleRate` or `tracesSampler` and are off until configured.
- Network body collection and console breadcrumbs default off. Do not copy demo full sampling, body capture or per-click fingerprints into production.
- `tracePropagationTargets` defaults to an empty list. Add anchored URL allowlists only for backends the application controls.
- `dataCollection` governs automatic fields. `userInfo: false` stops automatic error IP inference, but does not erase explicit `setUser` fields or arbitrary business logs.
- Use `beforeSend`, `beforeSendLog` and `beforeSendMetric` for their respective data. `beforeSendSpan` edits streamed spans; `ignoreSpans` filters them.
- `requireConsent` gates sending, not collection. See the offline/consent reference before changing that policy.
- Integration factories create per-client instances. Keep default `SpanStreaming` when enabling tracing; replacing the full default set requires installing it explicitly.

## 4. Verify the result

Run the consumer's relevant checks and build the actual target. Verify progressively:

1. Capture a new known error and record its event ID, release and runtime diagnostics.
2. Check request errors and HTTP responses, then find the same event in the intended Sentry project/environment.
3. For framework errors, test the framework handler as well as direct capture.
4. For Source Maps, check the final runtime filename and event coordinates against the same build's JS/map.
5. For enabled tracing, Logs, Metrics, Sessions or consent, check each feature's own payload and backend result.
6. When device behavior is in scope, verify foreground/background, network restoration and domain checks on the actual target.

An event ID means capture was attempted. `flush()` returning true is not a backend receipt or proof of symbolication. Local tests do not establish survival across host freezing or process termination.

Report which version, build, runtime and backend were actually verified. Keep untested capabilities explicit, and include concise remaining steps only when they require user access or a real-device action.
