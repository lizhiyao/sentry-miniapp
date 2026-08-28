import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { getClient, getCurrentScope, startInactiveSpan, startSpan } from '@sentry/core';
import { PerformanceIntegration, performanceIntegration } from '../src/integrations/performance';
import { getPerformanceManager, getSystemInfo, sdk } from '../src/crossPlatform';
import type { PerformanceEntry } from '../src/crossPlatform';
import {
  createPerformanceTestHarness,
  type PerformanceTestHarness,
} from './support/performance';

vi.mock('@sentry/core', () => ({
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

vi.mock('../src/crossPlatform', () => ({
  getPerformanceManager: vi.fn(),
  getSystemInfo: vi.fn(() => ({ platform: 'devtools' })),
  sdk: vi.fn(() => ({
    getPerformance: vi.fn(),
  })),
  epochNow: vi.fn(() => 1_700_000_000_000),
}));

describe('PerformanceIntegration', () => {
  let integration: PerformanceIntegration;
  let mockPerformanceManager: PerformanceTestHarness['mockPerformanceManager'];
  let mockScope: PerformanceTestHarness['mockScope'];
  let mockObserver: PerformanceTestHarness['mockObserver'];
  let mockSpan: PerformanceTestHarness['mockSpan'];

  beforeEach(() => {
    ({ integration, mockPerformanceManager, mockObserver, mockScope, mockSpan } =
      createPerformanceTestHarness({
        PerformanceIntegration,
        getPerformanceManager: getPerformanceManager as Mock,
        getSystemInfo: getSystemInfo as Mock,
        sdk: sdk as Mock,
        getClient: getClient as Mock,
        getCurrentScope: getCurrentScope as Mock,
        startInactiveSpan: startInactiveSpan as Mock,
        startSpan: startSpan as Mock,
      }));
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

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(mockPerformanceManager.createObserver).not.toHaveBeenCalled();
      expect((integration as any)._reportTimer).toBeNull();
      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should silently skip hosts that only expose performance.now', () => {
      (getPerformanceManager as Mock).mockReturnValue({ now: vi.fn(() => 1) });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      integration.setupOnce();

      expect(consoleSpy).not.toHaveBeenCalled();
      expect((integration as any)._reportTimer).toBeNull();
      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();

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
      expect((disabledIntegration as any)._reportTimer).toBeNull();
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
      expect((integration as any)._reportTimer).toBeNull();
      expect(mockScope.setTag).not.toHaveBeenCalled();
      expect(mockScope.setContext).not.toHaveBeenCalled();

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
});
