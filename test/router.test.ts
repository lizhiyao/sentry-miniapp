import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { Router } from '../src/integrations/router';
import { addBreadcrumb, getClient, getCurrentScope } from '@sentry/core';

// Mock Sentry core functions
vi.mock('@sentry/core', () => ({
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => undefined),
  getCurrentScope: vi.fn(() => ({
    setTag: vi.fn(),
    setContext: vi.fn(),
  })),
}));

// Mock crossPlatform sdk
const mockSdk: any = {};
vi.mock('../src/crossPlatform', () => ({
  sdk: vi.fn(() => mockSdk),
}));

import { sdk as sdkFn } from '../src/crossPlatform';

function setupRouter(router: Router): void {
  const client = { registerCleanup: vi.fn() } as any;
  vi.mocked(getClient).mockReturnValue(client);
  router.setup(client);
}

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
      setTag: vi.fn(),
      setContext: vi.fn(),
    };

    // Mock getCurrentScope
    (getCurrentScope as Mock).mockReturnValue(mockScope);

    // Set up mock SDK with wx-like APIs
    mockSdk.navigateTo = vi.fn();
    mockSdk.redirectTo = vi.fn();
    mockSdk.switchTab = vi.fn();
    mockSdk.navigateBack = vi.fn();
    mockSdk.reLaunch = vi.fn();

    // Mock getCurrentPages on globalThis
    (globalThis as any).getCurrentPages = vi.fn(() => [
      { route: 'pages/index/index' },
      { route: 'pages/detail/detail' },
    ]);

    // Mock setInterval to avoid actual timing
    (global as any).setInterval = vi.fn();
    vi.mocked(getClient).mockReturnValue(undefined);

    vi.clearAllMocks();

    // Re-setup mockSdk methods after clearAllMocks
    mockSdk.navigateTo = vi.fn();
    mockSdk.redirectTo = vi.fn();
    mockSdk.switchTab = vi.fn();
    mockSdk.navigateBack = vi.fn();
    mockSdk.reLaunch = vi.fn();

    (getCurrentScope as Mock).mockReturnValue(mockScope);
    (sdkFn as Mock).mockReturnValue(mockSdk);
    (globalThis as any).getCurrentPages = vi.fn(() => [
      { route: 'pages/index/index' },
      { route: 'pages/detail/detail' },
    ]);
    (global as any).setInterval = vi.fn();
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

    it('should clear its route monitor during cleanup', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => {});
      ((global as any).setInterval as Mock).mockReturnValue(123 as any);

      try {
        setupRouter(router);
        router.cleanup();

        expect(clearIntervalSpy).toHaveBeenCalledWith(123);
      } finally {
        clearIntervalSpy.mockRestore();
      }
    });

    it('registers cleanup through the official client lifecycle', () => {
      const registerCleanup = vi.fn();

      router.setup({ registerCleanup } as any);
      router.setup({ registerCleanup } as any);

      expect(registerCleanup).toHaveBeenCalledTimes(2);
      expect(registerCleanup).toHaveBeenCalledWith(expect.any(Function));
      expect((global as any).setInterval).toHaveBeenCalledTimes(2);

      registerCleanup.mock.calls[0][0]();
      expect((global as any).setInterval).toHaveBeenCalledTimes(2);
    });

    it('client handlers and route timer only run for the active client', () => {
      const registerCleanup = vi.fn();
      const client = { registerCleanup } as any;
      router.setup(client);
      const timerCallback = ((global as any).setInterval as Mock).mock.calls[0][0];

      vi.mocked(getClient).mockReturnValue({} as any);
      timerCallback();
      expect(addBreadcrumb).not.toHaveBeenCalled();

      vi.mocked(getClient).mockReturnValue(client);
      mockSdk.navigateTo();
      timerCallback();
      expect(addBreadcrumb).toHaveBeenCalled();

      const cleanup = registerCleanup.mock.calls[0][0];
      cleanup();
      cleanup();
      router.cleanup();
    });
  });

  describe('setupOnce', () => {
    it('should install neutral wrappers without starting route monitoring', () => {
      const originalNavigateTo = mockSdk.navigateTo;
      router.setupOnce();

      expect(mockSdk.navigateTo).not.toBe(originalNavigateTo);
      mockSdk.navigateTo({ url: '/pages/test/test' });
      expect(originalNavigateTo).toHaveBeenCalledWith({ url: '/pages/test/test' });
      expect(addBreadcrumb).not.toHaveBeenCalled();
      expect((global as any).setInterval).not.toHaveBeenCalled();
    });

    it('should instrument navigateTo', () => {
      const originalNavigateTo = mockSdk.navigateTo;
      setupRouter(router);

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
      setupRouter(router);

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
      setupRouter(router);

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
      setupRouter(router);

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
      setupRouter(router);

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
      setupRouter(router);

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
      (sdkFn as Mock).mockImplementation(() => {
        throw new Error('sentry-miniapp 暂不支持此平台');
      });

      expect(() => router.setupOnce()).not.toThrow();
    });

    it('client setup degrades gracefully when sdk() throws', () => {
      (sdkFn as Mock).mockImplementation(() => {
        throw new Error('sentry-miniapp 暂不支持此平台');
      });
      const client = { registerCleanup: vi.fn() } as any;
      vi.mocked(getClient).mockReturnValue(client);

      expect(() => router.setup(client)).not.toThrow();
      expect(client.registerCleanup).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle SDK with missing methods gracefully', () => {
      // Clear all methods from mockSdk
      Object.keys(mockSdk).forEach((key) => {
        delete mockSdk[key];
      });

      expect(() => router.setupOnce()).not.toThrow();
    });

    it('client setup skips unavailable navigation methods', () => {
      delete mockSdk.redirectTo;

      expect(() => setupRouter(router)).not.toThrow();
      expect(mockSdk.navigateTo).toEqual(expect.any(Function));
    });
  });

  describe('route monitoring', () => {
    it('should monitor route changes', () => {
      setupRouter(router);

      // Get the interval callback
      const setIntervalMock = (global as any).setInterval as Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      // Simulate route change
      ((globalThis as any).getCurrentPages as Mock).mockReturnValue([
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
      setupRouter(router);

      const setIntervalMock = (global as any).setInterval as Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      // Execute callback first time to establish current route
      intervalCallback();
      const firstCallCount = (addBreadcrumb as Mock).mock.calls.length;

      // Execute callback again with same route
      intervalCallback();

      // Should not add additional breadcrumb for same route
      expect(addBreadcrumb).toHaveBeenCalledTimes(firstCallCount);
    });

    it('should handle getCurrentPages errors gracefully', () => {
      ((globalThis as any).getCurrentPages as Mock).mockImplementation(() => {
        throw new Error('getCurrentPages error');
      });

      setupRouter(router);
      const setIntervalMock = (global as any).setInterval as Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      expect(() => intervalCallback()).not.toThrow();
    });

    it('should handle empty pages array', () => {
      ((globalThis as any).getCurrentPages as Mock).mockReturnValue([]);

      setupRouter(router);
      const setIntervalMock = (global as any).setInterval as Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      expect(() => intervalCallback()).not.toThrow();
    });

    it('should handle pages with __route__ property', () => {
      ((globalThis as any).getCurrentPages as Mock).mockReturnValue([
        { __route__: 'pages/legacy/legacy' },
      ]);

      setupRouter(router);
      const setIntervalMock = (global as any).setInterval as Mock;
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

    it('should handle a current page without route metadata', () => {
      ((globalThis as any).getCurrentPages as Mock).mockReturnValue([{}]);

      setupRouter(router);
      const setIntervalMock = (global as any).setInterval as Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      expect(() => intervalCallback()).not.toThrow();
      expect(addBreadcrumb).not.toHaveBeenCalled();
    });

    it('should handle missing getCurrentPages function', () => {
      delete (globalThis as any).getCurrentPages;

      setupRouter(router);
      const setIntervalMock = (global as any).setInterval as Mock;
      const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;

      expect(() => intervalCallback()).not.toThrow();
    });
  });

  describe('navigation recording', () => {
    beforeEach(() => {
      setupRouter(router);
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
      const alipayNavigateTo = vi.fn();
      const alipaySdk = {
        navigateTo: alipayNavigateTo,
        redirectTo: vi.fn(),
        switchTab: vi.fn(),
        navigateBack: vi.fn(),
        reLaunch: vi.fn(),
      };

      (sdkFn as Mock).mockReturnValue(alipaySdk);

      const alipayRouter = new Router();
      setupRouter(alipayRouter);

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

});
