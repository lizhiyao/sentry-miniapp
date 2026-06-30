import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  configureConsent,
  isConsentGranted,
  notifyConsentDrop,
  resetConsentState,
  setConsentGranted,
} from '../src/consent';
import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { sdk } from '../src/crossPlatform';

jest.mock('../src/crossPlatform', () => ({
  sdk: jest.fn(),
}));

const OFFLINE_KEY = 'sentry_offline_store';

function makeEnvelope(id: string, type = 'event', data: Record<string, unknown> = {}): any {
  return [
    { event_id: id },
    [[{ type }, { event_id: id, ...data }]],
  ];
}

describe('Consent gate state', () => {
  beforeEach(() => {
    resetConsentState();
  });

  afterEach(() => {
    resetConsentState();
  });

  it('defaults to granted when requireConsent is not enabled', () => {
    expect(isConsentGranted()).toBe(true);

    configureConsent({ required: false });
    expect(isConsentGranted()).toBe(true);

    setConsentGranted(false);
    expect(isConsentGranted()).toBe(true);
  });

  it('starts blocked when requireConsent is enabled and follows setConsentGranted', () => {
    configureConsent({ required: true });
    expect(isConsentGranted()).toBe(false);

    setConsentGranted(true);
    expect(isConsentGranted()).toBe(true);

    setConsentGranted(false);
    expect(isConsentGranted()).toBe(false);
  });

  it('notifies consent cache drops only when the consent gate is enabled', () => {
    const onDrop = jest.fn();

    configureConsent({ required: false, onDrop });
    notifyConsentDrop('count', 1);
    expect(onDrop).not.toHaveBeenCalled();

    configureConsent({ required: true, onDrop });
    notifyConsentDrop('count', 2);
    expect(onDrop).toHaveBeenCalledWith({ reason: 'count', dropped: 2 });

    setConsentGranted(true);
    notifyConsentDrop('age', 1);
    expect(onDrop).toHaveBeenLastCalledWith({ reason: 'age', dropped: 1 });
  });
});

describe('Consent cache store behavior', () => {
  let mockStorage: Record<string, string>;

  function cachedIds(): string[] {
    const raw = mockStorage[OFFLINE_KEY];
    if (!raw) return [];
    return JSON.parse(raw).map((item: any) => item.envelope[0].event_id);
  }

  beforeEach(() => {
    mockStorage = {};
    (sdk as jest.Mock).mockReturnValue({
      getStorageSync: jest.fn((key: string) => mockStorage[key]),
      setStorageSync: jest.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeStorageSync: jest.fn((key: string) => {
        delete mockStorage[key];
      }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('preserves the oldest envelopes and drops the newest when count is exceeded', async () => {
    const onDrop = jest.fn();
    const store = createMiniappOfflineStore({
      offlineCacheLimit: 2,
      evictionMode: 'preserve-oldest',
      onDrop,
    } as any);

    await store.push(makeEnvelope('cold-start'));
    await store.push(makeEnvelope('early-error'));
    await store.push(makeEnvelope('later-transaction', 'transaction'));

    expect(cachedIds()).toEqual(['cold-start', 'early-error']);
    expect(onDrop).toHaveBeenCalledWith('count', 1);
  });

  it('uses the configurable byte limit and reports byte drops', async () => {
    const onDrop = jest.fn();
    const store = createMiniappOfflineStore({
      offlineCacheLimit: 10,
      maxBytes: 120,
      evictionMode: 'preserve-oldest',
      onDrop,
    } as any);

    await store.push(makeEnvelope('too-large', 'transaction', { body: 'x'.repeat(200) }));

    expect(cachedIds()).toEqual([]);
    expect(onDrop).toHaveBeenCalledWith('bytes', 1);
  });

  it('drops expired entries, reports age drops, and clears stale storage on shift', async () => {
    const onDrop = jest.fn();
    mockStorage[OFFLINE_KEY] = JSON.stringify([
      { envelope: makeEnvelope('expired'), timestamp: 0 },
    ]);

    const store = createMiniappOfflineStore({
      offlineCacheMaxAge: 1,
      onDrop,
    } as any);

    await expect(store.shift()).resolves.toBeUndefined();
    expect(cachedIds()).toEqual([]);
    expect(onDrop).toHaveBeenCalledWith('age', 1);
  });
});
