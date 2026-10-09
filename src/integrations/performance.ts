import { getClientEnvironment, setClientContext } from '../clientState';
import {
  addBreadcrumb,
  getCurrentScope,
  getIsolationScope,
  startInactiveSpan,
  withScope,
} from '@sentry/core';
import type { Client, Integration, IntegrationFn, Scope, SpanAttributes } from '@sentry/core';
import {
  getPerformanceManager,
  epochNow,
  type PerformanceEntry,
  type PerformanceObserver,
} from '../crossPlatform';
import { automaticSpanAttributes, setClientSpanDimension } from '../spanDimensions';
import { collectUrlName } from '../dataCollection';
import { getClientLifetime } from '../lifecycle';
import { OwnerToken } from '../owner';
import { setOwnedScopeSession } from '../sessionCapture';

const EPOCH_TIMESTAMP_THRESHOLD = 100_000_000_000;
const MAX_ENTRY_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW = 60 * 1000;

/** 显式安装 Performance observer；span 采样和批处理由 core 负责。 */
export interface PerformanceIntegrationOptions {
  enableNavigation?: boolean;
  enableRender?: boolean;
  enableResource?: boolean;
  enableUserTiming?: boolean;
}

type EntryTimes = { start: number; end: number; duration: number };

/** 仅消费可信条目，不保存原始 entries 或周期统计。 */
class PerformanceController {
  private readonly _options: Required<PerformanceIntegrationOptions>;
  private _observer: PerformanceObserver | undefined;
  private _timeOrigin: number | undefined;
  private _client: Client | undefined;
  private _owner: OwnerToken | undefined;

  public constructor(options: PerformanceIntegrationOptions) {
    this._options = {
      enableNavigation: options.enableNavigation !== false,
      enableRender: options.enableRender !== false,
      enableResource: options.enableResource !== false,
      enableUserTiming: options.enableUserTiming === true,
    };
  }

  public setup(client: Client): void {
    this._client = client;
    this._owner = new OwnerToken(client, 'current');
    this._owner.run(() => this._setup());
  }

  private _setup(): void {
    try {
      const manager = getPerformanceManager();
      if (!manager || !this._isActiveClient()) return;
      // 仅接受宿主明确提供的 epoch 毫秒原点，不使用 setup 墙钟或首批结束时间推算。
      const origin = manager.timeOrigin;
      if (!this._isActiveClient()) return;
      if (
        typeof origin === 'number' &&
        Number.isFinite(origin) &&
        origin >= EPOCH_TIMESTAMP_THRESHOLD
      ) {
        this._timeOrigin = origin;
      }
      const createObserver = manager.createObserver;
      if (typeof createObserver !== 'function' || !this._isActiveClient()) return;
      const entryTypes = [
        ...(this._options.enableNavigation ? ['navigation'] : []),
        ...(this._options.enableRender ? ['render'] : []),
        ...(this._options.enableResource ? ['resource'] : []),
        ...(this._options.enableUserTiming ? ['measure', 'mark'] : []),
      ];
      if (entryTypes.length === 0) return;
      const observer = createObserver.call(manager, (entries) => this._observe(entries));
      if (!this._isActiveClient()) {
        observer.disconnect();
        return;
      }
      // 先登记；observe 的同步回调可能退休 owner，部分注册后抛错也必须清理。
      this._observer = observer;
      try {
        observer.observe({ entryTypes });
      } catch (error) {
        if (!this._isActiveClient()) return;
        const safeTypes = entryTypes.filter((type) => type !== 'measure' && type !== 'mark');
        if (safeTypes.length === entryTypes.length || safeTypes.length === 0) throw error;
        observer.observe({ entryTypes: safeTypes });
      }
      if (!this._isActiveClient()) return;
      getClientEnvironment(this._client!).tags['performance.api.available'] = true;
      getClientEnvironment(this._client!).tags['performance.integration'] = 'enabled';
      setClientSpanDimension(this._client, 'performance.api.available', true);
      setClientSpanDimension(this._client, 'performance.integration', 'enabled');
      setClientContext(this._client, 'performance_support', {
        integration_enabled: true,
        time_origin_available: this._timeOrigin !== undefined,
        options: this._options,
      });
    } catch (error) {
      console.warn('[sentry-miniapp] Failed to setup performance observers:', error);
    }
  }

  private _observe(entries: unknown): void {
    if (!this._isActiveClient()) return;
    // mark 的 hook 保留 delivery 的 active span 与用户 scope 数据；会话使用当前 isolation episode。
    const deliveryScope = getCurrentScope();
    try {
      this._owner?.run(() => this._handleEntries(entries, deliveryScope));
    } catch (_error) {
      /* 宿主不可读列表或用户 hook 故障不传播到 observer。 */
    }
  }

  private _handleEntries(entries: unknown, deliveryScope: Scope): void {
    if (!entries || typeof entries !== 'object') return;
    let values: unknown;
    if (Array.isArray(entries)) values = entries;
    else {
      const reader = (entries as { getEntries?: () => PerformanceEntry[] }).getEntries;
      if (!this._isActiveClient()) return;
      values = typeof reader === 'function' ? reader.call(entries) : [entries];
    }
    if (!Array.isArray(values)) return;
    for (const entry of values) {
      if (!this._isActiveClient()) return;
      try {
        this._processEntry(entry as PerformanceEntry, deliveryScope);
      } catch (_error) {
        /* 一条坏记录不能吞掉同批其它可信记录。 */
      }
    }
  }

