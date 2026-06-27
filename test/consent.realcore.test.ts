import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { makeOfflineTransport } from '@sentry/core';
import { configureConsent, isConsentGranted, resetConsentState, setConsentGranted } from '../src/consent';
import { resetPlatformCache } from '../src/crossPlatform';
import { createMiniappOfflineStore } from '../src/transports/offlineStore';

const OFFLINE_KEY = 'sentry_offline_store';

function makeEnvelope(id: string): any {
  return [
    { event_id: id, sent_at: '2022-01-01T00:00:00.000Z' },
    [[{ type: 'event' }, { event_id: id }]],
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Consent gate with real makeOfflineTransport', () => {
  const g = global as any;
  let mem: Record<string, string>;

  beforeEach(() => {
    mem = {};
    g.wx = {
      setStorageSync: jest.fn((key: string, value: string) => {
        mem[key] = value;
      }),
      getStorageSync: jest.fn((key: string) => mem[key]),
      removeStorageSync: jest.fn((key: string) => {
        delete mem[key];
      }),
      request: jest.fn(),
    };
    resetPlatformCache();
    configureConsent({ required: true });
  });

  afterEach(() => {
    resetConsentState();
    delete g.wx;
    resetPlatformCache();
  });

  it('queues before consent, flushes after consent, and blocks again when consent is revoked', async () => {
    const baseSend = jest.fn((_: any) => Promise.resolve({ statusCode: 200 }));
    const makeBase = () => ({ send: baseSend, flush: () => Promise.resolve(true) });

    const transport = makeOfflineTransport(makeBase as any)({
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
      createStore: (options: any) =>
        createMiniappOfflineStore({
          ...options,
          offlineCacheLimit: 100,
          evictionMode: 'preserve-oldest',
        }),
      shouldSend: () => isConsentGranted(),
      flushAtStartup: false,
    } as any);

    await transport.send(makeEnvelope('before-consent') as any);
    await sleep(20);

    expect(baseSend).not.toHaveBeenCalled();
    expect(mem[OFFLINE_KEY]).toContain('before-consent');

    setConsentGranted(true);
    void transport.flush();
    await sleep(300);

    expect(baseSend).toHaveBeenCalledTimes(1);
    const resentEnvelope = baseSend.mock.calls[0]?.[0];
    expect(resentEnvelope?.[0]?.event_id).toBe('before-consent');
    expect(JSON.parse(mem[OFFLINE_KEY] || '[]')).toHaveLength(0);

    baseSend.mockClear();
    setConsentGranted(false);

    await transport.send(makeEnvelope('blocked-again') as any);
    await sleep(20);

    expect(baseSend).not.toHaveBeenCalled();
    expect(mem[OFFLINE_KEY]).toContain('blocked-again');
  });
});
