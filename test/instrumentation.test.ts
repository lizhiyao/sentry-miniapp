import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetClient } = vi.hoisted(() => ({ mockGetClient: vi.fn() }));

vi.mock('@sentry/core', () => ({ getClient: mockGetClient }));

import {
  addFunctionInstrumentationHandler,
  addSetupOnceFunctionInstrumentationHandler,
  ensureFunctionInstrumentation,
} from '../src/instrumentation';

describe('共享函数 instrumentation', () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockGetClient.mockReturnValue(undefined);
  });

  it('setupOnce fallback 可工作、幂等并在退订后恢复原函数', () => {
    const original = vi.fn((value: number) => value + 1);
    const source = { run: original };
    const fallback = vi.fn((fn: Function, thisArg: unknown, args: unknown[]) =>
      fn.apply(thisArg, args) * 2,
    );

    expect(ensureFunctionInstrumentation(source, 'run')).toBe(true);
    const wrapper = source.run;
    expect(ensureFunctionInstrumentation(source, 'run')).toBe(true);
    expect(source.run).toBe(wrapper);
    const unsubscribe = addSetupOnceFunctionInstrumentationHandler(source, 'run', fallback);

    expect(source.run(2)).toBe(6);
    expect(fallback).toHaveBeenCalledOnce();
    unsubscribe();
    unsubscribe();
    expect(source.run).toBe(original);
  });

  it('只分发给当前 client，乱序退订不影响其他 client', () => {
    const original = vi.fn((value: string) => `original:${value}`);
    const source = { run: original };
    const first = {} as any;
    const second = {} as any;
    const unknown = {} as any;
    const firstHandler = vi.fn(() => 'first');
    const secondHandler = vi.fn(() => 'second');
    const unsubscribeFirst = addFunctionInstrumentationHandler(
      source,
      'run',
      first,
      firstHandler,
    );
    const wrapper = source.run;
    const unsubscribeSecond = addFunctionInstrumentationHandler(
      source,
      'run',
      second,
      secondHandler,
    );

    mockGetClient.mockReturnValue(first);
    expect(source.run('a')).toBe('first');
    mockGetClient.mockReturnValue(second);
    expect(source.run('b')).toBe('second');
    mockGetClient.mockReturnValue(unknown);
    expect(source.run('c')).toBe('original:c');

    unsubscribeFirst();
    unsubscribeFirst();
    expect(source.run).toBe(wrapper);
    mockGetClient.mockReturnValue(second);
    expect(source.run('d')).toBe('second');
    unsubscribeSecond();
    expect(source.run).toBe(original);
  });

  it('同一 client 的新 handler 不会被旧退订函数删除', () => {
    const source = { run: vi.fn(() => 'original') };
    const client = {} as any;
    const oldHandler = vi.fn(() => 'old');
    const newHandler = vi.fn(() => 'new');
    const unsubscribeOld = addFunctionInstrumentationHandler(source, 'run', client, oldHandler);
    const unsubscribeNew = addFunctionInstrumentationHandler(source, 'run', client, newHandler);
    mockGetClient.mockReturnValue(client);

    unsubscribeOld();
    expect(source.run()).toBe('new');
    unsubscribeNew();
    expect(source.run()).toBe('original');
  });

  it('不会覆盖后来安装的第三方 wrapper，并能基于新调用链重新注册', () => {
    const original = vi.fn(() => 'original');
    const source = { run: original };
    const client = {} as any;
    const unsubscribe = addFunctionInstrumentationHandler(source, 'run', client, () => 'sentry');
    const sentryWrapper = source.run;
    const thirdPartyWrapper = vi.fn(() => sentryWrapper());
    source.run = thirdPartyWrapper;

    unsubscribe();
    expect(source.run).toBe(thirdPartyWrapper);
    expect(source.run()).toBe('original');

    const unsubscribeAgain = addFunctionInstrumentationHandler(source, 'run', client, () => 'new');
    mockGetClient.mockReturnValue(client);
    expect(source.run()).toBe('new');
    unsubscribeAgain();
    expect(source.run).toBe(thirdPartyWrapper);
  });

  it('宿主属性不可包装时安全返回 no-op cleanup', () => {
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, 'run', {
      configurable: false,
      get: () => () => 'original',
    });

    expect(ensureFunctionInstrumentation(source, 'missing')).toBe(false);
    const cleanupClient = addFunctionInstrumentationHandler(
      source,
      'run',
      {} as any,
      () => 'client',
    );
    const cleanupFallback = addSetupOnceFunctionInstrumentationHandler(
      source,
      'run',
      () => 'fallback',
    );
    expect(cleanupClient()).toBeUndefined();
    expect(cleanupFallback()).toBeUndefined();
    expect((source.run as Function)()).toBe('original');
  });
});
