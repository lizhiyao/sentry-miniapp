import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  captureException,
  getClient,
  flush,
  installedIntegrations,
  type Envelope,
  type Event,
} from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init } from '../src/index';
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
});
