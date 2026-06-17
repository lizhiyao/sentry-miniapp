import type { Event, Integration, IntegrationFn } from '@sentry/core';

import { sdk, getSystemInfo } from '../crossPlatform';

/** Add node request data to the event */
export class HttpContext implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'HttpContext';

  /**
   * @inheritDoc
   */
  public name: string = HttpContext.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // This integration adds context during event processing
  }

  /**
   * @inheritDoc
   */
  public processEvent(event: Event): Event {
    // runtime 与 appId 来源的 app 是本集成独有的贡献。
    // device 由 MiniappClient._prepareEvent 统一写（唯一权威，避免多处重复）；
    // network 由 NetworkStatusIntegration 写（带连接状态，且不走异步回调时序）。
    const miniappVersion = this._getMiniappVersion();
    const appName = this._getAppName();
    const appVersion = this._getAppVersion();

    event.contexts = {
      ...event.contexts,
      runtime: {
        ...(event.contexts?.['runtime'] || {}),
        name: 'miniapp',
        version: miniappVersion,
      },
      app: {
        ...(event.contexts?.['app'] || {}),
        name: appName,
        version: appVersion,
      },
    };

    return event;
  }

  /**
   * Get miniapp version
   */
  private _getMiniappVersion(): string {
    const sys = getSystemInfo();
    return sys?.version || sys?.SDKVersion || 'unknown';
  }

  /**
   * Get app name
   */
  private _getAppName(): string {
    try {
      if (sdk().getAccountInfoSync) {
        const accountInfo = sdk().getAccountInfoSync?.();
        return accountInfo.miniProgram?.appId || 'unknown';
      }
    } catch (_e) {
      // Ignore errors
    }
    return 'unknown';
  }

  /**
   * Get app version
   */
  private _getAppVersion(): string {
    try {
      if (sdk().getAccountInfoSync) {
        const accountInfo = sdk().getAccountInfoSync?.();
        return accountInfo?.miniProgram?.version || 'unknown';
      }
    } catch (_e) {
      // Ignore errors
    }
    return 'unknown';
  }
}

/**
 * HttpContext integration
 */
export const httpContextIntegration: IntegrationFn = () => {
  return new HttpContext();
};
