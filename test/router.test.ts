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

describe('Router Integration', () => {
  let router: Router;
  let mockGlobal: any;

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
    
    // Mock global object with wx APIs
    mockGlobal = {
      wx: {
        navigateTo: jest.fn(),
        redirectTo: jest.fn(),
        switchTab: jest.fn(),
        navigateBack: jest.fn(),
        reLaunch: jest.fn(),
      },
      getCurrentPages: jest.fn(() => [
        { route: 'pages/index/index' },
        { route: 'pages/detail/detail' },
      ]),
    };
    
    // Replace globalThis
    Object.assign(globalThis, mockGlobal);
    
    // Mock setInterval to avoid actual timing
    (global as any).setInterval = jest.fn();
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original global and setInterval
    Object.keys(mockGlobal).forEach(key => {
      delete (globalThis as any)[key];
    });
    (global as any).setInterval = originalSetInterval;
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

    it('should instrument wx.navigateTo', () => {
      const originalNavigateTo = mockGlobal.wx.navigateTo;
      router.setupOnce();
      
      // Check that navigateTo was wrapped
      expect(mockGlobal.wx.navigateTo).not.toBe(originalNavigateTo);
      
      // Test the wrapped function
      const options = { url: '/pages/test/test' };
      mockGlobal.wx.navigateTo(options);
      
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

    it('should instrument wx.redirectTo', () => {
      const originalRedirectTo = mockGlobal.wx.redirectTo;
      router.setupOnce();
      
      const options = { url: '/pages/redirect/redirect' };
      mockGlobal.wx.redirectTo(options);
      
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

    it('should instrument wx.switchTab', () => {
      const originalSwitchTab = mockGlobal.wx.switchTab;
      router.setupOnce();
      
      const options = { url: '/pages/tab/tab' };
      mockGlobal.wx.switchTab(options);
      
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

    it('should instrument wx.navigateBack', () => {
      const originalNavigateBack = mockGlobal.wx.navigateBack;
      router.setupOnce();
      
      const options = { delta: 2 };
      mockGlobal.wx.navigateBack(options);
      
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

    it('should instrument wx.navigateBack with default options', () => {
      const originalNavigateBack = mockGlobal.wx.navigateBack;
      router.setupOnce();
      
      mockGlobal.wx.navigateBack();
      
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

    it('should instrument wx.reLaunch', () => {
      const originalReLaunch = mockGlobal.wx.reLaunch;
      router.setupOnce();
      
      const options = { url: '/pages/relaunch/relaunch' };
      mockGlobal.wx.reLaunch(options);
      
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

    it('should handle missing wx object gracefully', () => {
      delete (globalThis as any).wx;
      
      expect(() => router.setupOnce()).not.toThrow();
    });

    it('should handle missing wx methods gracefully', () => {
      (globalThis as any).wx = {};
      
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
      mockGlobal.getCurrentPages.mockReturnValue([
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
      mockGlobal.getCurrentPages.mockImplementation(() => {
        throw new Error('getCurrentPages error');
      });
      
      router.setupOnce();
      const setIntervalMock = (global as any).setInterval as jest.Mock;
        const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;
      
      expect(() => intervalCallback()).not.toThrow();
    });

    it('should handle empty pages array', () => {
      mockGlobal.getCurrentPages.mockReturnValue([]);
      
      router.setupOnce();
      const setIntervalMock = (global as any).setInterval as jest.Mock;
        const intervalCallback = setIntervalMock.mock.calls[0]?.[0] as () => void;
      
      expect(() => intervalCallback()).not.toThrow();
    });

    it('should handle pages with __route__ property', () => {
      mockGlobal.getCurrentPages.mockReturnValue([
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
      mockGlobal.wx.navigateTo(options);
      
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
      mockGlobal.wx.navigateBack({ delta: 1 });
      
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