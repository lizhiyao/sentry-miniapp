import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetClient } = vi.hoisted(() => ({ mockGetClient: vi.fn() }));

vi.mock('@sentry/core', () => ({ getClient: mockGetClient }));

import { getLastNativeEvent, subscribeNativeEvent } from '../src/nativeEvents';

import {
  addFunctionInstrumentationHandler,
  addFunctionInstrumentationObserver,
  ensureFunctionInstrumentation,
} from '../src/instrumentation';

describe('共享函数 instrumentation', () => {
  it('参数观察与主 handler 共用包装，退订／异常／client 切换不重复执行业务', () => {
    const first = {} as any,
      second = {} as any;
    const original = vi.fn((value: { observed?: boolean }) => value.observed);
    const source = { run: original };
    const observed = vi.fn((args: unknown[]) => {
      (args[0] as any).observed = true;
    });
    const release = addFunctionInstrumentationObserver(source, 'run', first, observed);
    const primary = vi.fn((fn: Function, receiver: unknown, args: unknown[]) =>
      fn.apply(receiver, args),
    );
    const stop = addFunctionInstrumentationHandler(source, 'run', first, primary);
    mockGetClient.mockReturnValue(first);
    expect(source.run({})).toBe(true);
    expect(observed).toHaveBeenCalledOnce();
    expect(primary).toHaveBeenCalledOnce();
    expect(original).toHaveBeenCalledOnce();
    const failing = addFunctionInstrumentationObserver(source, 'run', first, () => {
      throw new Error('observation');
    });
    const retired = addFunctionInstrumentationObserver(source, 'run', first, () => {
      failing();
      mockGetClient.mockReturnValue(second);
    });
    expect(source.run({})).toBe(true);
    expect(primary).toHaveBeenCalledOnce();
    retired();
    failing();
    stop();
    release();
    release();
    expect(source.run).toBe(original);
    const fresh = addFunctionInstrumentationObserver(source, 'run', first, observed);
    release();
    mockGetClient.mockReturnValue(first);
    expect(source.run({})).toBe(true);
    fresh();
    expect(addFunctionInstrumentationObserver({}, 'missing', first, observed)()).toBeUndefined();
    const owner = {} as any;
    const order: string[] = [];
    const a = addFunctionInstrumentationObserver(source, 'run', owner, () => {
      order.push('a');
      later();
    });
    const later = addFunctionInstrumentationObserver(source, 'run', owner, () =>
      order.push('later'),
    );
    mockGetClient.mockReturnValue(owner);
    source.run({});
    expect(order).toEqual(['a']);
    a();
    later();
  });
  beforeEach(() => {
    mockGetClient.mockReset();
    mockGetClient.mockReturnValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('缺少透明代理能力时保留普通调用，扩展函数及不可检查函数跳过观测', () => {
    const NativeProxy = Proxy;
    const original = function (value: number) {
      return value + 1;
    };
    const extended = Object.assign(function () {}, { capability: true });
    const symbolExtended = Object.assign(function () {}, { [Symbol('capability')]: true });
    const inherited = Object.setPrototypeOf(function () {}, { capability: true });
    const inaccessible = new NativeProxy(original, {
      ownKeys() {
        throw new Error('keys unavailable');
      },
    });
    const badSignature = new NativeProxy(original, {
      get(target, key, receiver) {
        if (key === 'name') throw new Error('signature unavailable');
        return Reflect.get(target, key, receiver);
      },
    });
    vi.stubGlobal('Proxy', undefined);
    const source = { run: original };
    const client = {} as any;
    const unsubscribe = addFunctionInstrumentationHandler(
      source,
      'run',
      client,
      (fn, receiver, args) => fn.apply(receiver, args),
    );
    mockGetClient.mockReturnValue(client);
    expect(source.run(2)).toBe(3);
    expect(source.run.name).toBe(original.name);
    expect(source.run.length).toBe(original.length);
    expect((source.run as any).__sentry_original__).toBe(original);
    expect(Object.prototype.hasOwnProperty.call(original, '__sentry_original__')).toBe(false);
    unsubscribe();
    expect(source.run).toBe(original);
    for (const run of [extended, symbolExtended, inherited, inaccessible, badSignature]) {
      const host = { run };
      expect(ensureFunctionInstrumentation(host, 'run')).toBe(false);
      expect(host.run).toBe(run);
    }
    vi.stubGlobal('Proxy', function () {
      throw new Error('Proxy unavailable');
    });
    const installed = ensureFunctionInstrumentation(source, 'run');
    vi.stubGlobal('Proxy', NativeProxy);
    expect(installed).toBe(false);
    expect(source.run).toBe(original);
    const nativeReflect = Reflect;
    for (const reflect of [
      undefined,
      { apply: nativeReflect.apply, ownKeys: nativeReflect.ownKeys },
    ]) {
      vi.stubGlobal('Reflect', reflect);
      const host = { run: original };
      const installed = ensureFunctionInstrumentation(host, 'run');
      const result = host.run(2);
      const markedOriginal = (host.run as any).__sentry_original__;
      const extendedHost = { run: extended };
      const extendedInstalled = ensureFunctionInstrumentation(extendedHost, 'run');
      vi.stubGlobal('Reflect', nativeReflect);
      expect(installed).toBe(true);
      expect(result).toBe(3);
      expect(markedOriginal).toBe(original);
      expect(extendedInstalled).toBe(false);
      expect(extendedHost.run).toBe(extended);
    }
    vi.stubGlobal('Reflect', {
      get get() {
        throw new Error('Reflect inaccessible');
      },
    });
    const guardedHost = { run: original };
    const guardedInstalled = ensureFunctionInstrumentation(guardedHost, 'run');
    vi.stubGlobal('Reflect', nativeReflect);
    expect(guardedInstalled).toBe(false);
    expect(guardedHost.run).toBe(original);
  });

  it('冻结函数仍可调用并遵守已有原函数标记的 Proxy 不变量', () => {
    for (const descriptor of [
      undefined,
      { value: 'locked' },
      { value: 'writable', writable: true },
      { set() {} },
      { get: () => 'accessor' },
      { value: 'configurable', configurable: true },
    ]) {
      const original = () => 'result';
      if (descriptor) Object.defineProperty(original, '__sentry_original__', descriptor);
      // 可写／可配置标记需要保留其 descriptor；其余输入覆盖冻结 target。
      if (!descriptor?.writable && !descriptor?.configurable) Object.freeze(original);
      const before = Object.getOwnPropertyDescriptors(original);
      const source = { run: original };
      const client = {} as any;
      const unsubscribe = addFunctionInstrumentationHandler(
        source,
        'run',
        client,
        (fn, receiver, args) => fn.apply(receiver, args),
      );
      mockGetClient.mockReturnValue(client);
      expect(source.run()).toBe('result');
      const expected =
        descriptor && !descriptor.configurable && !descriptor.writable && !descriptor.get
          ? descriptor.value
          : original;
      expect((source.run as any).__sentry_original__).toBe(expected);
      expect(Object.getOwnPropertyDescriptors(original)).toEqual(before);
      expect(() => new (source.run as any)()).toThrow(TypeError);
      unsubscribe();
      expect(source.run).toBe(original);
    }
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
    const unsubscribeFirst = addFunctionInstrumentationHandler(source, 'run', first, firstHandler);
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

describe('共享原生事件 instrumentation', () => {
  it.each(['missing', 'throws', 'getter-throws', 'works', 'shadowed-call'] as const)(
    'off %s：重复订阅数量有界，源对象隔离，空通道不读取参数',
    (mode) => {
      const retained = new Set<(...args: any[]) => void>();
      const on = vi.fn((listener) => retained.add(listener));
      const off = vi.fn((listener) => {
        if (mode === 'throws') throw new Error('off unavailable');
        retained.delete(listener);
      });
      if (mode === 'shadowed-call') {
        Object.defineProperty(on, 'call', { value: 'platform extension' });
        Object.defineProperty(off, 'call', {
          get() {
            throw new Error('call property');
          },
        });
      }
      const host = { on, ...(mode === 'missing' ? {} : { off }) };
      if (mode === 'getter-throws')
        Object.defineProperty(host, 'off', {
          get() {
            throw new Error('off getter');
          },
        });
      Object.freeze(host);
      const read = vi.fn();
      const payload = new Proxy({}, { get: read });
      const seen = vi.fn();
      const stops: Array<() => void> = [];
      expect(getLastNativeEvent(undefined, ['on'])).toBeUndefined();
      for (let cycle = 0; cycle < 20; cycle++) {
        expect(
          subscribeNativeEvent(
            host,
            'on',
            'off',
            seen,
            () => true,
            (stop) => stops.push(stop),
          ),
        ).toBe(true);
        if (cycle === 0) expect(getLastNativeEvent(host, ['on'])).toBeUndefined();
        for (const listener of retained) listener(payload);
        expect(getLastNativeEvent(host, ['on'])).toBe('on');
        expect(getLastNativeEvent(host, ['on', 'missing'])).toBeUndefined();
        expect(getLastNativeEvent(host, [])).toBeUndefined();
        expect(seen).toHaveBeenCalledTimes(cycle + 1);
        stops.at(-1)!();
        stops.at(-1)!();
        for (const listener of retained) listener(payload);
      }
      expect(on).toHaveBeenCalledTimes(mode === 'works' || mode === 'shadowed-call' ? 20 : 1);
      expect(retained.size).toBe(mode === 'works' || mode === 'shadowed-call' ? 0 : 1);
      expect(read).not.toHaveBeenCalled();
      // 同名 API 的另一个真实宿主有自己的通道。
      const otherOn = vi.fn();
      const other = { on: otherOn };
      expect(getLastNativeEvent(other, ['on'])).toBeUndefined();
      subscribeNativeEvent(
        other,
        'on',
        'off',
        seen,
        () => true,
        (stop) => stops.push(stop),
      );
      expect(otherOn).toHaveBeenCalledOnce();
      expect(getLastNativeEvent(other, ['on'])).toBeUndefined();
      stops.at(-1)!();
    },
  );

  it('分发快照不转交事件，退订和一个处理器异常不影响其他订阅', () => {
    let emit: (...args: any[]) => void;
    const host = {
      on: (handler: typeof emit) => {
        emit = handler;
      },
    };
    const stops: Array<() => void> = [];
    const seen: string[] = [];
    let current = 'A';
    const add = (handler: () => void, active = () => true) =>
      subscribeNativeEvent(host, 'on', 'off', handler, active, (stop) => stops.push(stop));
    add(
      () => {
        seen.push('A');
        stops[1]!();
        current = 'B';
        add(() => seen.push('new'));
        throw new Error('handler');
      },
      () => current === 'A',
    );
    add(() => seen.push('retired'));
    current = 'B';
    add(
      () => seen.push('B'),
      () => current === 'B',
    );
    current = 'A';
    add(() => seen.push('tail'));
    let corrupt = false;
    add(
      () => seen.push('unreadable'),
      () => {
        if (corrupt) throw new Error('active getter');
        return true;
      },
    );
    corrupt = true;
    emit!();
    expect(seen).toEqual(['A', 'tail']);
    emit!();
    expect(seen).toEqual(['A', 'tail', 'B', 'tail', 'new']);
    stops.forEach((stop) => stop());
    emit!();
    expect(seen).toHaveLength(5);
  });

  it('off getter／调用中加入订阅不丢监听；注册前失活不调用 on', () => {
    for (const phase of ['getter', 'call']) {
      const saved: Array<() => void> = [];
      const on = vi.fn((listener) => saved.push(listener));
      const seen = vi.fn();
      let firstStop: () => void;
      let secondStop: () => void;
      let subscribed = false;
      const addSecond = () => {
        if (subscribed) return;
        subscribed = true;
        saved[0]!(); // off 内同步分发必须无效。
        subscribeNativeEvent(
          host,
          'on',
          'off',
          seen,
          () => true,
          (stop) => {
            secondStop = stop;
          },
        );
      };
      const off = vi.fn(() => {
        if (phase === 'call') addSecond();
      });
      const host = Object.defineProperty({ on }, 'off', {
        get() {
          if (phase === 'getter') addSecond();
          return off;
        },
      });
      subscribeNativeEvent(
        host,
        'on',
        'off',
        seen,
        () => true,
        (stop) => {
          firstStop = stop;
        },
      );
      firstStop!();
      expect(on).toHaveBeenCalledTimes(phase === 'getter' ? 1 : 2);
      expect(seen).not.toHaveBeenCalled();
      saved.at(-1)!();
      expect(seen).toHaveBeenCalledOnce();
      secondStop!();
      saved.forEach((listener) => listener());
      expect(seen).toHaveBeenCalledOnce();
    }
    let active = true;
    const on = vi.fn();
    const stop = vi.fn();
    expect(
      subscribeNativeEvent(
        { on },
        'on',
        'off',
        vi.fn(),
        () => active,
        (release) => {
          active = false;
          release();
          stop();
        },
      ),
    ).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
    expect(on).not.toHaveBeenCalled();
    expect(
      subscribeNativeEvent(
        { on },
        'on',
        'off',
        vi.fn(),
        () => {
          throw new Error('active getter');
        },
        vi.fn(),
      ),
    ).toBe(false);
  });

  it('部分注册失败按能力降级；成功 off 后可重装，注册中停止只在 on 返回后 off', () => {
    for (const removable of [false, true]) {
      const saved: Array<(...args: any[]) => void> = [];
      const stops: Array<() => void> = [];
      const on = vi.fn((listener) => {
        saved.push(listener);
        throw new Error('after saving');
      });
      const off = vi.fn();
      const host = { on, ...(removable ? { off } : {}) };
      for (let i = 0; i < 2; i++) {
        expect(
          subscribeNativeEvent(
            host,
            'on',
            'off',
            vi.fn(),
            () => true,
            (stop) => stops.push(stop),
          ),
        ).toBe(false);
        stops.at(-1)!();
      }
      expect(on).toHaveBeenCalledTimes(removable ? 2 : 1);
      stops.forEach((stop) => stop());
      const read = vi.fn();
      saved.forEach((listener) => listener(new Proxy({}, { get: read })));
      expect(read).not.toHaveBeenCalled();
    }
    const order: string[] = [];
    let stop: () => void;
    const host = {
      on: () => {
        order.push('on');
        stop();
        order.push('saved');
      },
      off: () => {
        order.push('off');
      },
    };
    expect(
      subscribeNativeEvent(
        host,
        'on',
        'off',
        vi.fn(),
        () => true,
        (release) => {
          stop = release;
        },
      ),
    ).toBe(false);
    expect(order).toEqual(['on', 'saved', 'off']);
  });
});
