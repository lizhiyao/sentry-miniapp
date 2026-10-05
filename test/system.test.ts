import { getClientEnvironment } from '../src/clientState';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { addBreadcrumb, getCurrentScope, getClient } from '@sentry/core';
import { System } from '../src/integrations/system';
import { getSystemInfo, sdk } from '../src/crossPlatform';

// Mock @sentry/core
vi.mock('@sentry/core', () => ({
  addBreadcrumb: vi.fn(),
  getCurrentScope: vi.fn(),
  getClient: vi.fn(),
}));

// Mock crossPlatform
const mockSystemInfo: any = {
  brand: 'Apple',
  model: 'iPhone 13',
  pixelRatio: 3,
  screenWidth: 390,
  screenHeight: 844,
  windowWidth: 390,
  windowHeight: 844,
  statusBarHeight: 44,
  language: 'zh_CN',
  version: '8.0.5',
  system: 'iOS 15.0',
  platform: 'ios',
  fontSizeSetting: 16,
  SDKVersion: '2.19.4',
};

const mockSdk: any = {};

vi.mock('../src/crossPlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/crossPlatform')>()),
  getAccountInfo: vi.fn(() => ({ appId: 'wx-owned', version: '1.2' })),
  getSystemInfo: vi.fn(() => mockSystemInfo),
  sdk: vi.fn(() => mockSdk),
}));

