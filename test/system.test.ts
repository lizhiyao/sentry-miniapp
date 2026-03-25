import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getCurrentScope } from '@sentry/core';
import { System } from '../src/integrations/system';

// Mock @sentry/core
jest.mock('@sentry/core', () => ({
  getCurrentScope: jest.fn(),
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

jest.mock('../src/crossPlatform', () => ({
  getSystemInfo: jest.fn(() => mockSystemInfo),
  sdk: jest.fn(() => mockSdk),
}));

describe('System', () => {
  let mockScope: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockScope = {
      setContext: jest.fn(),
      setTag: jest.fn(),
    };
    (getCurrentScope as jest.Mock).mockReturnValue(mockScope);

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
      mockSdk.getNetworkType = jest.fn();

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
      mockSdk.getNetworkType = jest.fn((opts: any) => {
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
      mockSdk.getNetworkType = jest.fn((opts: any) => {
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
      mockSdk.getLocation = jest.fn();

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
      mockSdk.getLocation = jest.fn((opts: any) => {
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
      mockSdk.getLocation = jest.fn((opts: any) => {
        opts.fail();
      });

      const integration = new System();
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle getSystemInfo returning null', () => {
      const { getSystemInfo } = require('../src/crossPlatform');
      (getSystemInfo as jest.Mock).mockReturnValueOnce(null);

      const integration = new System();
      expect(() => integration.setupOnce()).not.toThrow();
    });

    it('should handle system without OS separator', () => {
      const { getSystemInfo } = require('../src/crossPlatform');
      (getSystemInfo as jest.Mock).mockReturnValueOnce({
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
  });

  describe('metadata', () => {
    it('should have correct id and name', () => {
      const integration = new System();
      expect(integration.name).toBe('System');
      expect(System.id).toBe('System');
    });
  });
});
