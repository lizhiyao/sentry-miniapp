let telemetryDepth = 0;
let activeRuntimeToken: object | undefined;
const clientLifetimes = new WeakMap<object, ClientLifetime>();

export function registerClientLifetime(client: object, lifetime: ClientLifetime): void {
  clientLifetimes.set(client, lifetime);
}

export function getClientLifetime(client: object): ClientLifetime | undefined {
  return clientLifetimes.get(client);
}

/** 只覆盖同步调用栈，不持有 await 锁或异步上下文。 */
export function withTelemetryCritical<T>(callback: () => T): T {
  telemetryDepth++;
  try {
    return callback();
  } finally {
    telemetryDepth--;
  }
}

export function isTelemetryCritical(): boolean {
  return telemetryDepth > 0;
}

export type LifecycleWarningCode =
  | 'late_init'
  | 'lifecycle_unavailable'
  | 'reentrant_init_unsupported'
  | 'invalid_close_timeout'
  | 'performance_clock_invalid'
  | 'performance_time_origin_missing'
  | 'binary_request_unsupported'
  | 'low_level_consent_blocking';

/** SDK 资源边界；core buffer/采样/传输结果仍由 core 管理。 */
export class ClientLifetime {
  public readonly warnings = new Set<LifecycleWarningCode>();
  public state: 'open' | 'closing' | 'closed' = 'open';
  public visibility: 'inactive' | 'foreground' | 'background' | 'stopped' = 'inactive';
  private readonly _runtimeToken = {};
  private _deadline: number | undefined;
  private _finalizing = false;
  public closingReason: 'client_closed' | 'client_replaced' = 'client_closed';
  private readonly _finalizers = new Set<() => void>();
  private readonly _stoppers = new Set<() => void>();

  public acceptsTelemetry(): boolean {
    return this.state === 'open' || (this.state === 'closing' && this._finalizing);
  }

  public canSend(): boolean {
    return this.state !== 'closed' && (this._deadline === undefined || Date.now() < this._deadline);
  }

  public activate(): void {
    if (this.state === 'open') activeRuntimeToken = this._runtimeToken;
  }

  public canCollectAutomatic(): boolean {
    return activeRuntimeToken === this._runtimeToken && this.state === 'open';
  }

  public canUseStore(): boolean {
    return this.canCollectAutomatic();
  }

  private retire(): void {
    if (activeRuntimeToken === this._runtimeToken) activeRuntimeToken = undefined;
  }

  public registerFinalizer(callback: () => void): () => void {
    if (this.state === 'open') this._finalizers.add(callback);
    return () => {
      this._finalizers.delete(callback);
    };
  }

  public registerStop(callback: () => void): () => void {
    if (this.state === 'open') this._stoppers.add(callback);
    else callback();
    return () => {
      this._stoppers.delete(callback);
    };
  }

  private stopProducers(): void {
    const callbacks = [...this._stoppers];
    this._stoppers.clear();
    for (const callback of callbacks) {
      try {
        callback();
      } catch (_error) {
        /* 一个资源不阻断其余停止。 */
      }
    }
  }

  /** 返回总预算；0/undefined 保留无期限 drain，非法值安全回落。 */
  public beginClose(timeout?: number): number | undefined {
    const budget =
      timeout === undefined || timeout === 0
        ? undefined
        : Number.isFinite(timeout) && timeout > 0
          ? timeout
          : 2000;
    if (timeout !== undefined && timeout !== 0 && (!Number.isFinite(timeout) || timeout < 0)) {
      this.warnings.add('invalid_close_timeout');
    }
    this.retire();
    this.state = 'closing';
    this.visibility = 'stopped';
    this._deadline = budget === undefined ? undefined : Date.now() + budget;
    return budget;
  }

  public finalize(): void {
    this._finalizing = true;
    try {
      const callbacks = [...this._finalizers];
      this._finalizers.clear();
      for (const callback of callbacks) {
        if (this.state === 'closed') break;
        try {
          callback();
        } catch (_error) {
          /* 收尾故障不阻断剩余资源关闭。 */
        }
      }
    } finally {
      this._finalizing = false;
      this.stopProducers();
    }
  }

  public finish(): void {
    this.retire();
    this.state = 'closed';
    this.visibility = 'stopped';
    this._finalizers.clear();
    this.stopProducers();
  }
}
