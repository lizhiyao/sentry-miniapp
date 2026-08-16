import { getClient } from '@sentry/core';
import type { Client } from '@sentry/core';

import { fill } from './helpers';

export type FunctionInstrumentationHandler = (
  original: Function,
  thisArg: unknown,
  args: unknown[],
) => unknown;

interface FunctionInstrumentationState {
  handlers: Map<Client, FunctionInstrumentationHandler>;
  restore: () => void;
  wrapper: Function;
}

const states = new WeakMap<object, Map<string, FunctionInstrumentationState>>();

interface PropertyReadResult {
  readable: boolean;
  value?: unknown;
}

function readProperty(source: object, name: string): PropertyReadResult {
  try {
    return { readable: true, value: (source as Record<string, unknown>)[name] };
  } catch (_e) {
    return { readable: false };
  }
}

function warnInDebugMode(state: FunctionInstrumentationState, message: string): void {
  const debugEnabled = [...state.handlers.keys()].some((client) => {
    try {
      return client.getOptions().debug === true;
    } catch (_e) {
      return false;
    }
  });
  if (!debugEnabled) return;

  try {
    console.warn(message);
  } catch (_e) {
    // 诊断日志不能阻断宿主 instrumentation 的安装或降级。
  }
}

function getStateMap(source: object): Map<string, FunctionInstrumentationState> {
  let stateMap = states.get(source);
  if (!stateMap) {
    stateMap = new Map();
    states.set(source, stateMap);
  }
  return stateMap;
}

function createState(
  source: object,
  name: string,
  existingState?: FunctionInstrumentationState,
): FunctionInstrumentationState | undefined {
  const stateMap = getStateMap(source);
  const state =
    existingState ??
    ({
      handlers: new Map<Client, FunctionInstrumentationHandler>(),
    } as FunctionInstrumentationState);
  const target = source as Record<string, unknown>;

  const result = fill(target, name, (original: Function) => {
    const wrapper = function (this: unknown, ...args: unknown[]): unknown {
      // 宿主 API 被第三方重包后，旧 wrapper 可能仍位于新调用链内部。状态迁移到新 wrapper
      // 后旧层必须透明转发，否则同一 handler 会递归或重复执行。
      if (state.wrapper !== wrapper) return original.apply(this, args);

      const activeClient = getClient();
      const handler = activeClient ? state.handlers.get(activeClient) : undefined;
      return handler ? handler(original, this, args) : original.apply(this, args);
    };

    state.wrapper = wrapper;
    return wrapper;
  });

  if (!result?.replaced) {
    return undefined;
  }

  state.restore = result.restore;
  stateMap.set(name, state);
  return state;
}

function ensureState(source: object, name: string): FunctionInstrumentationState | undefined {
  const stateMap = getStateMap(source);
  const existing = stateMap.get(name);
  if (existing) {
    const current = readProperty(source, name);
    if (!current.readable) {
      warnInDebugMode(
        existing,
        `[sentry-miniapp] 无法读取宿主 API ${name}，保留现有监控状态并跳过重装`,
      );
      return undefined;
    }
    if (current.value === existing.wrapper) return existing;

    // 宿主 API 被外部重新赋值后，在新调用链上重装 wrapper，同时保留所有 client handler。
    // cleanup 闭包继续引用同一个 state，仍能正确退订并恢复最新宿主函数。
    warnInDebugMode(
      existing,
      `[sentry-miniapp] 检测到宿主 API ${name} 被外部替换，正在重新安装监控包装`,
    );

    const reinstalled = createState(source, name, existing);
    if (!reinstalled) stateMap.delete(name);
    return reinstalled;
  }
  return createState(source, name);
}

function restoreIfIdle(source: object, name: string, state: FunctionInstrumentationState): void {
  if (state.handlers.size > 0) return;

  // 只恢复自己仍直接拥有的 wrapper。若第三方后来又包了一层，保留当前调用链，
  // 空 handler 的 Sentry wrapper 会透明转发，避免覆盖第三方修改。
  const current = readProperty(source, name);
  if (current.readable && current.value === state.wrapper) {
    state.restore();
    getStateMap(source).delete(name);
  }
}

/**
 * 安装一次进程级函数包装，但不绑定 client 处理器。
 *
 * `setupOnce()` 可调用本函数；真正的数据采集必须由 `setup(client)` 注册 handler。
 */
export function ensureFunctionInstrumentation(source: object, name: string): boolean {
  return ensureState(source, name) !== undefined;
}

/**
 * 为指定 client 注册函数 instrumentation handler。
 *
 * 全局函数只包装一次；调用发生时仅分发给当前 scope 绑定的 client。退订只移除
 * 当前 client 的 handler，最后一个 handler 退出后才安全恢复宿主原函数。
 */
export function addFunctionInstrumentationHandler(
  source: object,
  name: string,
  client: Client,
  handler: FunctionInstrumentationHandler,
): () => void {
  const state = ensureState(source, name);
  if (!state) return () => {};

  state.handlers.set(client, handler);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (state.handlers.get(client) === handler) {
      state.handlers.delete(client);
    }
    restoreIfIdle(source, name, state);
  };
}
