import { Hub } from '@sentry/core';
import {
  CustomSamplingContext,
  Integration,
  Options,
  SamplingContext,
  TransactionContext,
} from '@sentry/types';
import { isNaN, logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from './flags';
import { IdleTransaction } from './idletransaction';
import { Transaction } from './transaction';
import { hasTracingEnabled } from './utils';
import { sdk } from '../crossPlatform';


const GLOBAL_OBJ = sdk;

/** Returns all trace headers that are currently on the top scope. */
function traceHeaders(this: Hub): { [key: string]: string } {
  const scope = this.getScope();
  if (scope) {
    const span = scope.getSpan();
    if (span) {
      return {
        'sentry-trace': span.toTraceparent(),
      };
    }
  }
  return {};
}

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
  if (isNaN(rate) || !(typeof rate === 'number' || typeof rate === 'boolean')) {
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
 *
 * The Hub.startTransaction method delegates to this method to do its work, passing the Hub instance in as `this`, as if
 * it had been called on the hub directly. Exists as a separate function so that it can be injected into the class as an
 * "extension method."
 *
 * @param this: The Hub starting the transaction
 * @param transactionContext: Data used to configure the transaction
 * @param CustomSamplingContext: Optional data to be provided to the `tracesSampler` function (if any)
 *
 * @returns The new transaction
 *
 * @see {@link Hub.startTransaction}
 */
function _startTransaction(
  this: Hub,
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
): Transaction {
  const client = this.getClient();
  const options = (client && client.getOptions()) || {};

  let transaction = new Transaction(transactionContext, this);
  transaction = sample(transaction, options, {
    parentSampled: transactionContext.parentSampled,
    transactionContext,
    ...customSamplingContext,
  });
  if (transaction.sampled) {
    const maxSpans = (options as any)._experiments && (options as any)._experiments.maxSpans;
    transaction.initSpanRecorder(maxSpans as number);
  }
  return transaction;
}

/**
 * Create new idle transaction.
 */
export function startIdleTransaction(
  hub: Hub,
  transactionContext: TransactionContext,
  idleTimeout?: number,
  onScope?: boolean,
  customSamplingContext?: CustomSamplingContext,
): IdleTransaction {
  const client = hub.getClient();
  const options = (client && client.getOptions()) || {};

  let transaction = new IdleTransaction(transactionContext, hub, idleTimeout, onScope);
  transaction = sample(transaction, options, {
    parentSampled: transactionContext.parentSampled,
    transactionContext,
    ...customSamplingContext,
  });
  if (transaction.sampled) {
    const maxSpans = (options as any)._experiments && (options as any)._experiments.maxSpans;
    transaction.initSpanRecorder(maxSpans as number);
  }
  return transaction;
}


export interface RunWithAsyncContextOptions {
  /** Whether to reuse an existing async context if one exists. Defaults to false. */
  reuseExisting?: boolean;
}

export interface AsyncContextStrategy {
  /**
   * Gets the current async context. Returns undefined if there is no current async context.
   */
  // eslint-disable-next-line deprecation/deprecation
  getCurrentHub: () => Hub | undefined;
  /**
   * Runs the supplied callback in its own async context.
   */
  runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions): T;
}


export interface Carrier {
  __SENTRY__?: {
    // eslint-disable-next-line deprecation/deprecation
    hub?: Hub;
    acs?: AsyncContextStrategy;
    /**
     * Extra Hub properties injected by various SDKs
     */
    integrations?: Integration[];
    extensions?: {
      /** Extension methods for the hub, which are bound to the current Hub instance */
      // eslint-disable-next-line @typescript-eslint/ban-types
      [key: string]: Function;
    };
  };
}

export function getMainCarrier(): Carrier {
  (GLOBAL_OBJ as any).__SENTRY__ = (GLOBAL_OBJ as any).__SENTRY__ || {
    extensions: {},
    hub: undefined,
  };
  return GLOBAL_OBJ as Carrier;
}

/**
 * @private
 */
export function addTracingExtensions(): void {
  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    return;
  }
  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  if (!carrier.__SENTRY__.extensions.startTransaction) {
    carrier.__SENTRY__.extensions.startTransaction = _startTransaction;
  }
  if (!carrier.__SENTRY__.extensions.traceHeaders) {
    carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
  }
}
