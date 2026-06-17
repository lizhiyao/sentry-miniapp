import { addBreadcrumb, setContext, getClient } from '@sentry/core';
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
  private _lastConnected: boolean | null = null;

  public setupOnce(): void {
    const miniappSdk = sdk();
    if (!miniappSdk) return;

    // 初始获取网络状态
    if (typeof miniappSdk.getNetworkType === 'function') {
      try {
        miniappSdk.getNetworkType({
          success: (res: any) => {
            const networkType = res.networkType || 'unknown';
            this._lastConnected = networkType !== 'none';
            setContext('network', {
              type: networkType,
              isConnected: this._lastConnected,
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

        // 网络从断到连：主动 flush，尽快补发离线期间积压的事件。best-effort——
        // 不保证排空离线 store（其重放仍由 transport 的退避 / 启动重试负责）。
        if (isConnected && this._lastConnected === false) {
          try {
            void getClient()?.flush();
          } catch (_e) {
            // ignore
          }
        }
        this._lastConnected = isConnected;
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
