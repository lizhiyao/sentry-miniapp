
import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, TransactionContext } from '@sentry/types';
import { _addTracingExtensions, startIdleTransaction } from '../hubextensions';
import { MetricsInstrumentation } from './metrics';
import { sdk } from 'src/crossPlatform';

export class MiniAppTracing implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'MiniAppTracing';
  /**
   * @inheritDoc
   */
  public name: string = MiniAppTracing.id;

  private readonly _metrics: MetricsInstrumentation;

  constructor() {
    this._metrics = new MetricsInstrumentation();
  }

  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    _addTracingExtensions();

    const idleTimeout = 5000;
    const hub = getCurrentHub();

    const performanceIdleTransaction = startIdleTransaction(
      hub,
      {
        name: 'app-performance',
        op: 'performance',
      } as TransactionContext,
      idleTimeout,
      true,
      {},
    );

    this._metrics.addPerformanceEntries(performanceIdleTransaction);

    sdk.onAppHide?.(() => {
      performanceIdleTransaction.finish();
    });

    /* performanceIdleTransaction.registerBeforeFinishCallback((transaction, _endTimestamp) => {
    }); */


    // idleTransaction.setTag('idleTimeout', idleTimeout);
  }
}