import {
  getCurrentScope,
  initAndBind,
  setContext,
  withScope,
} from '@sentry/core';
import type {
  Integration,
} from '@sentry/core';

import { MiniappClient } from './client';
import { appName, getSystemInfo, isMiniappEnvironment } from './crossPlatform';
import {
  GlobalHandlers,
  TryCatch,
  LinkedErrors,
  HttpContext,
  Dedupe,
  performanceIntegration,
} from './integrations/index';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';

/**
 * Default integrations for the miniapp SDK
 */
export const defaultIntegrations: Integration[] = [
  // Core integrations
  new HttpContext(),
  new Dedupe(),
  new GlobalHandlers(),
  new TryCatch(),
  new LinkedErrors(),
  // Performance monitoring
  performanceIntegration({
    enableNavigation: true,
    enableRender: true,
    enableResource: true,
    enableUserTiming: true,
    sampleRate: 1.0,
    reportInterval: 30000,
  }),
];

/**
 * Get default integrations for the miniapp SDK
 * @returns Array of default integrations
 */
export function getDefaultIntegrations(): Integration[] {
  return [...defaultIntegrations];
}

/**
 * Initialize the Sentry Miniapp SDK
 * @param options Configuration options for the SDK
 */
export function init(options: MiniappOptions = {} as any): MiniappClient | undefined {
  if (!isMiniappEnvironment()) {
    console.warn('sentry-miniapp: Not running in a supported miniapp environment');
    return undefined;
  }

  const opts = {
    ...options,
    integrations: options.integrations || defaultIntegrations,
    stackParser: () => [],
    transport: options.transport,
  };

  // Set platform context
  setContext('miniapp', {
    platform: appName,
    environment: 'miniapp',
  });

  // Add system information
  const systemInfo = getSystemInfo();
  if (systemInfo) {
    setContext('device', {
      brand: systemInfo.brand,
      model: systemInfo.model,
      language: systemInfo.language,
      system: systemInfo.system,
      platform: systemInfo.platform,
      screen_resolution: `${systemInfo.screenWidth}x${systemInfo.screenHeight}`,
    });

    setContext('app', {
      sdk_version: systemInfo.SDKVersion,
      version: systemInfo.version,
    });
  }

  initAndBind(MiniappClient as any, opts as any);
  return getCurrentScope().getClient() as MiniappClient;
}

/**
 * Show a report dialog to the user to send feedback to a specific event.
 * 注意：小程序环境暂时不支持此功能
 *
 * @param options Set individual options for the dialog
 */
export function showReportDialog(options: ReportDialogOptions = {}): void {
  const client = getCurrentScope().getClient() as MiniappClient | undefined;
  if (client) {
    client.showReportDialog(options);
  } else {
    console.warn('sentry-miniapp: No client available for showReportDialog');
  }
}

/**
 * Get the last event ID
 */
export function lastEventId(): string | undefined {
  return getCurrentScope().lastEventId();
}

/**
 * Flush pending events
 */
export function flush(timeout?: number): PromiseLike<boolean> {
  const client = getCurrentScope().getClient();
  if (client) {
    return client.flush(timeout);
  }
  return Promise.resolve(false);
}

/**
 * Close the SDK
 */
export function close(timeout?: number): PromiseLike<boolean> {
  const client = getCurrentScope().getClient();
  if (client) {
    return client.close(timeout);
  }
  return Promise.resolve(false);
}

/**
 * Wrap a function to capture exceptions
 */
export function wrap<T extends (...args: any[]) => any>(fn: T): T {
  return (function(this: any, ...args: Parameters<T>) {
    return withScope(() => {
      try {
        return fn.apply(this, args);
      } catch (error) {
        getCurrentScope().captureException(error);
        throw error;
      }
    });
  }) as T;
}



/**
 * Capture feedback using the new feedback API.
 * 使用新的反馈 API 捕获反馈
 *
 * @param params Feedback parameters
 * @returns Event ID
 */
export function captureFeedback(params: SendFeedbackParams): string {
  const client = getCurrentScope().getClient() as MiniappClient | undefined;
  if (client) {
    return client.captureFeedback(params);
  } else {
    console.warn('sentry-miniapp: No client available for captureFeedback');
    return '';
  }
}