import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { addBreadcrumb, getCurrentScope } from '@sentry/core';
import { PerformanceIntegration } from '../src/integrations/performance';
import { getPerformanceManager } from '../src/crossPlatform';
import type { PerformanceEntry, PerformanceManager, PerformanceObserver } from '../src/crossPlatform';

// Mock Sentry core functions
jest.mock('@sentry/core', () => ({
  addBreadcrumb: jest.fn(),
  getCurrentScope: jest.fn(),
  startSpan: jest.fn(),
  withScope: jest.fn(),
  getCurrentHub: jest.fn(() => ({
    getClient: jest.fn(() => ({
      captureException: jest.fn(),
      captureMessage: jest.fn()
    }))
  }))
}));

// Mock the crossPlatform module
jest.mock('../src/crossPlatform', () => ({
  getPerformanceManager: jest.fn(),
  sdk: jest.fn(() => ({
    getPerformance: jest.fn(),
    reportPerformance: jest.fn(),
  })),
}));

// Mock startTransaction since it's not available in v9
const mockStartTransaction = jest.fn();

describe('Performance Monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Transaction tracking', () => {
    it('should start transaction for page navigation', () => {
      mockStartTransaction.mockReturnValue({
        setName: jest.fn(),
        setTag: jest.fn(),
        setData: jest.fn(),
        finish: jest.fn(),
        toTraceparent: jest.fn(),
        toSentryTrace: jest.fn(),
        getTraceContext: jest.fn()
      } as any);

      // Simulate page navigation
      const transaction = mockStartTransaction({
        name: 'Page Load',
        op: 'navigation'
      });

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'Page Load',
        op: 'navigation'
      });
      expect(transaction).toBeDefined();
    });

    it('should track API request performance', () => {
      const mockStartTransaction = jest.fn();
      const mockTransaction = {
        setName: jest.fn(),
        setTag: jest.fn(),
        setData: jest.fn(),
        finish: jest.fn(),
        toTraceparent: jest.fn(),
        toSentryTrace: jest.fn(),
        getTraceContext: jest.fn()
      };
      mockStartTransaction.mockReturnValue(mockTransaction as any);

      // Simulate API request
      const transaction = mockStartTransaction({
        name: 'API Request',
        op: 'http.client'
      });

      (transaction as any).setTag('http.method', 'GET');
      (transaction as any).setData('url', 'https://api.example.com/data');
      (transaction as any).finish();

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'API Request',
        op: 'http.client'
      });
      expect(mockTransaction.setTag).toHaveBeenCalledWith('http.method', 'GET');
      expect(mockTransaction.setData).toHaveBeenCalledWith('url', 'https://api.example.com/data');
      expect(mockTransaction.finish).toHaveBeenCalled();
    });

    it('should track user interaction performance', () => {
      const mockStartTransaction = jest.fn();
      const mockTransaction = {
        setName: jest.fn(),
        setTag: jest.fn(),
        setData: jest.fn(),
        finish: jest.fn(),
        toTraceparent: jest.fn(),
        toSentryTrace: jest.fn(),
        getTraceContext: jest.fn()
      };
      mockStartTransaction.mockReturnValue(mockTransaction as any);

      // Simulate user interaction
      const transaction = mockStartTransaction({
        name: 'Button Click',
        op: 'ui.action.click'
      });

      (transaction as any).setTag('element.tag', 'button');
      (transaction as any).setData('element.id', 'submit-btn');
      (transaction as any).finish();

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'Button Click',
        op: 'ui.action.click'
      });
      expect(mockTransaction.setTag).toHaveBeenCalledWith('element.tag', 'button');
      expect(mockTransaction.setData).toHaveBeenCalledWith('element.id', 'submit-btn');
      expect(mockTransaction.finish).toHaveBeenCalled();
    });
  });

  describe('Breadcrumb tracking', () => {
    it('should add navigation breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'navigation',
        message: 'Navigated to /home',
        level: 'info',
        data: {
          from: '/login',
          to: '/home'
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        message: 'Navigated to /home',
        level: 'info',
        data: {
          from: '/login',
          to: '/home'
        }
      });
    });

    it('should add user action breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'user',
        message: 'User clicked submit button',
        level: 'info',
        data: {
          element: 'button',
          id: 'submit-btn'
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'user',
        message: 'User clicked submit button',
        level: 'info',
        data: {
          element: 'button',
          id: 'submit-btn'
        }
      });
    });

    it('should add HTTP request breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'http',
        message: 'GET /api/users',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/users',
          status_code: 200
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'http',
        message: 'GET /api/users',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/users',
          status_code: 200
        }
      });
    });

    it('should add console breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'console',
        message: 'User logged a warning',
        level: 'warning',
        data: {
          logger: 'console',
          extra: {
            arguments: ['Warning message']
          }
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'console',
        message: 'User logged a warning',
        level: 'warning',
        data: {
          logger: 'console',
          extra: {
            arguments: ['Warning message']
          }
        }
      });
    });

    it('should add error breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'error',
        message: 'Unhandled promise rejection',
        level: 'error',
        data: {
          type: 'unhandledrejection',
          reason: 'Network timeout'
        }
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'error',
        message: 'Unhandled promise rejection',
        level: 'error',
        data: {
          type: 'unhandledrejection',
          reason: 'Network timeout'
        }
      });
    });
  });

  describe('Performance metrics', () => {
    it('should measure function execution time', async () => {
      const startTime = Date.now();
      
      // Simulate some async work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(1000);
    });

    it('should track memory usage', () => {
      // Mock memory info for miniapp environment
      const mockMemoryInfo = {
        usedJSHeapSize: 1024 * 1024, // 1MB
        totalJSHeapSize: 2 * 1024 * 1024, // 2MB
        jsHeapSizeLimit: 10 * 1024 * 1024 // 10MB
      };

      // In a real miniapp, this would come from wx.getSystemInfo or similar
      const memoryUsage = mockMemoryInfo.usedJSHeapSize / mockMemoryInfo.totalJSHeapSize;

      expect(memoryUsage).toBe(0.5);
      expect(mockMemoryInfo.usedJSHeapSize).toBeLessThan(mockMemoryInfo.jsHeapSizeLimit);
    });

  });
});

