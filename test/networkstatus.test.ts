import {
  getClientEnvironment,
  EnvironmentState,
  registerClientEnvironment,
} from '../src/clientState';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const {
  mockAddBreadcrumb,
  mockSetContext,
  mockSetAttribute,
  mockFlush,
  mockGetClient,
  mockClient,
  activeCleanups,
} = vi.hoisted(() => {
  const mockFlush = vi.fn(() => Promise.resolve(true));
  const activeCleanups = new Set<() => void>();

  return {
    mockAddBreadcrumb: vi.fn(),
    mockSetContext: vi.fn(),
    mockSetAttribute: vi.fn(),
    mockFlush,
    // 稳定的 client 桩：集成按「绑定的 client 是否仍是当前 client」过滤回调，
    // 每次新建对象会让 setup(client) 之后的回调全部被当成 stale 丢掉。
    mockClient: {
      flush: mockFlush,
      registerCleanup: vi.fn((cleanup: () => void) => {
        activeCleanups.add(cleanup);
      }),
      getOptions: () => ({}),
    },
    mockGetClient: vi.fn(() => mockClient),
    activeCleanups,
  };
});

vi.mock('@sentry/core', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  setContext: mockSetContext,
  setAttribute: mockSetAttribute,
  getClient: mockGetClient,
}));

import * as crossPlatform from '../src/crossPlatform';
import { NetworkStatusIntegration } from '../src/integrations/networkstatus';

