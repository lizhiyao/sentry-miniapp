# Error Monitoring — Mini Program SDK

Automatic and manual error capture for mini programs across all supported platforms.

## What's Captured Automatically

After early `Sentry.init()`, the SDK registers available host APIs for:

- **`onError`** — unhandled JavaScript exceptions
- **`onUnhandledRejection`** — unhandled Promise rejections
- **`onPageNotFound`** — navigation to non-existent pages
- **`onMemoryWarning`** — system memory pressure warnings

Missing APIs are skipped. Early initialization cannot recover events that already occurred. Framework-handled errors also need the framework's own entry point: use [Vue errorHandler](https://sentry-miniapp.pages.dev/guide/uniapp) or a [React Error Boundary](https://sentry-miniapp.pages.dev/guide/taro), preserving existing handlers.

Avoid manually reporting the same exception from `App.onError` when the global handler already captures it. If the host lacks automatic capture, verify and use a manual fallback.

## Manual Error Capture

For errors caught in `try-catch` blocks or business logic errors:

```javascript
// Capture a caught exception
try {
  riskyOperation();
} catch (error) {
  Sentry.captureException(error);
}

// Capture a message (informational)
Sentry.captureMessage('User completed payment', 'info');

// Capture with extra context
Sentry.captureException(error, {
  tags: { action: 'payment' },
  extra: { orderId: '2024001' },
});
```

## Enriching Error Context

### User Identity

```javascript
Sentry.setUser({
  id: 'user-123',
});

// Clear user on logout
Sentry.setUser(null);
```

Set only approved user fields. `dataCollection.userInfo: false` disables automatic error IP inference, but does not remove explicitly supplied user data.

### Tags and Context

```javascript
// Tags (indexed, searchable in Sentry)
Sentry.setTag('page', 'payment');
Sentry.setTag('feature', 'coupon');

// Context (structured data, not indexed)
Sentry.setContext('order', {
  orderId: '2024001',
  amount: 99.9,
  items: 3,
});
```

### Breadcrumbs

When supported and enabled, the SDK records breadcrumbs for:
- Page navigation (route changes)
- Network requests (wx.request, etc.)
- User interactions (tap, longpress)
- Console output (when `enableConsoleBreadcrumbs: true`)

Add custom breadcrumbs for business events:

```javascript
Sentry.addBreadcrumb({
  category: 'payment',
  message: 'User initiated payment',
  level: 'info',
  data: { amount: 99.9, method: 'wechat_pay' },
});
```

## Event Filtering

Use `beforeSend` to filter or modify events before they're sent:

```javascript
Sentry.init({
  dsn: 'YOUR_DSN',
  beforeSend(event) {
    // Example business filter; this is not comprehensive redaction.
    if (event.message && event.message.includes('password')) {
      return null;
    }

    // Limit breadcrumbs to prevent oversized events
    if (event.breadcrumbs && event.breadcrumbs.length > 20) {
      event.breadcrumbs = event.breadcrumbs.slice(-20);
    }

    return event;
  },
});
```

## User Feedback

Collect user-reported feedback using `captureFeedback`:

```javascript
Sentry.captureFeedback({
  message: 'The payment button is not responding',
  name: 'Zhang San',
  email: 'zhangsan@example.com',
  associatedEventId: lastEventId, // optional: link to a captured error
});
```
