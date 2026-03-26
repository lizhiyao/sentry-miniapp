import { getCurrentScope, initAndBind, setContext, withScope } from '@sentry/core';
import type { Integration } from '@sentry/core';
import { miniappStackParser } from './stacktrace';

import { MiniappClient } from './client';
import { appName, getSystemInfo, isMiniappEnvironment } from './crossPlatform';
import {
  GlobalHandlers,
  TryCatch,
  LinkedErrors,
  HttpContext,
  Dedupe,
  performanceIntegration,
  RewriteFrames,
  NetworkBreadcrumbs,
  PageBreadcrumbs,
  ConsoleBreadcrumbs,
  SessionIntegration,
  NetworkStatusIntegration,
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
export function init(options: MiniappOptions = {}): MiniappClient | undefined {
  if (!isMiniappEnvironment()) {
    console.warn('[sentry-miniapp] Not running in a supported miniapp environment');
    return undefined;
  }

  const opts = {
    ...options,
    integrations: options.integrations || defaultIntegrations,
    stackParser: miniappStackParser,
    transport: options.transport,
  };

  if (opts.enableSourceMap !== false) {
    opts.integrations.push(new RewriteFrames());
  }

  const networkOptions: Record<string, any> = { traceNetworkBody: opts.traceNetworkBody };
  if (opts.enableTracePropagation !== undefined) {
    networkOptions['enableTracePropagation'] = opts.enableTracePropagation;
  }
  if (opts.tracePropagationTargets !== undefined) {
    networkOptions['tracePropagationTargets'] = opts.tracePropagationTargets;
  }
  opts.integrations.push(new NetworkBreadcrumbs(networkOptions));

  // 自动 Session 管理（默认启用）
  if (opts.enableAutoSessionTracking !== false) {
    opts.integrations.push(new SessionIntegration());
  }

  // 页面生命周期和用户交互面包屑（默认启用）
  if (opts.enableUserInteractionBreadcrumbs !== false) {
    opts.integrations.push(new PageBreadcrumbs());
  }

  // 网络状态实时监控（默认启用）
  if (opts.enableNetworkStatusMonitoring !== false) {
    opts.integrations.push(new NetworkStatusIntegration());
  }

  // Console 面包屑（默认禁用，需手动开启）
  if (opts.enableConsoleBreadcrumbs) {
    opts.integrations.push(new ConsoleBreadcrumbs());
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initAndBind(MiniappClient as any, opts as any);
  return getCurrentScope().getClient() as MiniappClient;
}

/**
 * @deprecated Miniapp environment does not support Sentry's default HTML report dialog.
 * Please implement your own UI form to collect user feedback (name, email, comments)
 * and use `Sentry.captureFeedback()` to submit it to Sentry.
 *
 * 小程序环境不支持 Sentry 官方的 HTML 反馈弹窗。
 * 请自行实现 UI 表单收集用户反馈，并调用 `Sentry.captureFeedback()` 进行上报。
 */
export function showReportDialog(_options: ReportDialogOptions = {}): void {
  console.warn(
    '[sentry-miniapp] showReportDialog is deprecated and does nothing. ' +
      'Please build your own UI and use `Sentry.captureFeedback()` instead.',
  );
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
  return function (this: any, ...args: Parameters<T>) {
    return withScope(() => {
      try {
        return fn.apply(this, args);
      } catch (error) {
        getCurrentScope().captureException(error);
        throw error;
      }
    });
  } as T;
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
    console.warn('[sentry-miniapp] No client available for captureFeedback');
    return '';
  }
}
