
import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, TransactionContext } from '@sentry/types';
import { _addTracingExtensions, startIdleTransaction } from '../hubextensions';

export class MiniAppTracing implements Integration {
  /**
     * @inheritDoc
     */
  public static id: string = 'MiniAppTracing';
  /**
   * @inheritDoc
   */
  public name: string = MiniAppTracing.id;
  // private readonly _metrics: MetricsInstrumentation;

  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    _addTracingExtensions();

    const idleTimeout = 1000;


    const hub = getCurrentHub();

    const finalContext: TransactionContext = {
      name: 'idleTransaction',
      op: 'idleTransaction',
    }
    // const { location } = getGlobalObject() as WindowOrWorkerGlobalScope & { location: Location };

    const idleTransaction = startIdleTransaction(
      hub,
      finalContext,
      idleTimeout,
      true,
      {}, // for use in the tracesSampler
    );
    idleTransaction.registerBeforeFinishCallback((_transaction, _endTimestamp) => {
    });

    idleTransaction.setTag('idleTimeout', idleTimeout);
  }
}