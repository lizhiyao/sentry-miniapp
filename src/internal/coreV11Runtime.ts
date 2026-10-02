import { getCurrentScope, withScope } from '@sentry/core';
import type { Client, SpanAttributes } from '@sentry/core';

/**
 * #428 验证原型，尚未接入默认 SDK。只使用 core 公共契约。
 * run 只恢复同步回调的 owner；不承诺跨 await 的 scope 隔离。
 */
export class CoreV11Runtime {
  private readonly owner = getCurrentScope().clone();
  private phase: 'open' | 'closing' | 'closed' = 'open';
  private finalizing = false;
  private readonly finalizers: Array<() => void> = [];
  private readonly cleanups: Array<() => void> = [];
  private closing: Promise<boolean> | undefined;
  private resolveClose: ((result: boolean) => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly client: Client) {
    this.owner.setClient(client);
    const options = client.getOptions();
    const beforeLog = options.beforeSendLog;
    const beforeMetric = options.beforeSendMetric;
    options.beforeSendLog = (log) => {
      if (!this.accepting()) return null;
      const result = beforeLog ? beforeLog(log) : log;
      return this.accepting() ? result : null;
    };
    options.beforeSendMetric = (metric) => {
      if (!this.accepting()) return null;
      const result = beforeMetric ? beforeMetric(metric) : metric;
      return this.accepting() ? result : null;
    };
  }

  private accepting(): boolean {
    return this.phase === 'open' || (this.phase === 'closing' && this.finalizing);
  }

  /** SDK 持有的同步回调使用；不返回 callback 的 Promise。 */
  public run(callback: () => void): boolean {
    if (!this.accepting()) return false;
    withScope(this.owner, () => { callback(); });
    return true;
  }

  public onFinalize(callback: () => void): void {
    if (this.phase === 'open') this.finalizers.push(callback);
  }

  public onCleanup(callback: () => void): void {
    if (this.phase === 'closed') {
      attempt(callback);
    } else {
      this.cleanups.push(callback);
    }
  }

  public canStartRequest(): boolean {
    return this.phase !== 'closed';
  }

  /** 一个总预算；共享 Promise 在调用任何用户 finalizer 之前建立。 */
  public close(timeout = 2000): Promise<boolean> {
    if (this.closing) return this.closing;
    if (this.phase === 'closed') return Promise.resolve(false);
    this.phase = 'closing';
    this.closing = new Promise<boolean>((resolve) => { this.resolveClose = resolve; });
    const budget = Number.isFinite(timeout) && timeout > 0 ? timeout : 2000;
    this.timer = setTimeout(() => this.finish(false), budget);
    let finalized = true;
    this.finalizing = true;
    for (const callback of this.finalizers.splice(0)) {
      if (!this.canStartRequest()) break;
      finalized = attempt(() => { this.run(callback); }) && finalized;
    }
    this.finalizing = false;
    if (this.canStartRequest()) {
      try {
        void this.client.flush(budget).then(
          (result) => this.finish(result && finalized),
          () => this.finish(false),
        );
      } catch {
        this.finish(false);
      }
    }
    return this.closing;
  }

  public dispose(): void {
    this.finish(false);
  }

  private finish(result: boolean): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    clearTimeout(this.timer);
    this.client.getOptions().enabled = false;
    // disabled flush 清空 logs/metrics；close 清空官方 span buffer。
    // 各步骤独立，任一个用户 hook 抛错仍继续 SDK cleanup。
    attempt(() => this.client.emit('flush'));
    attempt(() => this.client.emit('close'));
    attempt(() => this.client.dispose());
    for (const callback of this.cleanups.splice(0)) attempt(callback);
    this.finalizers.length = 0;
    this.resolveClose?.(result);
    this.resolveClose = undefined;
  }
}

function attempt(callback: () => void): boolean {
  try {
    callback();
    return true;
  } catch {
    return false;
  }
}

/** 手动 span 只在开始记快照、preprocess 按缺失字段补齐，保留 scope RawAttribute。 */
export function registerSpanStartSnapshots(
  client: Client,
  snapshot: () => SpanAttributes,
): () => void {
  const pending = new Map<string, SpanAttributes>();
  const offStart = client.on('spanStart', (span) => {
    if (!span.isRecording()) return;
    if (pending.size >= 256) pending.delete(pending.keys().next().value as string);
    pending.set(span.spanContext().spanId, { ...snapshot() });
  });
  const offPreprocess = client.on('preprocessSpan', (json) => {
    const attributes = pending.get(json.span_id);
    pending.delete(json.span_id);
    for (const [key, value] of Object.entries(attributes ?? {})) {
      if (value !== undefined && !(key in json.attributes)) json.attributes[key] = value;
    }
  });
  return () => {
    offStart();
    offPreprocess();
    pending.clear();
  };
}
