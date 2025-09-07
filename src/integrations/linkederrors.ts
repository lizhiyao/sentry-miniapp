import type { Event, EventHint, Exception, ExtendedError, Integration, IntegrationFn } from '@sentry/core';
import { exceptionFromError, getCurrentScope } from '@sentry/core';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

/** Adds SDK info to the event */
export class LinkedErrors implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'LinkedErrors';

  /**
   * @inheritDoc
   */
  public name: string = LinkedErrors.id;

  /**
   * @inheritDoc
   */
  private readonly _key: string;

  /**
   * @inheritDoc
   */
  private readonly _limit: number;

  /**
   * @inheritDoc
   */
  public constructor(options: { key?: string; limit?: number } = {}) {
    this._key = options.key || DEFAULT_KEY;
    this._limit = options.limit || DEFAULT_LIMIT;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // This integration doesn't need setup
  }

  /**
   * @inheritDoc
   */
  public processEvent(event: Event, hint?: EventHint): Event {
    const client = getCurrentScope().getClient();
    if (!client) {
      return event;
    }

    // const options = client.getOptions();
    // Note: getCurrentScope() doesn't have getIntegration method, so we'll process directly
    return this._handler(event, hint);
  }

  /**
   * @inheritDoc
   */
  private _handler(event: Event, hint?: EventHint): Event {
    if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
      return event;
    }

    const linkedErrors = this._walkErrorTree(hint.originalException as ExtendedError, this._key);
    event.exception.values = [...linkedErrors, ...event.exception.values];

    return event;
  }

  /**
   * @inheritDoc
   */
  private _walkErrorTree(error: ExtendedError, key: string, stack: Exception[] = []): Exception[] {
    if (!isInstanceOf(error[key], Error) || stack.length + 1 >= this._limit) {
      return stack;
    }

    const exception = exceptionFromError(() => [], error[key]);
    return this._walkErrorTree(error[key], key, [exception, ...stack]);
  }
}

/**
 * Checks whether given value's type is one of a few Error or Error-like
 * {@link isError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
function isInstanceOf(wat: any, base: any): boolean {
  try {
    return wat instanceof base;
  } catch (_e) {
    return false;
  }
}



/**
 * LinkedErrors integration
 */
export const linkedErrorsIntegration: IntegrationFn = (options?: { key?: string; limit?: number }) => {
  return new LinkedErrors(options);
};