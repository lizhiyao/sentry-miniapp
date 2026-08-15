// Vitest setup file for Sentry Miniapp SDK tests
import { afterEach, beforeEach, vi } from 'vitest';

import { resetPlatformCache } from '../src/crossPlatform';

// 所有平台全局：每个用例前后统一清理，杜绝跨用例残留导致 detectPlatform 串味。
const PLATFORM_GLOBALS = ['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks'];

// 默认 wx（微信）平台 mock。多平台对象共存但没有平台专属宿主信息时，detectPlatform
// 会按 PLATFORMS 顺序回退到 wx。要隔离验证非 wx 路径，测试仍应清掉默认 wx。
function makeDefaultWx(): any {
  return {
    request: vi.fn(),
    getSystemInfo: vi.fn(),
    getSystemInfoSync: vi.fn(() => ({
      // 已弃用，保留兼容性
      platform: 'devtools',
      version: '8.0.5',
      SDKVersion: '2.19.4',
      system: 'iOS 15.0',
      model: 'iPhone 13',
    })),
    // 新的 API
    getDeviceInfo: vi.fn(() => ({
      brand: 'Apple',
      model: 'iPhone 13',
      system: 'iOS 15.0',
      platform: 'ios',
    })),
    getWindowInfo: vi.fn(() => ({
      pixelRatio: 3,
      screenWidth: 390,
      screenHeight: 844,
      windowWidth: 390,
      windowHeight: 844,
      statusBarHeight: 44,
    })),
    getAppBaseInfo: vi.fn(() => ({
      SDKVersion: '2.19.4',
      version: '8.0.5',
      language: 'zh_CN',
      fontSizeSetting: 16,
    })),
    getSystemSetting: vi.fn(() => ({
      bluetoothEnabled: true,
      locationEnabled: true,
      wifiEnabled: true,
    })),
    getAppAuthorizeSetting: vi.fn(() => ({
      albumAuthorized: 'authorized',
      cameraAuthorized: 'authorized',
      locationAuthorized: 'authorized',
      microphoneAuthorized: 'authorized',
      notificationAuthorized: 'authorized',
    })),
    onError: vi.fn(),
    onUnhandledRejection: vi.fn(),
    showModal: vi.fn(),
  };
}

beforeEach(() => {
  // 每个用例从干净、确定的平台状态开始：清掉所有平台全局 + 平台检测缓存，再注入默认 wx。
  // 这样既不被上个用例设的 my/tt 等串味，也消除 sdk()/appName 缓存跨用例的陈旧读取。
  for (const k of PLATFORM_GLOBALS) {
    delete (global as any)[k];
  }
  resetPlatformCache();
  (global as any).wx = makeDefaultWx();
});

afterEach(() => {
  for (const k of PLATFORM_GLOBALS) {
    delete (global as any)[k];
  }
  resetPlatformCache();
});

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
};

// Mock performance API
global.performance = {
  now: vi.fn(() => Date.now()),
} as any;

// Mock Date.now for consistent timestamps in tests
const mockDateNow = vi.fn(() => 1640995200000); // 2022-01-01 00:00:00 UTC
Date.now = mockDateNow;
