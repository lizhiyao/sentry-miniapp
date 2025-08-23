import { captureException, getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn, WrappedFunction } from '@sentry/core';

/** Wrap timer functions and event targets to catch errors and provide better meta data */
export class TryCatch implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'TryCatch';

  /**
   * @inheritDoc
   */
  public name: string = TryCatch.id;

  /** JSDoc */
  private _ignoreOnError: number = 0;

  /** JSDoc */
  private _wrapTimeFunction(original: (...args: any[]) => any): (...args: any[]) => any {
    return function (this: any, ...args: any[]): any {
      const originalCallback = args[0];
      args[0] = wrap(originalCallback, {
        mechanism: {
          data: { function: getFunctionName(original) },
          handled: true,
          type: 'instrument',
        },
      });
      return original.apply(this, args);
    };
  }

  /** JSDoc */
  private _wrapRAF(original: any): (callback: () => void) => any {
    return function (this: any, callback: () => void): any {
      return original(
        wrap(callback, {
          mechanism: {
            data: {
              function: 'requestAnimationFrame',
              handler: getFunctionName(original),
            },
            handled: true,
            type: 'instrument',
          },
        }),
      );
    };
  }

  /**
   * Wrap timer functions and event targets to catch errors
   * and provide better metadata.
   */
  public setupOnce(): void {
    this._ignoreOnError = this._ignoreOnError;

    // In miniapp environment, we mainly focus on wrapping common async functions
    const global = globalThis as any;

    if (global.setTimeout) {
      fill(global, 'setTimeout', this._wrapTimeFunction.bind(this));
    }
    if (global.setInterval) {
      fill(global, 'setInterval', this._wrapTimeFunction.bind(this));
    }
    if (global.requestAnimationFrame) {
      fill(global, 'requestAnimationFrame', this._wrapRAF.bind(this));
    }
  }
}

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
    capture?: boolean;
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
      const wrappedArguments = args.map((arg: any) => wrap(arg, options));

      if ((fn as any).handleEvent) {
        return (fn as any).handleEvent.apply(this, wrappedArguments);
      }

      return fn.apply(this, wrappedArguments);
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
 * Fill an object with a new value, keeping a reference to the original
 */
function fill(source: { [key: string]: any }, name: string, replacementFactory: (...args: any[]) => any): void {
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
 * Safely extract function name from itself
 */
function getFunctionName(fn: any): string {
  try {
    return (fn && fn.name) || '<anonymous>';
  } catch (e) {
    return '<anonymous>';
  }
}

/**
 * TryCatch integration
 */
export const tryCatchIntegration: IntegrationFn = () => {
  return new TryCatch();
};