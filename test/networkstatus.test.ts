import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockAddBreadcrumb = jest.fn();
const mockSetContext = jest.fn();
const mockFlush = jest.fn(() => Promise.resolve(true));
const mockGetClient = jest.fn(() => ({ flush: mockFlush }));

jest.mock('@sentry/core', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  setContext: mockSetContext,
  getClient: mockGetClient,
}));

import * as crossPlatform from '../src/crossPlatform';
import { NetworkStatusIntegration } from '../src/integrations/networkstatus';

describe('NetworkStatusIntegration', () => {
  let networkChangeCallback: ((res: any) => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    networkChangeCallback = null;

    jest.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: jest.fn(),
      getNetworkType: jest.fn((options: any) => {
        if (options.success) {
          options.success({ networkType: 'wifi' });
        }
      }),
      onNetworkStatusChange: jest.fn((callback: any) => {
        networkChangeCallback = callback;
      }),
      offNetworkStatusChange: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should get initial network type on setup', () => {
    const integration = new NetworkStatusIntegration();
    integration.setupOnce();

    expect(mockSetContext).toHaveBeenCalledWith('network', {
      type: 'wifi',
      isConnected: true,
    });
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
    jest.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: jest.fn() } as any);

    const integration = new NetworkStatusIntegration();
    // Should not throw
    expect(() => integration.setupOnce()).not.toThrow();
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
