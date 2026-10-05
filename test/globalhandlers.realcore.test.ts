import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
import { init } from '../src/index';
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
 * （未处理错误的标志，core 据此把 Session 标记为 crashed）。
 *
 * 历史单测把 captureException mock 掉，只断言「调用了」，测不到事件实际形态——本用例补这个真窟窿。
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

  it('注册/getter 故障按能力隔离；不可读 native payload 不向宿主抛出', async () => {
    g.wx.onError = vi.fn(() => {
      throw new Error('register failed');
    });
    Object.defineProperty(g.wx, 'onMemoryWarning', {
      get() {
        throw new Error('capability getter');
      },
    });
    const owner = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [new GlobalHandlers()],
      transport: createCapturingTransport(captured),
    })!;
    const rejection = g.wx.onUnhandledRejection.mock.calls[0][0];
    const unreadable = Object.defineProperty({}, 'reason', {
      get() {
        throw new Error('reason getter');
      },
    });
    expect(() => rejection(unreadable)).not.toThrow();
    rejection({ reason: new Error('valid rejection'), promise: Promise.resolve() });
    await owner.flush();
    const events = collectEnvelopePayloads<Event>(captured, ['event']);
    expect(events).toHaveLength(1);
    expect(events[0]!.exception?.values?.[0]?.mechanism).toMatchObject({
      type: 'onunhandledrejection',
      handled: false,
    });
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
    // core 11 把 hint 的 instrument mechanism 施加到被捕获的外层异常上，GlobalHandlers 因此
    // 入队的是外层错误的 type/value，与宿主 onError 报上来的那条一致。10.x 下入队的是根因，
    // 这条去重会失效、同一崩溃会被重报两次——本用例锁住该行为。
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
});
