# Tracing

Configure `tracesSampleRate` or `tracesSampler` for HTTP and business spans. Error `sampleRate` is separate. Core owns sampling, trace context and batching; do not add independent random sampling or flush after every span.

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  tracePropagationTargets: [/^https:\/\/api\.example\.com\//],
});

await Sentry.startSpan(
  { name: 'checkout.submit', op: 'ui.action' },
  async () => submitOrder(),
);
```

`startSpan` ends with the callback; `startInactiveSpan` requires an explicit `end()`. Miniapp's default context strategy does not isolate arbitrary concurrent operations across `await`. Initialize one active client; use `withActiveSpan` to bind a span around synchronous work that schedules or performs an operation. Details and examples: [performance and tracing](https://sentry-miniapp.pages.dev/guide/performance-and-tracing).

## HTTP and propagation

Host request instrumentation creates a child span under an active parent, or a standalone segment otherwise. `enableStandaloneHttpSpans: false` keeps child-only tracing without removing breadcrumbs. Do not wrap an automatically instrumented request in a duplicate manual `http.client` span.

Headers are injected only for matching `tracePropagationTargets`; an empty list injects none. String targets match substrings of the full URL, including query, so prefer anchored origin regexes. Add `propagateTraceparent: true` only for a backend requiring W3C/OTel propagation. `enableTracePropagation: false` stops header injection without disabling local spans.

If the caller already supplies `sentry-trace` or `traceparent`, the SDK leaves that header group under the caller's control. An unsampled trace decision may still be propagated.

## Optional performance and attributes

Install `performanceIntegration()` only for the required observer categories. Missing observers or trustworthy timestamps skip the measurement with diagnostics. FPS/jank is a separate opt-in for minigames. Do not describe SDK-install-to-first-rAF as full cold start or infer browser FCP/LCP.

Use span `attributes` for performance dimensions. `beforeSendSpan` receives streamed `name` and `attributes`, which may include value/unit wrappers; it cannot return null. Use `ignoreSpans` to drop spans. Removed transaction fields and API changes belong in the [migration guide](https://sentry-miniapp.pages.dev/guide/migration-2.0#before-send-span).

Keep `spanStreamingIntegration()` if replacing default integrations. Completed spans are sent in bounded batches, including children whose parent is unfinished. Hide/close drains are best effort; verify target backend support and actual displayed spans separately from successful HTTP responses.
