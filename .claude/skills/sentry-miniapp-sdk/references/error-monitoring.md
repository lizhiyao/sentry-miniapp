# Error Monitoring — Mini Program SDK

Automatic and manual error capture for mini programs across all supported platforms.

## What's Captured Automatically

Once `Sentry.init()` is called, the SDK automatically captures:

- **`onError`** — unhandled JavaScript exceptions
- **`onUnhandledRejection`** — unhandled Promise rejections
- **`onPageNotFound`** — navigation to non-existent pages
- **`onMemoryWarning`** — system memory pressure warnings

No manual code is needed for these. The SDK hooks into the platform's global error handlers.

> **Important:** Do NOT manually call `Sentry.captureException()` inside `App.onError()`. The SDK already captures these errors automatically. Doing so causes duplicate reports.

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
  username: 'zhang_san',
  ip_address: '{{auto}}',
});

// Clear user on logout
Sentry.setUser(null);
```

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

The SDK automatically records breadcrumbs for:
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
  dsn: '...',
  beforeSend(event) {
    // Drop events containing sensitive data
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

## Dynamic Sampling

Control which errors get reported based on context:

```javascript
Sentry.init({
  dsn: '...',
  tracesSampler: ({ name, inheritOrSampleWith }) => {
    // 100% sampling for critical pages
    if (name.includes('pages/pay')) return 1;
    // Lower sampling for less critical pages
    if (name.includes('pages/about')) return 0.1;
    // Default
    return inheritOrSampleWith(0.5);
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
