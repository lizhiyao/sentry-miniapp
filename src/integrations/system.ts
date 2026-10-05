import { getClientEnvironment } from '../clientState';
import { getClient, addBreadcrumb } from '@sentry/core';
import type { Client, Event, EventHint, Integration } from '@sentry/core';

import { sdk } from '../crossPlatform';

/**
 * System information integration.
 *
 * @deprecated 默认不启用，且其 system/device/network context 由 client EnvironmentState 统一提供。保留导出仅为向后兼容，将在 2.0 移除。请勿在新代码中使用。
 */
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
  private _client: Client | undefined;

  public setupOnce(): void {}

  public setup(client: Client): void {
    this._client = client;
    getClientEnvironment(client);
    this._addNetworkContext();
    this._addLocationContext();
    this._addStorageContext();
    this._checkAppUpdate();
    client.registerCleanup(() => {
      this._client = undefined;
    });
  }

  public processEvent(event: Event, _hint: EventHint, client: Client): Event {
    return getClientEnvironment(client).fillEvent(event);
  }

  private _getState() {
    const client = this._client;
    return client && getClient() === client ? getClientEnvironment(client) : undefined;
  }

  /**
   * Add network information to context
   */
  private _addNetworkContext(): void {
    try {
      if ((sdk() as any).getNetworkType) {
        (sdk() as any).getNetworkType({
          success: (res: { networkType: string; isConnected?: boolean }) => {
            const scope = this._getState();
            if (!scope) return;
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
    } catch (_e) {
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
            const scope = this._getState();
            if (!scope) return;
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
    } catch (_e) {
      // Ignore errors when getting location info
    }
  }
  /**
   * 采集存储配额信息
   */
  private _addStorageContext(): void {
    try {
      const miniappSdk = sdk();
      if (miniappSdk && typeof miniappSdk.getStorageInfoSync === 'function') {
        const info = miniappSdk.getStorageInfoSync();
        if (info) {
          const currentSize = info.currentSize || 0; // KB
          const limitSize = info.limitSize || 0; // KB
          const usagePercent = limitSize > 0 ? Math.round((currentSize / limitSize) * 100) : 0;

          const scope = this._getState();
          if (!scope) return;
          scope.setContext('storage', {
            currentSize,
            limitSize,
            usagePercent,
          });

          if (usagePercent >= 80) {
            addBreadcrumb({
              category: 'storage.warning',
              message: `存储使用率 ${usagePercent}%（${currentSize}KB / ${limitSize}KB）`,
              level: 'warning',
              data: { currentSize, limitSize, usagePercent },
            });
          }
        }
      }
    } catch (_e) {
      // ignore
    }
  }

  /**
   * 检测小程序更新
   */
  private _checkAppUpdate(): void {
    try {
      const miniappSdk = sdk();
      if (miniappSdk && typeof miniappSdk.getUpdateManager === 'function') {
        const updateManager = miniappSdk.getUpdateManager();
        if (updateManager) {
          if (typeof updateManager.onCheckForUpdate === 'function') {
            updateManager.onCheckForUpdate((res: any) => {
              if (res && res.hasUpdate) {
                const scope = this._getState();
                if (!scope) return;
                scope.setTag('has_update', 'true');

                addBreadcrumb({
                  category: 'app.update',
                  message: '检测到新版本可用',
                  level: 'info',
                  data: { hasUpdate: true },
                });
              }
            });
          }

          if (typeof updateManager.onUpdateReady === 'function') {
            updateManager.onUpdateReady(() => {
              if (!this._getState()) return;
              addBreadcrumb({
                category: 'app.update',
                message: '新版本已下载完成',
                level: 'info',
                data: { updateReady: true },
              });
            });
          }
        }
      }
    } catch (_e) {
      // ignore
    }
  }
}
