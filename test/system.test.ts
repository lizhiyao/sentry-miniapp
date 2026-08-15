import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { addBreadcrumb, getCurrentScope } from '@sentry/core';
import { System, systemIntegration } from '../src/integrations/system';
import { getSystemInfo, sdk } from '../src/crossPlatform';

// Mock @sentry/core
vi.mock('@sentry/core', () => ({
  addBreadcrumb: vi.fn(),
  getCurrentScope: vi.fn(),
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

vi.mock('../src/crossPlatform', () => ({
  getSystemInfo: vi.fn(() => mockSystemInfo),
  sdk: vi.fn(() => mockSdk),
}));

describe('System', () => {
  let mockScope: any;

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('setupOnce', () => {
    it('should add device context', () => {
      const integration = new System();
      integration.setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'device',
        expect.objectContaining({
          name: 'iPhone 13',
          model: 'iPhone 13',
          brand: 'Apple',
          family: 'ios',
        }),
      );
    });

    it('should add OS context', () => {
      const integration = new System();
      integration.setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'os',
        expect.objectContaining({
          name: 'iOS',
          version: '15.0',
        }),
      );
    });

    it('should add app context', () => {
      const integration = new System();
      integration.setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'app',
        expect.objectContaining({
          app_version: '8.0.5',
        }),
      );
    });

    it('should add screen context', () => {
      const integration = new System();
      integration.setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'screen',
        expect.objectContaining({
          screen_width: 390,
          screen_height: 844,
          screen_density: 3,
        }),
      );
    });

    it('should set device tags', () => {
      const integration = new System();
      integration.setupOnce();

      expect(mockScope.setTag).toHaveBeenCalledWith('device.model', 'iPhone 13');
      expect(mockScope.setTag).toHaveBeenCalledWith('device.brand', 'Apple');
      expect(mockScope.setTag).toHaveBeenCalledWith('os.name', 'iOS');
      expect(mockScope.setTag).toHaveBeenCalledWith('os.version', '15.0');
      expect(mockScope.setTag).toHaveBeenCalledWith('language', 'zh_CN');
    });
  });

  describe('network context', () => {
    it('should fetch network type when getNetworkType is available', () => {
      mockSdk.getNetworkType = vi.fn();

      const integration = new System();
      integration.setupOnce();

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
      integration.setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'network',
        expect.objectContaining({
          type: 'wifi',
          connected: true,
        }),
      );
      expect(mockScope.setTag).toHaveBeenCalledWith('network.type', 'wifi');
    });

    it('should handle network type failure gracefully', () => {
      mockSdk.getNetworkType = vi.fn((opts: any) => {
        opts.fail();
      });

      const integration = new System();
      expect(() => integration.setupOnce()).not.toThrow();
    });

    it('should skip network context when getNetworkType is not available', () => {
      const integration = new System();
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });

  describe('location context', () => {
    it('should fetch location when getLocation is available', () => {
      mockSdk.getLocation = vi.fn();

      const integration = new System();
      integration.setupOnce();

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
      integration.setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'location',
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
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });

  describe('storage context', () => {
    it('records storage usage and warns when the quota is nearly full', () => {
      mockSdk.getStorageInfoSync = vi.fn(() => ({ currentSize: 850, limitSize: 1000 }));

      new System().setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith('storage', {
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

      new System().setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith('storage', {
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

      new System().setupOnce();
      checkForUpdate?.({ hasUpdate: false });
      expect(mockScope.setTag).not.toHaveBeenCalledWith('has_update', 'true');

      checkForUpdate?.({ hasUpdate: true });
      updateReady?.();

      expect(mockScope.setTag).toHaveBeenCalledWith('has_update', 'true');
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
      expect(() => integration.setupOnce()).not.toThrow();
    });

    it('should handle system without OS separator', () => {
      (getSystemInfo as Mock).mockReturnValueOnce({
        ...mockSystemInfo,
        system: 'Android',
      });

      const integration = new System();
      integration.setupOnce();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'os',
        expect.objectContaining({
          name: 'Android',
        }),
      );
    });

    it('swallows host SDK access errors from optional context collectors', () => {
      (sdk as Mock).mockImplementation(() => {
        throw new Error('host API unavailable');
      });

      expect(() => new System().setupOnce()).not.toThrow();
    });
  });

  describe('metadata', () => {
    it('should have correct id and name', () => {
      const integration = new System();
      expect(integration.name).toBe('System');
      expect(System.id).toBe('System');
    });

    it('creates the compatibility integration through its factory', () => {
      expect(systemIntegration()).toBeInstanceOf(System);
    });
  });
});
