import { getCurrentScope } from '@sentry/core';
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
    const scope = getCurrentScope();

    // Add miniapp specific context
    const context = {
      runtime: {
        name: 'miniapp',
        version: this._getMiniappVersion(),
      },
      app: {
        name: this._getAppName(),
        version: this._getAppVersion(),
      },
      device: this._getDeviceInfo(),
      network: this._getNetworkInfo(),
    };

    scope.setContext('runtime', context.runtime);
    scope.setContext('app', context.app);
    scope.setContext('device', context.device);
    scope.setContext('network', context.network);

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
    } catch (e) {
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
    } catch (e) {
      // Ignore errors
    }
    return 'unknown';
  }

  /**
   * Get device information
   */
  private _getDeviceInfo(): Record<string, any> {
    const sys = getSystemInfo();
    if (!sys) return {};

    return {
      brand: sys.brand,
      model: sys.model,
      system: sys.system,
      platform: sys.platform,
      screenWidth: sys.screenWidth,
      screenHeight: sys.screenHeight,
      windowWidth: sys.windowWidth,
      windowHeight: sys.windowHeight,
      pixelRatio: sys.pixelRatio,
      language: sys.language,
    };
  }

  /**
   * Get network information
   */
  private _getNetworkInfo(): Record<string, any> {
    try {
      if ((sdk() as any).getNetworkType) {
        (sdk() as any).getNetworkType({
          success: (res: { networkType: string }) => {
            const scope = getCurrentScope();
            scope.setTag('network.type', res.networkType);
            scope.setContext('network', {
              type: res.networkType,
            });
          },
        });
      }
    } catch (e) {
      // Ignore errors
    }
    return {};
  }
}

/**
 * HttpContext integration
 */
export const httpContextIntegration: IntegrationFn = () => {
  return new HttpContext();
};