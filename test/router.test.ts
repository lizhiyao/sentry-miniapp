import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Router, routerIntegration } from '../src/integrations/router';
import { addBreadcrumb, getCurrentScope } from '@sentry/core';

// Mock Sentry core functions
jest.mock('@sentry/core', () => ({
  addBreadcrumb: jest.fn(),
  getCurrentScope: jest.fn(() => ({
    setTag: jest.fn(),
    setContext: jest.fn(),
  })),
}));

// Mock crossPlatform sdk
const mockSdk: any = {};
jest.mock('../src/crossPlatform', () => ({
  sdk: jest.fn(() => mockSdk),
}));

import { sdk as sdkFn } from '../src/crossPlatform';

describe('Router Integration', () => {
  let router: Router;

  let originalSetInterval: any;
  let mockScope: any;

  beforeEach(() => {
    router = new Router();

    // Save original setInterval
    originalSetInterval = global.setInterval;

    // Create mock scope
    mockScope = {
      setTag: jest.fn(),
      setContext: jest.fn(),
    };

    // Mock getCurrentScope
    (getCurrentScope as jest.Mock).mockReturnValue(mockScope);

    // Set up mock SDK with wx-like APIs
    mockSdk.navigateTo = jest.fn();
    mockSdk.redirectTo = jest.fn();
    mockSdk.switchTab = jest.fn();
    mockSdk.navigateBack = jest.fn();
    mockSdk.reLaunch = jest.fn();

    // Mock getCurrentPages on globalThis
    (globalThis as any).getCurrentPages = jest.fn(() => [
      { route: 'pages/index/index' },
      { route: 'pages/detail/detail' },
    ]);

    // Mock setInterval to avoid actual timing
    (global as any).setInterval = jest.fn();

    jest.clearAllMocks();

    // Re-setup mockSdk methods after clearAllMocks
    mockSdk.navigateTo = jest.fn();
    mockSdk.redirectTo = jest.fn();
    mockSdk.switchTab = jest.fn();
    mockSdk.navigateBack = jest.fn();
    mockSdk.reLaunch = jest.fn();

    (getCurrentScope as jest.Mock).mockReturnValue(mockScope);
    (sdkFn as jest.Mock).mockReturnValue(mockSdk);
    (globalThis as any).getCurrentPages = jest.fn(() => [
      { route: 'pages/index/index' },
      { route: 'pages/detail/detail' },
    ]);
    (global as any).setInterval = jest.fn();
  });

  afterEach(() => {
    // Restore original setInterval and clean up
    delete (globalThis as any).getCurrentPages;
    (global as any).setInterval = originalSetInterval;

    // Clean up mockSdk
    Object.keys(mockSdk).forEach((key) => {
      delete mockSdk[key];
    });
  });

  describe('basic properties', () => {
    it('should have correct id and name', () => {
      expect(Router.id).toBe('Router');
      expect(router.name).toBe('Router');
    });

    it('should have setupOnce method', () => {
      expect(typeof router.setupOnce).toBe('function');
    });
  });

  describe('setupOnce', () => {
    it('should instrument navigation functions and start monitoring', () => {
      router.setupOnce();

      // Check that setInterval was called for route monitoring
      expect((global as any).setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it('should instrument navigateTo', () => {
      const originalNavigateTo = mockSdk.navigateTo;
      router.setupOnce();

      // Check that navigateTo was wrapped
      expect(mockSdk.navigateTo).not.toBe(originalNavigateTo);

      // Test the wrapped function
      const options = { url: '/pages/test/test' };
      mockSdk.navigateTo(options);

      expect(originalNavigateTo).toHaveBeenCalledWith(options);
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          action: 'navigateTo',
          from: 'pages/detail/detail',
          to: '/pages/test/test',
          delta: undefined,
        },
        message: 'Navigation navigateTo: pages/detail/detail -> /pages/test/test',
        type: 'navigation',
      });
    });

    it('should instrument redirectTo', () => {
      const originalRedirectTo = mockSdk.redirectTo;
      router.setupOnce();

      const options = { url: '/pages/redirect/redirect' };
      mockSdk.redirectTo(options);

      expect(originalRedirectTo).toHaveBeenCalledWith(options);
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          action: 'redirectTo',
          from: 'pages/detail/detail',
          to: '/pages/redirect/redirect',
          delta: undefined,
        },
        message: 'Navigation redirectTo: pages/detail/detail -> /pages/redirect/redirect',
        type: 'navigation',
      });
    });

    it('should instrument switchTab', () => {
      const originalSwitchTab = mockSdk.switchTab;
      router.setupOnce();

      const options = { url: '/pages/tab/tab' };
      mockSdk.switchTab(options);

      expect(originalSwitchTab).toHaveBeenCalledWith(options);
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          action: 'switchTab',
          from: 'pages/detail/detail',
          to: '/pages/tab/tab',
          delta: undefined,
        },
        message: 'Navigation switchTab: pages/detail/detail -> /pages/tab/tab',
        type: 'navigation',
      });
    });

    it('should instrument navigateBack', () => {
      const originalNavigateBack = mockSdk.navigateBack;
      router.setupOnce();

      const options = { delta: 2 };
      mockSdk.navigateBack(options);

      expect(originalNavigateBack).toHaveBeenCalledWith(options);
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          action: 'navigateBack',
          from: 'pages/detail/detail',
          to: 'back',
          delta: 2,
        },
        message: 'Navigation navigateBack: pages/detail/detail -> back',
        type: 'navigation',
      });
    });

    it('should instrument navigateBack with default options', () => {
      const originalNavigateBack = mockSdk.navigateBack;
      router.setupOnce();

      mockSdk.navigateBack();

      expect(originalNavigateBack).toHaveBeenCalledWith({});
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          action: 'navigateBack',
          from: 'pages/detail/detail',
          to: 'back',
          delta: undefined,
        },
        message: 'Navigation navigateBack: pages/detail/detail -> back',
        type: 'navigation',
      });
    });

    it('should instrument reLaunch', () => {
      const originalReLaunch = mockSdk.reLaunch;
      router.setupOnce();

      const options = { url: '/pages/relaunch/relaunch' };
      mockSdk.reLaunch(options);

      expect(originalReLaunch).toHaveBeenCalledWith(options);
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          action: 'reLaunch',
          from: 'pages/detail/detail',
          to: '/pages/relaunch/relaunch',
          delta: undefined,
        },
        message: 'Navigation reLaunch: pages/detail/detail -> /pages/relaunch/relaunch',
        type: 'navigation',
      });
    });

    it('should handle sdk() throwing gracefully', () => {
      (sdkFn as jest.Mock).mockImplementation(() => {
        throw new Error('sentry-miniapp 暂不支持此平台');
      });

      expect(() => router.setupOnce()).not.toThrow();
    });

    it('should handle SDK with missing methods gracefully', () => {
      // Clear all methods from mockSdk
      Object.keys(mockSdk).forEach((key) => {
        delete mockSdk[key];
      });

      expect(() => router.setupOnce()).not.toThrow();
    });
  });

  describe('route monitoring', () => {
    it('should monitor route changes', () => {
      router.setupOnce();

      // Get the interval callback
      const setIntervalMock = (global as any).setInterval as jest.Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      // Simulate route change
      ((globalThis as any).getCurrentPages as jest.Mock).mockReturnValue([
        { route: 'pages/index/index' },
        { route: 'pages/new/new' },
      ]);

      // Execute the interval callback
      intervalCallback();

      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          from: '',
          to: 'pages/new/new',
        },
        message: 'Route changed:  -> pages/new/new',
        type: 'navigation',
      });

      expect(mockScope.setTag).toHaveBeenCalledWith('route', 'pages/new/new');
      expect(mockScope.setContext).toHaveBeenCalledWith('route', {
        current: 'pages/new/new',
        previous: '',
        timestamp: expect.any(Number),
      });
    });

    it('should not trigger route change for same route', () => {
      router.setupOnce();

      const setIntervalMock = (global as any).setInterval as jest.Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      // Execute callback first time to establish current route
      intervalCallback();
      const firstCallCount = (addBreadcrumb as jest.Mock).mock.calls.length;

      // Execute callback again with same route
      intervalCallback();

      // Should not add additional breadcrumb for same route
      expect(addBreadcrumb).toHaveBeenCalledTimes(firstCallCount);
    });

    it('should handle getCurrentPages errors gracefully', () => {
      ((globalThis as any).getCurrentPages as jest.Mock).mockImplementation(() => {
        throw new Error('getCurrentPages error');
      });

      router.setupOnce();
      const setIntervalMock = (global as any).setInterval as jest.Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      expect(() => intervalCallback()).not.toThrow();
    });

    it('should handle empty pages array', () => {
      ((globalThis as any).getCurrentPages as jest.Mock).mockReturnValue([]);

      router.setupOnce();
      const setIntervalMock = (global as any).setInterval as jest.Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      expect(() => intervalCallback()).not.toThrow();
    });

    it('should handle pages with __route__ property', () => {
      ((globalThis as any).getCurrentPages as jest.Mock).mockReturnValue([
        { __route__: 'pages/legacy/legacy' },
      ]);

      router.setupOnce();
      const setIntervalMock = (global as any).setInterval as jest.Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      intervalCallback();

      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          from: '',
          to: 'pages/legacy/legacy',
        },
        message: 'Route changed:  -> pages/legacy/legacy',
        type: 'navigation',
      });
    });

    it('should handle missing getCurrentPages function', () => {
      delete (globalThis as any).getCurrentPages;

      router.setupOnce();
      const setIntervalMock = (global as any).setInterval as jest.Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      expect(() => intervalCallback()).not.toThrow();
    });
  });

  describe('navigation recording', () => {
    beforeEach(() => {
      router.setupOnce();
    });

    it('should set correct tags and context for navigation', () => {
      const options = { url: '/pages/test/test' };
      mockSdk.navigateTo(options);

      expect(mockScope.setTag).toHaveBeenCalledWith('route', '/pages/test/test');
      expect(mockScope.setContext).toHaveBeenCalledWith('navigation', {
        action: 'navigateTo',
        from: 'pages/detail/detail',
        to: '/pages/test/test',
        delta: undefined,
        timestamp: expect.any(Number),
      });
    });

    it('should set correct tags for navigateBack', () => {
      mockSdk.navigateBack({ delta: 1 });

      expect(mockScope.setTag).toHaveBeenCalledWith('route', 'pages/detail/detail');
      expect(mockScope.setContext).toHaveBeenCalledWith('navigation', {
        action: 'navigateBack',
        from: 'pages/detail/detail',
        to: 'back',
        delta: 1,
        timestamp: expect.any(Number),
      });
    });
  });

  describe('non-wx platform support (Alipay)', () => {
    it('should instrument navigation on Alipay SDK (my)', () => {
      // Set up an Alipay-like SDK
      const alipayNavigateTo = jest.fn();
      const alipaySdk = {
        navigateTo: alipayNavigateTo,
        redirectTo: jest.fn(),
        switchTab: jest.fn(),
        navigateBack: jest.fn(),
        reLaunch: jest.fn(),
      };

      (sdkFn as jest.Mock).mockReturnValue(alipaySdk);

      const alipayRouter = new Router();
      alipayRouter.setupOnce();

      // navigateTo should have been wrapped
      expect(alipaySdk.navigateTo).not.toBe(alipayNavigateTo);

      // Call the wrapped method
      const options = { url: '/pages/alipay/home' };
      alipaySdk.navigateTo(options);

      // Original should have been called
      expect(alipayNavigateTo).toHaveBeenCalledWith(options);

      // Breadcrumb should have been recorded
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        data: {
          action: 'navigateTo',
          from: 'pages/detail/detail',
          to: '/pages/alipay/home',
          delta: undefined,
        },
        message: 'Navigation navigateTo: pages/detail/detail -> /pages/alipay/home',
        type: 'navigation',
      });
    });
  });

  describe('routerIntegration factory', () => {
    it('should create a new Router instance', () => {
      const integration = routerIntegration();
      expect(integration).toBeInstanceOf(Router);
      expect(integration.name).toBe('Router');
    });

    it('should create different instances on multiple calls', () => {
      const integration1 = routerIntegration();
      const integration2 = routerIntegration();
      expect(integration1).not.toBe(integration2);
      expect(integration1).toBeInstanceOf(Router);
      expect(integration2).toBeInstanceOf(Router);
    });
  });
});
