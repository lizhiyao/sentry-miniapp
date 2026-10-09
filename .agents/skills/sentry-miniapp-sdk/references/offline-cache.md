# Offline and consent in the 2.0 miniapp SDK

Use one core makeOfflineTransport layer, one active persistent target and one runtime owner token. Do not add a second retry engine, multi-target archive, durable ACK or exactly-once promise.

```js
Sentry.init({
  dsn: 'YOUR_DSN',
  enableOfflineCache: true,
  offlineCacheLimit: 30,
  offlineCacheMaxAge: 24 * 60 * 60 * 1000,
});
```

The whole encoded container, including metadata, uses an SDK budget of 180 KiB on Alipay/DingTalk and 900 KiB on other supported runtimes; a lower configured byte limit still applies. These are SDK policy budgets, not guarantees of available host storage. Typed records preserve binary payloads and subviews; retry retains original capture time/TTL. Default eviction prioritizes errors and then older records; consent preserve-oldest may reject new data when full. Storage faults are observable, never described as durable success.

DSN/tunnel target, old schema or incompatible privacy/storage policy changes drop incompatible data with diagnostics; count/bytes/TTL/eviction adjustments only trim compatible data. A replacement runtime may consume compatible stored records but does not inherit grant. Retired owners cannot write back an in-flight failure over the new owner's store.

shift commits removal to storage before handing a record to transport. Failed commit returns no record and pauses replay; it must not repeatedly deliver the same item or leak retry timers. Successful removal before network handoff is best-effort and can lose data if interrupted; it is not an atomic delivery transaction.

## Consent

```js
Sentry.init({ dsn: 'YOUR_DSN', requireConsent: true });
Sentry.setConsent(true); // After explicit user consent.
Sentry.setConsent(false); // Revoke the current client's permission.
```

required=true implies a consent/offline layer even with enableOfflineCache=false. Count/bytes=0 disables SDK caching; missing Storage can fall back to bounded memory with diagnostics. Before grant, SDK collection may still occur but no SDK Sentry request starts. Revocation also checks queued work at actual host dequeue; in-flight abort depends on host capability.

Custom transport with required=false remains user-managed with no automatic SDK offline layer. With required=true it is wrapped for consent; it should not itself stack a second offline layer. Its private queue needs its own actual-send gate for strict revocation. Low-level directly constructed MiniappClient does not acquire persistent store or runtime replay ownership.

## Verification

Capture before grant: observe no request and an allowed storage/memory record. Grant: observe replay without TTL renewal. Revoke while one request occupies a host slot: queued requests must not start. Force storage write/delete failures and runtime replacement: no false success, cross-target delivery or retired-owner overwrite. Check diagnostics and final payload bytes.

Then verify on the real target host and Sentry deployment. Mock storage/request and successful flush do not prove survival of process termination, timer freeze or backend receipt. client_report is not stored on disk.
