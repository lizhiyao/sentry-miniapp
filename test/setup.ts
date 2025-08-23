// Jest setup file for Sentry Miniapp SDK tests

// Mock miniapp global objects
(global as any).wx = {
  request: jest.fn(),
  getSystemInfo: jest.fn(),
  getSystemInfoSync: jest.fn(() => ({
    // 已弃用，保留兼容性
    platform: 'devtools',
    version: '8.0.5',
    SDKVersion: '2.19.4',
    system: 'iOS 15.0',
    model: 'iPhone 13'
  })),
  // 新的 API
  getDeviceInfo: jest.fn(() => ({
    brand: 'Apple',
    model: 'iPhone 13',
    system: 'iOS 15.0',
    platform: 'ios'
  })),
  getWindowInfo: jest.fn(() => ({
    pixelRatio: 3,
    screenWidth: 390,
    screenHeight: 844,
    windowWidth: 390,
    windowHeight: 844,
    statusBarHeight: 44
  })),
  getAppBaseInfo: jest.fn(() => ({
    SDKVersion: '2.19.4',
    version: '8.0.5',
    language: 'zh_CN',
    fontSizeSetting: 16
  })),
  getSystemSetting: jest.fn(() => ({
    bluetoothEnabled: true,
    locationEnabled: true,
    wifiEnabled: true
  })),
  getAppAuthorizeSetting: jest.fn(() => ({
    albumAuthorized: 'authorized',
    cameraAuthorized: 'authorized',
    locationAuthorized: 'authorized',
    microphoneAuthorized: 'authorized',
    notificationAuthorized: 'authorized'
  })),
  onError: jest.fn(),
  onUnhandledRejection: jest.fn(),
  showModal: jest.fn()
} as any;

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn()
};

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now())
} as any;

// Mock Date.now for consistent timestamps in tests
const mockDateNow = jest.fn(() => 1640995200000); // 2022-01-01 00:00:00 UTC
Date.now = mockDateNow;