import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockAddBreadcrumb, mockSetContext, mockFlush, mockGetClient } = vi.hoisted(() => {
  const mockFlush = vi.fn(() => Promise.resolve(true));

  return {
    mockAddBreadcrumb: vi.fn(),
    mockSetContext: vi.fn(),
    mockFlush,
    mockGetClient: vi.fn(() => ({ flush: mockFlush })),
  };
});

vi.mock('@sentry/core', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  setContext: mockSetContext,
  getClient: mockGetClient,
}));

import * as crossPlatform from '../src/crossPlatform';
import { NetworkStatusIntegration } from '../src/integrations/networkstatus';

describe('NetworkStatusIntegration', () => {
  let networkChangeCallback: ((res: any) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
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
    integration.setupOnce();

    expect(mockSetContext).toHaveBeenCalledWith('network', {
      type: 'wifi',
      isConnected: true,
    });
  });

  it('ignores initial and change callbacks owned by an inactive client', () => {
    const oldClient = { registerCleanup: vi.fn() };
    mockGetClient.mockReturnValue({ flush: mockFlush });
    const integration = new NetworkStatusIntegration();

    integration.setup(oldClient as any);
    networkChangeCallback?.({ networkType: 'none', isConnected: false });

    expect(mockSetContext).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    integration.cleanup();
  });

  it('should add breadcrumb on network change', () => {
    const integration = new NetworkStatusIntegration();
    integration.setupOnce();

    expect(networkChangeCallback).not.toBeNull();

    // Simulate network change to 4G
    networkChangeCallback!({ networkType: '4g', isConnected: true });

    expect(mockSetContext).toHaveBeenCalledWith('network', {
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
    integration.setupOnce();

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
    integration.setupOnce();

    integration.cleanup();

    const miniappSdk = crossPlatform.sdk();
    expect(miniappSdk.offNetworkStatusChange).toHaveBeenCalled();
  });

  it('should handle missing network APIs gracefully', () => {
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: vi.fn() } as any);

    const integration = new NetworkStatusIntegration();
    // Should not throw
    expect(() => integration.setupOnce()).not.toThrow();
  });

  it('should handle an unavailable platform SDK gracefully', () => {
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue(null as any);

    expect(() => new NetworkStatusIntegration().setupOnce()).not.toThrow();
  });

  it('falls back to unknown network type and infers connectivity', () => {
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      getNetworkType: vi.fn((options: any) => options.success({})),
      onNetworkStatusChange: vi.fn((callback: any) => {
        networkChangeCallback = callback;
      }),
    } as any);
    const integration = new NetworkStatusIntegration();

    integration.setupOnce();
    expect(mockSetContext).toHaveBeenCalledWith('network', {
      type: 'unknown',
      isConnected: true,
    });

    networkChangeCallback!({ networkType: 'none' });
    expect(mockSetContext).toHaveBeenLastCalledWith('network', {
      type: 'none',
      isConnected: false,
    });

    networkChangeCallback!({});
    expect(mockSetContext).toHaveBeenLastCalledWith('network', {
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

    expect(() => integration.setupOnce()).not.toThrow();
    networkChangeCallback!({ networkType: 'none' });
    mockGetClient.mockImplementationOnce(() => {
      throw new Error('flush unavailable');
    });
    expect(() => networkChangeCallback!({ networkType: 'wifi' })).not.toThrow();
    expect(() => integration.cleanup()).not.toThrow();
    expect(offNetworkStatusChange).toHaveBeenCalled();
  });

  it('网络从断到连时触发 client.flush 补发离线积压', () => {
    const integration = new NetworkStatusIntegration();
    integration.setupOnce(); // 初始 wifi → _lastConnected = true

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
