
import { Measurements } from '@sentry/types';
import type { SpanContext } from '../types';
import { Span } from '../span';
import { Transaction } from '../transaction';
import { msToSec } from '../utils';
import { sdk } from '../../crossPlatform';

// https://developers.weixin.qq.com/miniprogram/dev/api/base/performance/PerformanceEntry.html
type PerformanceEntry = {
  duration: number;
  entryType: string;
  moduleName?: string;
  name: string;
  startTime: number;
  path?: string;
};

type PerformanceObserver = {
  disconnect: () => void;
  observe: (options: { entryTypes: string[] }) => void;
};

type MiniProgramPerformance = {
  createObserver?: (callback: (entryList: { getEntries: () => PerformanceEntry[] }) => void) => PerformanceObserver;
  timeOrigin?: number;
  now?: () => number;
};

const EPOCH_TIME_THRESHOLD = 1e12;

/** Class tracking metrics  */
export class MetricsInstrumentation {
  private _measurements: Measurements = {};
  private _observer?: PerformanceObserver;
  private _timeOrigin?: number;

  public constructor(private _reportAllChanges: boolean = false) {}

  public addPerformanceEntries(transaction: Transaction): void {
    const performance = this._getPerformance();
    if (!performance) {
      return;
    }

    this._timeOrigin = this._getTimeOrigin(performance, transaction);

    // performance.createObserver

    this._observer = performance.createObserver?.((entryList: { getEntries: () => PerformanceEntry[] }) => {
      const list = entryList?.getEntries?.() || [];
      list.forEach(entry => this._handleEntry(transaction, entry));
    });

    if (!this._observer) {
      return;
    }

    this._observer.observe({
      entryTypes: ['navigation', 'render', 'script', 'loadPackage', 'resource'],
    });
  }

  private _getPerformance(): MiniProgramPerformance | undefined {
    if (!sdk.getPerformance) {
      return undefined;
    }

    const performance = sdk.getPerformance();
    if (!performance || typeof performance.createObserver !== 'function') {
      return undefined;
    }

    return performance as unknown as MiniProgramPerformance;
  }

  private _getTimeOrigin(performance: MiniProgramPerformance, transaction: Transaction): number | undefined {
    if (typeof performance.timeOrigin === 'number') {
      return msToSec(performance.timeOrigin);
    }

    const perfNow = typeof performance.now === 'function' ? performance.now() : undefined;
    if (typeof perfNow === 'number') {
      return msToSec(Date.now() - perfNow);
    }

    return transaction.startTimestamp;
  }

  private _handleEntry(transaction: Transaction, entry: PerformanceEntry): void {
    if (transaction.endTimestamp !== undefined) {
      this._stopObserver();
      return;
    }

    const startTimestamp = this._toTimestamp(entry.startTime, transaction.startTimestamp);
    const endTimestamp = this._toTimestamp(entry.startTime + entry.duration, transaction.startTimestamp);

    _startChild(transaction, {
      op: this._mapOp(entry),
      description: this._getDescription(entry),
      startTimestamp,
      endTimestamp,
      data: this._buildSpanData(entry),
    });

    this._recordMeasurements(entry, transaction, startTimestamp);
    transaction.setTag('sentry_reportAllChanges', this._reportAllChanges);

    if (Object.keys(this._measurements).length > 0) {
      transaction.setMeasurements(this._measurements);
    }

    /* if (entry.name === 'largestContentfulPaint' && !this._reportAllChanges) {
      this._stopObserver(transaction);
    } */
  }

  private _mapOp(entry: PerformanceEntry): string {
    switch (entry.entryType) {
      case 'navigation':
        return 'navigation';
      case 'render':
        return 'ui.render';
      case 'script':
        return 'script';
      case 'loadPackage':
        return 'resource.package';
      case 'resource':
        return 'resource';
      default:
        return entry.entryType || 'custom';
    }
  }

  private _getDescription(entry: PerformanceEntry): string | undefined {
    return entry.path || entry.moduleName || entry.name;
  }

  private _buildSpanData(entry: PerformanceEntry): Record<string, unknown> {
    const data: Record<string, unknown> = { entryType: entry.entryType };
    if (entry.moduleName) {
      data.moduleName = entry.moduleName;
    }
    if (entry.path) {
      data.path = entry.path;
    }
    if (typeof entry.duration === 'number') {
      data.duration = entry.duration;
    }
    return data;
  }

  private _recordMeasurements(entry: PerformanceEntry, transaction: Transaction, startTimestamp: number): void {
    const normalizedName = (entry.name || '').toLowerCase();
    const durationMs = entry.duration;
    const relativeStartMs = Math.max((startTimestamp - transaction.startTimestamp) * 1000, 0);

    if (normalizedName === 'first-paint' || normalizedName === 'firstpaint') {
      this._measurements['fp'] = { value: relativeStartMs, unit: 'millisecond' };
    } else if (normalizedName === 'first-contentful-paint' || normalizedName === 'firstcontentfulpaint') {
      this._measurements['fcp'] = { value: relativeStartMs, unit: 'millisecond' };
    } else if (
      normalizedName === 'largest-contentful-paint' ||
      normalizedName === 'largestcontentfulpaint' ||
      normalizedName === 'lcp'
    ) {
      this._measurements['lcp'] = { value: relativeStartMs, unit: 'millisecond' };
    } else if (
      (normalizedName === 'first-input-delay' || normalizedName === 'firstinputdelay' || normalizedName === 'fid') &&
      typeof durationMs === 'number'
    ) {
      this._measurements['fid'] = { value: durationMs, unit: 'millisecond' };
    } else if (
      entry.entryType === 'navigation' &&
      typeof durationMs === 'number' &&
      !this._measurements['navigation']
    ) {
      this._measurements['navigation'] = { value: durationMs, unit: 'millisecond' };
    }

    if (this._reportAllChanges && typeof durationMs === 'number') {
      const key = this._measurementKey(entry);
      if (key && !this._measurements[key]) {
        this._measurements[key] = { value: durationMs, unit: 'millisecond' };
      }
    }
  }

  private _measurementKey(entry: PerformanceEntry): string | undefined {
    const base = entry.name || entry.entryType;
    if (!base) {
      return undefined;
    }
    return base.replace(/\s+/g, '_').toLowerCase();
  }

  private _toTimestamp(startTimeMs: number, transactionStart: number): number {
    if (startTimeMs > EPOCH_TIME_THRESHOLD) {
      return msToSec(startTimeMs);
    }

    const origin = this._timeOrigin ?? transactionStart;
    return origin + msToSec(startTimeMs);
  }

  private _stopObserver(transaction?: Transaction): void {
    this._observer?.disconnect();
    this._observer = undefined;

    if (transaction && !transaction.endTimestamp) {
      transaction.finish();
    }
  }
}

function _startChild(transaction: Transaction, { startTimestamp, ...ctx }: SpanContext): Span {
  if (startTimestamp && transaction.startTimestamp > startTimestamp) {
    transaction.startTimestamp = startTimestamp;
  }

  return transaction.startChild({
    startTimestamp,
    ...ctx,
  });
}
