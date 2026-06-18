// Jest setup file for Sentry Miniapp SDK tests
import { resetPlatformCache } from '../src/crossPlatform';

// 所有平台全局：每个用例前后统一清理，杜绝跨用例残留导致 detectPlatform 串味。
const PLATFORM_GLOBALS = ['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks'];

// 默认 wx（微信）平台 mock。注意：detectPlatform 按 PLATFORMS 顺序、wx 优先命中，
// 因此只要 global.wx 存在，平台恒为 wechat。要测非 wx 平台（支付宝 my / 字节 tt 等），
// 用例需在自己的 beforeEach 里 `delete (global as any).wx` 再注入目标平台全局——
// 本文件的 beforeEach 先执行、用例的 beforeEach 后执行覆盖，故清除生效。
function makeDefaultWx(): any {
  return {
    request: jest.fn(),
    getSystemInfo: jest.fn(),
    getSystemInfoSync: jest.fn(() => ({
      // 已弃用，保留兼容性
      platform: 'devtools',
      version: '8.0.5',
      SDKVersion: '2.19.4',
      system: 'iOS 15.0',
      model: 'iPhone 13',
    })),
    // 新的 API
    getDeviceInfo: jest.fn(() => ({
      brand: 'Apple',
      model: 'iPhone 13',
      system: 'iOS 15.0',
      platform: 'ios',
    })),
    getWindowInfo: jest.fn(() => ({
      pixelRatio: 3,
      screenWidth: 390,
      screenHeight: 844,
      windowWidth: 390,
      windowHeight: 844,
      statusBarHeight: 44,
    })),
    getAppBaseInfo: jest.fn(() => ({
      SDKVersion: '2.19.4',
      version: '8.0.5',
      language: 'zh_CN',
      fontSizeSetting: 16,
    })),
    getSystemSetting: jest.fn(() => ({
      bluetoothEnabled: true,
      locationEnabled: true,
      wifiEnabled: true,
    })),
    getAppAuthorizeSetting: jest.fn(() => ({
      albumAuthorized: 'authorized',
      cameraAuthorized: 'authorized',
      locationAuthorized: 'authorized',
      microphoneAuthorized: 'authorized',
      notificationAuthorized: 'authorized',
    })),
    onError: jest.fn(),
    onUnhandledRejection: jest.fn(),
    showModal: jest.fn(),
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
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
};

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now()),
} as any;

// Mock Date.now for consistent timestamps in tests
const mockDateNow = jest.fn(() => 1640995200000); // 2022-01-01 00:00:00 UTC
Date.now = mockDateNow;
