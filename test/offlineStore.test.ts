import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeEnvelope, type Envelope, type EventEnvelope, type Event } from '@sentry/core';
import {
  createMiniappOfflineStore,
  type MiniappOfflineStoreOptions,
} from '../src/transports/offlineStore';
import { OFFLINE_STORE_KEY, LEGACY_OFFLINE_STORE_KEY } from '../src/transports/offlineRecords';
import { MAX_STORE_BYTES } from '../src/transports/envelopeCodec';
import { utf8ByteLength } from '../src/coreCompat';
import { appName, sdk } from '../src/crossPlatform';
import { createEventEnvelope } from './support/envelopes';

vi.mock('../src/crossPlatform', () => ({ sdk: vi.fn(), appName: vi.fn() }));
const defaults: MiniappOfflineStoreOptions = {
  targetId: 'target-A',
  policyId: 'privacy-v2',
};
let storage: Record<string, unknown>;
let host: {
  request: ReturnType<typeof vi.fn>;
  getStorageSync: ReturnType<typeof vi.fn>;
  setStorageSync: ReturnType<typeof vi.fn>;
  removeStorageSync: ReturnType<typeof vi.fn>;
};
function store(options: Partial<MiniappOfflineStoreOptions> = {}, active?: () => boolean) {
  return createMiniappOfflineStore({ ...defaults, ...options }, active);
}
function records(): Array<{
  createdAt: number;
  recordId: string;
  payload: { headers: { event_id: string } };
}> {
  const raw = storage[OFFLINE_STORE_KEY];
  return typeof raw === 'string' && raw ? JSON.parse(raw).records : [];
}
async function drain(cache: ReturnType<typeof store>): Promise<string[]> {
  const ids: string[] = [];
  for (let envelope = await cache.shift(); envelope; envelope = await cache.shift())
    ids.push(String(envelope[0].event_id));
  return ids;
}
function nonError(id: string): Envelope {
  return [
    { event_id: id, sent_at: '2026-10-06T00:00:00Z' },
    [[{ type: 'transaction' }, { transaction: id }]],
  ];
}
beforeEach(() => {
  storage = {};
  host = {
    request: vi.fn(),
    getStorageSync: vi.fn((key: string) => storage[key]),
    setStorageSync: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeStorageSync: vi.fn((key: string) => {
      delete storage[key];
    }),
  };
  vi.mocked(sdk).mockReturnValue(host);
  vi.mocked(appName).mockReturnValue('wechat');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('single-target offline store', () => {
  it('persists FIFO and reinserts retry at the front', async () => {
    const cache = store();
    await cache.push(createEventEnvelope('A'));
    await cache.push(createEventEnvelope('B'));
    const first = await cache.shift();
    expect(first?.[0].event_id).toBe('A');
    await cache.unshift(first!);
    expect(await drain(cache)).toEqual(['A', 'B']);
    expect(cache.getDiagnostics()).toEqual({ mode: 'persistent', codes: [] });
  });
  it('keeps typed bytes across storage and sends exactly the original core wire', async () => {
    const cache = store();
    const envelope: Envelope = [
      { event_id: 'binary', sent_at: '2026-10-06T00:00:00Z' },
      [[{ type: 'attachment', filename: 'a.bin', length: 3 }, new Uint8Array([0, 128, 255])]],
    ];
    await cache.push(envelope);
    const cold = store();
    expect(serializeEnvelope((await cold.shift())!)).toEqual(serializeEnvelope(envelope));
  });
  it('preserves original TTL and identity across cold-start retries', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    let cache = store({ offlineCacheMaxAge: 1000 });
    await cache.push(createEventEnvelope('A'));
    const initial = records()[0]!;
    now.mockReturnValue(1900);
    cache = store({ offlineCacheMaxAge: 1000 });
    const retry = await cache.shift();
    await cache.unshift(retry!);
    expect(records()[0]?.createdAt).toBe(initial.createdAt);
    expect(records()[0]?.recordId).toBe(initial.recordId);
    now.mockReturnValue(2000);
    expect(await cache.shift()).toBeUndefined();
    expect(records()).toEqual([]);
  });
  it('does not treat a wall clock rollback as expiry', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const cache = store({ offlineCacheMaxAge: 10 });
    await cache.push(createEventEnvelope('A'));
    now.mockReturnValue(1);
    expect((await cache.shift())?.[0].event_id).toBe('A');
  });
  it.each(['targetId', 'policyId'] as const)(
    'discards old records on %s change before writing the new container',
    async (field) => {
      await store().push(createEventEnvelope('A'));
      const onDrop = vi.fn();
      const next = store({ [field]: 'changed', onDrop });
      await next.push(createEventEnvelope('B'));
      expect(await drain(next)).toEqual(['B']);
      expect(onDrop).toHaveBeenCalledWith(
        field === 'targetId' ? 'target_changed' : 'policy_changed',
        1,
      );
      expect(host.removeStorageSync).toHaveBeenCalledWith(OFFLINE_STORE_KEY);
    },
  );
  it('changing capacity/TTL/eviction preserves compatible records', async () => {
    await store().push(createEventEnvelope('A'));
    const next = store({
      offlineCacheLimit: 2,
      offlineCacheMaxAge: 999999,
      evictionMode: 'preserve-oldest',
    });
    expect(await drain(next)).toEqual(['A']);
    expect(host.removeStorageSync).not.toHaveBeenCalled();
  });
  it('discards legacy unscoped data instead of inventing target or age', async () => {
    storage[LEGACY_OFFLINE_STORE_KEY] = JSON.stringify([createEventEnvelope('legacy')]);
    const cache = store();
    await cache.push(createEventEnvelope('B'));
    expect(storage[LEGACY_OFFLINE_STORE_KEY]).toBeUndefined();
    expect(await drain(cache)).toEqual(['B']);
    expect(cache.getDiagnostics().codes).toContain('migration_drop');
  });
  it('unknown root versions are discarded with diagnostics', async () => {
    storage[OFFLINE_STORE_KEY] = '{"schemaVersion":999,"records":[]}';
    const cache = store();
    expect(await cache.shift()).toBeUndefined();
    expect(cache.getDiagnostics().codes).toContain('migration_drop');
  });
  it('rejects writes to retired owners and never calls host APIs', async () => {
    const cache = store({}, () => false);
    await expect(cache.push(createEventEnvelope('A'))).rejects.toThrow('retired');
    expect(await cache.shift()).toBeUndefined();
    expect(host.getStorageSync).not.toHaveBeenCalled();
    expect(host.setStorageSync).not.toHaveBeenCalled();
  });
  it('rechecks ownership after retrieving storage API getters', async () => {
    let active = true;
    Object.defineProperty(host, 'getStorageSync', {
      get: () => {
        active = false;
        return vi.fn();
      },
    });
    const cache = store({}, () => active);
    await expect(cache.push(createEventEnvelope('A'))).rejects.toThrow('retired');
    expect(host.setStorageSync).not.toHaveBeenCalled();
  });
});

