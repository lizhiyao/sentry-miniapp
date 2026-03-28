# Offline Cache — Mini Program SDK

Reliable event delivery for mini programs in weak network environments.

## Overview

Mini programs often run on mobile networks where connectivity is unreliable. The offline cache feature ensures error events are not lost when the network is unavailable:

1. When a request to Sentry fails (network error, timeout), the event is saved to local storage
2. When the app is next launched or network connectivity returns, cached events are automatically retried
3. Events expire after a configurable time period to prevent stale data

## Configuration

```javascript
Sentry.init({
  dsn: '...',
  enableOfflineCache: true,       // default: true
  offlineCacheLimit: 30,          // max events to store (default: 30)
  offlineCacheMaxAge: 86400000,   // expiry in ms (default: 24 hours)
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableOfflineCache` | `boolean` | `true` | Enable/disable offline caching |
| `offlineCacheLimit` | `number` | `30` | Maximum events stored locally |
| `offlineCacheMaxAge` | `number` | `86400000` | Cache expiry time in milliseconds (default 24h) |

## How It Works

```
Event captured
    ↓
Attempt to send to Sentry
    ↓
┌─ Success → Event delivered ✓
└─ Failure (network error) → Save to local storage
                                    ↓
                              Next app launch / network restored
                                    ↓
                              Retry sending cached events
                                    ↓
                              ┌─ Success → Remove from cache ✓
                              └─ Still failing → Keep in cache (retry later)
```

### Smart Eviction

When the cache reaches `offlineCacheLimit`:
1. Non-error events (messages, info) are evicted first
2. Then oldest error events are evicted
3. New events always get stored (oldest are dropped)

## Best Practices

- **Don't set `offlineCacheLimit` too high** — each event consumes local storage, which is limited on mini programs (typically 10MB)
- **Keep `offlineCacheMaxAge` reasonable** — 24 hours is usually sufficient; very old events lose diagnostic value
- **Monitor storage usage** — if your events are large (lots of breadcrumbs/context), consider lowering the limit
- **The feature is enabled by default** — you only need to configure it if you want to change limits or disable it

## Disabling

```javascript
Sentry.init({
  dsn: '...',
  enableOfflineCache: false,
});
```
