import { vi, type Mock, type Mocked } from 'vitest';
import type { PerformanceIntegration } from '../../src/integrations/performance';
import type {
  PerformanceManager,
  PerformanceObserver,
  PerformanceObserverCallback,
} from '../../src/crossPlatform';

type MockPerformanceManager = {
  getEntries: Mock<PerformanceManager['getEntries']>;
  getEntriesByType: Mock<PerformanceManager['getEntriesByType']>;
  getEntriesByName: Mock<PerformanceManager['getEntriesByName']>;
  mark: Mock<PerformanceManager['mark']>;
  measure: Mock<PerformanceManager['measure']>;
  clearMarks: Mock<PerformanceManager['clearMarks']>;
  clearMeasures: Mock<PerformanceManager['clearMeasures']>;
  createObserver: Mock<(callback: PerformanceObserverCallback) => PerformanceObserver>;
};

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
  mockPerformanceManager: MockPerformanceManager;
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
  const mockPerformanceManager: MockPerformanceManager = {
    getEntries: vi.fn<PerformanceManager['getEntries']>(() => []),
    getEntriesByType: vi.fn<PerformanceManager['getEntriesByType']>(() => []),
    getEntriesByName: vi.fn<PerformanceManager['getEntriesByName']>(() => []),
    mark: vi.fn<PerformanceManager['mark']>(),
    measure: vi.fn<PerformanceManager['measure']>(),
    clearMarks: vi.fn<PerformanceManager['clearMarks']>(),
    clearMeasures: vi.fn<PerformanceManager['clearMeasures']>(),
    createObserver: vi.fn<(callback: PerformanceObserverCallback) => PerformanceObserver>(
      () => mockObserver,
    ),
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
