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
});
