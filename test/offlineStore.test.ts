import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { sdk } from '../src/crossPlatform';

vi.mock('../src/crossPlatform', () => ({
  sdk: vi.fn(),
}));

describe('OfflineStore', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};
    (sdk as Mock).mockReturnValue({
      getStorageSync: vi.fn((key: string) => mockStorage[key]),
      setStorageSync: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should push and shift envelopes', async () => {
    const store = createMiniappOfflineStore({} as any);
    const env1: any = [{ event_id: '1' }, []];
    const env2: any = [{ event_id: '2' }, []];

    await store.push(env1);
    await store.push(env2);

    expect(mockStorage['sentry_offline_store']).toBeDefined();

    const shifted1 = await store.shift();
    expect(shifted1).toEqual(env1);

    const shifted2 = await store.shift();
    expect(shifted2).toEqual(env2);

    const shifted3 = await store.shift();
    expect(shifted3).toBeUndefined();
  });

  it('should limit the cache size', async () => {
    const store = createMiniappOfflineStore({} as any);

    // push 35 envelopes, limit is 30
    for (let i = 0; i < 35; i++) {
      await store.push([{ event_id: String(i) }, []] as any);
    }

    const cachedStr = mockStorage['sentry_offline_store'];
    const cached = JSON.parse(cachedStr);

    expect(cached.length).toBe(30);
    // New format: CachedEnvelope { envelope, timestamp }
    // The first 5 should be dropped, so the first one in cache is '5'
    expect(cached[0].envelope[0].event_id).toBe('5');
    expect(cached[29].envelope[0].event_id).toBe('34');
  });

  it('should unshift envelopes', async () => {
    const store = createMiniappOfflineStore({} as any);
    const env1: any = [{ event_id: '1' }, []];
    const env2: any = [{ event_id: '2' }, []];

    await store.push(env1);
    await store.unshift(env2);

    const shifted1 = await store.shift();
    expect(shifted1).toEqual(env2); // env2 was unshifted, so it's first

    const shifted2 = await store.shift();
    expect(shifted2).toEqual(env1);
  });

  describe('淘汰优先级与兼容性', () => {
    const errorEnvelope = (id: string): any => [
      { event_id: id },
      [[{ type: 'event' }, { message: id }]],
    ];
    const transactionEnvelope = (id: string): any => [
      { event_id: id },
      [[{ type: 'transaction' }, { transaction: id }]],
    ];

    it('缓存全是错误事件时按条数淘汰最旧错误', async () => {
      const store = createMiniappOfflineStore({ offlineCacheLimit: 1 } as any);

      await store.push(errorEnvelope('old-error'));
      await store.push(errorEnvelope('new-error'));

      expect(await store.shift()).toEqual(errorEnvelope('new-error'));
    });

    it('unshift 超限时从最新端优先淘汰非错误事件', async () => {
      const store = createMiniappOfflineStore({ offlineCacheLimit: 2 } as any);

      await store.push(errorEnvelope('old-error'));
      await store.push(transactionEnvelope('transaction'));
      await store.unshift(errorEnvelope('retry-error'));

      expect(await store.shift()).toEqual(errorEnvelope('retry-error'));
      expect(await store.shift()).toEqual(errorEnvelope('old-error'));
      expect(await store.shift()).toBeUndefined();
    });

    it('unshift 全是错误事件时淘汰最新端错误，保留刚回插事件', async () => {
      const store = createMiniappOfflineStore({ offlineCacheLimit: 2 } as any);

      await store.push(errorEnvelope('old-error'));
      await store.push(errorEnvelope('newer-error'));
      await store.unshift(errorEnvelope('retry-error'));

      expect(await store.shift()).toEqual(errorEnvelope('retry-error'));
      expect(await store.shift()).toEqual(errorEnvelope('old-error'));
    });

    it('兼容旧版直接存储 Envelope 数组的格式', async () => {
      const legacyEnvelope = errorEnvelope('legacy');
      mockStorage['sentry_offline_store'] = JSON.stringify([legacyEnvelope]);

      const store = createMiniappOfflineStore({} as any);

      expect(await store.shift()).toEqual(legacyEnvelope);
    });

    it('兼容宿主直接返回对象形式的旧版缓存', async () => {
      const legacyEnvelope = errorEnvelope('legacy-object');
      mockStorage['sentry_offline_store'] = [legacyEnvelope];

      const store = createMiniappOfflineStore({} as any);

      expect(await store.shift()).toEqual(legacyEnvelope);
    });

    it('onDrop 回调抛错时不影响缓存主流程', async () => {
      const onDrop = vi.fn(() => {
        throw new Error('observer failed');
      });
      const store = createMiniappOfflineStore({ offlineCacheLimit: 1, onDrop } as any);

      await expect(store.push(transactionEnvelope('first'))).resolves.toBeUndefined();
      await expect(store.push(transactionEnvelope('second'))).resolves.toBeUndefined();

      expect(onDrop).toHaveBeenCalledWith('count', 1);
      expect(await store.shift()).toEqual(transactionEnvelope('second'));
    });
  });

  describe('健壮性：损坏自愈与体积上限', () => {
    it('存储被写坏（非法 JSON）时清键自愈，之后可正常使用', async () => {
      const removeStorageSync = vi.fn((key: string) => {
        delete mockStorage[key];
      });
      (sdk as Mock).mockReturnValue({
        getStorageSync: vi.fn((key: string) => mockStorage[key]),
        setStorageSync: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeStorageSync,
      });
      mockStorage['sentry_offline_store'] = '{{ 这不是合法 JSON';

      const store = createMiniappOfflineStore({} as any);
      // shift 时 getStore 解析失败 → 清键自愈（修复前坏数据常驻、永远读到空）
      const first = await store.shift();
      expect(first).toBeUndefined();
      expect(removeStorageSync).toHaveBeenCalledWith('sentry_offline_store');
      expect(mockStorage['sentry_offline_store']).toBeUndefined();

      // 自愈后可正常 push / shift
      const env: any = [{ event_id: 'ok' }, []];
      await store.push(env);
      expect(await store.shift()).toEqual(env);
    });

    it('超出单 key 体积上限时丢弃最旧的非错误事件，保住错误事件写入', async () => {
      const big = 'x'.repeat(1024 * 1024); // 1MB，单条即超 900KB 上限
      const bigTransaction: any = [
        { event_id: 'big' },
        [[{ type: 'transaction' }, { data: big }]],
      ];
      const errorEnv: any = [{ event_id: 'err' }, [[{ type: 'event' }, { msg: 'boom' }]]];

      const store = createMiniappOfflineStore({ offlineCacheLimit: 50 } as any);
      await store.push(bigTransaction);
      await store.push(errorEnv);

      const raw = mockStorage['sentry_offline_store'];
      expect(raw).toBeDefined();
      const ids = JSON.parse(raw).map((i: any) => i.envelope[0].event_id);
      // 修复前超大非错误事件原样写入；修复后被丢弃以腾空间，错误事件保留
      expect(ids).toContain('err');
      expect(ids).not.toContain('big');
    });

    it('按 UTF-8 字节数处理中文与代理对字符', async () => {
      const unicodeEnvelope: any = [
        { event_id: 'unicode' },
        [[{ type: 'transaction' }, { data: '汉🙂' }]],
      ];
      const store = createMiniappOfflineStore({ maxBytes: 20 } as any);

      await store.push(unicodeEnvelope);

      expect(mockStorage['sentry_offline_store']).toBe('[]');
      expect(await store.shift()).toBeUndefined();
    });

    it('单条错误事件超过体积上限时也能安全淘汰', async () => {
      const oversizedError: any = [
        { event_id: 'oversized-error' },
        [[{ type: 'event' }, { message: 'x'.repeat(100) }]],
      ];
      const store = createMiniappOfflineStore({ maxBytes: 20 } as any);

      await store.push(oversizedError);

      expect(mockStorage['sentry_offline_store']).toBe('[]');
    });

    it('宿主 storage 读写抛错时不阻断缓存接口', async () => {
      const setStorageSync = vi.fn(() => {
        throw new Error('quota exceeded');
      });
      (sdk as Mock).mockReturnValue({
        getStorageSync: vi.fn(() => {
          throw new Error('storage corrupted');
        }),
        setStorageSync,
      });
      const store = createMiniappOfflineStore({} as any);
      const env: any = [{ event_id: 'best-effort' }, []];

      await expect(store.push(env)).resolves.toBeUndefined();
      await expect(store.shift()).resolves.toBeUndefined();
      expect(setStorageSync).toHaveBeenCalled();
    });

    it('缺少 storage API 时安全降级为空缓存', async () => {
      (sdk as Mock).mockReturnValue({});
      const store = createMiniappOfflineStore({} as any);
      const env: any = [{ event_id: 'ignored' }, []];

      await expect(store.push(env)).resolves.toBeUndefined();
      await expect(store.unshift(env)).resolves.toBeUndefined();
      await expect(store.shift()).resolves.toBeUndefined();
    });

    it('宿主 SDK 访问抛错时记录警告并保持异步接口可用', async () => {
      (sdk as Mock).mockImplementation(() => {
        throw new Error('storage unavailable');
      });
      const store = createMiniappOfflineStore({} as any);
      const env: any = [{ event_id: 'ignored' }, []];

      await expect(store.push(env)).resolves.toBeUndefined();
      await expect(store.unshift(env)).resolves.toBeUndefined();
      await expect(store.shift()).resolves.toBeUndefined();

      expect(console.warn).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to push to offline store',
        expect.any(Error),
      );
      expect(console.warn).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to unshift to offline store',
        expect.any(Error),
      );
      expect(console.warn).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to shift from offline store',
        expect.any(Error),
      );
    });
  });
});
