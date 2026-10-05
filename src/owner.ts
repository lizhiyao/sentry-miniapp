import { getClient, getCurrentScope, getIsolationScope, withScope } from '@sentry/core';
import type { Client, Scope } from '@sentry/core';
import { getClientLifetime, withTelemetryCritical, type ClientLifetime } from './lifecycle';

/** 自动操作的单次归属；退休后只剩小 token，不持有旧 client/scope。 */
export class OwnerToken {
  private _client: Client | undefined;
  private _scope: Scope | undefined;
  private _lifetime: ClientLifetime | undefined;
  private readonly _detach = new Set<() => void>();
  private readonly _releaseCallbacks = new Set<() => void>();

  public constructor(client: Client) {
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    this._client = client;
    this._scope = getCurrentScope().clone();
    this._scope.setClient(client);
    this._scope.setSession(this._scope.getSession() ?? getIsolationScope().getSession());
    this._lifetime = lifetime;
    const stop = this._lifetime?.registerStop(() => this.release());
    if (stop && this._client) this._detach.add(stop);
  }

  public isActive(): boolean {
    return (
      !!this._client &&
      getClient() === this._client &&
      this._client.getOptions().enabled !== false &&
      (!this._lifetime || this._lifetime.canCollectAutomatic())
    );
  }

  public run<T>(callback: (client: Client) => T): T | undefined {
    if (!this.isActive()) return undefined;
    return this.inScope(callback);
  }

  private inScope<T>(callback: (client: Client) => T): T | undefined {
    const client = this._client;
    const captured = this._scope;
    if (!client || !captured) return undefined;
    let result!: T;
    withScope(captured, () => {
      result = withTelemetryCritical(() => callback(client));
    });
    return result;
  }

  public registerFinalizer(callback: (reason: string) => void): void {
    const lifetime = this._lifetime;
    if (!lifetime || !this._client) return;
    this._detach.add(
      lifetime.registerFinalizer(() => {
        if (lifetime.acceptsTelemetry()) this.inScope(() => callback(lifetime.closingReason));
      }),
    );
  }

  public onRelease(callback: () => void): void {
    if (this._client) this._releaseCallbacks.add(callback);
    else callback();
  }

  public release(): void {
    this._client = undefined;
    this._scope = undefined;
    this._lifetime = undefined;
    for (const detach of this._detach) detach();
    this._detach.clear();
    const callbacks = [...this._releaseCallbacks];
    this._releaseCallbacks.clear();
    for (const callback of callbacks) {
      try {
        callback();
      } catch (_error) {
        /* 释放仍继续。 */
      }
    }
  }
}

/** 同步退休可能早于宿主实际保存监听；注册返回时再解除迟到资源。 */
export function registerOwnerListener(
  owner: OwnerToken | undefined,
  host: object,
  onName: string,
  offName: string,
  handler: Function,
): void {
  if (!owner?.isActive()) return;
  const source = host as Record<string, unknown>;
  const on = source[onName];
  const off = source[offName];
  if (typeof on !== 'function' || !owner.isActive()) return;
  try {
    on.call(host, handler);
  } finally {
    if (!owner.isActive() && typeof off === 'function') off.call(host, handler);
  }
}
