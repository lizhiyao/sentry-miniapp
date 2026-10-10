import { vi, type Mock } from 'vitest';
import type { NetworkBreadcrumbs } from '../../src/integrations/networkbreadcrumbs';
import type * as CrossPlatform from '../../src/crossPlatform';

interface NetworkBreadcrumbsTestDependencies {
  crossPlatform: typeof CrossPlatform;
  mockGetClient: Mock;
}

export function createNetworkBreadcrumbsTestHarness(
  dependencies: NetworkBreadcrumbsTestDependencies,
): {
  beforeEach: () => Mock;
  afterEach: () => void;
  setupIntegration: (
    integration: NetworkBreadcrumbs,
    clientOptions?: Record<string, unknown>,
  ) => () => void;
} {
  const activeCleanups = new Set<() => void>();

  return {
    beforeEach(): Mock {
      vi.clearAllMocks();
      dependencies.mockGetClient.mockReturnValue(undefined);

      const requestMock = vi.fn((options) => {
        options.success?.({ statusCode: 200, data: { status: 'ok' } });
      });
      vi.spyOn(dependencies.crossPlatform, 'sdk').mockReturnValue({
        request: requestMock,
      });
      return requestMock;
    },

    afterEach(): void {
      for (const cleanup of activeCleanups) cleanup();
      activeCleanups.clear();
      vi.restoreAllMocks();
    },

    setupIntegration(
      integration: NetworkBreadcrumbs,
      clientOptions: Record<string, unknown> = {},
    ): () => void {
      const registerCleanup = vi.fn((cleanup: () => void) => {
        activeCleanups.add(cleanup);
      });
      const client = {
        getOptions: () => ({ dsn: 'https://key@sentry.io/123', ...clientOptions }),
        getDsn: () => ({ host: 'sentry.io' }),
        registerCleanup,
        // core 读采集开关的入口；返回空对象即按 core 默认（全部 true）。
        getDataCollectionOptions: () => ({}),
      } as any;
      dependencies.mockGetClient.mockReturnValue(client);
      integration.setup(client);
      return registerCleanup.mock.calls[0]![0];
    },
  };
}
