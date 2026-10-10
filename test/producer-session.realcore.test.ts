import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope,
  getActiveSpan,
  getIsolationScope,
  spanStreamingIntegration,
  startInactiveSpan,
  withActiveSpan,
  type Envelope,
  type Event,
  type Session,
  type SerializedSession,
  type Span,
} from '@sentry/core';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { MiniappClient } from '../src/client';
import * as crossPlatform from '../src/crossPlatform';
import { miniappLifecycleIntegration } from '../src/integrations/lifecycle';
import { minigameIntegration } from '../src/integrations/minigame';
import { minigameFrameRateIntegration } from '../src/integrations/minigame-framerate';
import { networkBreadcrumbsIntegration } from '../src/integrations/networkbreadcrumbs';
import { performanceIntegration } from '../src/integrations/performance';
import { sessionIntegration } from '../src/integrations/session';
import { tryCatchIntegration } from '../src/integrations/trycatch';
import { init } from '../src/sdk';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('长期 producer 使用当前 Session；调度任务保留原 Session（真实 core）', () => {
  const clients: MiniappClient[] = [];
  let envelopes: Envelope[];
  let shows: Array<() => void>;
  let hides: Array<() => void>;
  let frames: Map<number, () => void>;
  let nextFrame: number;
  let clock: number;
  let observer: ((entries: unknown) => void) | undefined;
  let host: Record<string, unknown>;
  function start(options: Parameters<typeof init>[0]) {
    const client = init({
      dsn: 'https://test@example.com/0',
      release: 'producer-session@2.0',
      transport: createCapturingTransport(envelopes),
      ...options,
    })!;
    clients.push(client);
    return client;
  }
  function sessions() {
    return collectEnvelopePayloads<SerializedSession>(envelopes, ['session']);
  }
  async function drain(client: MiniappClient) {
    const flushed = client.flush();
    await vi.advanceTimersByTimeAsync(10);
    await flushed;
  }
  function frame(elapsed: number) {
    clock += elapsed;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    _resetAppLifecycle();
    getIsolationScope().setSession();
    envelopes = [];
    shows = [];
    hides = [];
    frames = new Map();
    nextFrame = clock = 0;
    observer = undefined;
    vi.stubGlobal('App', undefined);
    vi.stubGlobal('Page', undefined);
    vi.stubGlobal('getCurrentPages', undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
    vi.spyOn(crossPlatform, 'epochNow').mockReturnValue(1700000000000);
    host = {
      onShow: (callback: () => void) => shows.push(callback),
      onHide: (callback: () => void) => hides.push(callback),
      getPerformance: () => ({
        timeOrigin: 1699999990000,
        createObserver: (callback: (entries: unknown) => void) => {
          observer = callback;
          return { observe: () => {}, disconnect: () => {} };
        },
      }),
    };
    vi.stubGlobal('wx', host);
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    _resetAppLifecycle();
    getIsolationScope().setSession();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['default', 'minigame'],
    ['dynamic', 'minigame'],
    ['default', 'fps'],
    ['dynamic', 'fps'],
  ] as const)('%s %s 的业务 breadcrumb hook 只更新当前前台 B', async (installation, producer) => {
    let capture = false;
    let observedSession: Session | undefined;
    const client = start({
      ...(installation === 'dynamic'
        ? { defaultIntegrations: [sessionIntegration(), miniappLifecycleIntegration()] }
        : {}),
      enableMinigameFrameRate: producer === 'fps',
      minigameFrameRateOptions: { reportInterval: 40 },
      beforeBreadcrumb: (breadcrumb) => {
        const trigger =
          producer === 'minigame'
            ? breadcrumb.category === 'minigame.lifecycle' && breadcrumb.message?.includes('onShow')
            : breadcrumb.category === 'minigame.framerate';
        if (capture && trigger) {
          observedSession = getCurrentScope().getSession();
          client.captureException(new Error('business hook in current foreground'));
        }
        return breadcrumb;
      },
    });
    const first = getIsolationScope().getSession()!;
    if (installation === 'dynamic') {
      client.addIntegration(
        producer === 'minigame'
          ? minigameIntegration()
          : minigameFrameRateIntegration({ reportInterval: 40 }),
      );
    }
    hides[0]!();
    capture = true;
    shows[0]!();
    const second = getIsolationScope().getSession()!;
    if (producer === 'fps') {
      frame(20);
      expect(observedSession).toBeUndefined(); // 未到合法窗口边界，不提前上报。
      frame(20);
    }
    await drain(client);
    expect(second.sid).not.toBe(first.sid);
    expect(observedSession).toBe(second);
    expect(second.errors).toBe(1);
    expect(first).toMatchObject({ status: 'exited', errors: 0 });
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toHaveLength(1);
    hides[0]!();
    expect(
      sessions()
        .filter((session) => session.sid === second.sid)
        .at(-1),
    ).toMatchObject({ status: 'exited', errors: 1 });
  });

  it.each([
    ['navigation', 'A'],
    ['mark', 'A'],
    ['navigation', 'none'],
    ['mark', 'none'],
  ] as const)(
    '动态 Performance %s 在捕获 %s 的旧 timer hook 内仍取 isolation B，空会话不恢复 A',
    async (entryType, captured) => {
      let timer!: () => void;
      const nativeSetTimeout = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', (callback: () => void, delay?: number, ...args: unknown[]) => {
        if (delay === 100) {
          timer = callback;
          return 1;
        }
        return Reflect.apply(nativeSetTimeout, globalThis, [callback, delay, ...args]);
      });
      let deliver = false;
      let sampled = false;
      let timerScope: Session | undefined;
      let observerScope: Session | undefined;
      let deliverySpan: Span | undefined;
      let markSpan: Span | undefined;
      const client = start({
        defaultIntegrations: [
          spanStreamingIntegration(),
          sessionIntegration(),
          tryCatchIntegration(),
          miniappLifecycleIntegration(),
        ],
        tracesSampler: () => {
          if (deliver) {
            sampled = true;
            observerScope = getCurrentScope().getSession();
            client.captureException(new Error('observer business hook'));
          }
          return 1;
        },
        beforeBreadcrumb: (breadcrumb) => {
          if (deliver && breadcrumb.category === 'performance.mark') {
            sampled = true;
            observerScope = getCurrentScope().getSession();
            markSpan = getActiveSpan();
            client.captureException(new Error('observer business hook'));
          }
          return breadcrumb;
        },
        beforeSend: (event) => {
          if (event.exception?.values?.some((value) => value.value === 'timer scheduled before B')) {
            timerScope = getCurrentScope().getSession();
            deliverySpan = startInactiveSpan({
              name: 'actual observer delivery',
              parentSpan: null,
            });
            deliver = true;
            withActiveSpan(deliverySpan, () => {
              observer!([{ name: 'pages/home', entryType, startTime: 0, duration: 20 }]);
            });
            deliver = false;
            deliverySpan.end();
          }
          return event;
        },
      });
      const first = getIsolationScope().getSession()!;
      client.addIntegration(performanceIntegration({ enableUserTiming: true }));
      if (captured === 'none') hides[0]!();
      setTimeout(() => {
        throw new Error('timer scheduled before B');
      }, 100);
      const oldTimer = timer;
      if (captured === 'A') hides[0]!();
      shows[0]!();
      const second = getIsolationScope().getSession()!;
      expect(() => oldTimer()).toThrow('timer scheduled before B');
      await drain(client);
      expect(sampled).toBe(true);
      expect(timerScope).toBe(captured === 'A' ? first : undefined);
      expect(observerScope).toBe(second);
      if (entryType === 'mark') expect(markSpan).toBe(deliverySpan);
      expect(first).toMatchObject({ status: 'exited', errors: 0 });
      expect(second.errors).toBe(1);
      expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toHaveLength(2);
      hides[0]!();
      expect(getIsolationScope().getSession()).toBeUndefined();
      deliver = true;
      observer!([{ name: 'pages/after_hide', entryType, startTime: 30, duration: 20 }]);
      deliver = false;
      await drain(client);
      expect(observerScope).toBeUndefined();
      expect(first.errors).toBe(0);
      expect(second.errors).toBe(1);
      expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toHaveLength(3);
    },
  );

  it('Network 请求在 A 发起、B 完成时保留 A 的会话快照，业务外部 capture 仍更新 B', async () => {
    let request!: { success: (response: unknown) => void };
    const task = { abort: () => {} };
    host.request = (options: typeof request) => {
      request = options;
      return task;
    };
    let capture = false;
    let requestScope: Session | undefined;
    const client = start({
      defaultIntegrations: [
        sessionIntegration(),
        networkBreadcrumbsIntegration(),
        miniappLifecycleIntegration(),
      ],
      beforeBreadcrumb: (breadcrumb) => {
        if (capture && breadcrumb.category === 'xhr') {
          requestScope = getCurrentScope().getSession();
          client.captureException(new Error('request A completed during B'));
        }
        return breadcrumb;
      },
    });
    const first = getIsolationScope().getSession()!;
    const returned = (host.request as (options: unknown) => unknown)({
      url: 'https://business.example/data',
      method: 'GET',
    });
    expect(returned).toBe(task);
    hides[0]!();
    shows[0]!();
    const second = getIsolationScope().getSession()!;
    capture = true;
    request.success({ statusCode: 200, data: {} });
    await drain(client);
    expect(requestScope).toBe(first);
    expect(first).toMatchObject({ status: 'exited', errors: 0 });
    expect(second.errors).toBe(0);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toHaveLength(1);
    client.captureException(new Error('current B directly'));
    await drain(client);
    expect(second.errors).toBe(1);
  });

  it.each(['timer', 'raf', 'request'] as const)(
    '无 Session 时开始的 %s 观测不会回落到后来前台 B，最终 payload 不含归属引用',
    async (operation) => {
      let timer!: () => void;
      const nativeSetTimeout = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', (callback: () => void, delay?: number, ...args: unknown[]) => {
        if (delay === 101) {
          timer = callback;
          return 1;
        }
        return Reflect.apply(nativeSetTimeout, globalThis, [callback, delay, ...args]);
      });
      let request!: { success: (response: unknown) => void };
      const task = { abort: () => {} };
      host.request = (options: typeof request) => {
        request = options;
        return task;
      };
      let observedSession: Session | undefined;
      const client = start({
        defaultIntegrations: [
          spanStreamingIntegration(),
          sessionIntegration(),
          tryCatchIntegration(),
          networkBreadcrumbsIntegration(),
          miniappLifecycleIntegration(),
        ],
        tracesSampleRate: 1,
        beforeSend: (event) => {
          observedSession = getCurrentScope().getSession();
          return event;
        },
        beforeBreadcrumb: (breadcrumb) => {
          if (breadcrumb.category === 'xhr') {
            client.captureException(new Error('request started without a Session'));
          }
          return breadcrumb;
        },
      });
      const first = getIsolationScope().getSession()!;
      hides[0]!();
      expect(getIsolationScope().getSession()).toBeUndefined();
      const error = new Error('scheduled without a Session');
      const callback = () => {
        throw error;
      };
      if (operation === 'timer') setTimeout(callback, 101);
      else if (operation === 'raf') requestAnimationFrame(callback);
      else {
        expect(
          (host.request as (options: unknown) => unknown)({ url: 'https://business.example/data' }),
        ).toBe(task);
      }
      shows[0]!();
      const second = getIsolationScope().getSession()!;
      expect(second.sid).not.toBe(first.sid);
      if (operation === 'request') request.success({ statusCode: 200 });
      else {
        let thrown: unknown;
        try {
          if (operation === 'timer') timer();
          else frame(20);
        } catch (caught) {
          thrown = caught;
        }
        expect(thrown).toBe(error);
      }
      await drain(client);
      expect(observedSession).toBeUndefined();
      expect(first).toMatchObject({ status: 'exited', errors: 0 });
      expect(second).toMatchObject({ status: 'ok', errors: 0 });
      expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toHaveLength(1);
      hides[0]!();
      expect(sessions().filter((session) => session.sid === second.sid).at(-1)).toMatchObject({
        status: 'exited',
        errors: 0,
      });
      const seen = new WeakSet<object>();
      const inspect = (value: unknown): void => {
        if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        expect(value).not.toBe(first);
        expect(value).not.toBe(second);
        expect(Reflect.ownKeys(value).some((key) => typeof key === 'symbol')).toBe(false);
        expect('sdkProcessingMetadata' in value).toBe(false);
        Object.values(value).forEach(inspect);
      };
      envelopes.forEach(inspect);
    },
  );
});
