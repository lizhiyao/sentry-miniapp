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
      // 平台全局 onError 会在异常重新抛出后再次收到同一个错误。记录错误特征，
      // 由 GlobalHandlers 在短时间内精确匹配并消费对应回调。
      markErrorAsCaptured(ex);

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

interface ErrorSignature {
  message: string;
  type?: string;
  location?: string;
}

interface RecentCapturedError {
  signature: ErrorSignature;
  capturedAt: number;
}

// 微信小游戏真机可能在主线程卡顿后延迟触发 onError。窗口只用于匹配同一错误，
// 优先校验首个有效堆栈位置；宿主改写堆栈时退回到错误类型与消息，并在命中后立即消费。
const ON_ERROR_DEDUPLICATION_WINDOW_MS = 1000;
const MAX_RECENT_CAPTURED_ERRORS = 20;
const recentCapturedErrors: RecentCapturedError[] = [];
const V8_STACK_LOCATION_REGEX = /^\s*at\s+(?:(.*?)\s*\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))\s*$/;
const SAFARI_STACK_LOCATION_REGEX = /^\s*[^@]*@(.+):(\d+):(\d+)\s*$/;
const ERROR_TYPE_PREFIX =
  /^(?:Uncaught\s+)?(Error|Exception|[A-Za-z_$][\w.$]*(?:Error|Exception)):\s*/i;

function normalizeErrorMessage(message: string): string {
  return message.trim().replace(ERROR_TYPE_PREFIX, '').replace(/\s+/g, ' ');
}

function getPlatformErrorMessage(stack: string): string {
  const lines = stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const typedMessage = lines.find(
    (line) => ERROR_TYPE_PREFIX.test(line) && normalizeErrorMessage(line).length > 0,
  );

  if (typedMessage) {
    return normalizeErrorMessage(typedMessage);
  }

  const message = lines.find(
    (line) =>
      line !== 'MiniProgramError' &&
      !line.startsWith('at ') &&
      !/^\s*[^@]*@.+:\d+(?::\d+)?\s*$/.test(line),
  );
  return message ? normalizeErrorMessage(message) : '';
}

function getPlatformErrorType(stack: string): string | undefined {
  for (const line of stack.split('\n')) {
    const match = ERROR_TYPE_PREFIX.exec(line.trim());
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return undefined;
}

function getErrorDetails(
  value: unknown,
): { message: string; stack: string; type?: string } | undefined {
  try {
    if (typeof value === 'string') {
      const type = getPlatformErrorType(value);
      return type
        ? { message: getPlatformErrorMessage(value), stack: value, type }
        : { message: getPlatformErrorMessage(value), stack: value };
    }
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const error = value as { message?: unknown; stack?: unknown };
    const stack = typeof error.stack === 'string' ? error.stack : '';
    const message =
      typeof error.message === 'string'
        ? normalizeErrorMessage(error.message)
        : getPlatformErrorMessage(stack);
    const type =
      'name' in error && typeof error.name === 'string' && error.name
        ? error.name.toLowerCase()
        : getPlatformErrorType(stack);
    return type ? { message, stack, type } : { message, stack };
  } catch (_error) {
    return undefined;
  }
}

function getFirstStackLocation(
  stack: string,
): { filename: string; lineno: string; colno: string } | undefined {
  for (const line of stack.split('\n')) {
    const v8Match = V8_STACK_LOCATION_REGEX.exec(line);
    if (v8Match) {
      return {
        filename: (v8Match[2] || v8Match[5])!,
        lineno: (v8Match[3] || v8Match[6])!,
        colno: (v8Match[4] || v8Match[7])!,
      };
    }

    const safariMatch = SAFARI_STACK_LOCATION_REGEX.exec(line);
    if (safariMatch) {
      return {
        filename: safariMatch[1]!,
        lineno: safariMatch[2]!,
        colno: safariMatch[3]!,
      };
    }
  }

  return undefined;
}

function getErrorSignature(value: unknown): ErrorSignature | undefined {
  const details = getErrorDetails(value);
  if (!details?.message) {
    return undefined;
  }

  const location = getFirstStackLocation(details.stack);
  if (!location) {
    return details.type
      ? { message: details.message, type: details.type }
      : { message: details.message };
  }

  const filename = location.filename
    .replace(/\\/g, '/')
    .replace(/^(?:app|file|webpack):\/+/, '')
    .replace(/^\.\//, '')
    .replace(/[?#].*$/, '');
  return {
    message: details.message,
    ...(details.type ? { type: details.type } : {}),
    location: `${filename}:${location.lineno}:${location.colno}`,
  };
}

function removeExpiredCapturedErrors(now: number): void {
  for (let index = recentCapturedErrors.length - 1; index >= 0; index -= 1) {
    if (now - recentCapturedErrors[index]!.capturedAt > ON_ERROR_DEDUPLICATION_WINDOW_MS) {
      recentCapturedErrors.splice(index, 1);
    }
  }
}

/**
 * 检查并消费与近期已捕获异常匹配的 onError
 */
export function shouldIgnoreOnError(error: unknown): boolean {
  const signature = getErrorSignature(error);
  if (!signature || (!signature.location && !signature.type)) {
    return false;
  }

  const now = Date.now();
  removeExpiredCapturedErrors(now);
  const matchIndex = recentCapturedErrors.findIndex((candidate) => {
    if (candidate.signature.message !== signature.message) {
      return false;
    }

    const sameLocation =
      !!candidate.signature.location &&
      !!signature.location &&
      candidate.signature.location === signature.location;
    const sameType =
      !!candidate.signature.type && !!signature.type && candidate.signature.type === signature.type;
    return sameLocation || sameType;
  });
  if (matchIndex === -1) {
    return false;
  }

  recentCapturedErrors.splice(matchIndex, 1);
  return true;
}

/**
 * 记录一次已由 TryCatch 捕获、随后可能再次进入 onError 的异常
 */
export function markErrorAsCaptured(error: unknown): void {
  const signature = getErrorSignature(error);
  if (!signature || (!signature.location && !signature.type)) {
    return;
  }

  const now = Date.now();
  removeExpiredCapturedErrors(now);
  recentCapturedErrors.push({ signature, capturedAt: now });
  if (recentCapturedErrors.length > MAX_RECENT_CAPTURED_ERRORS) {
    recentCapturedErrors.splice(0, recentCapturedErrors.length - MAX_RECENT_CAPTURED_ERRORS);
  }
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
  try {
    if (!(name in source)) return undefined;
  } catch (_e) {
    // 宿主 Proxy 可能拒绝 has 检查；无法确认属性存在时不尝试修改。
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
  let original: () => any;
  try {
    original = source[name] as () => any;
  } catch (_e) {
    // 无法安全读取原值时不能建立可恢复的包装。
    return undefined;
  }
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

      // 身份读取失败时无法证明当前属性仍由我们拥有。此时宁可保留透明 wrapper，
      // 也不能进入恢复 fallback 覆盖宿主或第三方后来安装的实现。
      try {
        if (source[name] !== wrapped) return;
      } catch (_e) {
        return;
      }

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
