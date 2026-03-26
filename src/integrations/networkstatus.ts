import { addBreadcrumb, setContext } from '@sentry/core';
import type { Integration } from '@sentry/core';
import { sdk } from '../crossPlatform';

/**
 * Network Status Integration
 * 实时监控网络状态变化，在网络切换时自动添加面包屑并更新上下文。
 */
export class NetworkStatusIntegration implements Integration {
  public static id: string = 'NetworkStatus';
  public name: string = NetworkStatusIntegration.id;

  private _statusChangeHandler: ((res: any) => void) | null = null;

  public setupOnce(): void {
    const miniappSdk = sdk();
    if (!miniappSdk) return;

    // 初始获取网络状态
    if (typeof miniappSdk.getNetworkType === 'function') {
      try {
        miniappSdk.getNetworkType({
          success: (res: any) => {
            const networkType = res.networkType || 'unknown';
            setContext('network', {
              type: networkType,
              isConnected: networkType !== 'none',
            });
          },
        });
      } catch (_e) {
        // ignore
      }
    }

    // 监听网络状态变化
    if (typeof miniappSdk.onNetworkStatusChange === 'function') {
      this._statusChangeHandler = (res: any) => {
        const networkType = res.networkType || 'unknown';
        const isConnected =
          res.isConnected !== undefined ? res.isConnected : networkType !== 'none';

        setContext('network', {
          type: networkType,
          isConnected,
        });

        addBreadcrumb({
          category: 'network.change',
          message: `网络状态变化: ${networkType}`,
          level: isConnected ? 'info' : 'warning',
          data: {
            networkType,
            isConnected,
          },
        });
      };

      miniappSdk.onNetworkStatusChange(this._statusChangeHandler);
    }
  }

  public cleanup(): void {
    if (this._statusChangeHandler) {
      const miniappSdk = sdk();
      if (miniappSdk && typeof miniappSdk.offNetworkStatusChange === 'function') {
        try {
          miniappSdk.offNetworkStatusChange(this._statusChangeHandler);
        } catch (_e) {
          // ignore
        }
      }
      this._statusChangeHandler = null;
    }
  }
}
