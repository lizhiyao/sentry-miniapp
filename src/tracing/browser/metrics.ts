
// import { Measurements, SpanContext } from '@sentry/types';
// import { Span } from '../span';
import { Transaction } from '../transaction';
import { msToSec } from '../utils';
import { sdk } from "../../crossPlatform";

/** Class tracking metrics  */
export class MetricsInstrumentation {
  // private _measurements: Measurements = {};

  public constructor(_reportAllChanges: boolean = false) {

  }

  public addPerformanceEntries(transaction: Transaction): void {
    if (!sdk.getPerformance) return
    const performance = sdk.getPerformance();
    if (!performance) return;

    // const entryList = performance.getEntriesByType('measure');
    const observer = performance.createObserver(entryList => {
      const list = entryList.getEntries() || [];
      list.forEach((entry: any) => {
        /* const transaction = Sentry.startTransaction({
          name: entry.entryType,
          op: entry.entryType,
        }); */
        const span = transaction.startChild({
          op: entry.name,
          description: entry.path || entry.moduleName,
          startTimestamp: msToSec(entry.startTime), // 将毫秒转换为秒
        });
        /* span.setData('startTime', entry.startTime / 1000);
        span.setData('duration', entry.duration / 1000);
        span.setData('entryType', entry.entryType); */
        span.finish(msToSec(entry.startTime + entry.duration));

        if ('largestContentfulPaint' === entry.name) {
          clearMarks();
        }
      });
    });

    function clearMarks() {
      observer?.disconnect();
      transaction?.finish();
    }

    observer.observe({ entryTypes: ['navigation', 'render', 'script', 'loadPackage'] });
  }
}