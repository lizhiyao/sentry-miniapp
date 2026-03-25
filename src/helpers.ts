import { captureException, getCurrentScope } from '@sentry/core';
import type { WrappedFunction } from '@sentry/core';

/**
 * 包装函数以捕获异常
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
  } catch (_e) {
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
 * 是否忽略下一次 onError 事件
 */
let ignoreNextOnError = 0;

/**
 * 检查是否应忽略 onError
 */
export function shouldIgnoreOnError(): boolean {
  return ignoreNextOnError > 0;
}

/**
 * 忽略下一次 onError 调用
 */
export function ignoreNextOnErrorCall(): void {
  ignoreNextOnError += 1;
  setTimeout(() => {
    ignoreNextOnError -= 1;
  });
}

/**
 * 安全地提取函数名称
 */
export function getFunctionName(fn: any): string {
  try {
    return (fn && fn.name) || '<anonymous>';
  } catch (_e) {
    return '<anonymous>';
  }
}

/**
 * 用新值填充对象属性，保留原始值的引用
 */
export function fill(
  source: { [key: string]: any },
  name: string,
  replacementFactory: (...args: any[]) => any,
): void {
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
 * 检查值是否为 Error 实例
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
 * 检查值是否为指定构造函数的实例
 */
export function isInstanceOf(wat: any, base: any): boolean {
  try {
    return wat instanceof base;
  } catch (_e) {
    return false;
  }
}

/**
 * 检查值是否为字符串
 */
export function isString(wat: any): wat is string {
  return Object.prototype.toString.call(wat) === '[object String]';
}

/**
 * 检查值是否为普通对象
 */
export function isPlainObject(wat: any): wat is Record<string, any> {
  return Object.prototype.toString.call(wat) === '[object Object]';
}
