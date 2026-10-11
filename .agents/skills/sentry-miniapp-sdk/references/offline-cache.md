# Offline Cache and Consent

The default transport enables a bounded weak-network cache. Change it to meet the consumer's needs, without adding a second retry engine.

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  enableOfflineCache: true,
  offlineCacheLimit: 30,
  offlineCacheMaxAge: 24 * 60 * 60 * 1000,
});
```

Cache budgets cover encoded envelopes and metadata: at most 180 KiB on Alipay/DingTalk and 900 KiB on other supported runtimes, with lower configured limits respected. These are SDK budgets, not guaranteed available host storage.

Retries preserve the original expiry. Incompatible Sentry targets or privacy/storage policies discard old records with diagnostics; changes to capacity or TTL trim compatible data. Storage failure may fall back to bounded memory. Removal from storage precedes network delivery, so interruption can lose data; retries can duplicate it. Do not promise durable receipt or exactly-once delivery.

## Consent

```js
Sentry.init({ dsn: 'YOUR_DSN', requireConsent: true });
Sentry.setConsent(true);  // After explicit user consent.
Sentry.setConsent(false); // Revoke this client's sending permission.
```

`requireConsent: true` gates Sentry sending while collection may continue. It uses `consentCache*` both before and after permission, even with `enableOfflineCache: false`; weak-network failures use the same cache. Count/byte limits of zero disable caching. Drop callbacks count envelope records, which may contain multiple telemetry items.

Reinitialization does not inherit permission. Revocation prevents queued SDK requests from starting and attempts in-flight cancellation when the host supports it; it does not erase saved records. A custom transport must control its own private queue at actual send time. Without required consent, custom transports receive no implicit SDK offline layer.

## Verification

Check capture before permission, replay after grant, queued requests after revocation, and recovery after network loss. Use diagnostics to distinguish storage failure, capacity drops and blocked sending. Do not infer backend receipt from a cache becoming empty or `flush()` returning true.

Actual foreground/background freezing and process termination require target-runtime validation when that behavior is in scope. See [reliability and privacy](https://sentry-miniapp.pages.dev/guide/reliability-and-privacy) and [configuration](https://sentry-miniapp.pages.dev/guide/configuration) for limits and verification steps.
