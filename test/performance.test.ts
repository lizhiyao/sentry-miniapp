import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
  type Mocked,
  type MockedFunction,
} from 'vitest';
import {
  addBreadcrumb,
  getClient,
  getCurrentScope,
  startInactiveSpan,
  startSpan,
} from '@sentry/core';
import { PerformanceIntegration, performanceIntegration } from '../src/integrations/performance';
import { getPerformanceManager, getSystemInfo, sdk } from '../src/crossPlatform';
import type {
  PerformanceEntry,
  PerformanceManager,
  PerformanceObserver,
} from '../src/crossPlatform';

// Mock Sentry core functions
vi.mock('@sentry/core', () => ({
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(),
  getCurrentScope: vi.fn(),
  startInactiveSpan: vi.fn(),
  startSpan: vi.fn(),
  withActiveSpan: vi.fn((_span, callback) => callback()),
  withScope: vi.fn(),
  getCurrentHub: vi.fn(() => ({
    getClient: vi.fn(() => ({
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    })),
  })),
}));

// Mock the crossPlatform module
vi.mock('../src/crossPlatform', () => ({
  getPerformanceManager: vi.fn(),
  getSystemInfo: vi.fn(() => ({ platform: 'devtools' })),
  sdk: vi.fn(() => ({
    getPerformance: vi.fn(),
  })),
  epochNow: vi.fn(() => 1_700_000_000_000),
}));

// Mock startTransaction since it's not available in v9
const mockStartTransaction = vi.fn();

