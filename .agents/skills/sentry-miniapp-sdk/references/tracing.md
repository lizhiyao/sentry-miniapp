# Performance Tracing — Mini Program SDK

Performance monitoring and distributed tracing for mini programs.

## Automatic Performance Monitoring

The SDK includes a `PerformanceIntegration` that automatically collects:

- **Navigation performance** — page load timing (FCP, LCP equivalents)
- **Render performance** — page show/hide timing
- **Resource loading** — asset loading times
- **User timing** — custom performance marks

Enable with `tracesSampleRate`:

```javascript
Sentry.init({
  dsn: '...',
  tracesSampleRate: 1.0, // 100% of transactions
});
```

### Custom Performance Integration Options

```javascript
Sentry.init({
  dsn: '...',
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.performanceIntegration({
      enableNavigation: true,
      enableRender: true,
      enableResource: true,
      enableUserTiming: true,
      sampleRate: 1.0,
      reportInterval: 30000, // Report every 30 seconds
    }),
  ],
});
```

## Custom Spans

Track specific operations with manual spans:

```javascript
// Track an API request
const span = Sentry.startInactiveSpan({
  name: 'fetchUserProfile',
  op: 'http.client',
});

wx.request({
  url: 'https://api.example.com/user/profile',
  success: (res) => {
    span.setStatus('ok');
  },
  fail: (err) => {
    span.setStatus('internal_error');
  },
  complete: () => {
    span.end();
  },
});
```

### Custom Performance Marks

```javascript
// Mark start of an operation
Sentry.addPerformanceMark('checkout-start');

// ... perform operation ...

// Mark end
Sentry.addPerformanceMark('checkout-end');

// Measure the interval
Sentry.measurePerformance('checkout-flow', 'checkout-start', 'checkout-end');
```

## Distributed Tracing

Inject `sentry-trace` and `baggage` headers only into explicitly allowlisted outgoing requests to link frontend and backend spans:

```javascript
Sentry.init({
  dsn: '...',
  enableTracePropagation: true, // default: true
  tracePropagationTargets: ['api.example.com', /^https:\/\/api\./],
});
```

- When `tracePropagationTargets` is empty (default), no business request receives trace headers
- Only matching URLs receive trace headers; allowlist only API origins controlled by the application owner
- Backend must have Sentry SDK with tracing enabled to complete the trace
- An outgoing request becomes an `http.client` child span only when an active transaction exists; the SDK does not create one root transaction per parentless request

## Dynamic Sampling

Use `tracesSampler` for per-page or per-operation sampling:

```javascript
Sentry.init({
  dsn: '...',
  tracesSampler: ({ name, inheritOrSampleWith }) => {
    if (name.includes('pages/pay')) return 1;      // Payment: 100%
    if (name.includes('pages/index')) return 0.5;   // Home: 50%
    return inheritOrSampleWith(0.1);                 // Others: 10%
  },
});
```

> **Note:** `tracesSampler` takes priority over `tracesSampleRate`. When set, `tracesSampleRate` is ignored.

## Session Tracking

Automatic session lifecycle management for Sentry Release Health:

```javascript
Sentry.init({
  dsn: '...',
  enableAutoSessionTracking: true, // default: true
});
```

This tracks:
- Session start (app launch / `onShow`)
- Session end (app hide / `onHide`)
- Crash detection (error during session)
- Data appears in Sentry → Releases → Health dashboard
