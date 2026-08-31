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
  setupIntegration: (integration: NetworkBreadcrumbs) => void;
} {
  const activeIntegrations = new Set<NetworkBreadcrumbs>();

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
      for (const integration of activeIntegrations) integration.cleanup();
      activeIntegrations.clear();
      vi.restoreAllMocks();
    },

    setupIntegration(integration: NetworkBreadcrumbs): void {
      const client = {
        getOptions: () => ({ dsn: 'https://key@sentry.io/123' }),
        getDsn: () => ({ host: 'sentry.io' }),
        registerCleanup: vi.fn(),
      } as any;
      dependencies.mockGetClient.mockReturnValue(client);
      integration.setup(client);
      activeIntegrations.add(integration);
    },
  };
}
