import { captureEvent } from '@sentry/core';
import { DynamicSamplingContext, Event, MeasurementUnit, Measurements } from '@sentry/types';
import { dropUndefinedKeys, logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from './flags';
import { Span as SpanClass, SpanRecorder } from './span';
import type { TransactionContext, TransactionMetadata } from './types';


/** JSDoc */
export class Transaction extends SpanClass {
  public name: string;

  public metadata: TransactionMetadata;

  private _measurements: Measurements = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _contexts: Record<string, any> = {};

  private _trimEnd?: boolean;

  /**
   * This constructor should never be called manually. Those instrumenting tracing should use
   * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(transactionContext: TransactionContext) {
    super(transactionContext);

    this.name = transactionContext.name || '';

    this.metadata = {
      source: 'custom',
      spanMetadata: {},
      ...transactionContext.metadata,
    };
    this._trimEnd = transactionContext.trimEnd;

    // this is because transactions are also spans, and spans have a transaction pointer
    this.transaction = this;
  }

  /**
   * JSDoc
   */
  public setName(name: string): void {
    this.name = name;
  }

  /**
   * Attach additional context to the transaction.
   * @deprecated Prefer attributes or scope data.
   */
  // eslint-disable-next-line @typescript-eslint/ban-types
  public setContext(key: string, context: object): void {
    this._contexts[key] = context;
  }

  /**
   * Record a single measurement.
   * @deprecated Prefer top-level `setMeasurement`.
   */
  public setMeasurement(name: string, value: number, unit: MeasurementUnit = ''): void {
    this._measurements[name] = { value, unit };
  }

  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
  public initSpanRecorder(maxlen: number = 1000): void {
    if (!this.spanRecorder) {
      this.spanRecorder = new SpanRecorder(maxlen);
    }
    this.spanRecorder.add(this);
  }

  /**
   * Set observed measurements for this transaction.
   * @hidden
   */
  public setMeasurements(measurements: Measurements): void {
    this._measurements = { ...measurements };
  }

  /**
   * Set metadata for this transaction.
   * @hidden
   */
  public setMetadata(newMetadata: TransactionMetadata): void {
    this.metadata = { ...this.metadata, ...newMetadata };
  }

  /**
   * Return dynamic sampling context for this transaction.
   */
  public getDynamicSamplingContext(): Partial<DynamicSamplingContext> {
    return this.metadata?.dynamicSamplingContext || {};
  }

  /**
   * Placeholder profile id (not used in miniapp tracing).
   */
  public getProfileId(): string | undefined {
    return undefined;
  }

  /**
   * @inheritDoc
   */
  public finish(endTimestamp?: number): string | undefined {
    // This transaction is already finished, so we should not flush it again.
    if (this.endTimestamp !== undefined) {
      return undefined;
    }

    if (!this.name) {
      IS_DEBUG_BUILD && logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this.name = '<unlabeled transaction>';
    }

    // just sets the end timestamp
    super.finish(endTimestamp);

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      IS_DEBUG_BUILD && logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');

      // Transport no longer exposes recordLostEvent in v7; best effort no-op.
      return undefined;
    }

    const finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter(s => s !== this && s.endTimestamp) : [];
    const serializedSpans = finishedSpans.map(span => span.toJSON());

    if (this._trimEnd && finishedSpans.length > 0) {
      this.endTimestamp = finishedSpans.reduce((prev: SpanClass, current: SpanClass) => {
        if (prev.endTimestamp && current.endTimestamp) {
          return prev.endTimestamp > current.endTimestamp ? prev : current;
        }
        return prev;
      }).endTimestamp;
    }

    const transaction: Event = {
      contexts: {
        trace: this.getTraceContext(),
        ...this._contexts,
      },
      spans: serializedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: 'transaction',
      sdkProcessingMetadata: this.metadata,
    };

    const hasMeasurements = Object.keys(this._measurements).length > 0;

    if (hasMeasurements) {
      IS_DEBUG_BUILD &&
        logger.log(
          '[Measurements] Adding measurements to transaction',
          JSON.stringify(this._measurements, undefined, 2),
        );
      transaction.measurements = this._measurements;
    }

    IS_DEBUG_BUILD && logger.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`);

    return captureEvent(transaction);
  }

  /**
   * @inheritDoc
   */
  public toContext(): TransactionContext {
    const spanContext = super.toContext();

    return dropUndefinedKeys({
      ...spanContext,
      name: this.name,
      trimEnd: this._trimEnd,
    });
  }

  /**
   * @inheritDoc
   */
  public updateWithContext(transactionContext: TransactionContext): this {
    super.updateWithContext(transactionContext);

    this.name = transactionContext.name ?? '';

    this._trimEnd = transactionContext.trimEnd;

    return this;
  }
}
