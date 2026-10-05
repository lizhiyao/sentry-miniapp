import { getClientEnvironment } from '../src/clientState';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { getClient, getCurrentScope, startInactiveSpan, startSpan } from '@sentry/core';
import { PerformanceIntegration } from '../src/integrations/performance';
import { epochNow, getPerformanceManager, getSystemInfo, sdk } from '../src/crossPlatform';
import { createPerformanceTestHarness, type PerformanceTestHarness } from './support/performance';

vi.mock('@sentry/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/core')>()),
  getClient: vi.fn(),
  getCurrentScope: vi.fn(),
  startInactiveSpan: vi.fn(),
  startSpan: vi.fn(),
  withActiveSpan: vi.fn((_span, callback) => callback()),
  getCurrentHub: vi.fn(() => ({
    getClient: vi.fn(() => ({
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    })),
  })),
}));

vi.mock('../src/crossPlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/crossPlatform')>()),
  getPerformanceManager: vi.fn(),
  getSystemInfo: vi.fn(() => ({ platform: 'devtools' })),
  sdk: vi.fn(() => ({
    getPerformance: vi.fn(),
  })),
  epochNow: vi.fn(() => 1_700_000_000_000),
}));

describe('PerformanceIntegration entries and reporting', () => {
  let integration: PerformanceIntegration;
  let activeClient: PerformanceTestHarness['activeClient'];
  let mockPerformanceManager: PerformanceTestHarness['mockPerformanceManager'];
  let mockScope: PerformanceTestHarness['mockScope'];
  let mockObserver: PerformanceTestHarness['mockObserver'];
  let mockSpan: PerformanceTestHarness['mockSpan'];

  beforeEach(() => {
    vi.useFakeTimers();
    ({ integration, activeClient, mockPerformanceManager, mockObserver, mockScope, mockSpan } =
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
    vi.useRealTimers();
  });

  describe('resource entry processing', () => {
    it('should process resource entries with network timing', () => {
      integration.setup(activeClient as any);

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
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'resource.fetch_start': 510,
            'resource.response_end': 700,
            'resource.network_time': 190,
          }),
        }),
        expect.any(Function),
      );
      expect(mockSpan.end).toHaveBeenCalledWith(1_700_000_000);
    });

    it('should use resource defaults when optional timing data is absent', () => {
      integration.setup(activeClient as any);
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];

      observerCallback?.([
        { name: 'inline-resource', entryType: 'resource', startTime: 0, duration: 5 },
      ]);

      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'resource.type': 'unknown',
            'resource.transfer_size': 0,
            'resource.encoded_size': 0,
            'resource.decoded_size': 0,
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('user timing entry processing', () => {
    it('should process measure entries', () => {
      integration.setup(activeClient as any);

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
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'measure.name': 'api-call',
            'measure.duration': 300,
            'measure.detail': '{"url":"/api/data"}',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should omit absent measure details', () => {
      integration.setup(activeClient as any);
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];

      observerCallback?.([
        { name: 'plain-measure', entryType: 'measure', startTime: 0, duration: 1 },
      ]);

      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({ 'measure.detail': undefined }),
        }),
        expect.any(Function),
      );
    });

    it('should process mark entries as breadcrumbs', () => {
      integration.setup(activeClient as any);

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
    it('通过 observer 规范化 epoch/duration，非法 startTime 被忽略', () => {
      integration.setup(activeClient as any);
      const callback = mockPerformanceManager.createObserver.mock.calls[0]![0];
      callback([
        { name: 'epoch', entryType: 'navigation', startTime: 1_700_000_000_000, duration: NaN },
        { name: 'invalid', entryType: 'render', startTime: NaN, duration: -10 },
      ]);
      expect(startSpan).toHaveBeenCalledTimes(1);
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Navigation: epoch',
          startTime: 1_700_000_000,
        }),
        expect.any(Function),
      );
      expect(mockSpan.end).toHaveBeenCalledWith(1_700_000_000);
    });

    it('迟到首批数据的锚点不晚于 setup', () => {
      vi.mocked(epochNow).mockReturnValue(1_699_999_999_000);
      integration.setup(activeClient as any);
      vi.mocked(epochNow).mockReturnValue(1_700_000_000_000);
      const callback = mockPerformanceManager.createObserver.mock.calls[0]![0];
      callback([{ name: 'stale', entryType: 'render', startTime: 50, duration: 50 }]);
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Render: stale',
          startTime: 1_699_999_999.05,
        }),
        expect.any(Function),
      );
    });

    it('drops implausible relative entries before creating spans', () => {
      integration.setup(activeClient as any);
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];

      observerCallback?.([
        {
          name: 'implausible-runtime',
          entryType: 'render',
          startTime: 31 * 24 * 60 * 60 * 1000,
          duration: 0,
        },
      ]);

      expect(startInactiveSpan).not.toHaveBeenCalled();
      expect(mockSpan.end).not.toHaveBeenCalled();
    });

    it('observer 忽略过旧/未来/非法绝对时间，只创建可信条目', () => {
      const now = 1_700_000_000_000;
      integration.setup(activeClient as any);
      const callback = mockPerformanceManager.createObserver.mock.calls[0]![0];
      callback([
        { name: 'old', entryType: 'resource', startTime: now - 31 * 86_400_000, duration: 0 },
        { name: 'future', entryType: 'resource', startTime: now + 60_001, duration: 0 },
        { name: 'current', entryType: 'resource', startTime: now - 1000, duration: 500 },
        { name: 'invalid', entryType: 'resource', startTime: NaN, duration: 0 },
        { name: 'relative', entryType: 'render', startTime: 100, duration: NaN },
      ]);
      expect(startSpan).toHaveBeenCalledTimes(2);
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Resource: current' }),
        expect.any(Function),
      );
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Render: relative' }),
        expect.any(Function),
      );
    });

    it('should handle PerformanceObserverEntryList format', () => {
      integration.setup(activeClient as any);

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
      integration.setup(activeClient as any);

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
      integration.setup(activeClient as any);

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
      userTimingIntegration.setup(activeClient as any);

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
      smallBufferIntegration.setup(activeClient as any);

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

      vi.advanceTimersByTime(30000);
      expect(
        getClientEnvironment(activeClient as any).contexts.performance_summary?.total_entries,
      ).toBe(3);

      smallBufferIntegration.cleanup();
    });
  });

  describe('render threshold checks', () => {
    it('should warn when render avg exceeds threshold', () => {
      const customIntegration = new PerformanceIntegration({
        thresholds: { render: 500 },
      });
      customIntegration.setup(activeClient as any);

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'r1', entryType: 'render', startTime: 0, duration: 600 },
          { name: 'r2', entryType: 'render', startTime: 600, duration: 800 },
        ]);
      }

      vi.advanceTimersByTime(30000);

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
      customIntegration.setup(activeClient as any);

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([
          { name: 'r1', entryType: 'resource', startTime: 0, duration: 1500 },
          { name: 'r2', entryType: 'resource', startTime: 1500, duration: 2000 },
        ]);
      }

      vi.advanceTimersByTime(30000);

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

      integration.setup(activeClient as any);

      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      if (observerCallback) {
        observerCallback([{ name: 'entry', entryType: 'navigation', startTime: 0, duration: 100 }]);
      }

      vi.advanceTimersByTime(30000);

      expect(mockReportPerformance).not.toHaveBeenCalled();
    });
  });

  describe('auto reporting disabled', () => {
    it('should not start timer when reportInterval is 0', () => {
      const noReportIntegration = new PerformanceIntegration({ reportInterval: 0 });
      noReportIntegration.setup(activeClient as any);

      expect(vi.getTimerCount()).toBe(0);

      noReportIntegration.cleanup();
    });
  });

  describe('reporting fallbacks', () => {
    it('should keep buffered entries when summary context writing fails', () => {
      const error = new Error('scope unavailable');
      const contextSpy = vi
        .spyOn(getClientEnvironment(activeClient as any), 'setContext')
        .mockImplementation((name: string) => {
          if (name === 'performance_summary') throw error;
        });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      integration.setup(activeClient as any);
      const observerCallback = mockPerformanceManager.createObserver.mock.calls[0]?.[0];
      observerCallback?.([{ name: 'pending', entryType: 'navigation', startTime: 0, duration: 1 }]);

      expect(() => vi.advanceTimersByTime(30000)).not.toThrow();
      contextSpy.mockRestore();
      vi.advanceTimersByTime(30000);
      expect(
        getClientEnvironment(activeClient as any).contexts.performance_summary?.total_entries,
      ).toBe(1);
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

      memIntegration.setup(activeClient as any);
      const callback = mockPerformanceManager.createObserver.mock.calls[0]![0];
      callback([{ name: 'nav', entryType: 'navigation', startTime: 0, duration: 1 }]);
      vi.advanceTimersByTime(30000);
      expect(
        getClientEnvironment(activeClient as any).contexts.performance_summary?.memory,
      ).toBeUndefined();
      memIntegration.cleanup();
    });

    it('should contain performance context failures', () => {
      const error = new Error('host unavailable');
      (sdk as Mock).mockImplementation(() => {
        throw error;
      });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => integration.setup(activeClient as any)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to add performance context:',
        error,
      );

      consoleSpy.mockRestore();
    });
  });
});
