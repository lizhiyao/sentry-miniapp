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
} = vi.hoisted(() => {
  const mockFlush = vi.fn(() => Promise.resolve(true));

  return {
    mockAddBreadcrumb: vi.fn(),
    mockSetContext: vi.fn(),
    mockSetAttribute: vi.fn(),
    mockFlush,
    // 稳定的 client 桩：集成按「绑定的 client 是否仍是当前 client」过滤回调，
    // 每次新建对象会让 setup(client) 之后的回调全部被当成 stale 丢掉。
    mockClient: { flush: mockFlush, registerCleanup: vi.fn() },
    mockGetClient: vi.fn(() => mockClient),
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
    vi.restoreAllMocks();
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
    const oldClient = { registerCleanup: vi.fn() };
    // 全局 client 已被新一轮 init 换掉：本实例的回调必须失活。
    mockGetClient.mockReturnValue({ flush: mockFlush, registerCleanup: vi.fn() });
    const integration = new NetworkStatusIntegration();

    integration.setup(oldClient as any);
    networkChangeCallback?.({ networkType: 'none', isConnected: false });

    expect(mockSetContext).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    integration.cleanup();
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

    integration.cleanup();

    const miniappSdk = crossPlatform.sdk();
    expect(miniappSdk.offNetworkStatusChange).toHaveBeenCalled();
  });

  it('同一实例被第二个 client 复用时不重复挂载宿主监听', () => {
    const getNetworkType = vi.fn((options: any) => options.success({ networkType: 'wifi' }));
    const onNetworkStatusChange = vi.fn((callback: any) => {
      networkChangeCallback = callback;
    });
    const registerCleanup = vi.fn();
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      getNetworkType,
      onNetworkStatusChange,
    } as any);

    const integration = new NetworkStatusIntegration();
    integration.setup(mockClient as any);
    integration.setup({ flush: mockFlush, registerCleanup } as any);

    // 宿主监听是进程级的，重复挂载会让同一网络变化被记录两次。
    expect(getNetworkType).toHaveBeenCalledOnce();
    expect(onNetworkStatusChange).toHaveBeenCalledOnce();
    expect(registerCleanup).toHaveBeenCalledOnce();
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
    expect(() => integration.cleanup()).not.toThrow();
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
