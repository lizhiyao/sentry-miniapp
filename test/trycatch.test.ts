import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  functionToStringIntegration,
  getClient,
  getCurrentScope,
  type Envelope,
} from '@sentry/core';
import { TryCatch, tryCatchIntegration } from '../src/integrations/trycatch';
import { MiniappClient } from '../src/client';
import { init } from '../src/sdk';
import { wrap as wrapHelper } from '../src/helpers';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';
import type { Event } from '@sentry/core';

type Task = { callback: (...args: any[]) => any; args: unknown[] };

describe('TryCatch 调度 owner（真实 core）', () => {
  const clients: MiniappClient[] = [];
  const tasks = new Map<number, Task>();
  let nextId: number;
  let envelopes: Envelope[];
  let schedule: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  let frameSchedule: ReturnType<typeof vi.fn>;

  function start(target: Envelope[] = envelopes, integration = new TryCatch()) {
    const client = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [functionToStringIntegration(), integration],
      transport: createCapturingTransport(target),
    })!;
    clients.push(client);
    return client;
  }
  function events(target: Envelope[] = envelopes) {
    return collectEnvelopePayloads<Event>(target, ['event']);
  }
  function run(id: number, receiver: unknown = undefined, args?: unknown[]) {
    const task = tasks.get(id)!;
    return task.callback.apply(receiver, args ?? task.args);
  }
  function timer(fn: (...args: any[]) => any, interval = false, ...args: unknown[]): number {
    return Reflect.apply(interval ? globalThis.setInterval : globalThis.setTimeout, globalThis, [
      fn,
      100,
      ...args,
    ]);
  }
  beforeEach(() => {
    envelopes = [];
    tasks.clear();
    nextId = 0;
    getCurrentScope().setClient(undefined);
    schedule = vi.fn((callback: Task['callback'], _delay: unknown, ...args: unknown[]) => {
      const id = ++nextId;
      tasks.set(id, { callback, args });
      return id;
    });
    frameSchedule = vi.fn((callback: Task['callback']) => {
      const id = ++nextId;
      tasks.set(id, { callback, args: [123] });
      return id;
    });
    cancel = vi.fn((_id: unknown) => 'host cancelled');
    vi.stubGlobal('setTimeout', schedule);
    vi.stubGlobal('setInterval', schedule);
    vi.stubGlobal('clearTimeout', cancel);
    vi.stubGlobal('clearInterval', cancel);
    vi.stubGlobal('requestAnimationFrame', frameSchedule);
    vi.stubGlobal('cancelAnimationFrame', cancel);
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    getCurrentScope().setClient(undefined);
    tasks.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('setup 包装和公开 dispose 幂等恢复，迟到业务保留原异常且不再捕获', () => {
    const integration = tryCatchIntegration() as TryCatch;
    expect(integration.name).toBe('TryCatch');
    expect(globalThis.setTimeout).toBe(schedule);
    const owner = start(envelopes, integration);
    integration.setup(owner);
    expect(globalThis.setTimeout).not.toBe(schedule);
    const error = new Error('after dispose');
    const business = vi.fn(() => {
      throw error;
    });
    const id = timer(business);
    owner.dispose();
    owner.dispose();
    expect(globalThis.setTimeout).toBe(schedule);
    expect(globalThis.setInterval).toBe(schedule);
    expect(globalThis.clearTimeout).toBe(cancel);
    expect(globalThis.clearInterval).toBe(cancel);
    expect(globalThis.requestAnimationFrame).toBe(frameSchedule);
    expect(globalThis.cancelAnimationFrame).toBe(cancel);
    let caught: unknown;
    try {
      run(id);
    } catch (thrown) {
      caught = thrown;
    }
    expect(caught).toBe(error);
    expect(business).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(events()).toEqual([]);
  });

  it('同 fn 多次调度各自捕获 owner，A 迟到业务异常不进入 B', () => {
    const firstEnvelopes: Envelope[] = [];
    start(firstEnvelopes);
    const fn = function repeated(value: string) {
      throw new Error(value);
    };
    const first = timer(fn, false, 'A first');
    const late = timer(fn, false, 'A late');
    expect(tasks.get(first)!.callback).not.toBe(tasks.get(late)!.callback);
    expect(() => run(first)).toThrow('A first');
    expect(events(firstEnvelopes)).toHaveLength(1);
    const second = start();
    const current = timer(fn, false, 'B current');
    expect(() => run(late)).toThrow('A late');
    expect(events()).toEqual([]);
    expect(() => run(current)).toThrow('B current');
    expect(events()).toHaveLength(1);
    expect(events()[0]!.exception!.values!.at(-1)!.mechanism).toMatchObject({
      type: 'instrument',
      handled: false,
    });
    expect(events()[0]!.extra?.arguments).toEqual(['B current']);
    expect(getClient()).toBe(second);
    // 宿主重复 callback 仍执行业务，已完成 token 不重复捕获。
    expect(() => run(current)).toThrow('B current');
    expect(events()).toHaveLength(1);
  });

  it('interval 在活动期间多次捕获，退休后继续业务但不取消或捕获到 B', () => {
    const firstEnvelopes: Envelope[] = [];
    start(firstEnvelopes);
    const business = vi.fn(() => {
      throw new Error('interval');
    });
    const id = timer(business, true);
    expect(() => run(id)).toThrow('interval');
    expect(() => run(id)).toThrow('interval');
    expect(events(firstEnvelopes)).toHaveLength(2);
    start();
    cancel.mockClear();
    expect(() => run(id)).toThrow('interval');
    expect(business).toHaveBeenCalledTimes(3);
    expect(cancel).not.toHaveBeenCalledWith(id);
    expect(events()).toEqual([]);
  });

  it.each(['clearTimeout', 'clearInterval', 'cancelAnimationFrame'] as const)(
    '%s 释放对应 token，迟到 callback 不捕获',
    (name) => {
      start();
      const callback = vi.fn(() => {
        throw new Error('late cancelled');
      });
      const id =
        name === 'cancelAnimationFrame'
          ? globalThis.requestAnimationFrame(callback)
          : timer(callback, name === 'clearInterval');
      const result = Reflect.apply(globalThis[name], globalThis, [id]);
      expect(result).toBe('host cancelled');
      expect(() => run(id)).toThrow('late cancelled');
      expect(callback).toHaveBeenCalledOnce();
      expect(events()).toEqual([]);
    },
  );

  it('rAF 的时间参数/this/返回和 functionToString markers 保留，冻结函数不被写入缓存', () => {
    start();
    const receiver = { offset: 2 };
    const callback = Object.freeze(function frame(this: typeof receiver, timestamp: number) {
      return timestamp + this.offset;
    });
    const id = globalThis.requestAnimationFrame(callback);
    const wrapped = tasks.get(id)!.callback;
    expect(run(id, receiver)).toBe(125);
    expect((wrapped as any).__sentry_original__).toBe(callback);
    expect(wrapped.name).toBe(callback.name);
    expect(wrapped.toString()).toBe(callback.toString());
    expect((callback as any).__sentry_wrapped__).toBeUndefined();
  });

  it('新调度解开旧 helper wrapper，再绑定当前 owner，不复用首次缓存', () => {
    start();
    const original = () => {
      throw new Error('wrapped schedule');
    };
    const previousWrapper = wrapHelper(original);
    const id = timer(previousWrapper);
    const wrapped = tasks.get(id)!.callback;
    expect(wrapped).not.toBe(previousWrapper);
    expect((wrapped as any).__sentry_original__).toBe(original);
    expect(() => run(id)).toThrow('wrapped schedule');
    expect(events()).toHaveLength(1);
  });

  it('回调返回原 Promise，无 stack fork 留到 await，业务 init 保留新绑定', async () => {
    const first = start();
    const scope = getCurrentScope();
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const id = timer(() => pending);
    expect(run(id)).toBe(pending);
    expect(getCurrentScope()).toBe(scope);
    const next = start();
    resolve('done');
    expect(await pending).toBe('done');
    expect(getClient()).toBe(next);
    first.dispose();
    const switching = timer(() => start());
    const businessClient = run(switching);
    expect(getClient()).toBe(businessClient);
  });

  it('SDK 捕获故障保留业务原异常，且完成后不会重复捕获', () => {
    const owner = start();
    const capture = vi.spyOn(owner, 'captureException').mockImplementation(() => {
      throw new Error('SDK failed');
    });
    const original = new Error('business');
    const id = timer(() => {
      throw original;
    });
    expect(() => run(id)).toThrow(original);
    expect(() => run(id)).toThrow(original);
    expect(capture).toHaveBeenCalledOnce();
    expect(events()).toEqual([]);
  });

  it('宿主同步调用 callback 后不重新登记 owner；调度 throw 保持身份并释放 token', () => {
    schedule.mockImplementation((callback: Task['callback']) => {
      callback();
      return 88;
    });
    start();
    const business = vi.fn();
    expect(timer(business)).toBe(88);
    expect(business).toHaveBeenCalledOnce();
    let captured!: Task['callback'];
    const failure = new Error('schedule failed');
    schedule.mockImplementation((callback: Task['callback']) => {
      captured = callback;
      throw failure;
    });
    expect(() =>
      timer(() => {
        throw new Error('late after schedule failure');
      }),
    ).toThrow(failure);
    expect(() => captured()).toThrow('late after schedule failure');
    expect(events()).toEqual([]);
  });

  it('缺能力、非函数 callback 与低层 client 均透明转发，不误启动自动采集', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      get() {
        throw new Error('host capability getter');
      },
    });
    start();
    expect(globalThis.requestAnimationFrame).toBeUndefined();
    Reflect.apply(globalThis.setTimeout, globalThis, ['business source', 100]);
    expect(schedule.mock.calls.at(-1)![0]).toBe('business source');
    getClient()!.dispose();
    const low = new MiniappClient({
      dsn: 'https://test@example.com/1',
      integrations: [new TryCatch()],
      transport: createCapturingTransport(envelopes),
    });
    clients.push(low);
    getCurrentScope().setClient(low);
    low.init();
    expect(globalThis.setTimeout).toBe(schedule);
    const callback = vi.fn();
    const id = timer(callback);
    expect(tasks.get(id)!.callback).toBe(callback);
    expect(run(id)).toBeUndefined();
    expect(events()).toEqual([]);
  });

  it('第三方后装 wrapper 跨 init 重装只执行一次，旧 cleanup 不覆盖第三方', () => {
    const first = start();
    const saved = globalThis.setTimeout;
    const thirdParty = vi.fn(function (this: unknown, ...args: unknown[]) {
      return Reflect.apply(saved, this, args);
    });
    vi.stubGlobal('setTimeout', thirdParty);
    const second = start();
    thirdParty.mockClear();
    const callback = vi.fn(() => 'business');
    const id = timer(callback);
    expect(run(id)).toBe('business');
    expect(callback).toHaveBeenCalledOnce();
    expect(thirdParty).toHaveBeenCalledOnce();
    first.dispose();
    second.dispose();
    expect(globalThis.setTimeout).toBe(thirdParty);
  });
});