describe('NetworkStatusIntegration', () => {
  let networkChangeCallback: ((res: any) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks 只清调用记录、不清 mockReturnValue，上个用例的桩会渗下来。
    mockGetClient.mockImplementation(() => mockClient);
    registerClientEnvironment(mockClient as any, new EnvironmentState({ enableSystemInfo: false }));
    networkChangeCallback = null;

    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: vi.fn(),
      getNetworkType: vi.fn((options: any) => {
        if (options.success) {
          options.success({ networkType: 'wifi' });
        }
      }),
      onNetworkStatusChange: vi.fn((callback: any) => {
        networkChangeCallback = callback;
      }),
      offNetworkStatusChange: vi.fn(),
    } as any);
  });

  afterEach(() => {
    for (const cleanup of activeCleanups) cleanup();
    activeCleanups.clear();
    vi.restoreAllMocks();
  });

  it('注册中 cleanup 后才保存的监听也会被解除，旧回调不读取参数', () => {
    const integration = new NetworkStatusIntegration();
    const handlers: Array<(res: any) => void> = [];
    const off = vi.fn();
    vi.mocked(crossPlatform.sdk).mockReturnValue({
      request: vi.fn(),
      onNetworkStatusChange: (handler: (res: any) => void) => {
        mockClient.registerCleanup.mock.calls[0]![0]();
        handlers.push(handler);
      },
      offNetworkStatusChange: off,
    });
    integration.setup(mockClient as any);
    expect(off).toHaveBeenCalledTimes(2);
    const read = vi.fn();
    handlers[0]!(new Proxy({}, { get: read }));
    expect(read).not.toHaveBeenCalled();
  });

  it('should get initial network type on setup', () => {
    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any);

    expect(getClientEnvironment(mockClient as any).contexts['network']).toEqual({
      type: 'wifi',
      isConnected: true,
    });
  });

  it('ignores initial and change callbacks owned by an inactive client', () => {
    const registerCleanup = vi.fn((cleanup: () => void) => {
      activeCleanups.add(cleanup);
    });
    const oldClient = { registerCleanup };
    // 全局 client 已被新一轮 init 换掉：本实例的回调必须失活。
    mockGetClient.mockReturnValue({
      flush: mockFlush,
      registerCleanup: vi.fn(),
      getOptions: () => ({}),
    });
    const integration = new NetworkStatusIntegration();

    integration.setup(oldClient as any);
    networkChangeCallback?.({ networkType: 'none', isConnected: false });

    expect(mockSetContext).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    registerCleanup.mock.calls[0]![0]();
  });

  it('should add breadcrumb on network change', () => {
    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any);

    expect(networkChangeCallback).not.toBeNull();

    // Simulate network change to 4G
    networkChangeCallback!({ networkType: '4g', isConnected: true });

    expect(getClientEnvironment(mockClient as any).contexts['network']).toEqual({
      type: '4g',
      isConnected: true,
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'network.change',
      message: '网络状态变化: 4g',
      level: 'info',
      data: { networkType: '4g', isConnected: true },
    });
  });

  it('should set warning level when disconnected', () => {
    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any);

    networkChangeCallback!({ networkType: 'none', isConnected: false });

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        data: { networkType: 'none', isConnected: false },
      }),
    );
  });

  it('should cleanup by calling offNetworkStatusChange', () => {
    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any);

    const cleanup = mockClient.registerCleanup.mock.calls[0]![0];
    cleanup();
    cleanup();

    const miniappSdk = crossPlatform.sdk();
    expect(miniappSdk.offNetworkStatusChange).toHaveBeenCalledOnce();
  });

  it('同 client 重复 setup 幂等，第二个 client 有独立订阅', () => {
    const getNetworkType = vi.fn((options: any) => options.success({ networkType: 'wifi' }));
    const onNetworkStatusChange = vi.fn((callback: any) => {
      networkChangeCallback = callback;
    });
    const registerCleanup = vi.fn((cleanup: () => void) => {
      activeCleanups.add(cleanup);
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      getNetworkType,
      onNetworkStatusChange,
    } as any);

    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any);
    integration.setup(mockClient as any);
    const second = { flush: mockFlush, registerCleanup, getOptions: () => ({}) };
    mockGetClient.mockReturnValue(second);
    integration.setup(second as any);

    // 分发只采用活动 owner；不同 client 的订阅不能共享可变归属。
    expect(getNetworkType).toHaveBeenCalledTimes(2);
    expect(onNetworkStatusChange).toHaveBeenCalledTimes(2);
    expect(registerCleanup).toHaveBeenCalledOnce();
  });

  it.each(['old-first', 'new-first'])('%s client cleanup 只解除对应网络监听', (order) => {
    const handlers: Array<(res: any) => void> = [];
    const off = vi.fn();
    vi.mocked(crossPlatform.sdk).mockReturnValue({
      request: vi.fn(),
      onNetworkStatusChange: (handler: (res: any) => void) => handlers.push(handler),
      offNetworkStatusChange: off,
    });
    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any);
    const oldCleanup = mockClient.registerCleanup.mock.calls[0]![0];
    const registerCleanup = vi.fn((cleanup: () => void) => {
      activeCleanups.add(cleanup);
    });
    const secondClient = { registerCleanup, getOptions: () => ({}) };
    mockGetClient.mockReturnValue(secondClient as any);
    integration.setup(secondClient as any);
    const newCleanup = registerCleanup.mock.calls[0]![0];
    const retired = order === 'old-first' ? 0 : 1;
    const [first, second] = retired === 0 ? [oldCleanup, newCleanup] : [newCleanup, oldCleanup];

    first!();
    first!();
    expect(off).toHaveBeenCalledExactlyOnceWith(handlers[retired]);
    const read = vi.fn();
    handlers[retired]!(new Proxy({}, { get: read }));
    expect(read).not.toHaveBeenCalled();
    handlers[1]!({ networkType: 'wifi', isConnected: true });
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(order === 'old-first' ? 1 : 0);

    second!();
    second!();
    expect(off).toHaveBeenCalledTimes(2);
    expect(off).toHaveBeenLastCalledWith(handlers[1 - retired]);
    for (const handler of handlers) handler(new Proxy({}, { get: read }));
    expect(read).not.toHaveBeenCalled();
  });

  it('should handle missing network APIs gracefully', () => {
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: vi.fn() } as any);

    const integration = new NetworkStatusIntegration();
    // Should not throw
    expect(() => integration.setup(mockClient as any)).not.toThrow();
  });

  it('should handle an unavailable platform SDK gracefully', () => {
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue(null as any);

    expect(() => new NetworkStatusIntegration().setup(mockClient as any)).not.toThrow();
  });

  it('falls back to unknown network type and infers connectivity', () => {
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      getNetworkType: vi.fn((options: any) => options.success({})),
      onNetworkStatusChange: vi.fn((callback: any) => {
        networkChangeCallback = callback;
      }),
    } as any);
    const integration = new NetworkStatusIntegration();

    integration.setup(mockClient as any);
    expect(getClientEnvironment(mockClient as any).contexts['network']).toEqual({
      type: 'unknown',
      isConnected: true,
    });

    networkChangeCallback!({ networkType: 'none' });
    expect(getClientEnvironment(mockClient as any).contexts['network']).toEqual({
      type: 'none',
      isConnected: false,
    });

    networkChangeCallback!({});
    expect(getClientEnvironment(mockClient as any).contexts['network']).toEqual({
      type: 'unknown',
      isConnected: true,
    });
  });

  it('contains host API and flush errors during setup, reconnect, and cleanup', () => {
    const offNetworkStatusChange = vi.fn(() => {
      throw new Error('off failed');
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      getNetworkType: vi.fn(() => {
        throw new Error('getNetworkType failed');
      }),
      onNetworkStatusChange: vi.fn((callback: any) => {
        networkChangeCallback = callback;
      }),
      offNetworkStatusChange,
    } as any);
    const integration = new NetworkStatusIntegration();

    expect(() => integration.setup(mockClient as any)).not.toThrow();
    networkChangeCallback!({ networkType: 'none' });
    // flush 走 setup(client) 绑定的 client，所以故障注入点在 client.flush 上。
    mockFlush.mockImplementationOnce(() => {
      throw new Error('flush unavailable');
    });
    expect(() => networkChangeCallback!({ networkType: 'wifi' })).not.toThrow();
    expect(mockFlush).toHaveBeenCalled();
    expect(mockClient.registerCleanup.mock.calls[0]![0]).not.toThrow();
    expect(offNetworkStatusChange).toHaveBeenCalled();
  });

  it('网络从断到连时触发 client.flush 补发离线积压', () => {
    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any); // 初始 wifi → _lastConnected = true

    // 断网：不触发 flush
    networkChangeCallback!({ networkType: 'none', isConnected: false });
    expect(mockFlush).not.toHaveBeenCalled();

    // 恢复联网：从断到连 → 触发一次 flush
    networkChangeCallback!({ networkType: 'wifi', isConnected: true });
    expect(mockFlush).toHaveBeenCalledTimes(1);

    // 持续联网（连到连）不应重复 flush
    networkChangeCallback!({ networkType: '4g', isConnected: true });
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });
});
