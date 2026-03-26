import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockAddBreadcrumb = jest.fn();
const mockSetContext = jest.fn();

jest.mock('@sentry/core', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  setContext: mockSetContext,
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
});