  private _entryTimes(entry: PerformanceEntry): EntryTimes | undefined {
    const start = entry.startTime;
    if (!this._isActiveClient()) return undefined;
    const duration = entry.duration;
    if (!this._isActiveClient()) return undefined;
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 0)
      return undefined;
    const relative = start < EPOCH_TIMESTAMP_THRESHOLD;
    if (relative && this._timeOrigin === undefined) {
      if (this._isActiveClient())
        getClientLifetime(this._client!)?.warnings.add('performance_time_origin_missing');
      return undefined;
    }
    const absoluteStart = relative ? this._timeOrigin! + start : start;
    const end = absoluteStart + duration;
    const current = epochNow();
    if (
      !Number.isFinite(end) ||
      absoluteStart < current - MAX_ENTRY_AGE ||
      end > current + MAX_FUTURE_CLOCK_SKEW
    )
      return undefined;
    return { start: absoluteStart / 1000, end: end / 1000, duration };
  }

  private _processEntry(entry: PerformanceEntry, deliveryScope: Scope): void {
    const type = entry.entryType;
    if (!this._isActiveClient()) return;
    const enabled =
      (type === 'navigation' && this._options.enableNavigation) ||
      (type === 'render' && this._options.enableRender) ||
      (type === 'resource' && this._options.enableResource) ||
      ((type === 'measure' || type === 'mark') && this._options.enableUserTiming);
    if (!enabled) return;
    const times = this._entryTimes(entry);
    if (!times || !this._isActiveClient()) return;
    const name = entry.name;
    if (typeof name !== 'string' || !this._isActiveClient()) return;
    if (type === 'mark') {
      const markScope = deliveryScope.clone();
      setOwnedScopeSession(markScope, getIsolationScope().getSession(), 'current');
      withScope(markScope, () => {
        addBreadcrumb({
          timestamp: times.start,
          message: `性能标记: ${name}`,
          category: 'performance.mark',
          level: 'info',
        });
      });
      return;
    }
    const operationName =
      type === 'navigation' || type === 'resource' ? collectUrlName(name) : name;
    const labels: Record<string, string> = {
      navigation: 'Navigation',
      render: 'Render',
      resource: 'Resource',
      measure: 'Measure',
    };
    const attributes: SpanAttributes = {
      [`${type}.name`]: operationName,
      [`${type}.duration`]: times.duration,
    };
    // 缺失数据不补 0；任意 detail/dataset 不自动采集。
    const source = entry as unknown as Record<string, unknown>;
    const fields: Record<string, Record<string, string>> = {
      navigation: {
        appLaunchTime: 'app_launch_time',
        pageReadyTime: 'page_ready_time',
        firstRenderTime: 'first_render_time',
      },
      render: {
        renderStart: 'start',
        renderEnd: 'end',
        scriptStart: 'script_start',
        scriptEnd: 'script_end',
      },
      resource: {
        transferSize: 'transfer_size',
        encodedBodySize: 'encoded_size',
        decodedBodySize: 'decoded_size',
      },
    };
    for (const [key, attribute] of Object.entries(fields[type] ?? {})) {
      const value = source[key];
      if (!this._isActiveClient()) return;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        attributes[`${type}.${attribute}`] = value;
    }
    if (type === 'resource') {
      const initiator = source['initiatorType'];
      if (!this._isActiveClient()) return;
      if (typeof initiator === 'string') attributes['resource.type'] = initiator;
      const fetch = source['fetchStart'];
      if (!this._isActiveClient()) return;
      const response = source['responseEnd'];
      if (!this._isActiveClient()) return;
      if (
        typeof fetch === 'number' &&
        typeof response === 'number' &&
        Number.isFinite(fetch) &&
        Number.isFinite(response) &&
        fetch >= 0 &&
        response >= fetch
      ) {
        attributes['resource.fetch_start'] = fetch;
        attributes['resource.response_end'] = response;
        attributes['resource.network_time'] = response - fetch;
      }
    }
    if (!this._isActiveClient()) return;
    const initialAttributes = automaticSpanAttributes(this._client, attributes, false, false);
    if (!this._isActiveClient()) return;
    // observer delivery 不是父 operation；没有可信关联时不接当前页面或活跃 span。
    const span = startInactiveSpan({
      name: `${labels[type]}: ${operationName}`,
      op: type,
      parentSpan: null,
      startTime: times.start,
      attributes: initialAttributes,
    });
    if (this._isActiveClient()) span.end(times.end);
  }

  public cleanup(): void {
    const owner = this._owner;
    this._owner = undefined;
    this._client = undefined;
    owner?.release();
    const observer = this._observer;
    this._observer = undefined;
    this._timeOrigin = undefined;
    try {
      observer?.disconnect();
    } catch (_error) {
      /* 解除失败后，迟到回调仍被 owner 门禁拒绝。 */
    }
  }

  private _isActiveClient(): boolean {
    return !!this._owner?.isActive();
  }
}

/** 配置对象可复用；每次 setup 的 observer 与状态归属独立 client。 */
export class PerformanceIntegration implements Integration {
  public static id = 'PerformanceAPI';
  public name = PerformanceIntegration.id;
  private readonly _clients = new WeakSet<Client>();
  private readonly _cleanups = new Set<() => void>();

  private readonly _options: PerformanceIntegrationOptions;

  public constructor(options: PerformanceIntegrationOptions = {}) {
    this._options = { ...options };
  }

  public setup(client: Client): void {
    if (this._clients.has(client)) return;
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    const controller = new PerformanceController(this._options);
    this._clients.add(client);
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      controller.cleanup();
      this._clients.delete(client);
      this._cleanups.delete(cleanup);
    };
    this._cleanups.add(cleanup);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
    controller.setup(client);
  }

  public cleanup(): void {
    for (const cleanup of [...this._cleanups]) cleanup();
  }
}

export const performanceIntegration = ((options?: PerformanceIntegrationOptions): Integration =>
  new PerformanceIntegration(options)) satisfies IntegrationFn;
