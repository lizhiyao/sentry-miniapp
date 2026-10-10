# Tracing in the 2.0 miniapp SDK

Enable tracesSampleRate or tracesSampler for HTTP and business spans. Error sampleRate is separate. Core owns parent sampling, DSC, ignoreSpans and batching; never add a second Math.random or flush after every end.

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 0.2,
  integrations: [Sentry.performanceIntegration({ enableResource: true })],
  tracePropagationTargets: [/^https:\/\/api\.example\.com\//],
});
```

The Performance factory is opt-in. It only uses available observer capabilities and trustworthy timestamps; it does not simulate browser FCP/LCP, create a parent for a delivery batch or infer route from the current page at delivery. No observer or reliable timeOrigin means skip and diagnostics. Performance sampleRate/bufferSize/reportInterval/thresholds/enableMemory options are removed. FPS is separately opt-in with enableMinigameFrameRate: true.

## Business spans and ownership

```js
const span = Sentry.startInactiveSpan({
  name: 'checkout.submit',
  op: 'ui.action',
  attributes: { route: 'pages/checkout/index' },
});
// End when the measured operation finishes.
span.end();
```

startSpan manages the callback lifetime; startSpanManual supplies span/end to the callback. withActiveSpan and owner scopes bind synchronous work. A callback returning a Promise does not create arbitrary cross-await context isolation on miniapp stack strategy. Only one init-managed active tracing client is supported. Manual spans must be created/ended while that client remains active; supply route/network at creation when required for sampling. The SDK does not retain a snapshot Map for all manual spans.

Automatic SDK operations supply dynamic dimensions before creation. Stable device/app attributes fill missing keys at preprocessing; explicit scope/span values and units win. Tags/extra remain error fields. beforeSendSpan receives RawAttributes (scalar or value/unit wrappers), modifies name/attributes and cannot return null; ignoreSpans drops spans. Stream-only removes static, transaction callbacks and measurements.

## HTTP propagation

Default host request instrumentation creates child spans under an active parent, otherwise native root/segment spans. enableStandaloneHttpSpans: false keeps child-only tracing without removing breadcrumbs. Do not add a duplicate manual http.client span around an automatically instrumented request.

Headers are injected only for explicitly matching tracePropagationTargets; an empty list injects none. String targets match substrings of the entire URL, including its query, so use anchored origin regexes to limit propagation to backends you control. Case-insensitive matching and g/y regex handling follow core. enableTracePropagation: false only stops propagation. propagateTraceparent: true is for a backend explicitly needing W3C/OTel headers; keep native sentry-trace/baggage otherwise. Unsampled decisions are still propagated.

Core SpanStreaming sends finite batches on its own timer/capacity thresholds; unfinished roots do not prevent children from being sent. Keep spanStreamingIntegration when replacing defaults. Hide/close/runtime replacement are explicit drain boundaries, not proof of server receipt.

## Session and performance interpretation

Session tracks foreground episodes and reports JS unhandled errors as unhandled, not crashed. Do not claim host process crash detection or compare 1.x crash-free baselines without migrating status filters and denominators.

minigame.init_to_first_frame measures SDK installation to first rAF callback, not full cold start. Its duration attribute is minigame.init_to_first_frame_ms and context is initToFirstFrameMs. FPS/jank are opt-in and retain bounded numeric samples; custom thresholds are not Sentry standard slow/frozen frames.

Verify actual envelopes, target backend span/v2 support and on-device freeze/restore separately. An HTTP call or successful flush is not an ingestion ACK.
