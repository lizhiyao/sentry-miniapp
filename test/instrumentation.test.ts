import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetClient } = vi.hoisted(() => ({ mockGetClient: vi.fn() }));

vi.mock('@sentry/core', () => ({ getClient: mockGetClient }));

import {
  addFunctionInstrumentationHandler,
  ensureFunctionInstrumentation,
} from '../src/instrumentation';

describe('共享函数 instrumentation', () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockGetClient.mockReturnValue(undefined);
  });

  it('中性包装幂等且无 client 时透明调用原函数', () => {
    const original = vi.fn((value: number) => value + 1);
    const source = { run: original };

    expect(ensureFunctionInstrumentation(source, 'run')).toBe(true);
    const wrapper = source.run;
    expect(ensureFunctionInstrumentation(source, 'run')).toBe(true);
    expect(source.run).toBe(wrapper);
    expect(source.run(2)).toBe(3);
    expect(original).toHaveBeenCalledOnce();
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

  it('宿主函数被外部重包后保留已有 handler，且旧 wrapper 只透明转发', () => {
    const original = vi.fn(() => 'original');
    const source = { run: original };
    const client = { getOptions: () => ({ debug: true }) } as any;
    const handler = vi.fn((fn: Function, thisArg: unknown, args: unknown[]) =>
      fn.apply(thisArg, args),
    );
    const unsubscribe = addFunctionInstrumentationHandler(source, 'run', client, handler);
    const sentryWrapper = source.run;
    const thirdPartyWrapper = vi.fn(() => sentryWrapper());
    source.run = thirdPartyWrapper;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(ensureFunctionInstrumentation(source, 'run')).toBe(true);
    mockGetClient.mockReturnValue(client);
    expect(source.run()).toBe('original');
    expect(handler).toHaveBeenCalledOnce();
    expect(thirdPartyWrapper).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('run'));

    unsubscribe();
    expect(source.run).toBe(thirdPartyWrapper);
    warn.mockRestore();
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
    expect(cleanupClient()).toBeUndefined();
    expect((source.run as Function)()).toBe('original');
  });

  it('宿主属性暂时不可读时 setup 与 cleanup 均安全降级', () => {
    const original = vi.fn(() => 'original');
    const target = { run: original };
    let rejectReads = false;
    const source = new Proxy(target, {
      get(targetObject, property, receiver) {
        if (rejectReads && property === 'run') throw new Error('read denied');
        return Reflect.get(targetObject, property, receiver);
      },
    });
    const client = { getOptions: () => ({ debug: true }) } as any;
    const unsubscribe = addFunctionInstrumentationHandler(source, 'run', client, () => 'handled');
    const wrapper = target.run;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('console unavailable');
    });

    rejectReads = true;
    expect(() => ensureFunctionInstrumentation(source, 'run')).not.toThrow();
    expect(ensureFunctionInstrumentation(source, 'run')).toBe(false);
    expect(() => unsubscribe()).not.toThrow();

    rejectReads = false;
    expect(target.run).toBe(wrapper);
    const unsubscribeAgain = addFunctionInstrumentationHandler(source, 'run', client, () => 'new');
    unsubscribeAgain();
    expect(target.run).toBe(original);
    warn.mockRestore();
  });

  it('宿主函数被替换为不可包装属性时丢弃脱离调用链的状态', () => {
    const original = vi.fn(() => 'original');
    const source = { run: original };
    const client = { getOptions: () => ({ debug: false }) } as any;
    const unsubscribe = addFunctionInstrumentationHandler(source, 'run', client, () => 'handled');
    const thirdParty = vi.fn(() => 'third-party');
    Object.defineProperty(source, 'run', {
      configurable: false,
      value: thirdParty,
      writable: false,
    });

    expect(ensureFunctionInstrumentation(source, 'run')).toBe(false);
    expect(() => unsubscribe()).not.toThrow();
    expect(source.run()).toBe('third-party');
  });
});
