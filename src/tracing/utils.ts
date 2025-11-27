import { getClient } from '@sentry/core';
import { Options } from '@sentry/types';
import type { Transaction } from './transaction';

let activeTransaction: Transaction | undefined;

/**
 * The `extractTraceparentData` function and `TRACEPARENT_REGEXP` constant used
 * to be declared in this file. It was later moved into `@sentry/utils` as part of a
 * move to remove `@sentry/tracing` dependencies from `@sentry/node` (`extractTraceparentData`
 * is the only tracing function used by `@sentry/node`).
 *
 * These exports are kept here for backwards compatability's sake.
 *
 * TODO(v7): Reorganize these exports
 *
 * See https://github.com/getsentry/sentry-javascript/issues/4642 for more details.
 */
export { TRACEPARENT_REGEXP, extractTraceparentData } from '@sentry/utils';

/**
 * Determines if tracing is currently enabled.
 *
 * Tracing is enabled when at least one of `tracesSampleRate` and `tracesSampler` is defined in the SDK config.
 */
export function hasTracingEnabled(maybeOptions?: Options | undefined): boolean {
  const client = getClient();
  const options = maybeOptions || (client && client.getOptions && client.getOptions());
  return !!options && ('tracesSampleRate' in options || 'tracesSampler' in options);
}

/** Grabs active transaction, if any */
export function getActiveTransaction<T extends Transaction>(): T | undefined {
  return activeTransaction as T | undefined;
}

export function setActiveTransaction(transaction?: Transaction): void {
  activeTransaction = transaction;
}

/**
 * Converts from milliseconds to seconds
 * @param time time in ms
 */
export function msToSec(time: number): number {
  return time / 1000;
}

/**
 * Converts from seconds to milliseconds
 * @param time time in seconds
 */
export function secToMs(time: number): number {
  return time * 1000;
}

// so it can be used in manual instrumentation without necessitating a hard dependency on @sentry/utils
export { stripUrlQueryAndFragment } from '@sentry/utils';
