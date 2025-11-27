import { getClient } from '@sentry/core';
import { Options } from '@sentry/types';
import { logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from './flags';
import { IdleTransaction } from './idletransaction';
import { Transaction } from './transaction';
import { hasTracingEnabled, setActiveTransaction } from './utils';
import type { CustomSamplingContext, SamplingContext, TransactionContext } from './types';

/**
 * Makes a sampling decision for the given transaction and stores it on the transaction.
 *
 * Called every time a transaction is created. Only transactions which emerge with a `sampled` value of `true` will be
 * sent to Sentry.
 *
 * @param transaction: The transaction needing a sampling decision
 * @param options: The current client's options, so we can access `tracesSampleRate` and/or `tracesSampler`
 * @param samplingContext: Default and user-provided data which may be used to help make the decision
 *
 * @returns The given transaction with its `sampled` value set
 */
function sample<T extends Transaction>(transaction: T, options: Options, samplingContext: SamplingContext): T {
  // nothing to do if tracing is not enabled
  if (!hasTracingEnabled(options)) {
    transaction.sampled = false;
    return transaction;
  }

  // if the user has forced a sampling decision by passing a `sampled` value in their transaction context, go with that
  if (transaction.sampled !== undefined) {
    return transaction;
  }

  // we would have bailed already if neither `tracesSampler` nor `tracesSampleRate` were defined, so one of these should
  // work; prefer the hook if so
  let sampleRate;
  if (typeof options.tracesSampler === 'function') {
    sampleRate = options.tracesSampler(samplingContext);
  } else if (samplingContext.parentSampled !== undefined) {
    sampleRate = samplingContext.parentSampled;
  } else {
    sampleRate = options.tracesSampleRate;
  }

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get. (The
  // only valid values are booleans or numbers between 0 and 1.)
  if (!isValidSampleRate(sampleRate)) {
    IS_DEBUG_BUILD && logger.warn('[Tracing] Discarding transaction because of invalid sample rate.');
    transaction.sampled = false;
    return transaction;
  }

  // if the function returned 0 (or false), or if `tracesSampleRate` is 0, it's a sign the transaction should be dropped
  if (!sampleRate) {
    IS_DEBUG_BUILD &&
      logger.log(
        `[Tracing] Discarding transaction because ${typeof options.tracesSampler === 'function'
          ? 'tracesSampler returned 0 or false'
          : 'a negative sampling decision was inherited or tracesSampleRate is set to 0'
        }`,
      );
    transaction.sampled = false;
    return transaction;
  }

  // Now we roll the dice. Math.random is inclusive of 0, but not of 1, so strict < is safe here. In case sampleRate is
  // a boolean, the < comparison will cause it to be automatically cast to 1 if it's true and 0 if it's false.
  transaction.sampled = Math.random() < (sampleRate as number);

  // if we're not going to keep it, we're done
  if (!transaction.sampled) {
    IS_DEBUG_BUILD &&
      logger.log(
        `[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(
          sampleRate,
        )})`,
      );
    return transaction;
  }

  IS_DEBUG_BUILD && logger.log(`[Tracing] starting ${transaction.op} transaction - ${transaction.name}`);
  return transaction;
}

/**
 * Checks the given sample rate to make sure it is valid type and value (a boolean, or a number between 0 and 1).
 */
function isValidSampleRate(rate: unknown): boolean {
  // we need to check NaN explicitly because it's of type 'number' and therefore wouldn't get caught by this typecheck
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (Number.isNaN(rate as number) || !(typeof rate === 'number' || typeof rate === 'boolean')) {
    IS_DEBUG_BUILD &&
      logger.warn(
        `[Tracing] Given sample rate is invalid. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
          rate,
        )} of type ${JSON.stringify(typeof rate)}.`,
      );
    return false;
  }

  // in case sampleRate is a boolean, it will get automatically cast to 1 if it's true and 0 if it's false
  if ((rate as number) < 0 || (rate as number) > 1) {
    IS_DEBUG_BUILD &&
      logger.warn(`[Tracing] Given sample rate is invalid. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}

/**
 * Creates a new transaction and adds a sampling decision if it doesn't yet have one.
 */
export function startTransaction(
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
): Transaction {
  const client = getClient();
  const options = (client && client.getOptions && client.getOptions()) || ({} as Options);

  const transactionName = transactionContext.name || transactionContext.op || 'unknown-transaction';
  const samplingContext: SamplingContext = {
    parentSampled: transactionContext.parentSampled,
    transactionContext: { ...transactionContext, name: transactionName },
    name: transactionName,
    ...customSamplingContext,
  };

  let transaction = new Transaction({ ...transactionContext, name: transactionName });
  transaction = sample(transaction, options, samplingContext);
  if (transaction.sampled) {
    const maxSpans = (options as any)._experiments && (options as any)._experiments.maxSpans;
    transaction.initSpanRecorder(maxSpans as number);
    setActiveTransaction(transaction);
  }
  return transaction;
}

/**
 * Create new idle transaction.
 */
export function startIdleTransaction(
  transactionContext: TransactionContext,
  idleTimeout?: number,
  onScope?: boolean,
  customSamplingContext?: CustomSamplingContext,
): IdleTransaction {
  const client = getClient();
  const options = (client && client.getOptions && client.getOptions()) || ({} as Options);

  const transactionName = transactionContext.name || transactionContext.op || 'unknown-transaction';
  const samplingContext: SamplingContext = {
    parentSampled: transactionContext.parentSampled,
    transactionContext: { ...transactionContext, name: transactionName },
    name: transactionName,
    ...customSamplingContext,
  };

  let transaction = new IdleTransaction({ ...transactionContext, name: transactionName }, idleTimeout, onScope);
  transaction = sample(transaction, options, samplingContext);
  if (transaction.sampled) {
    const maxSpans = (options as any)._experiments && (options as any)._experiments.maxSpans;
    transaction.initSpanRecorder(maxSpans as number);
    setActiveTransaction(transaction);
  }
  return transaction;
}


/**
 * Legacy no-op kept for backwards compatibility.
 */
export function addTracingExtensions(): void {
  // Tracing helpers are wired up directly; no carrier patching required.
}
