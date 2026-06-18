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
      swan: (global as any).swan,
      ks: (global as any).ks,
    };

    // 清理全局对象
    delete (global as any).wx;
    delete (global as any).my;
    delete (global as any).tt;
    delete (global as any).dd;
    delete (global as any).qq;
    delete (global as any).swan;
    delete (global as any).ks;

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
    (global as any).ks = originalGlobal.ks;
  });

  describe('getSDK', () => {
    it('should return wx SDK when available', async () => {
      const mockWx = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn(),
        onError: jest.fn(),
      };
      (global as any).wx = mockWx;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockWx);
    });

    it('多个平台全局对象共存时，按 PLATFORMS 顺序 first-match（wx 优先于 my）', async () => {
      const mockWx = { request: jest.fn() };
      const mockMy = { request: jest.fn() };
      (global as any).wx = mockWx;
      (global as any).my = mockMy;

      const { getSDK, appName, detectPlatform } = await import('../src/crossPlatform');
      expect(getSDK()).toBe(mockWx);
      expect(appName()).toBe('wechat');
      expect(detectPlatform()?.name).toBe('wechat');
    });

    it('should return my SDK when wx not available but my is', async () => {
      const mockMy = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn(),
      };
      (global as any).my = mockMy;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockMy);
    });

    it('should return tt SDK when wx and my not available but tt is', async () => {
      const mockTt = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn(),
      };
      (global as any).tt = mockTt;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockTt);
    });

    it('should return dd SDK when others not available but dd is', async () => {
      const mockDd = {
        httpRequest: jest.fn(),
        getSystemInfoSync: jest.fn(),
      };
      (global as any).dd = mockDd;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockDd);
    });

    it('should return qq SDK when others not available but qq is', async () => {
      const mockQq = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn(),
      };
      (global as any).qq = mockQq;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockQq);
    });

    it('should return swan SDK when others not available but swan is', async () => {
      const mockSwan = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn(),
      };
      (global as any).swan = mockSwan;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockSwan);
    });

    it('should return ks SDK when others not available but ks is', async () => {
      const mockKs = {
        request: jest.fn(),
      };
      (global as any).ks = mockKs;

      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBe(mockKs);
    });

    it('should return fallback SDK when no platform available', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { getSDK } = await import('../src/crossPlatform');
      const result = getSDK();
      expect(result).toBeDefined();
      expect(typeof result.request).toBe('function');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('未检测到已支持的小程序平台'),
      );
      consoleSpy.mockRestore();
    });

    it('should suggest @sentry/browser when running in a browser/H5 environment', async () => {
      const originalWindow = (global as any).window;
      const originalDocument = (global as any).document;
      (global as any).window = {};
      (global as any).document = {};

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const { getSDK } = await import('../src/crossPlatform');
        const result = getSDK();
        expect(result).toBeDefined();
        expect(typeof result.request).toBe('function');
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const message = (consoleSpy.mock.calls[0] as unknown[])[0] as string;
        expect(message).toContain('浏览器/H5 环境');
        expect(message).toContain('@sentry/browser');
        expect(message).not.toContain('未检测到已支持的小程序平台');
      } finally {
        consoleSpy.mockRestore();
        if (originalWindow === undefined) {
          delete (global as any).window;
        } else {
          (global as any).window = originalWindow;
        }
        if (originalDocument === undefined) {
          delete (global as any).document;
        } else {
          (global as any).document = originalDocument;
        }
      }
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
        SDKVersion: '2.19.4',
      };

      (global as any).wx = {
        getSystemInfoSync: jest.fn().mockReturnValue(mockSystemInfo),
      };

      const { getSystemInfo } = await import('../src/crossPlatform');
      const result = getSystemInfo();
      expect(result).toEqual(mockSystemInfo);
    });

    it('should return combined info from new APIs when available', async () => {
      const mockDeviceInfo = {
        brand: 'Apple',
        model: 'iPhone 12',
      };
      const mockWindowInfo = {
        pixelRatio: 3,
        screenWidth: 390,
        screenHeight: 844,
        windowWidth: 390,
        windowHeight: 844,
        statusBarHeight: 44,
      };
      const mockAppBaseInfo = {
        language: 'zh_CN',
        version: '8.0.5',
        SDKVersion: '2.19.4',
      };
      const mockSystemSetting = {
        bluetoothEnabled: true,
        locationEnabled: true,
        wifiEnabled: true,
      };

      (global as any).wx = {
        getDeviceInfo: jest.fn().mockReturnValue(mockDeviceInfo),
        getWindowInfo: jest.fn().mockReturnValue(mockWindowInfo),
        getAppBaseInfo: jest.fn().mockReturnValue(mockAppBaseInfo),
        getSystemSetting: jest.fn().mockReturnValue(mockSystemSetting),
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
        wifiEnabled: true,
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
        }),
      };

      const { getSystemInfo } = await import('../src/crossPlatform');
      const result = getSystemInfo();
      expect(result).toBeNull();
    });

    it('记忆化：多次调用只计算一次，resetPlatformCache 后重新计算', async () => {
      const sync = jest.fn().mockReturnValue({ brand: 'X', SDKVersion: '1' });
      (global as any).wx = { getSystemInfoSync: sync };

      const { getSystemInfo, resetPlatformCache } = await import('../src/crossPlatform');
      getSystemInfo();
      getSystemInfo();
      expect(sync).toHaveBeenCalledTimes(1); // 第二次走缓存

      resetPlatformCache();
      getSystemInfo();
      expect(sync).toHaveBeenCalledTimes(2); // 清缓存后重算
    });

    it('null 结果不缓存：下次调用重试（瞬时失败可自愈）', async () => {
      let call = 0;
      const sync = jest.fn().mockImplementation(() => {
        call += 1;
        if (call === 1) throw new Error('transient'); // 首次失败 → computeSystemInfo 返回 null
        return { brand: 'Y', SDKVersion: '2' };
      });
      (global as any).wx = { getSystemInfoSync: sync };

      const { getSystemInfo } = await import('../src/crossPlatform');
      expect(getSystemInfo()).toBeNull(); // 首次失败，不缓存
      expect(getSystemInfo()).toEqual({ brand: 'Y', SDKVersion: '2' }); // 重试成功
      expect(sync).toHaveBeenCalledTimes(2);
    });

    it('新分体 API 返回空壳（无 brand/model/system）时回退 getSystemInfoSync', async () => {
      const sync = jest.fn().mockReturnValue({
        brand: 'Xiaomi',
        model: 'MI 9',
        system: 'Android 10',
        platform: 'android',
        SDKVersion: '3.0',
      });
      (global as any).wx = {
        // 部分非微信端：方法存在却返回空壳 {}
        getDeviceInfo: jest.fn().mockReturnValue({}),
        getWindowInfo: jest.fn().mockReturnValue({}),
        getAppBaseInfo: jest.fn().mockReturnValue({}),
        getSystemInfoSync: sync,
      };

      const { getSystemInfo } = await import('../src/crossPlatform');
      const result = getSystemInfo();
      // 修复前：新 API 存在即采纳空壳 → system/brand 全 undefined；修复后回退 sync 取真实数据
      expect(result?.system).toBe('Android 10');
      expect(result?.brand).toBe('Xiaomi');
      expect(sync).toHaveBeenCalled();
    });
  });

  describe('getAccountInfo', () => {
    it('记忆化：多次调用只取一次 getAccountInfoSync，resetPlatformCache 后重新取', async () => {
      const getAccountInfoSync = jest.fn().mockReturnValue({
        miniProgram: { appId: 'wxabc', version: '1.2.3' },
      });
      (global as any).wx = { getAccountInfoSync };

      const { getAccountInfo, resetPlatformCache } = await import('../src/crossPlatform');
      expect(getAccountInfo()).toEqual({ appId: 'wxabc', version: '1.2.3' });
      getAccountInfo();
      getAccountInfo();
      // 修复前 HttpContext 每事件取两次（appName + appVersion）；现统一记忆化 → 仅一次
      expect(getAccountInfoSync).toHaveBeenCalledTimes(1);

      resetPlatformCache();
      getAccountInfo();
      expect(getAccountInfoSync).toHaveBeenCalledTimes(2);
    });

    it('全 unknown 不缓存：下次调用重试（API 未就绪可自愈）', async () => {
      let call = 0;
      const getAccountInfoSync = jest.fn().mockImplementation(() => {
        call += 1;
        if (call === 1) throw new Error('not ready');
        return { miniProgram: { appId: 'wxnew', version: '9' } };
      });
      (global as any).wx = { getAccountInfoSync };

      const { getAccountInfo } = await import('../src/crossPlatform');
      expect(getAccountInfo()).toEqual({ appId: 'unknown', version: 'unknown' }); // 首次失败不缓存
      expect(getAccountInfo()).toEqual({ appId: 'wxnew', version: '9' }); // 重试成功
      expect(getAccountInfoSync).toHaveBeenCalledTimes(2);
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

    it('should return true when ks is available', async () => {
      (global as any).ks = { request: jest.fn() };
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

  describe('now（时长时钟用 Date.now，避开 Performance.now 单位歧义，见 issue #167）', () => {
    it('返回 Date.now()，完全不受 getPerformance().now() 单位影响', async () => {
      // 真机 perf.now() 可能返回微秒（5_000_000）、开发者工具返回毫秒——一律忽略，避免 1000× 偏差。
      (global as any).wx = {
        request: jest.fn(),
        getPerformance: jest.fn(() => ({ now: jest.fn(() => 5_000_000) })),
      };

      const { now } = await import('../src/crossPlatform');
      // = Date.now() 的固定 mock，而非 5_000_000（微秒）或 5000（误除 1000）
      expect(now()).toBe(1640995200000);
    });

    it('与 epochNow() 一致（均为墙钟 epoch 毫秒）', async () => {
      (global as any).wx = { request: jest.fn() };

      const { now, epochNow } = await import('../src/crossPlatform');
      expect(now()).toBe(epochNow());
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

    it('should return "kuaishou" for ks', async () => {
      (global as any).ks = { request: jest.fn() };
      const { appName } = await import('../src/crossPlatform');
      expect(appName()).toBe('kuaishou');
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

  describe('Storage API wrapping for Alipay/DingTalk', () => {
    it('should wrap getStorageSync for Alipay (my)', async () => {
      const originalGet = jest.fn().mockImplementation((opts: any) => {
        return { data: `value_for_${opts.key}` };
      });
      const originalSet = jest.fn();
      const originalRemove = jest.fn();
      (global as any).my = {
        request: jest.fn(),
        getStorageSync: originalGet,
        setStorageSync: originalSet,
        removeStorageSync: originalRemove,
      };

      const { sdk } = await import('../src/crossPlatform');
      const s = sdk();

      // getStorageSync should be wrapped to accept string key
      const result = s.getStorageSync!('test_key');
      expect(result).toBe('value_for_test_key');
    });

    it('should wrap setStorageSync for Alipay (my)', async () => {
      const originalSet = jest.fn();
      (global as any).my = {
        request: jest.fn(),
        setStorageSync: originalSet,
      };

      const { sdk } = await import('../src/crossPlatform');
      const s = sdk();

      s.setStorageSync!('test_key', 'test_value');
      expect(originalSet).toHaveBeenCalledWith({ key: 'test_key', data: 'test_value' });
    });

    it('should wrap removeStorageSync for Alipay (my)', async () => {
      const originalRemove = jest.fn();
      (global as any).my = {
        request: jest.fn(),
        removeStorageSync: originalRemove,
      };

      const { sdk } = await import('../src/crossPlatform');
      const s = sdk();

      s.removeStorageSync!('test_key');
      expect(originalRemove).toHaveBeenCalledWith({ key: 'test_key' });
    });

    it('should wrap storage APIs for DingTalk (dd)', async () => {
      const originalGet = jest.fn().mockImplementation((opts: any) => {
        return { data: `dd_value_for_${opts.key}` };
      });
      const originalSet = jest.fn();
      (global as any).dd = {
        httpRequest: jest.fn(),
        getStorageSync: originalGet,
        setStorageSync: originalSet,
      };

      const { sdk } = await import('../src/crossPlatform');
      const s = sdk();

      const result = s.getStorageSync!('dd_key');
      expect(result).toBe('dd_value_for_dd_key');

      s.setStorageSync!('dd_key', 'dd_value');
      expect(originalSet).toHaveBeenCalledWith({ key: 'dd_key', data: 'dd_value' });
    });

    it('包装幂等：sdk() 与 getSystemInfo() 都触发 getSDK，storage 不被二次包装', async () => {
      // 用内存 store 模拟支付宝对象参数式存储，验证 round-trip
      const store: Record<string, any> = {};
      (global as any).my = {
        request: jest.fn(),
        getSystemInfoSync: jest.fn(() => ({ brand: 'X', version: '1' })),
        getStorageSync: jest.fn((opts: any) =>
          opts.key in store ? { data: store[opts.key] } : null,
        ),
        setStorageSync: jest.fn((opts: any) => {
          store[opts.key] = opts.data;
        }),
      };

      const { sdk, getSystemInfo } = await import('../src/crossPlatform');

      // 两条路径都会调用 getSDK()：sdk() 缓存一次；getSystemInfo()→computeSystemInfo 再调一次。
      // 修复前第二次会在同一个 my 上二次包装 storage，内层收到嵌套 { key: { key } } 致读写错位。
      const s = sdk();
      getSystemInfo();

      s.setStorageSync!('sentry_offline_store', '[1,2,3]');
      expect(store['sentry_offline_store']).toBe('[1,2,3]'); // 写未嵌套
      expect(s.getStorageSync!('sentry_offline_store')).toBe('[1,2,3]'); // 读拿得出
    });
  });
});
