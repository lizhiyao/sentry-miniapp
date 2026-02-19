import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('CrossPlatform', () => {
  let originalGlobal: any;

  beforeEach(() => {
    // 保存原始的全局对象
    originalGlobal = {
      wx: (global as any).wx,
      my: (global as any).my,
      tt: (global as any).tt,
      dd: (global as any).dd,
      qq: (global as any).qq,
      swan: (global as any).swan
    };

    // 清理全局对象
    delete (global as any).wx;
    delete (global as any).my;
    delete (global as any).tt;
    delete (global as any).dd;
    delete (global as any).qq;
    delete (global as any).swan;

    // 重置缓存的 appName - 通过重新导入模块来清理缓存
    jest.resetModules();

    jest.clearAllMocks();
  });

  afterEach(() => {
    // 恢复原始的全局对象
    (global as any).wx = originalGlobal.wx;
    (global as any).my = originalGlobal.my;
    (global as any).tt = originalGlobal.tt;
    (global as any).dd = originalGlobal.dd;
    (global as any).qq = originalGlobal.qq;
    (global as any).swan = originalGlobal.swan;
  });

  describe('getSDK', () => {
    it('should return wx SDK when available', async () => {
      const mockWx = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn(),
        onError: jest.fn()
      };
      (global as any).wx = mockWx;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockWx);
    });

    it('should return my SDK when wx not available but my is', async () => {
      const mockMy = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn()
      };
      (global as any).my = mockMy;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockMy);
    });

    it('should return tt SDK when wx and my not available but tt is', async () => {
      const mockTt = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn()
      };
      (global as any).tt = mockTt;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockTt);
    });

    it('should return dd SDK when others not available but dd is', async () => {
      const mockDd = {
        httpRequest: jest.fn(),
        getSystemInfoSync: jest.fn()
      };
      (global as any).dd = mockDd;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockDd);
    });

    it('should return qq SDK when others not available but qq is', async () => {
      const mockQq = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn()
      };
      (global as any).qq = mockQq;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockQq);
    });

    it('should return swan SDK when others not available but swan is', async () => {
      const mockSwan = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn()
      };
      (global as any).swan = mockSwan;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockSwan);
    });

    it('should throw error when no SDK available', async () => {
      const { getSDK } = await import('../src/crossPlatform');
      expect(() => getSDK()).toThrow('sentry-miniapp 暂不支持此平台');
    });
  });

  describe('getSystemInfo', () => {
    it('should return system info from getSystemInfoSync', async () => {
      const mockSystemInfo = {
        brand: 'Apple',
        model: 'iPhone 12',
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
        SDKVersion: '2.19.4'
      };

      (global as any).wx = {
        getSystemInfoSync: jest.fn().mockReturnValue(mockSystemInfo)
      };

      const { getSystemInfo } = await import('../src/crossPlatform');
      const result = getSystemInfo();
      expect(result).toEqual(mockSystemInfo);
    });

    it('should return combined info from new APIs when available', async () => {
      const mockDeviceInfo = {
        brand: 'Apple',
        model: 'iPhone 12'
      };
      const mockWindowInfo = {
        pixelRatio: 3,
        screenWidth: 390,
        screenHeight: 844,
        windowWidth: 390,
        windowHeight: 844,
        statusBarHeight: 44
      };
      const mockAppBaseInfo = {
        language: 'zh_CN',
        version: '8.0.5',
        SDKVersion: '2.19.4'
      };
      const mockSystemSetting = {
        bluetoothEnabled: true,
        locationEnabled: true,
        wifiEnabled: true
      };

      (global as any).wx = {
        getDeviceInfo: jest.fn().mockReturnValue(mockDeviceInfo),
        getWindowInfo: jest.fn().mockReturnValue(mockWindowInfo),
        getAppBaseInfo: jest.fn().mockReturnValue(mockAppBaseInfo),
        getSystemSetting: jest.fn().mockReturnValue(mockSystemSetting)
      };

      const { getSystemInfo } = await import('../src/crossPlatform');
      const result = getSystemInfo();
      expect(result).toEqual({
        brand: 'Apple',
        model: 'iPhone 12',
        pixelRatio: 3,
        screenWidth: 390,
        screenHeight: 844,
        windowWidth: 390,
        windowHeight: 844,
        statusBarHeight: 44,
        language: 'zh_CN',
        version: '8.0.5',
        SDKVersion: '2.19.4',
        bluetoothEnabled: true,
        locationEnabled: true,
        wifiEnabled: true
      });
    });

    it('should return null when no system info available', async () => {
      (global as any).wx = {};

      const { getSystemInfo } = await import('../src/crossPlatform');
      const result = getSystemInfo();
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      (global as any).wx = {
        getSystemInfoSync: jest.fn().mockImplementation(() => {
          throw new Error('System info error');
        })
      };

      const { getSystemInfo } = await import('../src/crossPlatform');
      const result = getSystemInfo();
      expect(result).toBeNull();
    });
  });

  describe('isMiniappEnvironment', () => {
    it('should return true when wx is available', async () => {
      (global as any).wx = { request: jest.fn() };
      const { isMiniappEnvironment } = await import('../src/crossPlatform');
      expect(isMiniappEnvironment()).toBe(true);
    });

    it('should return true when my is available', async () => {
      (global as any).my = { request: jest.fn() };
      const { isMiniappEnvironment } = await import('../src/crossPlatform');
      expect(isMiniappEnvironment()).toBe(true);
    });

    it('should return true when tt is available', async () => {
      (global as any).tt = { request: jest.fn() };
      const { isMiniappEnvironment } = await import('../src/crossPlatform');
      expect(isMiniappEnvironment()).toBe(true);
    });

    it('should return true when dd is available', async () => {
      (global as any).dd = { httpRequest: jest.fn() };
      const { isMiniappEnvironment } = await import('../src/crossPlatform');
      expect(isMiniappEnvironment()).toBe(true);
    });

    it('should return true when qq is available', async () => {
      (global as any).qq = { request: jest.fn() };
      const { isMiniappEnvironment } = await import('../src/crossPlatform');
      expect(isMiniappEnvironment()).toBe(true);
    });

    it('should return true when swan is available', async () => {
      (global as any).swan = { request: jest.fn() };
      const { isMiniappEnvironment } = await import('../src/crossPlatform');
      expect(isMiniappEnvironment()).toBe(true);
    });

    it('should return false when no miniapp SDK is available', async () => {
      const { isMiniappEnvironment } = await import('../src/crossPlatform');
      expect(isMiniappEnvironment()).toBe(false);
    });
  });

  describe('sdk', () => {
    it('should return cached SDK', async () => {
      const mockWx = { request: jest.fn() };
      (global as any).wx = mockWx;

      const { sdk } = await import('../src/crossPlatform');
      const result1 = sdk();
      const result2 = sdk();

      expect(result1).toBe(mockWx);
      expect(result2).toBe(result1);
    });
  });

  describe('appName', () => {
    it('should return "wechat" for wx', async () => {
      (global as any).wx = { request: jest.fn() };
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('wechat');
    });

    it('should return "alipay" for my', async () => {
      (global as any).my = { request: jest.fn() };
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('alipay');
    });

    it('should return "bytedance" for tt', async () => {
      (global as any).tt = { request: jest.fn() };
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('bytedance');
    });

    it('should return "dingtalk" for dd', async () => {
      (global as any).dd = { httpRequest: jest.fn() };
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('dingtalk');
    });

    it('should return "qq" for qq', async () => {
      (global as any).qq = { request: jest.fn() };
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('qq');
    });

    it('should return "swan" for swan', async () => {
      (global as any).swan = { request: jest.fn() };
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('swan');
    });

    it('should return "unknown" when no SDK available', async () => {
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('unknown');
    });

    it('should cache app name', async () => {
      (global as any).wx = { request: jest.fn() };

      const { appName } = await import('../src/crossPlatform');
      const result1 = appName();
      delete (global as any).wx;
      const result2 = appName();

      expect(result1).toBe('wechat');
      expect(result2).toBe('wechat'); // Should return cached value
    });
  });
});