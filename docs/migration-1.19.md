# Upgrading from 1.18 to 1.19

Version 1.19 keeps the public 1.x initialization APIs, while aligning default integrations, event
fields, and tracing behavior with the Sentry JavaScript SDK. Projects that only call
`Sentry.init({ dsn, release })` usually need no application-code changes. Review the items below if
you depend on the previous integration assembly, trace-header defaults, or event-field queries.

## Required checks before upgrading

### Configure trace propagation targets explicitly

An empty `tracePropagationTargets` list no longer injects `sentry-trace`, `baggage`, or
`traceparent` into arbitrary business requests. Allowlist only API origins you control:

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  tracePropagationTargets: [
    'https://api.example.com',
    /^https:\/\/gateway\.example\.com\//,
  ],
});
```

Without this configuration, distributed traces stop linking across the backend. Business requests,
error reporting, and network breadcrumbs continue to work.

### Update integration configuration

An `integrations` array now appends to the defaults, with a user integration winning by name. A
function receives the defaults and returns the final list. If an older configuration relied on an
array to disable every default integration, make that intent explicit:

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  defaultIntegrations: false,
  integrations: [Sentry.Integrations.globalHandlersIntegration()],
});
```

Create fresh stateful integration instances for every `init()` call. Do not reuse
`Sentry.defaultIntegrations` or a cached `Sentry.getDefaultIntegrations()` result across
initializations. The static `Sentry.defaultIntegrations` export remains only for 1.x source
compatibility and is deprecated.

The legacy `new Sentry.Integrations.Dedupe({ fuzzyMatch: true })` form remains available. New code
should use `Sentry.Integrations.dedupeIntegration()`.

### Update Sentry queries and alerts

- Top-level `event.platform` is now `javascript`; the actual WeChat, Alipay, ByteDance, Baidu, QQ,
  DingTalk, or Kuaishou host is stored in `contexts.miniapp.platform`.
- `contexts.app.app_version` is the mini program version and `app_identifier` is its App ID.
- Host-client and base-library versions are stored in `contexts.miniapp.host_version` and
  `contexts.miniapp.host_sdk_version`.
- `event.sdk.packages` uses the canonical package name `npm:sentry-miniapp`.

Migrate dashboards, Discover queries, and alert rules that still depend on the previous meanings.

## Performance and error-data changes

- API requests create `http.client` child spans only when a transaction is already active. The SDK
  no longer creates a root transaction for every isolated request. Wrap a business flow in
  `Sentry.startSpan()` when it needs tracing.
- Performance API entries are converted to Unix epoch time. Clearly stale, future, or invalid host
  timestamps are discarded.
- Timer and `requestAnimationFrame` callback errors are rethrown after capture and therefore use
  `handled: false`. Crash-free metrics or alerts may show a one-time shift to the corrected value.
- Exception construction, LinkedErrors, Dedupe, RewriteFrames, and feedback events now use official
  `@sentry/core` behavior. A small number of Issues may regroup because stacks and exception chains
  are more accurately represented.

## Recommended validation

Test 1.19 in a staging or prerelease build before broad rollout:

1. Send a test exception and verify `platform`, the miniapp/app contexts, and Source Maps.
2. Trigger a platform global error and an unhandled rejection; verify there are no duplicates.
3. Send successful and failed API requests; verify request options are unchanged, breadcrumbs exist,
   and trace headers are sent only to allowlisted origins.
4. Send a request inside `Sentry.startSpan()` and verify the backend trace is linked.
5. Call `close()`, initialize again, and verify error, page, and network listeners still work.
6. For mini games, also verify cold start, foreground/background events, FPS, and jank. Confirm those
   integrations remain no-ops in regular mini programs.

At minimum, run one real-device check on WeChat, Alipay, and ByteDance. Baidu, QQ, DingTalk, and
Kuaishou share the same cross-platform abstraction and fallback paths, but should still receive a
smoke test when they are production targets.
