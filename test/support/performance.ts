import { vi, type Mock, type Mocked } from 'vitest';
import type { PerformanceIntegration } from '../../src/integrations/performance';
import type { PerformanceManager, PerformanceObserver } from '../../src/crossPlatform';

interface PerformanceTestDependencies {
  PerformanceIntegration: new () => PerformanceIntegration;
  getPerformanceManager: Mock;
  getSystemInfo: Mock;
  sdk: Mock;
  getClient: Mock;
  getCurrentScope: Mock;
  startInactiveSpan: Mock;
  startSpan: Mock;
}

export interface PerformanceTestHarness {
  integration: PerformanceIntegration;
  mockPerformanceManager: Mocked<PerformanceManager>;
  mockObserver: Mocked<PerformanceObserver>;
  mockScope: {
    setTag: Mock;
    setContext: Mock;
    addBreadcrumb: Mock;
  };
  mockSpan: {
    setAttributes: Mock;
    end: Mock;
  };
}

export function createPerformanceTestHarness(
  dependencies: PerformanceTestDependencies,
): PerformanceTestHarness {
  vi.clearAllMocks();

  const mockObserver: Mocked<PerformanceObserver> = {
    observe: vi.fn(),
    disconnect: vi.fn(),
  };
  const mockPerformanceManager: Mocked<PerformanceManager> = {
    getEntries: vi.fn(() => []),
    getEntriesByType: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
    mark: vi.fn(),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    createObserver: vi.fn(() => mockObserver),
  };
  const mockScope = {
    setTag: vi.fn(),
    setContext: vi.fn(),
    addBreadcrumb: vi.fn(),
  };
  const mockSpan = {
    setAttributes: vi.fn(),
    end: vi.fn(),
  };

  dependencies.getPerformanceManager.mockReset().mockReturnValue(mockPerformanceManager);
  dependencies.getSystemInfo.mockReset().mockReturnValue({ platform: 'devtools' });
  dependencies.sdk.mockReset().mockReturnValue({ getPerformance: vi.fn() });
  dependencies.getClient.mockReset().mockReturnValue(undefined);
  dependencies.getCurrentScope.mockReset().mockReturnValue(mockScope);
  dependencies.startInactiveSpan.mockReset().mockReturnValue(mockSpan);
  dependencies.startSpan
    .mockReset()
    .mockImplementation((_options: unknown, callback: (span: unknown) => unknown) =>
      callback(mockSpan),
    );

  return {
    integration: new dependencies.PerformanceIntegration(),
    mockPerformanceManager,
    mockObserver,
    mockScope,
    mockSpan,
  };
}