describe('capacity and commit boundaries', () => {
  it.each(['my', 'dd'] as const)(
    'crops before %s object-parameter storage exceeds its single-key limit',
    async (platformGlobal) => {
      const platform =
        await vi.importActual<typeof import('../src/crossPlatform')>('../src/crossPlatform');
      const stored = new Map<string, string>();
      const set = vi.fn(({ key, data }: { key: string; data: string }) => {
        if (utf8ByteLength(data) > 200 * 1024)
          return { error: 14, errorMessage: 'Single key data length overrun' };
        stored.set(key, data);
        return { success: true };
      });
      vi.stubGlobal('wx', undefined);
      vi.stubGlobal(platformGlobal, {
        request: vi.fn(),
        getStorageSync: ({ key }: { key: string }) => ({ data: stored.get(key) }),
        setStorageSync: set,
        removeStorageSync: ({ key }: { key: string }) => stored.delete(key),
      });
      platform.resetPlatformCache();
      vi.mocked(sdk).mockImplementation(platform.sdk);
      vi.mocked(appName).mockImplementation(platform.appName);
      try {
        const onDrop = vi.fn();
        const cache = store({ onDrop });
        for (const id of ['A', 'B', 'C']) {
          const envelope: EventEnvelope = [
            createEventEnvelope(id)[0],
            [[{ type: 'event' }, { event_id: id, message: '中'.repeat(37_000) }]],
          ];
          await cache.push(envelope);
          expect(utf8ByteLength(stored.get(OFFLINE_STORE_KEY)!)).toBeLessThanOrEqual(180 * 1024);
        }
        expect(await drain(cache)).toEqual(['C']);
        expect(onDrop.mock.calls).toEqual([
          ['bytes', 1],
          ['bytes', 1],
        ]);
        expect(set.mock.calls.every(([input]) => typeof input.key === 'string')).toBe(true);
        expect(cache.getDiagnostics()).toEqual({ mode: 'persistent', codes: [] });
      } finally {
        platform.resetPlatformCache();
      }
    },
  );

  it.each(['push', 'shift'] as const)(
    'an Alipay error result cannot be mistaken for a committed %s',
    async (operation) => {
      const platform =
        await vi.importActual<typeof import('../src/crossPlatform')>('../src/crossPlatform');
      const stored = new Map<string, string>();
      let writeFailed = false;
      const set = vi.fn(({ key, data }: { key: string; data: string }) => {
        if (writeFailed) return { error: 12, errorMessage: 'Storage total size limit reached' };
        stored.set(key, data);
        return { success: true };
      });
      vi.stubGlobal('wx', undefined);
      vi.stubGlobal('my', {
        request: vi.fn(),
        getStorageSync: ({ key }: { key: string }) => ({ data: stored.get(key) }),
        setStorageSync: set,
        removeStorageSync: ({ key }: { key: string }) => stored.delete(key),
      });
      platform.resetPlatformCache();
      vi.mocked(sdk).mockImplementation(platform.sdk);
      vi.mocked(appName).mockImplementation(platform.appName);
      try {
        const cache = store();
        await cache.push(createEventEnvelope('persisted'));
        const original = stored.get(OFFLINE_STORE_KEY);
        writeFailed = true;
        if (operation === 'push') {
          await expect(cache.push(createEventEnvelope('incoming'))).rejects.toThrow();
          expect(await drain(cache)).toEqual(['incoming']);
        } else {
          expect(await cache.shift()).toBeUndefined();
          expect(await cache.shift()).toBeUndefined();
        }
        expect(stored.get(OFFLINE_STORE_KEY)).toBe(original);
        expect(cache.getDiagnostics()).toEqual({
          mode: 'memory',
          codes: ['storage_error', 'memory_only'],
        });
      } finally {
        platform.resetPlatformCache();
      }
    },
  );

  it.each(['alipay', 'dingtalk'] as const)(
    '%s drops a single oversized record instead of repeatedly attempting an over-budget write',
    async (platform) => {
      vi.mocked(appName).mockReturnValue(platform);
      const onDrop = vi.fn();
      const cache = store({ maxBytes: MAX_STORE_BYTES * 2, onDrop });
      const envelope: EventEnvelope = [
        createEventEnvelope('oversized')[0],
        [[{ type: 'event' }, { event_id: 'oversized', message: 'x'.repeat(190 * 1024) }]],
      ];
      await cache.push(envelope);
      await cache.unshift(envelope);
      expect(storage[OFFLINE_STORE_KEY]).toBe('');
      expect(onDrop.mock.calls).toEqual([
        ['bytes', 1],
        ['bytes', 1],
      ]);
      expect(cache.getDiagnostics()).toEqual({ mode: 'persistent', codes: [] });
      await cache.push(createEventEnvelope('small'));
      expect(await drain(cache)).toEqual(['small']);
    },
  );

  it('does not parse an oversized raw root again just to count migration drops', async () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      targetId: 'other',
      policyId: 'other',
      records: [],
      padding: 'x'.repeat(MAX_STORE_BYTES),
    });
    storage[OFFLINE_STORE_KEY] = raw;
    const parse = vi.spyOn(JSON, 'parse');
    const cache = store();
    await cache.push(createEventEnvelope('bounded'));
    expect(parse.mock.calls.some((call) => call[0] === raw)).toBe(false);
    expect(cache.getDiagnostics().codes).toContain('migration_drop');
  });
  it('rejects unserializable envelopes without changing persisted records or switching storage mode', async () => {
    const cache = store();
    await cache.push(createEventEnvelope('A'));
    const original = storage[OFFLINE_STORE_KEY];
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const invalid = [{}, [[{ type: 'event' }, circular]]] as unknown as Envelope;
    await expect(cache.push(invalid)).rejects.toThrow();
    expect(storage[OFFLINE_STORE_KEY]).toBe(original);
    expect(cache.getDiagnostics()).toEqual({ mode: 'persistent', codes: ['serialization_error'] });
    expect(await drain(cache)).toEqual(['A']);
  });

  it('an observer exception cannot undo the committed eviction or prevent subsequent use', async () => {
    const cache = store({
      offlineCacheLimit: 1,
      onDrop: () => {
        throw new Error('observer');
      },
    });
    await cache.push(createEventEnvelope('A'));
    await cache.push(createEventEnvelope('B'));
    expect(await drain(cache)).toEqual(['B']);
  });

  it.each([LEGACY_OFFLINE_STORE_KEY, OFFLINE_STORE_KEY])(
    'missing deletion capability cannot overwrite unowned data at %s',
    async (key) => {
      storage[key] = JSON.stringify({ schemaVersion: 99, records: [] });
      const original = storage[key];
      Object.defineProperty(host, 'removeStorageSync', { value: undefined });
      const cache = store();
      await expect(cache.push(createEventEnvelope('B'))).rejects.toThrow('Cannot discard');
      expect(storage[key]).toBe(original);
      expect(host.setStorageSync).not.toHaveBeenCalled();
      expect(await drain(cache)).toEqual(['B']);
    },
  );

  it('a setter that disappears between read and commit is an observable persistence failure', async () => {
    let reads = 0;
    Object.defineProperty(host, 'setStorageSync', {
      get: () => (++reads === 1 ? vi.fn() : undefined),
    });
    const cache = store();
    await expect(cache.push(createEventEnvelope('A'))).rejects.toThrow('write unavailable');
    expect(cache.getDiagnostics().codes).toContain('storage_error');
    expect(await drain(cache)).toEqual(['A']);
  });

  it('isolates and diagnoses a bad stored record while committing its removal with valid delivery', async () => {
    const cache = store();
    await cache.push(createEventEnvelope('A'));
    const root = JSON.parse(String(storage[OFFLINE_STORE_KEY]));
    root.records.unshift({ ...root.records[0], createdAt: -1 });
    storage[OFFLINE_STORE_KEY] = JSON.stringify(root);
    expect(await drain(cache)).toEqual(['A']);
    expect(cache.getDiagnostics().codes).toContain('invalid_record');
    expect(records()).toEqual([]);
  });

  it.each(['{', '[]', '42'])(
    'drops corrupt/unknown roots without inventing a count: %s',
    async (raw) => {
      storage[OFFLINE_STORE_KEY] = raw;
      const onDrop = vi.fn();
      const cache = store({ onDrop });
      await cache.push(createEventEnvelope('B'));
      expect(await drain(cache)).toEqual(['B']);
      expect(onDrop).not.toHaveBeenCalled();
      expect(cache.getDiagnostics().codes).toContain('migration_drop');
    },
  );

  it('does not treat a falsy host exception as successful persistence', async () => {
    const cache = store();
    host.setStorageSync.mockImplementation(() => {
      throw undefined;
    });
    await expect(cache.push(createEventEnvelope('A'))).rejects.toBeUndefined();
    expect(cache.getDiagnostics().codes).toContain('storage_error');
    expect(storage[OFFLINE_STORE_KEY]).toBeUndefined();
  });

  it('captures eviction and notification configuration at construction', async () => {
    const original = vi.fn();
    const replacement = vi.fn();
    const options: MiniappOfflineStoreOptions = {
      ...defaults,
      offlineCacheLimit: 1,
      evictionMode: 'preserve-oldest',
      onDrop: original,
    };
    const cache = createMiniappOfflineStore(options);
    options.evictionMode = 'error-priority';
    options.onDrop = replacement;
    await cache.push(createEventEnvelope('A'));
    await cache.push(createEventEnvelope('B'));
    expect(await drain(cache)).toEqual(['A']);
    expect(original).toHaveBeenCalledWith('count', 1);
    expect(replacement).not.toHaveBeenCalled();
  });

  it.each([0, 1, 3])('enforces count %i', async (limit) => {
    const cache = store({ offlineCacheLimit: limit });
    for (let i = 0; i < 5; i++) await cache.push(createEventEnvelope(String(i)));
    expect((await drain(cache)).length).toBe(limit);
  });
  it('preserves errors before non-errors, but keeps FIFO order for delivery', async () => {
    const cache = store({ offlineCacheLimit: 2 });
    await cache.push(createEventEnvelope('A'));
    await cache.push(nonError('B'));
    await cache.push(createEventEnvelope('C'));
    expect(await drain(cache)).toEqual(['A', 'C']);
  });
  it('preserve-oldest drops the newly appended record', async () => {
    const cache = store({ offlineCacheLimit: 1, evictionMode: 'preserve-oldest' });
    await cache.push(createEventEnvelope('A'));
    await cache.push(createEventEnvelope('B'));
    expect(await drain(cache)).toEqual(['A']);
  });
  it.each([0, 100, 700])(
    'bounds total persisted UTF-8 bytes including metadata to %i',
    async (bytes) => {
      const cache = store({ maxBytes: bytes });
      const payload: Event = { event_id: 'unicode', message: '中文😀'.repeat(50) };
      const envelope: EventEnvelope = [
        createEventEnvelope('unicode')[0],
        [[{ type: 'event' }, payload]],
      ];
      await cache.push(envelope);
      expect(utf8ByteLength(String(storage[OFFLINE_STORE_KEY] ?? ''))).toBeLessThanOrEqual(bytes);
    },
  );
  it('hard-caps configured storage beyond the host ceiling', async () => {
    const cache = store({ maxBytes: MAX_STORE_BYTES * 2 });
    const payload: Event = { event_id: 'large', message: 'a'.repeat(MAX_STORE_BYTES - 300) };
    const envelope: EventEnvelope = [
      createEventEnvelope('large')[0],
      [[{ type: 'event' }, payload]],
    ];
    await cache.push(envelope);
    expect(utf8ByteLength(String(storage[OFFLINE_STORE_KEY] ?? ''))).toBeLessThanOrEqual(
      MAX_STORE_BYTES,
    );
  });
  it('does not hand off records if the deletion write fails, and stops consuming disk', async () => {
    const cache = store();
    await cache.push(createEventEnvelope('A'));
    const original = storage[OFFLINE_STORE_KEY];
    host.setStorageSync.mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(await cache.shift()).toBeUndefined();
    const calls = host.getStorageSync.mock.calls.length;
    expect(await cache.shift()).toBeUndefined();
    expect(host.getStorageSync).toHaveBeenCalledTimes(calls);
    expect(storage[OFFLINE_STORE_KEY]).toBe(original);
    expect(cache.getDiagnostics()).toEqual({
      mode: 'memory',
      codes: ['storage_error', 'memory_only'],
    });
  });
  it('rejects failed persistence but retains only the incoming record in bounded memory', async () => {
    const cache = store();
    await cache.push(createEventEnvelope('A'));
    host.setStorageSync.mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(cache.push(createEventEnvelope('B'))).rejects.toThrow('disk full');
    expect(await drain(cache)).toEqual(['B']);
    expect(records().map((record) => record.payload.headers.event_id)).toEqual(['A']);
  });
  it('cannot overwrite an incompatible target if deletion fails', async () => {
    await store().push(createEventEnvelope('A'));
    const original = storage[OFFLINE_STORE_KEY];
    host.removeStorageSync.mockImplementation(() => {
      throw new Error('denied');
    });
    const b = store({ targetId: 'target-B' });
    await expect(b.push(createEventEnvelope('B'))).rejects.toThrow('denied');
    expect(storage[OFFLINE_STORE_KEY]).toBe(original);
    expect(await drain(b)).toEqual(['B']);
  });
  it('does not report prospective capacity drops when commit fails', async () => {
    const onDrop = vi.fn();
    const cache = store({ offlineCacheLimit: 1, onDrop });
    await cache.push(createEventEnvelope('A'));
    host.setStorageSync.mockImplementation(() => {
      throw new Error('failed');
    });
    await expect(cache.push(createEventEnvelope('B'))).rejects.toThrow();
    expect(onDrop).not.toHaveBeenCalled();
  });
  it('notifies only after commit; a callback switching owners cannot overwrite the new target', async () => {
    let active = true;
    let nextWrite: Promise<void> | undefined;
    const b = store({ targetId: 'target-B' });
    const a = store(
      {
        offlineCacheLimit: 1,
        onDrop: () => {
          expect(records().map((record) => record.payload.headers.event_id)).toEqual(['A2']);
          active = false;
          nextWrite = b.push(createEventEnvelope('B'));
        },
      },
      () => active,
    );
    await a.push(createEventEnvelope('A1'));
    await a.push(createEventEnvelope('A2'));
    await nextWrite;
    expect(await drain(b)).toEqual(['B']);
  });
  it('returns no shifted envelope after expiry notification retires the owner', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    let active = true;
    const cache = store(
      {
        offlineCacheMaxAge: 100,
        onDrop: () => {
          active = false;
        },
      },
      () => active,
    );
    await cache.push(createEventEnvelope('old'));
    now.mockReturnValue(1050);
    await cache.push(createEventEnvelope('fresh'));
    now.mockReturnValue(1100);
    expect(await cache.shift()).toBeUndefined();
    expect(records()).toEqual([]);
  });
  it('declares bounded memory fallback when sync storage is absent', async () => {
    vi.mocked(sdk).mockReturnValue({ request: vi.fn() });
    const cache = store({ offlineCacheLimit: 1 });
    await cache.push(createEventEnvelope('A'));
    await cache.push(createEventEnvelope('B'));
    expect(await drain(cache)).toEqual(['B']);
    expect(cache.getDiagnostics()).toEqual({ mode: 'memory', codes: ['memory_only'] });
  });
});
