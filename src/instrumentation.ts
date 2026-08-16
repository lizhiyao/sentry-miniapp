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
  fallbackHandler: FunctionInstrumentationHandler | undefined;
  restore: () => void;
  wrapper: Function;
}

const states = new WeakMap<object, Map<string, FunctionInstrumentationState>>();

function getStateMap(source: object): Map<string, FunctionInstrumentationState> {
  let stateMap = states.get(source);
  if (!stateMap) {
    stateMap = new Map();
    states.set(source, stateMap);
  }
  return stateMap;
}

function createState(source: object, name: string): FunctionInstrumentationState | undefined {
  const stateMap = getStateMap(source);
  const handlers = new Map<Client, FunctionInstrumentationHandler>();
  const state = { handlers } as FunctionInstrumentationState;
  const target = source as Record<string, unknown>;

  const result = fill(target, name, (original: Function) => {
    const wrapper = function (this: unknown, ...args: unknown[]): unknown {
      const activeClient = getClient();
      const handler = activeClient ? handlers.get(activeClient) : undefined;
      const selectedHandler = handler ?? (handlers.size === 0 ? state.fallbackHandler : undefined);

      return selectedHandler ? selectedHandler(original, this, args) : original.apply(this, args);
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
  if (existing && (source as Record<string, unknown>)[name] === existing.wrapper) {
    return existing;
  }

  // 宿主 API 被外部重新赋值后，不再复用已经脱离调用链的旧状态。
  if (existing) {
    stateMap.delete(name);
  }
  return createState(source, name);
}

function restoreIfIdle(source: object, name: string, state: FunctionInstrumentationState): void {
  if (state.handlers.size > 0 || state.fallbackHandler) return;

  // 只恢复自己仍直接拥有的 wrapper。若第三方后来又包了一层，保留当前调用链，
  // 空 handler 的 Sentry wrapper 会透明转发，避免覆盖第三方修改。
  if ((source as Record<string, unknown>)[name] === state.wrapper) {
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
  // setupOnce 的无 client 兼容 handler 只服务手动调用；正式 setup(client) 后立即淘汰。
  state.fallbackHandler = undefined;

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

/**
 * 兼容直接手动调用 integration.setupOnce() 的历史用法和单元测试。
 * core 的正常生命周期会在紧随其后的 setup(client) 中移除此 fallback。
 */
export function addSetupOnceFunctionInstrumentationHandler(
  source: object,
  name: string,
  handler: FunctionInstrumentationHandler,
): () => void {
  const state = ensureState(source, name);
  if (!state) return () => {};
  state.fallbackHandler = handler;

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (state.fallbackHandler === handler) {
      state.fallbackHandler = undefined;
    }
    restoreIfIdle(source, name, state);
  };
}