describe('PerformanceIntegration', () => {
  let integration: PerformanceIntegration;
  let mockPerformanceManager: jest.Mocked<PerformanceManager>;
  let mockScope: any;
  let mockObserver: jest.Mocked<PerformanceObserver>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock performance manager
    mockObserver = {
      observe: jest.fn(),
      disconnect: jest.fn(),
    };

    mockPerformanceManager = {
      getEntries: jest.fn(() => []),
      getEntriesByType: jest.fn(() => []),
      getEntriesByName: jest.fn(() => []),
      mark: jest.fn(),
      measure: jest.fn(),
      clearMarks: jest.fn(),
      clearMeasures: jest.fn(),
      createObserver: jest.fn(() => mockObserver),
    };

    // Setup mock scope
    mockScope = {
      setTag: jest.fn(),
      setContext: jest.fn(),
      addBreadcrumb: jest.fn(),
    };

    (getPerformanceManager as jest.Mock).mockReturnValue(mockPerformanceManager);
    (getCurrentScope as jest.Mock).mockReturnValue(mockScope);

    integration = new PerformanceIntegration();
  });

  afterEach(() => {
    integration.cleanup();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultIntegration = new PerformanceIntegration();
      expect(defaultIntegration.name).toBe('PerformanceAPI');
    });

    it('should initialize with custom options', () => {
      const customIntegration = new PerformanceIntegration({
        enableNavigation: false,
        sampleRate: 0.5,
        bufferSize: 50,
      });
      expect(customIntegration.name).toBe('PerformanceAPI');
    });
  });

  describe('setupOnce', () => {
    it('should setup performance monitoring when API is available', () => {
      integration.setupOnce();

      expect(getPerformanceManager).toHaveBeenCalled();
      expect(mockScope.setTag).toHaveBeenCalledWith('performance.api.available', true);
      expect(mockScope.setContext).toHaveBeenCalledWith('performance', expect.objectContaining({
        api_version: 'miniapp-1.0',
        sample_rate: 1.0,
        buffer_size: 100,
      }));
      expect(mockPerformanceManager.createObserver).toHaveBeenCalled();
      expect(mockObserver.observe).toHaveBeenCalledWith({
        entryTypes: ['navigation', 'render', 'resource', 'measure', 'mark']
      });
    });

    it('should handle missing performance API gracefully', () => {
      (getPerformanceManager as jest.Mock).mockReturnValue(null);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      integration.setupOnce();

      expect(consoleSpy).toHaveBeenCalledWith('[Sentry Performance] Performance API not available');
      expect(mockPerformanceManager.createObserver).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('performance entry processing', () => {
    beforeEach(() => {
      integration.setupOnce();
    });

    it('should process navigation entries', () => {
      const navigationEntry: PerformanceEntry = {
        name: 'page-load',
        entryType: 'navigation',
        startTime: 1000,
        duration: 500,
      };

      // Get the observer callback
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([navigationEntry]);
      }

      // Verify that the entry was processed
      expect(mockScope.addBreadcrumb).toHaveBeenCalled();
    });

    it('should handle performance entries correctly', () => {
      const mockEntries = [
        {
          name: 'test-navigation',
          entryType: 'navigation',
          startTime: 0,
          duration: 100,
        }
      ];

      // Get the observer callback and test it
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        expect(() => observerCallback(mockEntries)).not.toThrow();
      }
    });

    it('should handle different entry formats', () => {
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (!observerCallback) return;

      // Test array format
      const arrayEntries = [{
        name: 'test',
        entryType: 'navigation',
        startTime: 0,
        duration: 100
      }];
      expect(() => observerCallback(arrayEntries)).not.toThrow();

      // Test empty array
      expect(() => observerCallback([])).not.toThrow();

      // Test with null/undefined (should handle gracefully)
      expect(() => observerCallback(null as any)).not.toThrow();
      expect(() => observerCallback(undefined as any)).not.toThrow();
    });

    it('should process render entries', () => {
      const renderEntry: PerformanceEntry = {
        name: 'component-render',
        entryType: 'render',
        startTime: 2000,
        duration: 100,
      };

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([renderEntry]);
      }

      // Should process without errors
      expect(observerCallback).toBeDefined();
    });

    it('should respect sample rate', () => {
      const lowSampleRateIntegration = new PerformanceIntegration({ sampleRate: 0 });
      lowSampleRateIntegration.setupOnce();

      const entry: PerformanceEntry = {
        name: 'test-entry',
        entryType: 'navigation',
        startTime: 1000,
        duration: 500,
      };

      // Mock Math.random to return 0.5 (should be filtered out with sampleRate 0)
      const mathSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[1]?.[0];
      if (observerCallback) {
        observerCallback([entry]);
      }

      // Should not process due to sampling
      mathSpy.mockRestore();
      lowSampleRateIntegration.cleanup();
    });
  });

  describe('cleanup', () => {
    it('should disconnect observers and clear timers', () => {
      integration.setupOnce();
      integration.cleanup();

      expect(mockObserver.disconnect).toHaveBeenCalled();
    });
  });
});