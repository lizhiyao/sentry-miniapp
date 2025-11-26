import type { ClientOptions, Integration } from '@sentry/types';

/**
 * Configuration options for the Sentry Miniapp SDK.
 */
export interface MiniappOptions extends ClientOptions {
  defaultIntegrations?: Integration[];
}
