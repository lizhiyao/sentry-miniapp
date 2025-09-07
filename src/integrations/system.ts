import { getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';

import { getSystemInfo, sdk } from '../crossPlatform';

/** System information integration */
export class System implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'System';

  /**
   * @inheritDoc
   */
  public name: string = System.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._addSystemContext();
    this._addNetworkContext();
    this._addLocationContext();
  }

  /**
   * Add system information to context
   */
  private _addSystemContext(): void {
    try {
      const systemInfo = getSystemInfo();
      if (systemInfo) {
        const scope = getCurrentScope();
        
        // Set device context
        scope.setContext('device', {
          name: systemInfo.model,
          model: systemInfo.model,
          brand: systemInfo.brand,
          family: systemInfo.platform,
          arch: systemInfo.platform,
        });

        // Set OS context
        scope.setContext('os', {
          name: systemInfo.system?.split(' ')[0] || 'unknown',
          version: systemInfo.system?.split(' ')[1] || 'unknown',
          kernel_version: systemInfo.version,
        });

        // Set app context
        scope.setContext('app', {
          app_name: (systemInfo as any).appName || 'unknown',
          app_version: systemInfo.version,
        });

        // Set screen context
        scope.setContext('screen', {
          screen_width: systemInfo.screenWidth,
          screen_height: systemInfo.screenHeight,
          screen_density: systemInfo.pixelRatio,
        });

        // Set tags
        scope.setTag('device.model', systemInfo.model);
        scope.setTag('device.brand', systemInfo.brand);
        scope.setTag('os.name', systemInfo.system?.split(' ')[0] || 'unknown');
        scope.setTag('os.version', systemInfo.system?.split(' ')[1] || 'unknown');
        scope.setTag('app.version', systemInfo.version);
        scope.setTag('language', systemInfo.language);
      }
    } catch (e) {
      // Ignore errors when getting system info
    }
  }

  /**
   * Add network information to context
   */
  private _addNetworkContext(): void {
    try {
      if ((sdk() as any).getNetworkType) {
      (sdk() as any).getNetworkType({
          success: (res: { networkType: string; isConnected?: boolean }) => {
            const scope = getCurrentScope();
            scope.setContext('network', {
              type: res.networkType,
              connected: res.isConnected !== false,
            });
            scope.setTag('network.type', res.networkType);
          },
          fail: () => {
            // Ignore network type fetch errors
          },
        });
      }
    } catch (e) {
      // Ignore errors when getting network info
    }
  }

  /**
   * Add location information to context (if available)
   */
  private _addLocationContext(): void {
    try {
      if ((sdk() as any).getLocation) {
      (sdk() as any).getLocation({
          type: 'gcj02',
          success: (res: { latitude: number; longitude: number; accuracy: number }) => {
            const scope = getCurrentScope();
            scope.setContext('location', {
              latitude: res.latitude,
              longitude: res.longitude,
              accuracy: res.accuracy,
            });
          },
          fail: () => {
            // Ignore location fetch errors (user might not grant permission)
          },
        });
      }
    } catch (e) {
      // Ignore errors when getting location info
    }
  }
}

/**
 * System integration
 */
export const systemIntegration: IntegrationFn = () => {
  return new System();
};