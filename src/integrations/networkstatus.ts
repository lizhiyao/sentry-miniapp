import { addBreadcrumb, getClient } from '@sentry/core';
import type { Client, Integration } from '@sentry/core';
import { sdk } from '../crossPlatform';
import { setClientContext } from '../clientState';
import { getClientLifetime, withTelemetryCritical } from '../lifecycle';

/** 网络状态属于 client；同一 integration 对象可以被多个 client 复用。 */
export class NetworkStatusIntegration implements Integration {
  public static id = 'NetworkStatus';
  public name = NetworkStatusIntegration.id;
  private readonly _owners = new WeakSet<Client>();
  private readonly _cleanups = new Set<() => void>();

  public setup(client: Client): void {
    if (this._owners.has(client)) return;
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    let owner: Client | undefined = client;
    let lastConnected: boolean | null = null;
    let observedChange = false;
    let source: ReturnType<typeof sdk> | undefined;
    this._owners.add(client);
    const isActive = (): boolean =>
      !!owner &&
      getClient() === owner &&
      owner.getOptions().enabled !== false &&
      (!lifetime || lifetime.canCollectAutomatic());
    const collect = (res: any, changed: boolean): void => {
      if (!isActive() || (!changed && observedChange)) return;
      withTelemetryCritical(() => {
        try {
          const current = owner!;
          const networkType = res.networkType || 'unknown';
          if (!isActive()) return;
          const connectedValue = changed ? res.isConnected : undefined;
          const connected = connectedValue !== undefined ? connectedValue : networkType !== 'none';
          if (!isActive()) return;
          const reconnect = changed && connected && lastConnected === false;
          lastConnected = connected;
          if (changed) observedChange = true;
          setClientContext(current, 'network', { type: networkType, isConnected: connected });
          if (!changed) return;
          addBreadcrumb({
            category: 'network.change',
            message: `网络状态变化: ${networkType}`,
            level: connected ? 'info' : 'warning',
            data: { networkType, isConnected: connected },
          });
          // 起始同步，等待在 owner scope 外；拒绝被接住，不制造全局 rejection。
          if (reconnect && isActive()) void Promise.resolve(current.flush()).catch(() => {});
        } catch (_error) {
          /* 宿主数据或同步 flush 故障不阻断宿主。 */
        }
      });
    };
    const handler = (res: any): void => collect(res, true);
    const cleanup = (): void => {
      const held = owner;
      if (!held) return;
      owner = undefined;
      lastConnected = null;
      this._owners.delete(held);
      this._cleanups.delete(cleanup);
      const host = source;
      source = undefined;
      try {
        if (typeof host?.offNetworkStatusChange === 'function')
          host.offNetworkStatusChange(handler);
      } catch (_error) {
        /* 缺 off 或 off 失败时，旧回调也已失效。 */
      }
    };
    this._cleanups.add(cleanup);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
    source = sdk();
    try {
      if (typeof source?.getNetworkType === 'function')
        source.getNetworkType({ success: (res: any) => collect(res, false) });
    } catch (_error) {
      /* 一个能力不可用不阻断另一个监听。 */
    }
    try {
      const host = source;
      const on = host?.onNetworkStatusChange;
      const off = host?.offNetworkStatusChange;
      if (typeof on === 'function' && isActive()) {
        try {
          on.call(host, handler);
        } finally {
          if (!isActive() && typeof off === 'function') off.call(host, handler);
        }
      }
    } catch (_error) {
      /* 已登记 cleanup，部分注册成功仍能退休。 */
    }
  }

  public cleanup(): void {
    for (const cleanup of [...this._cleanups]) cleanup();
  }
}

/** 每次装配创建独立实例，资源仍由 client lifetime 管理。 */
export function networkStatusIntegration(): Integration {
  return new NetworkStatusIntegration();
}
