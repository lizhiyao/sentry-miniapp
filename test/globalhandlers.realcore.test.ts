import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  captureException,
  getClient,
  flush,
  getCurrentScope,
  getIsolationScope,
  installedIntegrations,
  type Envelope,
  type Event,
} from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init, linkedErrorsIntegration } from '../src/index';
import { GlobalHandlers } from '../src/integrations/globalhandlers';
import { MiniappClient } from '../src/client';
import { getClientLifetime } from '../src/lifecycle';
import {
  assertDefined,
  collectEnvelopePayloads,
  createCapturingTransport,
} from './support/envelopes';

/**
 * GlobalHandlers 的真 @sentry/core 端到端验证：
 * 平台 `wx.onError` 触发 → 经真 core 上报为 exception 事件，并带 `mechanism.handled=false`
 * （未处理错误的标志，core 据此把 Session 标记为 unhandled）。
 *
 * 检查真实事件形态、异常来源和宿主监听的生命周期边界。
 */
describe('GlobalHandlers（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];
  let onErrorHandler: ((e: unknown) => void) | undefined;
  let onPageNotFoundHandler:
    | ((event: { path: string; query: Record<string, unknown>; isEntryPage: boolean }) => void)
    | undefined;

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0;
    for (const scope of [getCurrentScope(), getIsolationScope()]) {
      scope.clearBreadcrumbs();
      scope.setContext('minigame', null);
    }
    onErrorHandler = undefined;
    onPageNotFoundHandler = undefined;
    g.wx = {
      request: vi.fn(),
      getSystemInfoSync: () => ({ brand: 'Apple', SDKVersion: '3' }),
      onError: vi.fn((h: (e: unknown) => void) => {
        onErrorHandler = h;
      }),
      onUnhandledRejection: vi.fn(),
      onPageNotFound: vi.fn((handler) => {
        onPageNotFoundHandler = handler;
      }),
    };
  });

  afterEach(async () => {
    const c = getClient();
    if (c) await c.close(0);
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    delete g.wx;
  });

  it('onError 注册中 dispose 后才完成注册，仍解除迟到监听且不安装后续资源', () => {
    const handlers: Array<(error: unknown) => void> = [];
    g.wx.offError = vi.fn();
    g.wx.onError = vi.fn((handler) => {
      getClient()!.dispose();
      handlers.push(handler);
    });
    const owner = init({
      dsn: 'https://first@example.com/1',
      defaultIntegrations: [new GlobalHandlers()],
      transport: createCapturingTransport(captured),
    })!;
    expect(g.wx.offError).toHaveBeenCalledTimes(2);
    expect(g.wx.onUnhandledRejection).not.toHaveBeenCalled();
    const read = vi.fn();
    handlers[0]!(new Proxy({}, { get: read }));
    expect(read).not.toHaveBeenCalled();
    expect(getClientLifetime(owner)?.state).toBe('closed');
  });

  it('同 integration 跨 A/B 复用仍独立；缺 off 的退休回调不读取参数或采集到 B', async () => {
    g.wx.onMemoryWarning = vi.fn();
    const integration = new GlobalHandlers();
    const firstEnvelopes: Envelope[] = [];
    const first = init({
      dsn: 'https://first@example.com/1',
      defaultIntegrations: [integration],
      transport: createCapturingTransport(firstEnvelopes),
    })!;
    const oldError = onErrorHandler!;
    const oldRejection = g.wx.onUnhandledRejection.mock.calls[0][0];
    const oldPage = onPageNotFoundHandler!;
    const oldMemory = g.wx.onMemoryWarning.mock.calls[0][0];
    first.captureEvent({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'same message',
            mechanism: { type: 'instrument', handled: false },
          },
        ],
      },
    });
    const second = init({
      dsn: 'https://second@example.com/2',
      defaultIntegrations: [integration],
      transport: createCapturingTransport(captured),
    })!;
    const read = vi.fn(() => {
      throw new Error('retired parameter read');
    });
    const unreadable = new Proxy({}, { get: read });
    expect(() => {
      oldError(unreadable);
      oldRejection(unreadable);
      oldPage(unreadable as any);
      oldMemory(unreadable);
    }).not.toThrow();
    expect(read).not.toHaveBeenCalled();
    onErrorHandler!(new Error('same message'));
    await second.flush();
    expect(collectEnvelopePayloads<Event>(firstEnvelopes, ['event'])).toHaveLength(1);
    expect(collectEnvelopePayloads<Event>(captured, ['event'])).toHaveLength(1);
    first.dispose();
    onErrorHandler!(new Error('B remains subscribed'));
    await second.flush();
    expect(collectEnvelopePayloads<Event>(captured, ['event'])).toHaveLength(2);
  });

  it('offError 失败或同步触发旧监听不影响其余 off，关闭后所有 handler 失效', () => {
    g.wx.onMemoryWarning = vi.fn();
    const owner = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [new GlobalHandlers()],
      transport: createCapturingTransport(captured),
    })!;
    const previous = onErrorHandler!;
    g.wx.offError = vi.fn(() => {
      previous(new Error('during off'));
      throw new Error('off failed');
    });
    g.wx.offUnhandledRejection = vi.fn();
    g.wx.offPageNotFound = vi.fn();
    g.wx.offMemoryWarning = vi.fn();
    owner.dispose();
    owner.dispose();
    expect(g.wx.offError).toHaveBeenCalledOnce();
    expect(g.wx.offUnhandledRejection).toHaveBeenCalledOnce();
    expect(g.wx.offPageNotFound).toHaveBeenCalledOnce();
    expect(g.wx.offMemoryWarning).toHaveBeenCalledOnce();
    previous(new Error('after dispose'));
    expect(getClientLifetime(owner)?.state).toBe('closed');
    expect(captured).toEqual([]);
  });

  it('监听故障隔离，rejection 保留原值与真实来源，不把监听器栈当成拒绝来源', async () => {
    g.wx.onError = vi.fn(() => {
      throw new Error('register failed');
    });
    Object.defineProperty(g.wx, 'onMemoryWarning', {
      get() {
        throw new Error('capability getter');
      },
    });
    const originalReasons: unknown[] = [];
    const owner = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [new GlobalHandlers()],
      transport: createCapturingTransport(captured),
      beforeSend: (event, hint) => {
        originalReasons.push(hint.originalException);
        return event;
      },
    })!;
    const rejection = g.wx.onUnhandledRejection.mock.calls[0][0];
    const unreadable = Object.defineProperty({}, 'reason', {
      get() {
        throw new Error('reason getter');
      },
    });
    expect(() => rejection(unreadable)).not.toThrow();
    const error = new Error('valid rejection');
    error.stack = 'Error: valid rejection\n    at submitOrder (pages/order/index.js:42:13)';
    rejection({ reason: error, promise: Promise.resolve() });
    await owner.flush();
    const events = collectEnvelopePayloads<Event>(captured, ['event']);
    expect(events).toHaveLength(1);
    expect(events[0]!.exception?.values?.[0]?.mechanism).toMatchObject({
      type: 'onunhandledrejection',
      handled: false,
    });
    expect(originalReasons[0]).toBe(error);
    expect(events[0]!.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      expect.objectContaining({ filename: 'pages/order/index.js', lineno: 42, colno: 13 }),
    ]);
    const reasons = [
      'Promise failed',
      '',
      42,
      false,
      null,
      undefined,
      BigInt(123),
      Symbol('failed'),
    ];
    for (const reason of reasons) {
      rejection({ reason, promise: Promise.resolve() });
      await owner.flush();
      const current = collectEnvelopePayloads<Event>(captured, ['event']);
      expect(current).toHaveLength(originalReasons.length);
      expect(originalReasons.at(-1)).toBe(reason);
      const exception = current.at(-1)!.exception?.values?.[0];
      expect(exception).toMatchObject({
        type: 'UnhandledRejection',
        value: `Non-Error promise rejection captured with value: ${String(reason)}`,
        mechanism: { type: 'onunhandledrejection', handled: false, synthetic: true },
      });
      expect(exception?.stacktrace).toBeUndefined();
    }
    expect(collectEnvelopePayloads<Event>(captured, ['event'])).toHaveLength(1 + reasons.length);
    const objectReason = { message: 'structured rejection', code: 'E_ORDER' };
    rejection({ reason: objectReason, promise: Promise.resolve() });
    await owner.flush();
    expect(originalReasons.at(-1)).toBe(objectReason);
    expect(
      collectEnvelopePayloads<Event>(captured, ['event']).at(-1)?.extra?.['__serialized__'],
    ).toEqual(objectReason);
    const optionalPromise = Object.defineProperty(
      { reason: new Error('optional promise unreadable') },
      'promise',
      {
        get() {
          throw new Error('promise getter');
        },
      },
    );
    expect(() => rejection(optionalPromise)).not.toThrow();
    await owner.flush();
    expect(originalReasons.at(-1)).toBe(optionalPromise.reason);
    expect(
      collectEnvelopePayloads<Event>(captured, ['event']).at(-1)?.exception?.values?.[0]?.value,
    ).toBe('optional promise unreadable');
    expect(g.wx.onPageNotFound).toHaveBeenCalledOnce();
  });

  it('native 遥测的同步 callback 内 init 拒绝重入；低层 client 无自动监听权限', async () => {
    let attempted: MiniappClient | undefined;
    const owner = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [new GlobalHandlers()],
      beforeSend: (event) => {
        attempted = init({ dsn: 'https://other@example.com/2', defaultIntegrations: false });
        return event;
      },
      transport: createCapturingTransport(captured),
    })!;
    onErrorHandler!(new Error('native callback'));
    await owner.flush();
    expect(attempted).toBeUndefined();
    expect(getClient()).toBe(owner);
    expect(getClientLifetime(owner)?.warnings.has('reentrant_init_unsupported')).toBe(true);
    owner.dispose();
    g.wx.onError.mockClear();
    const low = new MiniappClient({
      dsn: 'https://test@example.com/1',
      integrations: [new GlobalHandlers()],
      transport: createCapturingTransport(captured),
    });
    const previous = getCurrentScope().getClient();
    getCurrentScope().setClient(low);
    try {
      low.init();
      expect(g.wx.onError).not.toHaveBeenCalled();
    } finally {
      low.dispose();
      getCurrentScope().setClient(previous);
    }
  });

  it.each([true, false])(
    '默认 pageNotFound query=%s 时所有别名不泄露敏感值',
    async (urlQueryParams) => {
      init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        dataCollection: { urlQueryParams },
        sensitiveKeys: ['memberNo'],
        enableAutoSessionTracking: false,
        enableMinigameFrameRate: false,
        transport: createCapturingTransport(captured),
      });
      onPageNotFoundHandler!({
        path: 'https://canary-user:canary-password@example.com/missing?token=canary-token#canary-fragment',
        query: {
          token: 'canary-token',
          memberNo: 'canary-member',
          card_number: 'canary-card',
          id: '7',
        },
        isEntryPage: false,
      });
      await flush(2000);
      const event = collectEnvelopePayloads<Event>(captured, ['event'])[0];
      assertDefined(event);
      expect(event.contexts?.page_not_found?.query).toEqual(
        urlQueryParams
          ? { token: '[Filtered]', memberNo: '[Filtered]', card_number: '[Filtered]', id: '7' }
          : undefined,
      );
      expect(JSON.stringify(captured)).not.toContain('canary');
    },
  );

  it.each([true, false])(
    '默认小游戏启动 query=%s 使用 client 的采集策略',
    async (urlQueryParams) => {
      g.wx.getLaunchOptionsSync = () => ({
        scene: 1001,
        path: 'game.js?token=canary-path#canary-fragment',
        query: {
          token: 'canary-token',
          memberNo: 'canary-member',
          card_number: 'canary-card',
          id: '7',
        },
      });
      init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        dataCollection: { urlQueryParams },
        sensitiveKeys: ['memberNo'],
        enableAutoSessionTracking: false,
        enableMinigameFrameRate: false,
        transport: createCapturingTransport(captured),
      });
      captureException(new Error('launch probe'));
      await flush(2000);
      const event = collectEnvelopePayloads<Event>(captured, ['event'])[0];
      assertDefined(event);
      expect(event.contexts?.minigame?.path).toBe('game.js');
      expect(event.contexts?.minigame?.query).toEqual(
        urlQueryParams
          ? { token: '[Filtered]', memberNo: '[Filtered]', card_number: '[Filtered]', id: '7' }
          : undefined,
      );
      expect(JSON.stringify(captured)).not.toContain('canary');
    },
  );

  it('wx.onError 触发 → core 上报 exception，mechanism.handled=false', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    } as any);

    // GlobalHandlers.setupOnce 应已注册 wx.onError
    expect(typeof onErrorHandler).toBe('function');

    // 模拟平台抛出未处理错误
    onErrorHandler!('boom from platform');
    await flush(2000);

    const events = collectEnvelopePayloads<Event>(captured, ['event']);
    const errEvent = events.find((e) => e.exception?.values?.length);
    assertDefined(errEvent);
    const val = errEvent.exception?.values?.[0];
    assertDefined(val);
    expect(val.value).toContain('boom from platform');
    expect(val.mechanism).toEqual({ type: 'onerror', handled: false });
  });

  it('wx.onError 字符串中的小游戏堆栈会转为结构化 frames', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    } as any);

    onErrorHandler!(
      [
        'MiniProgramError',
        'Cannot read properties of undefined (reading someProperty)',
        'TypeError: Cannot read properties of undefined (reading someProperty)',
        'at o.OnInit (subpackages/engine/game.js:10555:48)',
        'at s.InvokeInit (subpackages/engine/game.js:58020:2130)',
        'at (WAGameSubContext.js:1:200000)',
      ].join('\n'),
    );
    await flush(2000);

    const events = collectEnvelopePayloads<Event>(captured, ['event']);
    const value = events[0]?.exception?.values?.[0];
    assertDefined(value);
    expect(value.mechanism).toEqual({ type: 'onerror', handled: false });
    expect(value.stacktrace?.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'app:///subpackages/engine/game.js',
          function: 'o.OnInit',
          lineno: 10555,
          colno: 48,
        }),
      ]),
    );
  });

  it('wx.onError 对象 message 中的小游戏堆栈会转为结构化 frames', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    } as any);

    onErrorHandler!({
      message: [
        'MiniProgramError',
        's.Ins.OnEventGameInit is not a function',
        'TypeError: s.Ins.OnEventGameInit is not a function',
        'at bInit (subpackages/../file:/Project/ViewBattleDebug.ts:52:23)',
        'at Function.<anonymous> (WAGameSubContext.js:1:216128)',
      ].join('\n'),
      stack: '',
    });
    await flush(2000);

    const events = collectEnvelopePayloads<Event>(captured, ['event']);
    const value = events[0]?.exception?.values?.[0];
    assertDefined(value);
    expect(value.type).toBe('TypeError');
    expect(value.value).toBe('s.Ins.OnEventGameInit is not a function');
    expect(value.mechanism).toEqual({ type: 'onerror', handled: false });
    expect(value.stacktrace?.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: 'bInit',
          lineno: 52,
          colno: 23,
        }),
      ]),
    );
  });

  it('page-not-found context 只附着本次事件，不泄漏到后续错误', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    } as any);

    expect(onPageNotFoundHandler).toBeDefined();
    onPageNotFoundHandler!({
      path: 'pages/missing?id=1',
      query: { id: '1' },
      isEntryPage: false,
    });
    captureException(new Error('unrelated after page-not-found'));
    await flush(2000);

    const events = collectEnvelopePayloads<Event>(captured, ['event']);
    const pageEvent = events.find((event) =>
      event.exception?.values?.[0]?.value?.includes('页面无法找到'),
    );
    const unrelated = events.find((event) =>
      event.exception?.values?.[0]?.value?.includes('unrelated after page-not-found'),
    );
    expect(pageEvent?.tags?.pagenotfound).toBe('pages/missing');
    expect(pageEvent?.contexts?.page_not_found).toBeDefined();
    expect(unrelated?.tags?.pagenotfound).toBeUndefined();
    expect(unrelated?.contexts?.page_not_found).toBeUndefined();
  });

  it('TryCatch 捕获带 cause 的错误后，宿主 onError 再报同一外层错误被去重', async () => {
    // Core 把 instrument mechanism 标记在被捕获的外层异常上；
    // 去重比较同一外层错误，cause 链继续由 LinkedErrors 处理。
    const originalSetTimeout = g.setTimeout;
    g.setTimeout = (cb: (...args: any[]) => any) => {
      cb();
      return 0 as any;
    };

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      enableOfflineCache: false,
      transport: createCapturingTransport(captured),
    } as any);

    const outer = new Error('outer boom') as Error & { cause?: Error };
    outer.cause = new Error('root cause');

    expect(() => {
      g.setTimeout(() => {
        throw outer;
      });
    }).toThrow('outer boom');
    await flush(2000);

    const boomEvents = () =>
      collectEnvelopePayloads<Event>(captured, ['event']).filter((e) =>
        e.exception?.values?.some((value: any) => value.value?.includes('outer boom')),
      );
    expect(boomEvents()).toHaveLength(1);

    // 宿主随后把同一个未处理错误交给 wx.onError：应被去重，不再重报。
    onErrorHandler!(outer);
    await flush(2000);

    expect(boomEvents()).toHaveLength(1);
    g.setTimeout = originalSetTimeout;
  });
  it.each([true, false])('宿主 raw stack 含 message 首行=%s 时第一帧不丢失', async (header) => {
    init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [new GlobalHandlers()],
      transport: createCapturingTransport(captured),
    });
    const lines = ['    at first (pages/first.js:10:2)', '    at second (pages/second.js:20:3)'];
    onErrorHandler!({
      name: 'Error',
      message: 'raw stack',
      stack: [...(header ? ['Error: raw stack'] : []), ...lines].join('\n'),
    });
    await flush();
    const frames = collectEnvelopePayloads<Event>(captured, ['event'])[0]!.exception!.values![0]!
      .stacktrace!.frames!;
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.filename)).toEqual(['pages/second.js', 'pages/first.js']);
  });

  it.each([true, false])(
    '同 type/message，stack 可用=%s：不同位置或缺失来源都不吞掉',
    async (hasStack) => {
      init({
        dsn: 'https://key@example.com/1',
        defaultIntegrations: [new GlobalHandlers()],
        transport: createCapturingTransport(captured),
      });
      const instrument = new Error('same message');
      instrument.stack = hasStack ? 'Error: same message\n    at first (page.js:1:1)' : '';
      captureException(instrument, { mechanism: { type: 'instrument', handled: false } });
      onErrorHandler!({
        name: 'Error',
        message: 'same message',
        stack: hasStack ? 'Error: same message\n    at second (page.js:2:1)' : '',
      });
      await flush();
      expect(collectEnvelopePayloads<Event>(captured, ['event'])).toHaveLength(2);
    },
  );
  it('宿主同／跨上下文 Error 保留身份、cause 与无首行 stack，结构化字段独立降级', async () => {
    const originals: unknown[] = [];
    init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [new GlobalHandlers(), linkedErrorsIntegration()],
      transport: createCapturingTransport(captured),
      beforeSend: (event, hint) => {
        originals.push(hint.originalException);
        return event;
      },
    });
    const stack = 'at first (pages/first.js:10:2)\nat second (pages/second.js:20:3)';
    const foreign = runInNewContext(
      "new Error('foreign Error', { cause: new TypeError('foreign cause') })",
    ) as Error & { cause: Error };
    expect(foreign).not.toBeInstanceOf(Error);
    foreign.cause.stack = 'TypeError: foreign cause\n at root (pages/root.js:7:3)';
    for (const error of [new Error('raw Error'), foreign]) {
      error.stack = stack;
      onErrorHandler!(error);
      await flush();
      expect(error.stack).toBe(stack);
      expect(originals.at(-1)).toBe(error);
      const exceptions = collectEnvelopePayloads<Event>(captured, ['event']).at(-1)!.exception!
        .values!;
      const outer = exceptions.at(-1)!;
      expect(outer.stacktrace!.frames!.map((frame) => frame.filename)).toEqual([
        'pages/second.js',
        'pages/first.js',
      ]);
      if (error === foreign) {
        expect(exceptions).toHaveLength(2);
        expect(exceptions[0]).toMatchObject({ type: 'TypeError', value: 'foreign cause' });
      }
    }
    for (const inaccessible of ['message', 'stack'] as const) {
      const payload = {
        name: 'TypeError',
        message: 'readable host message',
        stack: 'TypeError: readable host message\n at host (pages/host.js:13:2)',
      };
      Object.defineProperty(payload, inaccessible, {
        get() {
          throw new Error(`${inaccessible} getter`);
        },
      });
      expect(() => onErrorHandler!(payload)).not.toThrow();
      await flush();
      const exception = collectEnvelopePayloads<Event>(captured, ['event']).at(-1)!.exception!
        .values![0]!;
      expect(exception).toMatchObject({ type: 'TypeError', value: 'readable host message' });
      if (inaccessible === 'stack') expect(exception.stacktrace).toBeUndefined();
      else
        expect(exception.stacktrace!.frames![0]).toMatchObject({
          filename: 'pages/host.js',
          lineno: 13,
          colno: 2,
        });
    }
    const opaque = new Proxy(
      {},
      {
        get() {
          throw new Error('opaque host payload');
        },
      },
    );
    expect(() => onErrorHandler!(opaque)).not.toThrow();
    await flush();
    expect(
      collectEnvelopePayloads<Event>(captured, ['event']).at(-1)!.exception!.values![0],
    ).toMatchObject({ value: 'Unknown platform error' });
    expect(
      collectEnvelopePayloads<Event>(captured, ['event']).at(-1)!.exception!.values![0]!.stacktrace,
    ).toBeUndefined();
  });
});
