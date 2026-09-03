import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { configureConsent, isConsentGranted, resetConsentState, setConsentGranted } from '../src/consent';
import { resetPlatformCache } from '../src/crossPlatform';
import { createConsentAwareOfflineTransport } from '../src/transports/consent';
import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { createEventEnvelope } from './support/envelopes';

const OFFLINE_KEY = 'sentry_offline_store';

describe('Consent gate with real makeOfflineTransport', () => {
  const g = global as any;
  let mem: Record<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    mem = {};
    g.wx = {
      setStorageSync: vi.fn((key: string, value: string) => {
        mem[key] = value;
      }),
      getStorageSync: vi.fn((key: string) => mem[key]),
      removeStorageSync: vi.fn((key: string) => {
        delete mem[key];
      }),
      request: vi.fn(),
    };
    resetPlatformCache();
    configureConsent({ required: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    resetConsentState();
    delete g.wx;
    resetPlatformCache();
  });

  it('queues before consent, flushes after consent, and blocks again when consent is revoked', async () => {
    const baseSend = vi.fn((_: any) => Promise.resolve({ statusCode: 200 }));
    const baseTransport = { send: baseSend, flush: () => Promise.resolve(true) };
    const options = {
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
    };
    const store = createMiniappOfflineStore({
      ...options,
      offlineCacheLimit: 100,
      evictionMode: 'preserve-oldest',
    });
    const transport = createConsentAwareOfflineTransport(
      baseTransport,
      options,
      store,
      isConsentGranted,
    );

    const blockedSend = transport.send(createEventEnvelope('before-consent'));

    expect(baseSend).not.toHaveBeenCalled();
    expect(mem[OFFLINE_KEY]).toContain('before-consent');
    await blockedSend;

    setConsentGranted(true);
    void transport.flush();
    await vi.runOnlyPendingTimersAsync();

    expect(baseSend).toHaveBeenCalledTimes(1);
    const resentEnvelope = baseSend.mock.calls[0]?.[0];
    expect(resentEnvelope?.[0]?.event_id).toBe('before-consent');
    expect(JSON.parse(mem[OFFLINE_KEY] || '[]')).toHaveLength(0);

    baseSend.mockClear();
    setConsentGranted(false);

    const blockedAgain = transport.send(createEventEnvelope('blocked-again'));

    expect(baseSend).not.toHaveBeenCalled();
    expect(mem[OFFLINE_KEY]).toContain('blocked-again');
    await blockedAgain;
  });
});