describe('System', () => {
  let mockScope: any;
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = { registerCleanup: vi.fn(), getOptions: () => ({}) };
    vi.mocked(getClient).mockReturnValue(client);
    mockScope = {
      setContext: vi.fn(),
      setTag: vi.fn(),
    };
    (getCurrentScope as Mock).mockReturnValue(mockScope);
    (getSystemInfo as Mock).mockReturnValue(mockSystemInfo);
    (sdk as Mock).mockReturnValue(mockSdk);

    // 重置 mockSdk
    Object.keys(mockSdk).forEach((key) => delete mockSdk[key]);
  });

  describe('单一环境来源', () => {
    it('setupOnce 不读宿主或写共享 scope；setup(client) 使用统一快照', () => {
      const integration = new System();
      integration.setupOnce();
      expect(getSystemInfo).not.toHaveBeenCalled();
      integration.setup(client);
      const state = getClientEnvironment(client);
      expect(state.contexts['device']).toMatchObject({
        brand: 'Apple',
        model: 'iPhone 13',
        screen_resolution: '390x844',
      });
      expect(state.contexts['os']).toEqual({ name: 'iOS', version: '15.0' });
      expect(state.contexts['app']).toEqual({ app_identifier: 'wx-owned', app_version: '1.2' });
      expect(mockScope.setContext).not.toHaveBeenCalled();
      expect(mockScope.setTag).not.toHaveBeenCalled();
    });
  });

  describe('network context', () => {
    it('should fetch network type when getNetworkType is available', () => {
      mockSdk.getNetworkType = vi.fn();

      const integration = new System();
      integration.setup(client);

      expect(mockSdk.getNetworkType).toHaveBeenCalledWith(
        expect.objectContaining({
          success: expect.any(Function),
          fail: expect.any(Function),
        }),
      );
    });

    it('should set network context on success', () => {
      mockSdk.getNetworkType = vi.fn((opts: any) => {
        opts.success({ networkType: 'wifi', isConnected: true });
      });

      const integration = new System();
      integration.setup(client);

      expect(getClientEnvironment(client).contexts['network']).toEqual(
        expect.objectContaining({
          type: 'wifi',
          connected: true,
        }),
      );
      expect(getClientEnvironment(client).tags['network.type']).toBe('wifi');
    });

    it('should handle network type failure gracefully', () => {
      mockSdk.getNetworkType = vi.fn((opts: any) => {
        opts.fail();
      });

      const integration = new System();
      expect(() => integration.setup(client)).not.toThrow();
    });

    it('should skip network context when getNetworkType is not available', () => {
      const integration = new System();
      expect(() => integration.setup(client)).not.toThrow();
    });
  });

  describe('location context', () => {
    it('should fetch location when getLocation is available', () => {
      mockSdk.getLocation = vi.fn();

      const integration = new System();
      integration.setup(client);

      expect(mockSdk.getLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'gcj02',
          success: expect.any(Function),
          fail: expect.any(Function),
        }),
      );
    });

    it('should set location context on success', () => {
      mockSdk.getLocation = vi.fn((opts: any) => {
        opts.success({ latitude: 39.9, longitude: 116.4, accuracy: 30 });
      });

      const integration = new System();
      integration.setup(client);

      expect(getClientEnvironment(client).contexts['location']).toEqual(
        expect.objectContaining({
          latitude: 39.9,
          longitude: 116.4,
          accuracy: 30,
        }),
      );
    });

    it('should handle location failure gracefully', () => {
      mockSdk.getLocation = vi.fn((opts: any) => {
        opts.fail();
      });

      const integration = new System();
      expect(() => integration.setup(client)).not.toThrow();
    });
  });

  describe('storage context', () => {
    it('records storage usage and warns when the quota is nearly full', () => {
      mockSdk.getStorageInfoSync = vi.fn(() => ({ currentSize: 850, limitSize: 1000 }));

      new System().setup(client);

      expect(getClientEnvironment(client).contexts['storage']).toEqual({
        currentSize: 850,
        limitSize: 1000,
        usagePercent: 85,
      });
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'storage.warning',
        message: '存储使用率 85%（850KB / 1000KB）',
        level: 'warning',
        data: { currentSize: 850, limitSize: 1000, usagePercent: 85 },
      });
    });

    it('uses conservative defaults and does not warn without a usable quota', () => {
      mockSdk.getStorageInfoSync = vi.fn(() => ({}));

      new System().setup(client);

      expect(getClientEnvironment(client).contexts['storage']).toEqual({
        currentSize: 0,
        limitSize: 0,
        usagePercent: 0,
      });
      expect(addBreadcrumb).not.toHaveBeenCalled();
    });
  });

  describe('app update context', () => {
    it('records update availability and readiness callbacks', () => {
      let checkForUpdate: ((res: { hasUpdate: boolean }) => void) | undefined;
      let updateReady: (() => void) | undefined;
      mockSdk.getUpdateManager = vi.fn(() => ({
        onCheckForUpdate: vi.fn((callback: typeof checkForUpdate) => {
          checkForUpdate = callback;
        }),
        onUpdateReady: vi.fn((callback: typeof updateReady) => {
          updateReady = callback;
        }),
      }));

      new System().setup(client);
      checkForUpdate?.({ hasUpdate: false });
      expect(getClientEnvironment(client).tags['has_update']).toBeUndefined();

      checkForUpdate?.({ hasUpdate: true });
      updateReady?.();

      expect(getClientEnvironment(client).tags['has_update']).toBe('true');
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'app.update', data: { hasUpdate: true } }),
      );
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'app.update', data: { updateReady: true } }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle getSystemInfo returning null', () => {
      (getSystemInfo as Mock).mockReturnValueOnce(null);

      const integration = new System();
      expect(() => integration.setup(client)).not.toThrow();
    });

    it('should handle system without OS separator', () => {
      (getSystemInfo as Mock).mockReturnValueOnce({
        ...mockSystemInfo,
        system: 'Android',
      });

      const integration = new System();
      integration.setup(client);

      expect(getClientEnvironment(client).contexts['os']).toEqual(
        expect.objectContaining({
          name: 'Android',
        }),
      );
    });

    it('swallows host SDK access errors from optional context collectors', () => {
      (sdk as Mock).mockImplementation(() => {
        throw new Error('host API unavailable');
      });

      expect(() => new System().setup(client)).not.toThrow();
    });
  });

  it('cleanup 后的旧宿主回调不写状态或面包屑，事件处理复用唯一快照', () => {
    let success: ((value: any) => void) | undefined;
    let ready: (() => void) | undefined;
    mockSdk.getNetworkType = vi.fn((options) => {
      success = options.success;
    });
    mockSdk.getUpdateManager = vi.fn(() => ({
      onUpdateReady: vi.fn((callback) => {
        ready = callback;
      }),
    }));
    const integration = new System();
    integration.setup(client);
    const event = integration.processEvent({ message: 'owned' }, {}, client);
    expect(event.contexts?.device?.model).toBe('iPhone 13');
    expect(getSystemInfo).toHaveBeenCalledTimes(1);
    client.registerCleanup.mock.calls[0][0]();
    success?.({ networkType: 'wifi' });
    ready?.();
    expect(getClientEnvironment(client).contexts['network']).toBeUndefined();
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('client 切换后忽略网络、定位、更新回调，初始存储也不写退休 owner', () => {
    let network: ((value: any) => void) | undefined;
    let location: ((value: any) => void) | undefined;
    let check: ((value: any) => void) | undefined;
    mockSdk.getNetworkType = vi.fn((options) => {
      network = options.success;
    });
    mockSdk.getLocation = vi.fn((options) => {
      location = options.success;
    });
    mockSdk.getUpdateManager = vi.fn(() => ({
      onCheckForUpdate: vi.fn((callback) => {
        check = callback;
      }),
    }));
    const integration = new System();
    integration.setup(client);
    vi.mocked(getClient).mockReturnValue(undefined);
    network?.({ networkType: 'wifi' });
    location?.({ latitude: 1, longitude: 2, accuracy: 3 });
    check?.({ hasUpdate: true });
    mockSdk.getStorageInfoSync = vi.fn(() => ({ currentSize: 99, limitSize: 100 }));
    new System().setup(client);
    expect(getClientEnvironment(client).contexts['network']).toBeUndefined();
    expect(getClientEnvironment(client).contexts['location']).toBeUndefined();
    expect(getClientEnvironment(client).contexts['storage']).toBeUndefined();
    expect(getClientEnvironment(client).tags['has_update']).toBeUndefined();
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  describe('metadata', () => {
    it('should have correct id and name', () => {
      const integration = new System();
      expect(integration.name).toBe('System');
      expect(System.id).toBe('System');
    });
  });
});
