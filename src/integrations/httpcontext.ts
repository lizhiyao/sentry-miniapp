import { getCurrentScope } from '@sentry/core';
import type { Event, Integration, IntegrationFn } from '@sentry/core';

import { sdk } from '../crossPlatform';

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
    try {
      const currentSdk = sdk();
      
      // 优先使用新的 API
       if (currentSdk.getAppBaseInfo) {
         const appBaseInfo = currentSdk.getAppBaseInfo();
         return appBaseInfo?.version || appBaseInfo?.SDKVersion || 'unknown';
       }
      
      // 兜底使用旧的 API
      if (currentSdk.getSystemInfoSync) {
        const systemInfo = currentSdk.getSystemInfoSync?.();
        return systemInfo.version || systemInfo.SDKVersion || 'unknown';
      }
    } catch (e) {
      // Ignore errors
    }
    return 'unknown';
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
    try {
      const currentSdk = sdk();
      
      // 优先使用新的 API 组合
      if (currentSdk.getDeviceInfo && currentSdk.getWindowInfo) {
        const deviceInfo = currentSdk.getDeviceInfo();
        const windowInfo = currentSdk.getWindowInfo();
        return {
          brand: deviceInfo?.brand,
          model: deviceInfo?.model,
          system: deviceInfo?.system,
          platform: deviceInfo?.platform,
          screenWidth: windowInfo?.screenWidth,
          screenHeight: windowInfo?.screenHeight,
          windowWidth: windowInfo?.windowWidth,
          windowHeight: windowInfo?.windowHeight
        };
      }
      
      // 兜底使用旧的 API
      if (currentSdk.getSystemInfoSync) {
        const systemInfo = currentSdk.getSystemInfoSync();
        return {
          brand: systemInfo?.brand,
          model: systemInfo?.model,
          system: systemInfo?.system,
          platform: systemInfo?.platform,
          screenWidth: systemInfo?.screenWidth,
          screenHeight: systemInfo?.screenHeight,
          pixelRatio: systemInfo?.pixelRatio,
          language: systemInfo?.language,
        };
      }
    } catch (e) {
      // Ignore errors
    }
    return {};
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