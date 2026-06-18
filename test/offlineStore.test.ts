import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { sdk } from '../src/crossPlatform';

jest.mock('../src/crossPlatform', () => ({
  sdk: jest.fn(),
}));

describe('OfflineStore', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};
    (sdk as jest.Mock).mockReturnValue({
      getStorageSync: jest.fn((key: string) => mockStorage[key]),
      setStorageSync: jest.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  describe('健壮性：损坏自愈与体积上限', () => {
    it('存储被写坏（非法 JSON）时清键自愈，之后可正常使用', async () => {
      const removeStorageSync = jest.fn((key: string) => {
        delete mockStorage[key];
      });
      (sdk as jest.Mock).mockReturnValue({
        getStorageSync: jest.fn((key: string) => mockStorage[key]),
        setStorageSync: jest.fn((key: string, value: string) => {
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
  });
});
