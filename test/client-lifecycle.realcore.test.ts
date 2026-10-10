import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBreadcrumb,
  logger,
  getClient,
  getCurrentScope,
  getIsolationScope,
  metrics,
  withScope,
  startInactiveSpan,
  spanStreamingIntegration,
  makeSession,
  Scope,
  type ErrorEvent,
  type Envelope,
} from '@sentry/core';
import { createMiniappTransport } from '../src/transports/xhr';
import { MiniappClient } from '../src/client';
import { init, wrap, captureFeedback } from '../src/sdk';
import { getDiagnostics } from '../src/diagnostics';
import type { MiniappOptions } from '../src/types';
import { resetPlatformCache } from '../src/crossPlatform';
import { ClientLifetime, getClientLifetime } from '../src/lifecycle';
import { OwnerToken } from '../src/owner';
import {
  collectEnvelopePayloads,
  createCapturingTransport,
  createEventEnvelope,
} from './support/envelopes';

describe('真实 core client 关闭与发送边界', () => {
  const clients: MiniappClient[] = [];
  let envelopes: Envelope[];
  function make(options: MiniappOptions = {}, customTransport = true) {
    const configured = {
      dsn: 'https://test@o0.ingest.sentry.io/0',
      defaultIntegrations: false as const,
      ...options,
    };
    const client = customTransport
      ? new MiniappClient({
          ...configured,
          transport: options.transport ?? createCapturingTransport(envelopes),
        })
      : init(configured)!;
    clients.push(client);
    return client;
  }
  function owned<T>(client: MiniappClient, callback: () => T): T {
    return withScope((scope) => {
      scope.setClient(client);
      return callback();
    });
  }
  beforeEach(() => {
    vi.useFakeTimers();
    resetPlatformCache();
    envelopes = [];
    getIsolationScope().clearBreadcrumbs();
    vi.stubGlobal('wx', { request: vi.fn() });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    getIsolationScope().clearBreadcrumbs();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });

  it('dispose 后事件、日志与指标不能发网或启动新的 idle timer', async () => {
    const client = make();
    owned(client, () => {
      logger.info('before');
      metrics.count('before', 1);
    });
    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
    owned(client, () => {
      logger.info('after');
      metrics.count('after', 1);
      client.captureMessage('after');
    });
    const flushed = client.flush();
    await vi.runAllTimersAsync();
    await flushed;
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['dispose', 'close'] as const)(
    '%s 后新增事件和面包屑不执行 processor 或用户过滤回调',
    async (stop) => {
      const beforeSend = vi.fn((event) => event);
      const beforeBreadcrumb = vi.fn((breadcrumb) => breadcrumb);
      const processor = vi.fn((event) => event);
      const client = make({ beforeSend, beforeBreadcrumb });
      client.addEventProcessor(processor);
      if (stop === 'dispose') client.dispose();
      else {
        const closing = client.close();
        await vi.advanceTimersByTimeAsync(5);
        await closing;
      }
      const error = new Error('not captured by closed client');
      expect(client.captureException(error, { event_id: 'closed-exception' })).toBe(
        'closed-exception',
      );
      expect(client.captureMessage('closed message', 'info', { event_id: 'closed-message' })).toBe(
        'closed-message',
      );
      expect(client.captureEvent({ message: 'closed event' }, { event_id: 'closed-event' })).toBe(
        'closed-event',
      );
      owned(client, () => addBreadcrumb({ message: 'closed breadcrumb' }));
      expect(beforeSend).not.toHaveBeenCalled();
      expect(beforeBreadcrumb).not.toHaveBeenCalled();
      expect(processor).not.toHaveBeenCalled();
      expect(envelopes).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      // 拒收不应给 Error 写入 core 的“已捕获”标记，另一个有效 client 仍可捕获它。
      const next = make();
      next.captureException(error);
      const flushed = next.flush();
      await vi.advanceTimersByTimeAsync(5);
      await flushed;
      expect(envelopes).toHaveLength(1);
      expect((envelopes[0]![1][0]![1] as ErrorEvent).breadcrumbs).toBeUndefined();
    },
  );

  it('closing 拒绝新业务事件，同时排空已有异步事件和同步 finalizer', async () => {
    let finish!: (event: any) => void;
    const beforeSend = vi.fn((event) =>
      event.message === 'pending'
        ? new Promise<any>((resolve) => {
            finish = resolve;
          })
        : event,
    );
    const beforeBreadcrumb = vi.fn((breadcrumb) => breadcrumb);
    const client = make({ beforeSend, beforeBreadcrumb });
    client.captureMessage('pending');
    client.registerFinalizer(() => {
      owned(client, () => addBreadcrumb({ message: 'finalizer breadcrumb' }));
      client.captureMessage('finalizer');
      owned(client, () => {
        logger.info('finalizer log');
        metrics.count('finalizer metric', 1);
      });
    });
    const closing = client.close(100);
    client.captureException(new Error('too late'));
    client.captureMessage('too late');
    client.captureEvent({ message: 'too late' });
    owned(client, () => addBreadcrumb({ message: 'too late breadcrumb' }));
    expect(beforeBreadcrumb).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'finalizer breadcrumb' }),
      undefined,
    );
    expect(beforeSend).toHaveBeenCalledTimes(2);
    finish({ message: 'pending' });
    await vi.advanceTimersByTimeAsync(20);
    expect(await closing).toBe(true);
    expect(
      collectEnvelopePayloads<ErrorEvent>(envelopes, ['event']).map((event) => event.message),
    ).toEqual(['finalizer', 'pending']);
    for (const type of ['log', 'trace_metric'] as const) {
      expect(collectEnvelopePayloads(envelopes, [type])).toHaveLength(1);
    }
    expect((envelopes[0]![1][0]![1] as ErrorEvent).breadcrumbs).toEqual([
      expect.objectContaining({ message: 'finalizer breadcrumb' }),
    ]);
  });

  it.each(['dispose', 'close'] as const)(
    '%s 后反馈和 Session 捕获不触发 hook 或修改 init',
    async (stop) => {
      const client = make();
      const feedbackHook = vi.fn();
      const sessionHook = vi.fn();
      const envelopeHook = vi.fn();
      client.on('beforeSendFeedback', feedbackHook);
      client.on('beforeSendSession', sessionHook);
      client.on('beforeEnvelope', envelopeHook);
      if (stop === 'dispose') client.dispose();
      else {
        const closing = client.close();
        await vi.advanceTimersByTimeAsync(5);
        await closing;
      }
      expect(client.captureFeedback({ message: 'direct closed feedback' })).toMatch(
        /^[a-f0-9]{32}$/,
      );
      expect(
        owned(client, () => captureFeedback({ message: 'top-level closed feedback' })),
      ).toMatch(/^[a-f0-9]{32}$/);
      const session = makeSession({ release: 'test-release' });
      const before = session.toJSON();
      client.captureSession(session);
      expect(session.toJSON()).toEqual(before);
      expect(feedbackHook).not.toHaveBeenCalled();
      expect(sessionHook).not.toHaveBeenCalled();
      expect(envelopeHook).not.toHaveBeenCalled();
      expect(envelopes).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('closing 拒收新反馈，允许同步 finalizer 反馈和 Session、已有异步事件的 Session 更新', async () => {
    let finish!: () => void;
    const client = make({
      beforeSend: (event) =>
        new Promise<ErrorEvent>((resolve) => {
          finish = () => resolve(event);
        }),
    });
    const scope = new Scope();
    scope.setClient(client);
    const session = makeSession({ release: 'test-release' });
    scope.setSession(session);
    client.captureEvent(
      {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'pending error',
              mechanism: { type: 'onerror', handled: false },
            },
          ],
        },
      },
      {},
      scope,
    );
    const feedbackHook = vi.fn();
    client.on('beforeSendFeedback', feedbackHook);
    const finalSession = makeSession({ release: 'test-release' });
    client.registerFinalizer(() => {
      client.captureSession(finalSession);
      client.captureFeedback({ message: 'final direct feedback' });
      owned(client, () => captureFeedback({ message: 'final top-level feedback' }));
    });
    const closing = client.close(100);
    client.captureFeedback({ message: 'too late' });
    owned(client, () => captureFeedback({ message: 'too late' }));
    expect(feedbackHook).toHaveBeenCalledTimes(2);
    finish();
    await vi.advanceTimersByTimeAsync(20);
    expect(await closing).toBe(true);
    expect(session.errors).toBe(1);
    expect(session.status).toBe('unhandled');
    expect(session.init).toBe(false);
    expect(finalSession.init).toBe(false);
    expect(envelopes.flatMap((env) => env[1].map((item) => item[0].type))).toEqual([
      'session',
      'feedback',
      'feedback',
      'session',
      'event',
    ]);
  });

  it('并发 close 返回同一个 Promise，finalizer/close/cleanup 仅一次且等待 cleanup', async () => {
    const client = make();
    const summary = vi.fn(() => owned(client, () => logger.info('summary')));
    const cleanup = vi.fn();
    const closeHook = vi.fn();
    client.registerFinalizer(summary);
    client.registerCleanup(cleanup);
    client.on('close', closeHook);
    const first = client.close();
    expect(client.close(1)).toBe(first);
    await vi.runAllTimersAsync();
    expect(await first).toBe(true);
    client.dispose();
    expect(summary).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(closeHook).toHaveBeenCalledOnce();
    expect(envelopes.flatMap((env) => env[1].map((item) => item[0].type))).toEqual(['log']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dispose 中断悬挂的 close；迟到 flush 完成不能再次关闭', async () => {
    let finish!: (value: boolean) => void;
    const client = make({
      transport: () => ({
        send: () => Promise.resolve({}),
        flush: () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      }),
    });
    const hook = vi.fn();
    client.on('close', hook);
    const closing = client.close(0);
    await vi.advanceTimersByTimeAsync(1);
    client.dispose();
    expect(await closing).toBe(false);
    finish(true);
    await Promise.resolve();
    expect(hook).toHaveBeenCalledOnce();
    expect(client.getOptions().enabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, 0])('close(%s) 不套内部 2000ms 预算', async (timeout) => {
    let finish!: (value: boolean) => void;
    const client = make({
      transport: () => ({
        send: () => Promise.resolve({}),
        flush: () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      }),
    });
    let settled = false;
    const closing = client.close(timeout).then((value) => {
      settled = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(2500);
    expect(settled).toBe(false);
    expect(client.getOptions().enabled).not.toBe(false);
    finish(true);
    expect(await closing).toBe(true);
  });

  it('正预算耗尽会关闭，即使 processor 永远未完成', async () => {
    const client = make();
    client.addEventProcessor(() => new Promise(() => {}));
    client.captureMessage('pending');
    const closing = client.close(50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await closing).toBe(false);
    expect(client.getOptions().enabled).toBe(false);
    expect(envelopes).toEqual([]);
  });

  it('用户日志／指标回调或属性转换中 dispose 后不能重新填入 buffer', () => {
    for (const kind of ['log', 'metric'])
      for (const phase of ['callback', 'attribute', 'result']) {
        const callback = vi.fn((value) => {
          if (phase === 'callback') client.dispose();
          return phase === 'result' ? { ...value, attributes } : value;
        });
        const attributes = {
          probe: {
            get value() {
              client.dispose();
              return 'retired-canary';
            },
          },
        };
        const client = make(
          kind === 'log' ? { beforeSendLog: callback } : { beforeSendMetric: callback },
        );
        owned(client, () =>
          kind === 'log'
            ? logger.info('reentrant', phase === 'attribute' ? attributes : {})
            : metrics.count('reentrant', 1, {
                attributes: phase === 'attribute' ? attributes : {},
              }),
        );
        expect(callback).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        owned(client, () => (kind === 'log' ? logger.info('closed') : metrics.count('closed', 1)));
        expect(callback).toHaveBeenCalledOnce();
      }
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('属性序列化中 close 后，日志指标不能绕过关闭门禁或丢掉已有事件', async () => {
    for (const kind of ['log', 'metric'] as const) {
      envelopes.length = 0;
      let finish!: () => void;
      const client = make({
        beforeSend: (event) =>
          new Promise<ErrorEvent>((resolve) => {
            finish = () => resolve(event);
          }),
      });
      const closed = vi.fn();
      client.on('close', closed);
      client.captureMessage('accepted before close');
      let closing!: Promise<boolean>;
      const attributes = {
        probe: {
          get value() {
            closing = client.close(100);
            return 'retired-canary';
          },
        },
      };
      owned(client, () =>
        kind === 'log'
          ? logger.info('late log', attributes)
          : metrics.count('late metric', 1, { attributes }),
      );
      const flushed = client.flush(100);
      finish();
      await vi.advanceTimersByTimeAsync(10);
      expect(await closing).toBe(true);
      await flushed;
      expect(collectEnvelopePayloads<ErrorEvent>(envelopes, ['event'])).toEqual([
        expect.objectContaining({ message: 'accepted before close' }),
      ]);
      expect(collectEnvelopePayloads(envelopes, ['log', 'trace_metric'])).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      expect(closed).toHaveBeenCalledOnce();
    }
  });

  it('关闭后并发槽中的第二个 envelope 不调用宿主 request', async () => {
    const requests: Array<{ success: (result: { statusCode: number }) => void }> = [];
    vi.stubGlobal('wx', {
      request: vi.fn((options) => {
        requests.push(options);
        return {};
      }),
    });
    const client = make(
      {
        enableOfflineCache: false,
        transportOptions: { maxConcurrentRequests: 1 },
      },
      false,
    );
    const transport = client.getTransport()!;
    const first = transport.send(createEventEnvelope('first'));
    const second = transport.send(createEventEnvelope('second'));
    expect(requests).toHaveLength(1);
    client.dispose();
    requests[0]!.success({ statusCode: 200 });
    await first;
    await second;
    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('宿主恢复时先检查绝对 deadline，不依赖 cleanup timer 已执行', () => {
    const lifetime = new ClientLifetime();
    expect(lifetime.beginClose(10)).toBe(10);
    vi.setSystemTime(Date.now() + 11);
    expect(lifetime.canSend()).toBe(false);
    expect(lifetime.state).toBe('closing');
  });
  it('beforeSendSpan 内 dispose，core 后续 add 不留下新 bucket/timer', () => {
    const client = make({
      integrations: [spanStreamingIntegration()],
      tracesSampleRate: 1,
      beforeSendSpan: (span) => {
        client.dispose();
        return span;
      },
    });
    client.init();
    const close = vi.fn();
    client.on('close', close);
    owned(client, () => startInactiveSpan({ name: 'reentrant root' }).end());
    expect(client.getOptions().enabled).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    owned(client, () => startInactiveSpan({ name: 'closed root' }).end());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finalizer/cleanup 单项失败不阻断后续；flush reject 仍执行关闭', async () => {
    const client = make();
    const final = vi.fn();
    const cleanup = vi.fn();
    client.registerFinalizer(() => {
      throw new Error('finalizer');
    });
    client.registerFinalizer(final);
    client.registerCleanup(() => {
      throw new Error('cleanup');
    });
    client.registerCleanup(cleanup);
    vi.spyOn(client.getTransport()!, 'flush').mockRejectedValue(new Error('flush'));
    const closing = expect(client.close()).rejects.toThrow('flush');
    await vi.runAllTimersAsync();
    await closing;
    expect(final).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(client.getOptions().enabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([-1, NaN, Infinity])('非法 close(%s) 使用安全预算并保持关闭语义', async (timeout) => {
    const client = make({
      transport: () => ({
        send: () => Promise.resolve({}),
        flush: () => new Promise<boolean>(() => {}),
      }),
    });
    const closing = client.close(timeout);
    await vi.advanceTimersByTimeAsync(1999);
    expect(client.getOptions().enabled).not.toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await closing).toBe(false);
    expect(client.getOptions().enabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('关闭后注册 cleanup 立即执行，诊断故障也不阻断其余资源', () => {
    const client = make({ debug: true });
    const cleanup = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('console');
    });
    client.registerCleanup(() => {
      throw new Error('cleanup');
    });
    client.registerCleanup(cleanup);
    expect(() => client.dispose()).not.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();
    const late = vi.fn();
    client.registerCleanup(late);
    expect(late).toHaveBeenCalledOnce();
  });
  it('dispose 中断无限 processor 的无期限 close，不遗留 processing poll', async () => {
    const client = make();
    client.addEventProcessor(() => new Promise(() => {}));
    client.captureMessage('never finished');
    const closing = client.close(0);
    await vi.advanceTimersByTimeAsync(10);
    client.dispose();
    expect(await closing).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dispose 同样中断单独 flush 的无期限 processing 等待', async () => {
    const client = make();
    client.addEventProcessor(() => new Promise(() => {}));
    client.captureMessage('never finished');
    const descriptor = Object.getOwnPropertyDescriptor(Promise.prototype, 'finally')!;
    let draining: PromiseLike<boolean>;
    try {
      Object.defineProperty(Promise.prototype, 'finally', { value: undefined, configurable: true });
      draining = client.flush();
    } finally {
      Object.defineProperty(Promise.prototype, 'finally', descriptor);
    }
    await vi.advanceTimersByTimeAsync(10);
    client.dispose();
    await vi.advanceTimersByTimeAsync(1);
    expect(await draining).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('单次公开 flush 不重复 hook，dispose 中断忽略 timeout 的自定义 transport', async () => {
    let complete!: (value: boolean) => void;
    const client = make({
      transport: () => ({
        send: () => Promise.resolve({}),
        flush: () =>
          new Promise<boolean>((resolve) => {
            complete = resolve;
          }),
      }),
    });
    const flushHook = vi.fn();
    client.on('flush', flushHook);
    const first = client.flush();
    const second = client.flush();
    await vi.advanceTimersByTimeAsync(10);
    expect(flushHook).toHaveBeenCalledTimes(2);
    client.dispose();
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    complete(true);
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('第三方 flush/close hook 抛错仍清理 SDK 资源，关闭后不调用 finalizer', async () => {
    const client = make();
    const cleanup = vi.fn();
    client.on('flush', () => {
      throw new Error('flush hook');
    });
    client.on('close', () => {
      throw new Error('close hook');
    });
    client.registerCleanup(cleanup);
    expect(() => client.dispose()).not.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();
    const finalizer = vi.fn();
    client.registerFinalizer(finalizer);
    expect(await client.close()).toBe(false);
    expect(finalizer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('owner flush 不持有 Promise scope；新绑定不会在旧 flush 完成时被弹掉', async () => {
    const completions: Array<(value: boolean) => void> = [];
    const first = init({
      dsn: 'https://test@example.com/0',
      defaultIntegrations: false,
      transport: () => ({
        send: () => Promise.resolve({}),
        flush: () =>
          new Promise<boolean>((resolve) => {
            completions.push(resolve);
          }),
      }),
    })!;
    clients.push(first);
    const flushed = first.flush();
    expect(getClient()).toBe(first);
    const second = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(second);
    expect(getClient()).toBe(second);
    await vi.advanceTimersByTimeAsync(1);
    completions.forEach((complete) => complete(true));
    await flushed;
    expect(getClient()).toBe(second);
    first.dispose();
  });

  it('同步 sampler/span/DSC/beforeBreadcrumb 内 init 拒绝重入且保留原绑定', async () => {
    const attempts: Array<MiniappClient | undefined> = [];
    const attempt = () =>
      attempts.push(init({ dsn: 'https://test@example.com/1', defaultIntegrations: false }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const owner = init({
      dsn: 'https://test@example.com/0',
      defaultIntegrations: false,
      integrations: [spanStreamingIntegration()],
      transport: createCapturingTransport(envelopes),
      tracesSampler: () => {
        attempt();
        return 1;
      },
      beforeSendSpan: (span) => {
        attempt();
        return span;
      },
      beforeBreadcrumb: (breadcrumb) => {
        attempt();
        return breadcrumb;
      },
    })!;
    clients.push(owner);
    owner.on('createDsc', attempt);
    startInactiveSpan({ name: 'hook reentry' }).end();
    addBreadcrumb({ message: 'manual breadcrumb' });
    owner.captureMessage('breadcrumb reentry');
    const flushed = owner.flush();
    await vi.runAllTimersAsync();
    await flushed;
    expect(attempts.length).toBeGreaterThanOrEqual(4);
    expect(attempts.every((client) => client === undefined)).toBe(true);
    expect(getClient()).toBe(owner);
    expect(getDiagnostics().warnings.map((warning) => warning.code)).toContain(
      'reentrant_init_unsupported',
    );
    expect(envelopes).toHaveLength(2);
    const event = collectEnvelopePayloads<ErrorEvent>(envelopes, ['event'])[0]!;
    expect(event.breadcrumbs).toEqual([expect.objectContaining({ message: 'manual breadcrumb' })]);
  });

  it('integration setup 失败立即废弃 B、解除绑定并保留原异常，后续 init 正常', async () => {
    const original = new Error('setup failed');
    const cleanup = vi.fn();
    let failed!: MiniappClient;
    expect(() =>
      init({
        dsn: 'https://test@example.com/0',
        defaultIntegrations: false,
        transport: createCapturingTransport(envelopes),
        integrations: [
          {
            name: 'FailureLifecycleFixture',
            setup(client) {
              failed = client as MiniappClient;
              const timer = setInterval(() => {}, 100);
              client.registerCleanup(() => {
                clearInterval(timer);
                cleanup();
              });
              throw original;
            },
          },
        ],
      }),
    ).toThrow(original);
    expect(getClient()).toBeUndefined();
    expect(getClientLifetime(failed)?.state).toBe('closed');
    expect(getClientLifetime(failed)?.canUseStore()).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    const next = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(next);
    expect(getClient()).toBe(next);
    expect(getClientLifetime(next)?.canUseStore()).toBe(true);
  });

  it('transport 构造失败不复活已退休 A，不抢占下一次 init 的 token', async () => {
    const first = init({
      dsn: 'https://test@example.com/0',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(first);
    const original = new Error('transport failed');
    expect(() =>
      init({
        dsn: 'https://test@example.com/1',
        defaultIntegrations: false,
        transport: () => {
          throw original;
        },
      }),
    ).toThrow(original);
    expect(getClient()).toBeUndefined();
    expect(getClientLifetime(first)?.canUseStore()).toBe(false);
    const next = init({
      dsn: 'https://test@example.com/2',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(next);
    await vi.runAllTimersAsync();
    expect(getClient()).toBe(next);
    expect(getClientLifetime(next)?.canUseStore()).toBe(true);
  });

  it('公开 wrap 保留未决 Promise 身份，不持有 stack scope 或覆盖后续绑定', async () => {
    const first = init({
      dsn: 'https://test@example.com/0',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(first);
    const scope = getCurrentScope();
    let resolve!: (value: number) => void;
    const pending = new Promise<number>((done) => {
      resolve = done;
    });
    const receiver = { value: 7 };
    const wrapped = wrap(function (this: typeof receiver, increment: number) {
      expect(this.value + increment).toBe(9);
      return pending;
    });
    expect(wrapped.call(receiver, 2)).toBe(pending);
    expect(getCurrentScope()).toBe(scope);
    const next = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(next);
    resolve(9);
    expect(await pending).toBe(9);
    expect(getClient()).toBe(next);
    await vi.runAllTimersAsync();
    expect(getClient()).toBe(next);
  });

  it('公开 wrap 的业务 init 生效，捕获 hook 故障不替换业务 throw', () => {
    const first = init({
      dsn: 'https://test@example.com/0',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(first);
    const next = wrap(() =>
      init({
        dsn: 'https://test@example.com/1',
        defaultIntegrations: false,
        transport: createCapturingTransport(envelopes),
      }),
    )()!;
    clients.push(next);
    expect(getClient()).toBe(next);
    vi.spyOn(next, 'captureException').mockImplementation(() => {
      throw new Error('capture failed');
    });
    const original = new Error('business failed');
    expect(() =>
      wrap(() => {
        throw original;
      })(),
    ).toThrow(original);
    expect(getClient()).toBe(next);
  });

  it('owner 的一次资源释放故障不阻断其余释放，终态不会重复回调', () => {
    const client = init({
      dsn: 'https://test@example.com/0',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(client);
    const owner = new OwnerToken(client);
    const released = vi.fn();
    owner.onRelease(() => {
      throw new Error('release failed');
    });
    owner.onRelease(released);
    client.dispose();
    expect(released).toHaveBeenCalledOnce();
    owner.release();
    expect(released).toHaveBeenCalledOnce();
    expect(
      owner.run(() => {
        throw new Error('must not run');
      }),
    ).toBeUndefined();
    const lateOwnerResource = vi.fn();
    owner.onRelease(lateOwnerResource);
    const lateProducerResource = vi.fn();
    getClientLifetime(client)!.registerStop(lateProducerResource);
    expect(lateOwnerResource).toHaveBeenCalledOnce();
    expect(lateProducerResource).toHaveBeenCalledOnce();
  });

  it('A 被 init 替换后，旧 offline retry 不读写或消费 B 的缓存', async () => {
    const storage = new Map<string, string>();
    const request = vi.fn((options: { fail: (error: { errMsg: string }) => void }) => {
      options.fail({ errMsg: 'offline' });
      return {};
    });
    const get = vi.fn((key: string) => storage.get(key));
    const set = vi.fn((key: string, value: string) => storage.set(key, value));
    vi.stubGlobal('wx', { request, getStorageSync: get, setStorageSync: set });
    const options = { dsn: 'https://test@example.com/0', defaultIntegrations: false as const };
    const first = init(options)!;
    clients.push(first);
    first.captureMessage('A failed request');
    await vi.advanceTimersByTimeAsync(1);
    expect(storage.get('sentry_miniapp_offline_v2')).toContain('A failed request');
    const second = init({ ...options, enableOfflineCache: false })!;
    clients.push(second);
    const reads = get.mock.calls.length;
    const writes = set.mock.calls.length;
    const requests = request.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(get).toHaveBeenCalledTimes(reads);
    expect(set).toHaveBeenCalledTimes(writes);
    expect(request).toHaveBeenCalledTimes(requests);
    expect(storage.get('sentry_miniapp_offline_v2')).toContain('A failed request');
    expect(getClient()).toBe(second);
  });

  it('直接构造的非 runtime client 不获得 SDK 持久 cache 的消费权限', async () => {
    const get = vi.fn();
    const set = vi.fn();
    vi.stubGlobal('wx', {
      request: vi.fn((options) => {
        options.fail({ errMsg: 'offline' });
      }),
      getStorageSync: get,
      setStorageSync: set,
    });
    const advanced = make({ enableOfflineCache: true, transport: createMiniappTransport });
    advanced.captureMessage('advanced error');
    await vi.advanceTimersByTimeAsync(6000);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it('finalizer 中 dispose 立即结束采集窗口，后续 summary 不执行', async () => {
    const client = make();
    const later = vi.fn();
    client.registerFinalizer(() => client.dispose());
    client.registerFinalizer(later);
    expect(await client.close()).toBe(false);
    expect(later).not.toHaveBeenCalled();
    expect(envelopes).toEqual([]);
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('dispose abort 在途请求并立即结算；同步 abort fail 与迟到回调都忽略', async () => {
    const requests: Array<{
      success: (result: { statusCode: number }) => void;
      fail: (error: unknown) => void;
    }> = [];
    const abort = vi.fn(() => requests[0]!.fail({ errMsg: 'abort' }));
    const request = vi.fn((options) => {
      requests.push(options);
      return { abort };
    });
    vi.stubGlobal('wx', { request });
    const client = make(
      { enableOfflineCache: false, transportOptions: { maxConcurrentRequests: 1 } },
      false,
    );
    const transport = client.getTransport()!;
    const first = transport.send(createEventEnvelope('inflight'));
    const second = transport.send(createEventEnvelope('waiting'));
    const resolutions = vi.fn();
    void Promise.resolve(first).then(resolutions);
    client.dispose();
    client.dispose();
    await first;
    await second;
    requests[0]!.success({ statusCode: 200 });
    requests[0]!.fail({ errMsg: 'late failure' });
    await Promise.resolve();
    expect(abort).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(resolutions).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('宿主 request 同步 dispose，返回后才拿到的 task 仍被 abort；abort 抛错不挂起', async () => {
    const abort = vi.fn(() => {
      throw new Error('host abort');
    });
    const request = vi.fn(() => {
      client.dispose();
      return { abort };
    });
    vi.stubGlobal('wx', { request });
    const client = make({ enableOfflineCache: false }, false);
    await client.getTransport()!.send(createEventEnvelope('sync disposal'));
    expect(abort).toHaveBeenCalledOnce();
    expect(client.getOptions().enabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('总预算耗尽 abort 默认在途请求；close 返回 false 而非假送达', async () => {
    const abort = vi.fn();
    vi.stubGlobal('wx', { request: vi.fn(() => ({ abort })) });
    const client = make({ enableOfflineCache: false }, false);
    client.captureMessage('pending host request');
    const closing = client.close(20);
    await vi.advanceTimersByTimeAsync(20);
    expect(await closing).toBe(false);
    expect(abort).toHaveBeenCalledOnce();
    // core PromiseBuffer 的单次 drain timeout 在 t=21ms；SDK request timer 已清除。
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('宿主恢复时 deadline 已过但 timer 未执行，排队请求不启动且 close 不能报成功', async () => {
    const requests: Array<{ success: (result: { statusCode: number }) => void }> = [];
    const request = vi.fn((options) => {
      requests.push(options);
      return {};
    });
    vi.stubGlobal('wx', { request });
    const client = make(
      { enableOfflineCache: false, transportOptions: { maxConcurrentRequests: 1 } },
      false,
    );
    const first = client.getTransport()!.send(createEventEnvelope('active'));
    const second = client.getTransport()!.send(createEventEnvelope('queued'));
    const closing = client.close(20);
    vi.setSystemTime(Date.now() + 21);
    requests[0]!.success({ statusCode: 200 });
    await first;
    await second;
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await closing).toBe(false);
    expect(client.getOptions().enabled).toBe(false);
  });

  it('读取宿主 request 能力时同步 dispose，不会再调用宿主方法', async () => {
    const request = vi.fn();
    vi.stubGlobal('wx', {
      get request() {
        client.dispose();
        return request;
      },
    });
    const client = make({ enableOfflineCache: false }, false);
    await client.getTransport()!.send(createEventEnvelope('getter closes'));
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
