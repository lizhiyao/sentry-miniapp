import { getClient, getCurrentScope, getIsolationScope, withScope } from '@sentry/core';
import type { Client, Scope } from '@sentry/core';
import { getClientLifetime, withTelemetryCritical, type ClientLifetime } from './lifecycle';

/** 调度任务固定采集时会话；长期 producer 执行时使用当前 isolation episode。 */
export class OwnerToken {
  private _client: Client | undefined;
  private _scope: Scope | undefined;
  private _lifetime: ClientLifetime | undefined;
  private readonly _detach = new Set<() => void>();
  private readonly _releaseCallbacks = new Set<() => void>();
  private readonly _sessionStrategy: 'capture' | 'current';

  public constructor(client: Client, sessionStrategy: 'capture' | 'current' = 'capture') {
    this._sessionStrategy = sessionStrategy;
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    this._client = client;
    this._scope = getCurrentScope().clone();
    this._scope.setClient(client);
    this._scope.setSession(
      sessionStrategy === 'current'
        ? undefined
        : (this._scope.getSession() ?? getIsolationScope().getSession()),
    );
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
    const scope = this._sessionStrategy === 'current' ? captured.clone() : captured;
    if (this._sessionStrategy === 'current') scope.setSession(getIsolationScope().getSession());
    let result!: T;
    withScope(scope, () => {
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