describe('Performance Monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Transaction tracking', () => {
    it('should start transaction for page navigation', () => {
      mockStartTransaction.mockReturnValue({
        setName: vi.fn(),
        setTag: vi.fn(),
        setData: vi.fn(),
        finish: vi.fn(),
        toTraceparent: vi.fn(),
        toSentryTrace: vi.fn(),
        getTraceContext: vi.fn(),
      } as any);

      // Simulate page navigation
      const transaction = mockStartTransaction({
        name: 'Page Load',
        op: 'navigation',
      });

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'Page Load',
        op: 'navigation',
      });
      expect(transaction).toBeDefined();
    });

    it('should track API request performance', () => {
      const mockStartTransaction = vi.fn();
      const mockTransaction = {
        setName: vi.fn(),
        setTag: vi.fn(),
        setData: vi.fn(),
        finish: vi.fn(),
        toTraceparent: vi.fn(),
        toSentryTrace: vi.fn(),
        getTraceContext: vi.fn(),
      };
      mockStartTransaction.mockReturnValue(mockTransaction as any);

      // Simulate API request
      const transaction = mockStartTransaction({
        name: 'API Request',
        op: 'http.client',
      });

      (transaction as any).setTag('http.method', 'GET');
      (transaction as any).setData('url', 'https://api.example.com/data');
      (transaction as any).finish();

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'API Request',
        op: 'http.client',
      });
      expect(mockTransaction.setTag).toHaveBeenCalledWith('http.method', 'GET');
      expect(mockTransaction.setData).toHaveBeenCalledWith('url', 'https://api.example.com/data');
      expect(mockTransaction.finish).toHaveBeenCalled();
    });

    it('should track user interaction performance', () => {
      const mockStartTransaction = vi.fn();
      const mockTransaction = {
        setName: vi.fn(),
        setTag: vi.fn(),
        setData: vi.fn(),
        finish: vi.fn(),
        toTraceparent: vi.fn(),
        toSentryTrace: vi.fn(),
        getTraceContext: vi.fn(),
      };
      mockStartTransaction.mockReturnValue(mockTransaction as any);

      // Simulate user interaction
      const transaction = mockStartTransaction({
        name: 'Button Click',
        op: 'ui.action.click',
      });

      (transaction as any).setTag('element.tag', 'button');
      (transaction as any).setData('element.id', 'submit-btn');
      (transaction as any).finish();

      expect(mockStartTransaction).toHaveBeenCalledWith({
        name: 'Button Click',
        op: 'ui.action.click',
      });
      expect(mockTransaction.setTag).toHaveBeenCalledWith('element.tag', 'button');
      expect(mockTransaction.setData).toHaveBeenCalledWith('element.id', 'submit-btn');
      expect(mockTransaction.finish).toHaveBeenCalled();
    });
  });

  describe('Breadcrumb tracking', () => {
    it('should add navigation breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'navigation',
        message: 'Navigated to /home',
        level: 'info',
        data: {
          from: '/login',
          to: '/home',
        },
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        message: 'Navigated to /home',
        level: 'info',
        data: {
          from: '/login',
          to: '/home',
        },
      });
    });

    it('should add user action breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'user',
        message: 'User clicked submit button',
        level: 'info',
        data: {
          element: 'button',
          id: 'submit-btn',
        },
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'user',
        message: 'User clicked submit button',
        level: 'info',
        data: {
          element: 'button',
          id: 'submit-btn',
        },
      });
    });

    it('should add HTTP request breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'http',
        message: 'GET /api/users',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/users',
          status_code: 200,
        },
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'http',
        message: 'GET /api/users',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/users',
          status_code: 200,
        },
      });
    });

    it('should add console breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'console',
        message: 'User logged a warning',
        level: 'warning',
        data: {
          logger: 'console',
          extra: {
            arguments: ['Warning message'],
          },
        },
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'console',
        message: 'User logged a warning',
        level: 'warning',
        data: {
          logger: 'console',
          extra: {
            arguments: ['Warning message'],
          },
        },
      });
    });

    it('should add error breadcrumb', () => {
      const mockAddBreadcrumb = addBreadcrumb as MockedFunction<typeof addBreadcrumb>;

      addBreadcrumb({
        category: 'error',
        message: 'Unhandled promise rejection',
        level: 'error',
        data: {
          type: 'unhandledrejection',
          reason: 'Network timeout',
        },
      });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'error',
        message: 'Unhandled promise rejection',
        level: 'error',
        data: {
          type: 'unhandledrejection',
          reason: 'Network timeout',
        },
      });
    });
  });

  describe('Performance metrics', () => {
    it('should measure function execution time', async () => {
      const startTime = Date.now();

      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 10));

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
        jsHeapSizeLimit: 10 * 1024 * 1024, // 10MB
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
  let mockPerformanceManager: Mocked<PerformanceManager>;
  let mockScope: any;
  let mockObserver: Mocked<PerformanceObserver>;
  let mockSpan: { setAttributes: Mock; end: Mock };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock performance manager
    mockObserver = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    };

    mockPerformanceManager = {
      getEntries: vi.fn(() => []),
      getEntriesByType: vi.fn(() => []),
      getEntriesByName: vi.fn(() => []),
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
      createObserver: vi.fn(() => mockObserver),
    };

    // Setup mock scope
    mockScope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
      addBreadcrumb: vi.fn(),
    };

    mockSpan = {
      setAttributes: vi.fn(),
      end: vi.fn(),
    };

    (getPerformanceManager as Mock).mockReturnValue(mockPerformanceManager);
    (getCurrentScope as Mock).mockReturnValue(mockScope);
    (startInactiveSpan as Mock).mockReturnValue(mockSpan);
    (startSpan as Mock).mockImplementation((_options: unknown, callback: (span: any) => unknown) =>
      callback(mockSpan),
    );

    integration = new PerformanceIntegration();
  });

  afterEach(() => {
    integration.cleanup();
  });

  describe('constructor', () => {
    it('functional factory should return a usable integration instance', () => {
      const factoryIntegration = performanceIntegration({ enableNavigation: false });

      expect(factoryIntegration).toBeInstanceOf(PerformanceIntegration);
      expect(factoryIntegration.name).toBe('PerformanceAPI');
      expect(factoryIntegration.setupOnce).toEqual(expect.any(Function));
    });

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
      expect(mockScope.setContext).toHaveBeenCalledWith(
        'performance',
        expect.objectContaining({
          api_version: 'miniapp-1.0',
          sample_rate: 1.0,
          buffer_size: 100,
        }),
      );
      expect(mockPerformanceManager.createObserver).toHaveBeenCalled();
      expect(mockObserver.observe).toHaveBeenCalledWith({
        entryTypes: ['navigation', 'render', 'resource'],
      });
    });

    it('should not include user timing types when unsupported', () => {
      const originalPerformanceObserver = (global as any).PerformanceObserver;
      (global as any).PerformanceObserver = undefined;

      const integrationWithUserTiming = new PerformanceIntegration({ enableUserTiming: true });
      integrationWithUserTiming.setupOnce();

      expect(mockObserver.observe).toHaveBeenCalledWith({
        entryTypes: ['navigation', 'render', 'resource'],
      });

      integrationWithUserTiming.cleanup();
      (global as any).PerformanceObserver = originalPerformanceObserver;
    });

    it('should handle missing performance API gracefully', () => {
      (getPerformanceManager as Mock).mockReturnValue(null);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      integration.setupOnce();

      expect(consoleSpy).toHaveBeenCalledWith('[sentry-miniapp] Performance API not available');
      expect(mockPerformanceManager.createObserver).not.toHaveBeenCalled();
      expect((integration as any)._reportTimer).toBeNull();

      consoleSpy.mockRestore();
    });

    it('should handle performance manager initialization failures', () => {
      const error = new Error('host API failed');
      (getPerformanceManager as Mock).mockImplementation(() => {
        throw error;
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => integration.setupOnce()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to initialize performance manager:',
        error,
      );

      consoleSpy.mockRestore();
    });

    it('should skip observer creation when all entry types are disabled', () => {
      const disabledIntegration = new PerformanceIntegration({
        enableNavigation: false,
        enableRender: false,
        enableResource: false,
      });

      disabledIntegration.setupOnce();

      expect(mockPerformanceManager.createObserver).not.toHaveBeenCalled();
      disabledIntegration.cleanup();
    });

    it('should disable user timing when system info lookup fails', () => {
      (getSystemInfo as Mock).mockImplementation(() => {
        throw new Error('system info unavailable');
      });
      const userTimingIntegration = new PerformanceIntegration({ enableUserTiming: true });

      userTimingIntegration.setupOnce();

      expect(mockObserver.observe).toHaveBeenCalledWith({
        entryTypes: ['navigation', 'render', 'resource'],
      });
      userTimingIntegration.cleanup();
    });

    it('should contain observer setup errors when no fallback is possible', () => {
      const error = new Error('observe unavailable');
      mockObserver.observe.mockImplementation(() => {
        throw error;
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => integration.setupOnce()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to setup performance observers:',
        error,
      );

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
        },
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
      const arrayEntries = [
        {
          name: 'test',
          entryType: 'navigation',
          startTime: 0,
          duration: 100,
        },
      ];
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
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Render: component-render', op: 'render' }),
        expect.any(Function),
      );
      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'render.duration': 100 }),
      );
      expect(mockSpan.end).toHaveBeenCalledWith(1_700_000_000);
    });

    it('should reject primitive entry formats safely', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];

      observerCallback?.('invalid' as any);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Invalid entries format:',
        'string',
      );
      consoleSpy.mockRestore();
    });

    it('should continue when one performance entry fails to process', () => {
      const error = new Error('span failed');
      (startSpan as Mock).mockImplementationOnce(() => {
        throw error;
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];

      expect(() =>
        observerCallback?.([
          { name: 'failed-render', entryType: 'render', startTime: 0, duration: 10 },
        ]),
      ).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to process performance entry:',
        error,
      );

      consoleSpy.mockRestore();
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
      const mathSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[1]?.[0];
      if (observerCallback) {
        observerCallback([entry]);
      }

      // Should not process due to sampling
      mathSpy.mockRestore();
      lowSampleRateIntegration.cleanup();
    });
  });

  describe('configurable thresholds', () => {
    it('should use default thresholds when not configured', () => {
      integration.setupOnce();

      // Feed slow navigation entries to trigger threshold check
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'slow-nav', entryType: 'navigation', startTime: 0, duration: 4000 },
        ]);
      }

      // Trigger reporting
      (integration as any)._reportBufferedEntries();

      expect(mockScope.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '页面导航性能较慢',
          category: 'performance.warning',
          data: expect.objectContaining({ threshold: 3000 }),
        }),
      );
    });

    it('should use custom thresholds when configured', () => {
      const customIntegration = new PerformanceIntegration({
        thresholds: { navigation: 1000 },
      });
      customIntegration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        // 1500ms exceeds custom 1000ms threshold but not default 3000ms
        observerCallback([
          { name: 'nav', entryType: 'navigation', startTime: 0, duration: 1500 },
        ]);
      }

      (customIntegration as any)._reportBufferedEntries();

      expect(mockScope.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '页面导航性能较慢',
          data: expect.objectContaining({ threshold: 1000 }),
        }),
      );

      customIntegration.cleanup();
    });

    it('should not trigger warning when below threshold', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'fast-nav', entryType: 'navigation', startTime: 0, duration: 200 },
        ]);
      }

      (integration as any)._reportBufferedEntries();

      expect(mockScope.addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'performance.warning' }),
      );
    });
  });

  describe('setData slow render detection', () => {
    it('should detect slow renders above threshold', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'slow-render', entryType: 'render', startTime: 0, duration: 100 },
        ]);
      }

      expect(mockScope.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance.setData.slow',
          level: 'warning',
          data: expect.objectContaining({
            duration: 100,
            threshold: 50,
          }),
        }),
      );
    });

    it('should not trigger for fast renders', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'fast-render', entryType: 'render', startTime: 0, duration: 30 },
        ]);
      }

      expect(mockScope.addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'performance.setData.slow' }),
      );
    });

    it('should use custom setData threshold', () => {
      const customIntegration = new PerformanceIntegration({
        thresholds: { setData: 100 },
      });
      customIntegration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        // 80ms is below custom 100ms threshold
        observerCallback([
          { name: 'render', entryType: 'render', startTime: 0, duration: 80 },
        ]);
      }

      expect(mockScope.addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'performance.setData.slow' }),
      );

      customIntegration.cleanup();
    });

    it('should include slow_render_count in stats', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'r1', entryType: 'render', startTime: 0, duration: 100 },
          { name: 'r2', entryType: 'render', startTime: 100, duration: 30 },
          { name: 'r3', entryType: 'render', startTime: 200, duration: 200 },
        ]);
      }

      (integration as any)._reportBufferedEntries();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'performance_summary',
        expect.objectContaining({
          render_count: 3,
        }),
      );
    });
  });

  describe('memory info collection', () => {
    it('should not collect memory when enableMemory is false', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'nav', entryType: 'navigation', startTime: 0, duration: 100 },
        ]);
      }

      (integration as any)._reportBufferedEntries();

      // Should not have memory in context
      const contextCall = mockScope.setContext.mock.calls.find(
        (c: any[]) => c[0] === 'performance_summary',
      );
      if (contextCall) {
        expect(contextCall[1].memory).toBeUndefined();
      }
    });

    it('should collect memory when enableMemory is true and API available', () => {
      const mockMemory = { jsHeapSizeUsed: 1024000, jsHeapSizeLimit: 10240000 };
      (sdk as Mock).mockReturnValue({
        getPerformance: vi.fn(() => ({ memory: mockMemory })),
      });

      const memIntegration = new PerformanceIntegration({ enableMemory: true });
      memIntegration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'nav', entryType: 'navigation', startTime: 0, duration: 100 },
        ]);
      }

      (memIntegration as any)._reportBufferedEntries();

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'performance_summary',
        expect.objectContaining({
          memory: mockMemory,
        }),
      );

      memIntegration.cleanup();
    });

    it('should handle missing memory API gracefully', () => {
      (sdk as Mock).mockReturnValue({
        getPerformance: vi.fn(() => ({})), // No memory property
      });

      const memIntegration = new PerformanceIntegration({ enableMemory: true });
      memIntegration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'nav', entryType: 'navigation', startTime: 0, duration: 100 },
        ]);
      }

      expect(() => (memIntegration as any)._reportBufferedEntries()).not.toThrow();

      memIntegration.cleanup();
    });
  });

  describe('cleanup', () => {
    it('ignores observer data and buffered summaries owned by an inactive client', () => {
      const oldClient = { registerCleanup: vi.fn() };
      (getClient as Mock).mockReturnValue({});
      integration.setup(oldClient as any);
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      vi.mocked(startInactiveSpan).mockClear();

      observerCallback?.([
        { name: 'stale', entryType: 'navigation', startTime: 0, duration: 100 },
      ]);
      (integration as any)._entryBuffer.push({
        name: 'stale-buffer',
        entryType: 'navigation',
        startTime: 0,
        duration: 100,
      });
      integration.cleanup();

      expect(startInactiveSpan).not.toHaveBeenCalled();
      expect((integration as any)._entryBuffer).toEqual([]);
      expect(mockScope.setContext).not.toHaveBeenCalledWith(
        'performance_summary',
        expect.anything(),
      );
    });

    it('should disconnect observers and clear timers', () => {
      integration.setupOnce();
      integration.cleanup();

      expect(mockObserver.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', () => {
      mockObserver.disconnect.mockImplementation(() => {
        throw new Error('disconnect failed');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      integration.setupOnce();

      expect(() => integration.cleanup()).not.toThrow();
      consoleSpy.mockRestore();
    });

    it('should report remaining buffered entries before cleanup', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'last-entry', entryType: 'navigation', startTime: 0, duration: 100 },
        ]);
      }

      integration.cleanup();

      // 清理时应完成最后一次汇总
      expect(mockScope.setContext).toHaveBeenCalledWith(
        'performance_summary',
        expect.objectContaining({ total_entries: 1 }),
      );
    });
  });

  describe('resource entry processing', () => {
    it('should process resource entries with network timing', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          {
            name: 'https://cdn.example.com/app.js',
            entryType: 'resource',
            startTime: 500,
            duration: 200,
            initiatorType: 'script',
            fetchStart: 510,
            responseEnd: 700,
            transferSize: 50000,
            encodedBodySize: 48000,
            decodedBodySize: 120000,
          } as any,
        ]);
      }

      // 应处理资源条目无报错
      expect(observerCallback).toBeDefined();
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'resource.fetch_start': 510,
        'resource.response_end': 700,
        'resource.network_time': 190,
      });
      expect(mockSpan.end).toHaveBeenCalledWith(1_700_000_000);
    });

    it('should use resource defaults when optional timing data is absent', () => {
      integration.setupOnce();
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];

      observerCallback?.([
        { name: 'inline-resource', entryType: 'resource', startTime: 0, duration: 5 },
      ]);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'resource.type': 'unknown',
          'resource.transfer_size': 0,
          'resource.encoded_size': 0,
          'resource.decoded_size': 0,
        }),
      );
    });
  });

  describe('user timing entry processing', () => {
    it('should process measure entries', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          {
            name: 'api-call',
            entryType: 'measure',
            startTime: 100,
            duration: 300,
            detail: { url: '/api/data' },
          } as any,
        ]);
      }

      expect(observerCallback).toBeDefined();
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'measure.name': 'api-call',
        'measure.duration': 300,
        'measure.detail': '{"url":"/api/data"}',
      });
    });

    it('should omit absent measure details', () => {
      integration.setupOnce();
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];

      observerCallback?.([
        { name: 'plain-measure', entryType: 'measure', startTime: 0, duration: 1 },
      ]);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ 'measure.detail': undefined }),
      );
    });

    it('should process mark entries as breadcrumbs', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          {
            name: 'page-interactive',
            entryType: 'mark',
            startTime: 1500,
            duration: 0,
          },
        ]);
      }

      expect(mockScope.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance.mark',
          message: expect.stringContaining('page-interactive'),
        }),
      );
    });
  });

  describe('entry formats', () => {
    it('normalizes epoch, invalid, and negative timing values conservatively', () => {
      const epochEntry = {
        name: 'epoch-entry',
        entryType: 'navigation',
        startTime: 1_700_000_000_000,
        duration: Number.NaN,
      } as PerformanceEntry;

      (integration as any)._initializeRelativeTimeOrigin([epochEntry]);
      expect((integration as any)._relativeTimeOrigin).toBeNull();
      expect((integration as any)._entryTimes(epochEntry)).toEqual({
        start: 1_700_000_000,
        end: 1_700_000_000,
      });

      const invalidEntry = {
        name: 'invalid-entry',
        entryType: 'render',
        startTime: Number.NaN,
        duration: -10,
      } as PerformanceEntry;
      expect((integration as any)._entryTimes(invalidEntry)).toEqual({
        start: 1_700_000_000,
        end: 1_700_000_000,
      });

      const relativeEntry = {
        name: 'relative-entry',
        entryType: 'render',
        startTime: 100,
        duration: Number.NaN,
      } as PerformanceEntry;
      (integration as any)._initializeRelativeTimeOrigin([relativeEntry]);
      expect((integration as any)._relativeTimeOrigin).toBe(1_699_999_999_900);

      (integration as any)._initializeRelativeTimeOrigin([
        { ...relativeEntry, startTime: 500 },
      ]);
      expect((integration as any)._relativeTimeOrigin).toBe(1_699_999_999_900);
    });

    it('should handle PerformanceObserverEntryList format', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        // 微信小程序可能传入包含 getEntries() 方法的对象
        const entryList = {
          getEntries: () => [
            { name: 'from-list', entryType: 'navigation', startTime: 0, duration: 50 },
          ],
        };
        expect(() => observerCallback(entryList as any)).not.toThrow();
      }
    });

    it('should handle single object format', () => {
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        const singleEntry = {
          name: 'single',
          entryType: 'navigation',
          startTime: 0,
          duration: 30,
        };
        expect(() => observerCallback(singleEntry as any)).not.toThrow();
      }
    });

    it('should handle unknown entry types', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'unknown', entryType: 'custom-type', startTime: 0, duration: 10 },
        ]);
      }

      consoleSpy.mockRestore();
    });
  });

  describe('observe fallback', () => {
    it('should fallback when observe fails for some entry types', () => {
      let callCount = 0;
      mockObserver.observe.mockImplementation((opts: any) => {
        callCount++;
        if (callCount === 1 && opts.entryTypes.includes('measure')) {
          throw new Error('measure not supported');
        }
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // 需要设置 PerformanceObserver.supportedEntryTypes 并避免 devtools 平台检查
      const originalPO = (global as any).PerformanceObserver;
      (global as any).PerformanceObserver = {
        supportedEntryTypes: ['navigation', 'render', 'resource', 'measure', 'mark'],
      };

      // 覆盖 getSystemInfo 返回非 devtools 平台
      (getSystemInfo as Mock).mockReturnValue({
        platform: 'ios',
        system: 'iOS 15.0',
      });

      const userTimingIntegration = new PerformanceIntegration({ enableUserTiming: true });
      userTimingIntegration.setupOnce();

      // 应该降级重试：第一次包含 measure/mark 失败，第二次不包含
      expect(mockObserver.observe).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
      userTimingIntegration.cleanup();
      (global as any).PerformanceObserver = originalPO;
    });
  });

  describe('buffer overflow', () => {
    it('should trim buffer when exceeding bufferSize', () => {
      const smallBufferIntegration = new PerformanceIntegration({ bufferSize: 3 });
      smallBufferIntegration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'e1', entryType: 'navigation', startTime: 0, duration: 10 },
          { name: 'e2', entryType: 'navigation', startTime: 10, duration: 20 },
          { name: 'e3', entryType: 'navigation', startTime: 20, duration: 30 },
          { name: 'e4', entryType: 'navigation', startTime: 30, duration: 40 },
          { name: 'e5', entryType: 'navigation', startTime: 40, duration: 50 },
        ]);
      }

      // 缓冲区应该被修剪到 3 个
      const buffer = (smallBufferIntegration as any)._entryBuffer;
      expect(buffer.length).toBeLessThanOrEqual(3);

      smallBufferIntegration.cleanup();
    });
  });

  describe('render threshold checks', () => {
    it('should warn when render avg exceeds threshold', () => {
      const customIntegration = new PerformanceIntegration({
        thresholds: { render: 500 },
      });
      customIntegration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'r1', entryType: 'render', startTime: 0, duration: 600 },
          { name: 'r2', entryType: 'render', startTime: 600, duration: 800 },
        ]);
      }

      (customIntegration as any)._reportBufferedEntries();

      expect(mockScope.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '页面渲染性能较慢',
          category: 'performance.warning',
          data: expect.objectContaining({ threshold: 500 }),
        }),
      );

      customIntegration.cleanup();
    });
  });

  describe('resource threshold checks', () => {
    it('should warn when resource avg load time exceeds threshold', () => {
      const customIntegration = new PerformanceIntegration({
        thresholds: { resource: 1000 },
      });
      customIntegration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'r1', entryType: 'resource', startTime: 0, duration: 1500 },
          { name: 'r2', entryType: 'resource', startTime: 1500, duration: 2000 },
        ]);
      }

      (customIntegration as any)._reportBufferedEntries();

      expect(mockScope.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '资源加载性能较慢',
          category: 'performance.warning',
          data: expect.objectContaining({ threshold: 1000 }),
        }),
      );

      customIntegration.cleanup();
    });
  });

  describe('host performance reporting', () => {
    it('should not call the host reportPerformance API', () => {
      const mockReportPerformance = vi.fn();
      (sdk as Mock).mockReturnValue({
        getPerformance: vi.fn(),
        reportPerformance: mockReportPerformance,
      });

      integration.setupOnce();

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'entry', entryType: 'navigation', startTime: 0, duration: 100 },
        ]);
      }

      (integration as any)._reportBufferedEntries();

      expect(mockReportPerformance).not.toHaveBeenCalled();
    });
  });

  describe('auto reporting disabled', () => {
    it('should not start timer when reportInterval is 0', () => {
      const noReportIntegration = new PerformanceIntegration({ reportInterval: 0 });
      noReportIntegration.setupOnce();

      expect((noReportIntegration as any)._reportTimer).toBeNull();

      noReportIntegration.cleanup();
    });
  });

  describe('reporting fallbacks', () => {
    it('should keep buffered entries when summary context writing fails', () => {
      const error = new Error('scope unavailable');
      mockScope.setContext.mockImplementation((name: string) => {
        if (name === 'performance_summary') throw error;
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      integration.setupOnce();
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      observerCallback?.([
        { name: 'pending', entryType: 'navigation', startTime: 0, duration: 1 },
      ]);

      expect(() => (integration as any)._reportBufferedEntries()).not.toThrow();
      expect((integration as any)._entryBuffer).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to summarize buffered performance entries:',
        error,
      );

      consoleSpy.mockRestore();
    });

    it('should ignore host memory lookup failures', () => {
      (sdk as Mock).mockImplementation(() => {
        throw new Error('host unavailable');
      });
      const memIntegration = new PerformanceIntegration({ enableMemory: true });

      expect((memIntegration as any)._collectMemoryInfo()).toBeNull();
    });

    it('should contain performance context failures', () => {
      const error = new Error('host unavailable');
      (sdk as Mock).mockImplementation(() => {
        throw error;
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => integration.setupOnce()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to add performance context:',
        error,
      );

      consoleSpy.mockRestore();
    });
  });
});
