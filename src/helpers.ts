import { captureException, withScope } from '@sentry/core';
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
      // 平台全局 onError 会在异常重新抛出后再次收到同一个错误。短暂屏蔽该回调，
      // 与 Sentry Browser 的 TryCatch / GlobalHandlers 去重策略保持一致。
      ignoreNextOnErrorCall();

      // 用 withScope 临时 fork 一个 scope：事件处理器只作用于本次 captureException，用完即弃。
      // 绝不能用 getCurrentScope().addEventProcessor——那会把处理器永久挂在当前 scope 上，给之后
      // 每个 unrelated 事件都盖上本次的 mechanism/arguments（尤其把未处理错误误标成 handled:true，
      // 进而虚高 crash-free 率）。
      withScope((scope) => {
        scope.addEventProcessor((event) => ({
          ...event,
          extra: {
            ...event.extra,
            arguments: args,
          },
        }));

        // mechanism 交给 core 的 EventHint 处理：prepareEvent 会在 LinkedErrors 等 client
        // processors 前把 mechanism 标到原始异常上；否则带 Error.cause 时，scope processor
        // 阶段 values[0] 已经可能是 prepend 进来的 cause，落点会错。
        captureException(ex, options.mechanism ? { mechanism: options.mechanism } : undefined);
      });
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
export interface FillResult {
  replaced: boolean;
  restore: () => void;
}

function replacePropertyValue(
  source: { [key: string]: any },
  name: string,
  value: any,
  enumerable: boolean,
): boolean {
  try {
    source[name] = value;
    if (source[name] === value) return true;
  } catch (_e) {
    // 部分小程序真机把原生 API 暴露为 accessor，直接赋值可能抛错或被 setter 忽略。
  }

  try {
    Object.defineProperty(source, name, {
      configurable: true,
      enumerable,
      value,
      writable: true,
    });
    return source[name] === value;
  } catch (_e) {
    // 不可配置的宿主属性无法安全替换。
    return false;
  }
}

export function fill(
  source: { [key: string]: any },
  name: string,
  replacementFactory: (...args: any[]) => any,
): FillResult | undefined {
  if (!(name in source)) {
    return undefined;
  }

  let hadOwnProperty = false;
  let descriptorInspected = false;
  let originalDescriptor: PropertyDescriptor | undefined;
  try {
    hadOwnProperty = Object.prototype.hasOwnProperty.call(source, name);
    originalDescriptor = hadOwnProperty ? Object.getOwnPropertyDescriptor(source, name) : undefined;
    descriptorInspected = true;
  } catch (_e) {
    // 宿主代理可能不允许读取 descriptor；仍可继续尝试普通赋值。
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

  const enumerable = originalDescriptor?.enumerable ?? true;
  const replaced = replacePropertyValue(source, name, wrapped, enumerable);

  return {
    replaced,
    restore: () => {
      if (!replaced) return;

      try {
        if (!descriptorInspected) {
          replacePropertyValue(source, name, original, enumerable);
        } else if (hadOwnProperty && originalDescriptor) {
          Object.defineProperty(source, name, originalDescriptor);

          // accessor 可能把值保存在宿主内部；恢复 descriptor 后再尽力恢复原始值。
          if (source[name] !== original && originalDescriptor.set) {
            source[name] = original;
          }
        } else {
          delete source[name];

          // 若赋值命中了继承的 setter，删除自有属性后还需恢复其内部值。
          if (source[name] !== original) {
            source[name] = original;
          }
        }
      } catch (_e) {
        // 宿主拒绝精确恢复 descriptor 时，至少尽力恢复原始函数。
        replacePropertyValue(source, name, original, enumerable);
      }
    },
  };
}
