import { captureException, getCurrentScope } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';

/**
 * Wrap a function to capture exceptions
 */
export function wrap(
  fn: WrappedFunction,
  options: {
    mechanism?: {
      data?: Record<string, any>;
      handled?: boolean;
      type?: string;
    };
  } = {},
  before?: WrappedFunction,
): any {
  // tslint:disable-next-line:strict-type-predicates
  if (typeof fn !== 'function') {
    return fn;
  }

  try {
    // We don't wanna wrap it twice
    if ((fn as any).__sentry__) {
      return fn;
    }

    // If this has already been wrapped in the past, return that wrapped function
    if (fn.__sentry_wrapped__) {
      return fn.__sentry_wrapped__;
    }
  } catch (e) {
    // Just accessing custom props in some environments
    // can cause a "Permission denied" exception.
    // Bail on wrapping and return the function as-is.
    return fn;
  }

  const sentryWrapped: WrappedFunction = function (this: any, ...args: any[]): any {
    // tslint:disable-next-line:strict-type-predicates
    if (before && typeof before === 'function') {
      before.apply(this, args);
    }

    try {
      return fn.apply(this, args);
    } catch (ex) {
      const scope = getCurrentScope();
      
      scope.addEventProcessor((event) => {
        const processedEvent = { ...event };

        if (options.mechanism) {
          processedEvent.exception = processedEvent.exception || {};
          (processedEvent.exception as any).mechanism = options.mechanism;
        }

        processedEvent.extra = {
          ...processedEvent.extra,
          arguments: args,
        };

        return processedEvent;
      });

      captureException(ex);
      throw ex;
    }
  };

  // Accessing some objects may throw
  try {
    // tslint:disable-next-line: no-for-in
    for (const property in fn) {
      if (Object.prototype.hasOwnProperty.call(fn, property)) {
        (sentryWrapped as any)[property] = (fn as any)[property];
      }
    }
  } catch (_oO) {
    // no-empty
  }

  fn.prototype = fn.prototype || {};
  sentryWrapped.prototype = fn.prototype;

  Object.defineProperty(fn, '__sentry_wrapped__', {
    enumerable: false,
    value: sentryWrapped,
  });

  // Signal that this function has been wrapped/filled already
  Object.defineProperties(sentryWrapped, {
    __sentry__: {
      enumerable: false,
      value: true,
    },
    __sentry_original__: {
      enumerable: false,
      value: fn,
    },
  });

  // Restore original function name
  try {
    const descriptor = Object.getOwnPropertyDescriptor(sentryWrapped, 'name') as PropertyDescriptor;
    if (descriptor.configurable) {
      Object.defineProperty(sentryWrapped, 'name', {
        get(): string {
          return fn.name;
        },
      });
    }
  } catch (_oO) {
    // no-empty
  }

  return sentryWrapped;
}

/**
 * Check if we should ignore the next onError event
 */
let ignoreNextOnError = 0;

/**
 * Check if we should ignore onError
 */
export function shouldIgnoreOnError(): boolean {
  return ignoreNextOnError > 0;
}

/**
 * Ignore next onError
 */
export function ignoreNextOnErrorCall(): void {
  ignoreNextOnError += 1;
  setTimeout(() => {
    ignoreNextOnError -= 1;
  });
}

/**
 * Safely extract function name from itself
 */
export function getFunctionName(fn: any): string {
  try {
    return (fn && fn.name) || '<anonymous>';
  } catch (e) {
    return '<anonymous>';
  }
}

/**
 * Fill an object with a new value, keeping a reference to the original
 */
export function fill(source: { [key: string]: any }, name: string, replacementFactory: (...args: any[]) => any): void {
  if (!(name in source)) {
    return;
  }

  const original = source[name] as () => any;
  const wrapped = replacementFactory(original);

  if (typeof wrapped === 'function') {
    try {
      wrapped.prototype = wrapped.prototype || {};
      wrapped.prototype.constructor = wrapped;
    } catch (_Oo) {
      // This can throw in some funky environments
    }
  }

  source[name] = wrapped;
}

/**
 * Check if value is an instance of Error
 */
export function isError(wat: any): wat is Error {
  switch (Object.prototype.toString.call(wat)) {
    case '[object Error]':
    case '[object Exception]':
    case '[object DOMException]':
      return true;
    default:
      return isInstanceOf(wat, Error);
  }
}

/**
 * Check if value is an instance of the given constructor
 */
export function isInstanceOf(wat: any, base: any): boolean {
  try {
    return wat instanceof base;
  } catch (_e) {
    return false;
  }
}

/**
 * Check if value is a string
 */
export function isString(wat: any): wat is string {
  return Object.prototype.toString.call(wat) === '[object String]';
}

/**
 * Check if value is a plain object
 */
export function isPlainObject(wat: any): wat is Record<string, any> {
  return Object.prototype.toString.call(wat) === '[object Object]';
}