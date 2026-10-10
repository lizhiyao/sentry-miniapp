import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient,
  getCurrentScope,
  getIsolationScope,
  logger,
  metrics,
  spanToJSON,
  spanStreamingIntegration,
  startInactiveSpan,
  type Envelope,
  type Integration,
  type Session,
  type SerializedSession,
} from '@sentry/core';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { MiniappClient } from '../src/client';
import * as crossPlatform from '../src/crossPlatform';
import { miniappLifecycleIntegration } from '../src/integrations/lifecycle';
import { minigameIntegration } from '../src/integrations/minigame';
import { minigameFrameRateIntegration } from '../src/integrations/minigame-framerate';
import { sessionIntegration } from '../src/integrations/session';
import { tryCatchIntegration } from '../src/integrations/trycatch';
import { getClientLifetime } from '../src/lifecycle';
import { init } from '../src/sdk';
import {
  collectEnvelopePayloads,
  collectSpans,
  createCapturingTransport,
} from './support/envelopes';

describe('原生 show/hide 与真实 core Session', () => {
  let envelopes: Envelope[];
  let shows: Array<() => void>;
  let hides: Array<() => void>;
  const clients: MiniappClient[] = [];
  function start(
    integrations: Integration[] = [miniappLifecycleIntegration(), sessionIntegration()],
  ) {
    const client = init({
      dsn: 'https://test@example.com/0',
      release: 'native-session@2.0',
      tracesSampleRate: 1,
      defaultIntegrations: integrations,
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(client);
    return client;
  }
  function sessions() {
    return collectEnvelopePayloads<SerializedSession>(envelopes, ['session']);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    envelopes = [];
    shows = [];
    hides = [];
    _resetAppLifecycle();
    vi.stubGlobal('App', undefined);
    vi.stubGlobal('Page', undefined);
    vi.stubGlobal('getCurrentPages', undefined);
    vi.stubGlobal('wx', {
      onShow: (handler: () => void) => shows.push(handler),
      onHide: (handler: () => void) => hides.push(handler),
    });
  });
  afterEach(() => {
    _resetAppLifecycle();
    clients.splice(0).forEach((client) => client.dispose());
    getIsolationScope().setSession();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['wx', 'tt'] as const)(
    '%s 无 App 时首次错误已有会话，重复 show 不换 SID',
    async (host) => {
      if (host === 'tt') {
        vi.stubGlobal('tt', (globalThis as typeof globalThis & { wx: unknown }).wx);
        vi.stubGlobal('wx', undefined);
      }
      const client = start();
      expect(shows).toHaveLength(1);
      expect(hides).toHaveLength(1);
      expect(sessions()).toHaveLength(1);
      const sid = sessions()[0]!.sid;
      client.captureException(new Error('initial foreground failure'));
      const flushed = client.flush();
      await vi.advanceTimersByTimeAsync(10);
      await flushed;
      expect(sessions().at(-1)).toMatchObject({ sid, errors: 1, status: 'ok' });
      shows[0]!();
      shows[0]!();
      expect(sessions()).toHaveLength(2);
      hides[0]!();
      hides[0]!();
      expect(sessions().at(-1)).toMatchObject({ sid, errors: 1, status: 'exited' });
      expect(getIsolationScope().getSession()).toBeUndefined();
      shows[0]!();
      expect(sessions()).toHaveLength(4);
      expect(sessions().at(-1)).toMatchObject({ init: true, errors: 0, status: 'ok' });
      expect(sessions().at(-1)!.sid).not.toBe(sid);
    },
  );

  it.each(['session-first', 'coordinator-first'] as const)(
    '%s 共用一对监听，hide 的 Session 收尾先于 span/log/metric flush',
    (order) => {
      const producers =
        order === 'session-first'
          ? [sessionIntegration(), miniappLifecycleIntegration()]
          : [miniappLifecycleIntegration(), sessionIntegration()];
      const client = start([spanStreamingIntegration(), ...producers]);
      expect(shows).toHaveLength(1);
      expect(hides).toHaveLength(1);
      const operations: string[] = [];
      client.on('beforeSendSession', () => operations.push('session'));
      client.on('flush', () => operations.push('flush'));
      startInactiveSpan({ name: 'before hide' }).end();
      logger.info('before hide');
      metrics.count('before_hide', 1);
      hides[0]!();
      expect(operations).toEqual(['session', 'flush']);
      expect(getClientLifetime(client)?.visibility).toBe('background');
      const kinds = envelopes.flatMap((envelope) => envelope[1].map((item) => item[0].type));
      expect(kinds).toEqual(expect.arrayContaining(['session', 'span', 'log', 'trace_metric']));
    },
  );

  it('GameGlobal 优先于第三方 App/Page shim，原生生命周期仍驱动 Session', () => {
    const app = vi.fn();
    const page = vi.fn();
    vi.stubGlobal('GameGlobal', {});
    vi.stubGlobal('App', app);
    vi.stubGlobal('Page', page);
    start();
    expect((globalThis as typeof globalThis & { App: unknown }).App).toBe(app);
    expect((globalThis as typeof globalThis & { Page: unknown }).Page).toBe(page);
    expect(shows).toHaveLength(1);
    expect(hides).toHaveLength(1);
    const sid = sessions()[0]!.sid;
    shows[0]!();
    hides[0]!();
    shows[0]!();
    expect(sessions()).toEqual([
      expect.objectContaining({ sid, status: 'ok', init: true }),
      expect.objectContaining({ sid, status: 'exited', init: false }),
      expect.objectContaining({ status: 'ok', init: true }),
    ]);
    expect(sessions().at(-1)!.sid).not.toBe(sid);
  });

  it('小游戏长寿命 owner 的业务 beforeBreadcrumb 在第二次前台属于当前 Session', async () => {
    let capture = false;
    const client = init({
      dsn: 'https://test@example.com/0',
      release: 'native-session@2.0',
      transport: createCapturingTransport(envelopes),
      beforeBreadcrumb: (breadcrumb) => {
        if (
          capture &&
          breadcrumb.category === 'minigame.lifecycle' &&
          breadcrumb.message?.includes('onShow')
        ) {
          client.captureException(new Error('business hook in second foreground'));
        }
        return breadcrumb;
      },
    })!;
    clients.push(client);
    const firstSid = getIsolationScope().getSession()!.sid;
    hides[0]!();
    capture = true;
    shows[0]!();
    const second = getIsolationScope().getSession()!;
    const flushed = client.flush();
    await vi.advanceTimersByTimeAsync(10);
    await flushed;
    expect(second.sid).not.toBe(firstSid);
    expect(second.errors).toBe(1);
    expect(sessions().filter((session) => session.sid === firstSid)).toEqual([
      expect.objectContaining({ status: 'ok', errors: 0 }),
      expect.objectContaining({ status: 'exited', errors: 0 }),
    ]);
    expect(
      sessions()
        .filter((session) => session.sid === second.sid)
        .at(-1),
    ).toMatchObject({ status: 'ok', errors: 1 });
    expect(collectEnvelopePayloads(envelopes, ['event'])).toHaveLength(1);
  });

  it.each(['show', 'hide'] as const)(
    '后装 integration setup 同步 %s 时，首 Session 等待全部 setup 并读取最新可见状态',
    (event) => {
      let duringSetup: Session | undefined;
      start([
        sessionIntegration(),
        miniappLifecycleIntegration(),
        {
          name: 'HostLifecycleDuringSetup',
          setup: () => {
            (event === 'show' ? shows[0] : hides[0])!();
            duringSetup = getIsolationScope().getSession();
          },
        },
      ]);
      expect(duringSetup).toBeUndefined();
      expect(sessions()).toHaveLength(event === 'show' ? 1 : 0);
      shows[0]!();
      expect(sessions()).toHaveLength(1);
      expect(getIsolationScope().getSession()).toBeDefined();
    },
  );

  it('首会话延后安装不改变业务 timer 调度时的 Session 快照，迟到 A 不污染 B', () => {
    let scheduled!: () => void;
    vi.stubGlobal('setTimeout', (callback: () => void) => {
      scheduled = callback;
      return 1;
    });
    const client = start([
      sessionIntegration(),
      tryCatchIntegration(),
      miniappLifecycleIntegration(),
    ]);
    const first = getIsolationScope().getSession()!;
    setTimeout(() => {
      throw new Error('scheduled in first foreground');
    }, 100);
    const firstTimer = scheduled;
    hides[0]!();
    shows[0]!();
    const second = getIsolationScope().getSession()!;
    expect(() => firstTimer()).toThrow('scheduled in first foreground');
    expect(first).toMatchObject({ status: 'exited', errors: 0 });
    expect(second).toMatchObject({ status: 'ok', errors: 0 });
    expect(second.sid).not.toBe(first.sid);
    expect(collectEnvelopePayloads(envelopes, ['event'])).toHaveLength(1);
    client.captureException(new Error('current second foreground'));
    expect(second.errors).toBe(1);
  });

  it.each(['defaults', 'reversed'] as const)(
    '%s 的 FPS summary 在第一轮最终 flush 前已生成，hide 返回前有最终 span envelope',
    (order) => {
      let clock = 0;
      let nextId = 0;
      const frames = new Map<number, () => void>();
      vi.stubGlobal('requestAnimationFrame', (handler: () => void) => {
        const id = ++nextId;
        frames.set(id, handler);
        return id;
      });
      vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
      vi.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
      vi.spyOn(crossPlatform, 'epochNow').mockReturnValue(1700000000000);
      const client =
        order === 'defaults'
          ? init({
              dsn: 'https://test@example.com/0',
              release: 'native-session@2.0',
              tracesSampleRate: 1,
              enableMinigameFrameRate: true,
              transport: createCapturingTransport(envelopes),
            })!
          : start([
              spanStreamingIntegration(),
              miniappLifecycleIntegration(),
              minigameFrameRateIntegration(),
              sessionIntegration(),
              minigameIntegration(),
            ]);
      if (order === 'defaults') clients.push(client);
      expect(shows).toHaveLength(1);
      expect(hides).toHaveLength(1);
      const frame = (elapsed: number): void => {
        clock += elapsed;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback());
      };
      frame(20);
      frame(60);
      const operations: string[] = [];
      client.on('beforeSendSession', () => operations.push('session'));
      client.on('spanEnd', (span) => {
        if (spanToJSON(span).name === 'minigame.framerate.summary') operations.push('summary');
      });
      client.on('flush', () => operations.push('flush'));
      hides[0]!();
      expect(operations.indexOf('session')).toBeGreaterThanOrEqual(0);
      expect(operations.indexOf('summary')).toBeGreaterThanOrEqual(0);
      expect(operations.indexOf('session')).toBeLessThan(operations.indexOf('flush'));
      expect(operations.indexOf('summary')).toBeLessThan(operations.indexOf('flush'));
      expect(
        collectSpans(envelopes).filter((span) => span.name === 'minigame.framerate.summary'),
      ).toHaveLength(1);
      expect(sessions().at(-1)).toMatchObject({ status: 'exited', init: false });
      expect(frames.size).toBe(0);
      shows[0]!();
      expect(frames.size).toBe(1);
    },
  );

  it('缺少 off 时替换后旧回调不读参数、不结束新 Session；dispose 也停止新回调', () => {
    const first = start();
    const firstSid = sessions()[0]!.sid;
    const second = start();
    expect(sessions().filter((session) => session.sid === firstSid)).toHaveLength(2);
    const secondSid = getIsolationScope().getSession()!.sid;
    const count = sessions().length;
    shows[0]!();
    hides[0]!();
    expect(sessions()).toHaveLength(count);
    expect(getIsolationScope().getSession()!.sid).toBe(secondSid);
    expect(getClientLifetime(first)?.canCollectAutomatic()).toBe(false);
    hides[1]!();
    shows[1]!();
    expect(getIsolationScope().getSession()!.sid).not.toBe(secondSid);
    second.dispose();
    const afterDispose = sessions().length;
    shows[1]!();
    hides[1]!();
    expect(sessions()).toHaveLength(afterDispose);
    expect(getIsolationScope().getSession()).toBeUndefined();
  });

  it('原生启动 show 不回放时 close 仍只结束一份会话，重复 close 不重发', async () => {
    const client = start([sessionIntegration()]);
    const sid = getIsolationScope().getSession()!.sid;
    const closed = client.close();
    await vi.advanceTimersByTimeAsync(10);
    await closed;
    await client.close();
    shows[0]!();
    hides[0]!();
    expect(sessions()).toEqual([
      expect.objectContaining({ sid, status: 'ok', init: true }),
      expect.objectContaining({ sid, status: 'exited', init: false }),
    ]);
    expect(getIsolationScope().getSession()).toBeUndefined();
  });

  it.each(['missing-hide', 'throwing-hide', 'missing-both'] as const)(
    '%s 不伪造自动 Session；可用方向仍安全更新 coordinator',
    (missing) => {
      vi.stubGlobal('wx', {
        ...(missing === 'missing-both'
          ? {}
          : { onShow: (handler: () => void) => shows.push(handler) }),
        ...(missing === 'throwing-hide'
          ? {
              onHide: () => {
                throw new Error('registration failed');
              },
            }
          : {}),
      });
      const client = start();
      shows.forEach((show) => show());
      client.captureException(new Error('without complete lifecycle'));
      expect(sessions()).toEqual([]);
      expect(getIsolationScope().getSession()).toBeUndefined();
      if (missing !== 'missing-both') {
        expect(getClientLifetime(client)?.visibility).toBe('foreground');
      }
    },
  );

  it('原生注册中同步 hide 不假设当前前台，后续 show 才建立会话', () => {
    vi.stubGlobal('wx', {
      onShow: (handler: () => void) => shows.push(handler),
      onHide: (handler: () => void) => {
        hides.push(handler);
        handler();
      },
    });
    start([sessionIntegration(), miniappLifecycleIntegration()]);
    expect(sessions()).toEqual([]);
    shows[0]!();
    expect(sessions()).toHaveLength(1);
  });

  it.each(['session-first', 'fps-only'] as const)(
    '%s 原生初装已观察 hide 时取消 FPS 帧；show 恢复后 summary 正常发送',
    (order) => {
      let clock = 0;
      let nextId = 0;
      const frames = new Map<number, () => void>();
      vi.stubGlobal('requestAnimationFrame', (handler: () => void) => {
        const id = ++nextId;
        frames.set(id, handler);
        return id;
      });
      vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
      vi.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
      vi.spyOn(crossPlatform, 'epochNow').mockReturnValue(1700000000000);
      vi.stubGlobal('wx', {
        onShow: (handler: () => void) => shows.push(handler),
        onHide: (handler: () => void) => {
          hides.push(handler);
          handler();
        },
      });
      start([
        spanStreamingIntegration(),
        ...(order === 'session-first' ? [sessionIntegration()] : []),
        minigameFrameRateIntegration(),
        ...(order === 'session-first' ? [miniappLifecycleIntegration()] : []),
      ]);
      expect(frames.size).toBe(0);
      expect(sessions()).toEqual([]);
      shows[0]!();
      expect(frames.size).toBe(1);
      const callbacks = [...frames.values()];
      frames.clear();
      clock = 20;
      callbacks.forEach((callback) => callback());
      hides[0]!();
      expect(frames.size).toBe(0);
      expect(
        collectSpans(envelopes).filter((span) => span.name === 'minigame.framerate.summary'),
      ).toHaveLength(1);
    },
  );

  it('Session 原生注册或首会话读取中 dispose 后不建立会话，迟到回调失效', () => {
    const offShow = vi.fn();
    const onHide = vi.fn();
    vi.stubGlobal('wx', {
      onShow: (handler: () => void) => {
        getClient()!.dispose();
        shows.push(handler);
      },
      offShow,
      onHide,
    });
    start([sessionIntegration(), miniappLifecycleIntegration()]);
    expect(offShow).toHaveBeenCalledTimes(2);
    expect(onHide).not.toHaveBeenCalled();
    shows[0]!();
    expect(sessions()).toEqual([]);
    expect(getIsolationScope().getSession()).toBeUndefined();

    const user = getIsolationScope().getUser();
    getIsolationScope().setUser({
      get id() {
        getClient()!.dispose();
        return 'retired-user';
      },
    });
    vi.stubGlobal('wx', {
      onShow: (handler: () => void) => shows.push(handler),
      onHide: (handler: () => void) => hides.push(handler),
    });
    crossPlatform.resetPlatformCache();
    try {
      start([sessionIntegration()]);
      expect(sessions()).toEqual([]);
      expect(getIsolationScope().getSession()).toBeUndefined();
      shows[1]!();
      hides[0]!();
      expect(getIsolationScope().getSession()).toBeUndefined();
    } finally {
      getIsolationScope().setUser(user ?? null);
    }
  });

  it.each(['onShow', 'offShow'] as const)(
    '%s getter 退休 owner 后不再调用 on 或注册 hide',
    (key) => {
      const onShow = vi.fn();
      const offShow = vi.fn();
      const onHide = vi.fn();
      const host = { onShow, offShow, onHide };
      Object.defineProperty(host, key, {
        configurable: true,
        get: () => {
          getClient()!.dispose();
          return key === 'onShow' ? onShow : offShow;
        },
      });
      vi.stubGlobal('wx', host);
      const client = start();
      expect(onShow).not.toHaveBeenCalled();
      expect(offShow).not.toHaveBeenCalled();
      expect(onHide).not.toHaveBeenCalled();
      expect(getClientLifetime(client)?.state).toBe('closed');
      expect(sessions()).toEqual([]);
    },
  );

  it('手动绑定低层 client 仍不安装 Session/小游戏/FPS 自动监听或帧循环', () => {
    const requestFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const client = new MiniappClient({
      dsn: 'https://low@example.com/0',
      release: 'manual@2.0',
      integrations: [
        sessionIntegration(),
        minigameIntegration(),
        minigameFrameRateIntegration(),
        miniappLifecycleIntegration(),
      ],
      transport: createCapturingTransport(envelopes),
    });
    clients.push(client);
    getCurrentScope().setClient(client);
    client.init();
    expect(shows).toEqual([]);
    expect(hides).toEqual([]);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(sessions()).toEqual([]);
    expect(getIsolationScope().getSession()).toBeUndefined();
  });

  it('FPS summary 的用户 spanEnd hook 退休 owner 后不继续 flush 或恢复采样', () => {
    let frame: (() => void) | undefined;
    let clock = 0;
    vi.stubGlobal('requestAnimationFrame', (handler: () => void) => {
      frame = handler;
      return 1;
    });
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
    const client = start([
      spanStreamingIntegration(),
      minigameFrameRateIntegration(),
      miniappLifecycleIntegration(),
    ]);
    client.on('spanEnd', (span) => {
      if (spanToJSON(span).name === 'minigame.framerate.summary') client.dispose();
    });
    const flushed = vi.spyOn(client, 'flush');
    clock = 20;
    frame!();
    hides[0]!();
    expect(flushed).not.toHaveBeenCalled();
    expect(getClientLifetime(client)?.state).toBe('closed');
    expect(collectSpans(envelopes)).toEqual([]);
    expect(cancel).toHaveBeenCalled();
    const staleFrame = frame;
    shows[0]!();
    staleFrame!();
    expect(frame).toBe(staleFrame);
  });

  it('最终 flush 的用户 hook dispose 后清理两监听，迟到回调不创建新 Session', () => {
    const offShow = vi.fn();
    const offHide = vi.fn();
    vi.stubGlobal('wx', {
      onShow: (handler: () => void) => shows.push(handler),
      onHide: (handler: () => void) => hides.push(handler),
      offShow,
      offHide,
    });
    const client = start();
    client.on('flush', () => client.dispose());
    hides[0]!();
    expect(getClientLifetime(client)?.state).toBe('closed');
    expect(offShow).toHaveBeenCalledOnce();
    expect(offHide).toHaveBeenCalledOnce();
    const count = sessions().length;
    shows[0]!();
    hides[0]!();
    expect(sessions()).toHaveLength(count);
    expect(getIsolationScope().getSession()).toBeUndefined();
  });

  it('Session 收尾 hook 动态禁用 owner 后不自动 flush，恢复 enabled 后下个 show 可重新采集', () => {
    const client = start();
    client.on('beforeSendSession', (session) => {
      if ('status' in session && session.status === 'exited') client.getOptions().enabled = false;
    });
    const flushed = vi.fn();
    client.on('flush', flushed);
    hides[0]!();
    expect(flushed).not.toHaveBeenCalled();
    expect(getIsolationScope().getSession()).toBeUndefined();
    client.getOptions().enabled = true;
    shows[0]!();
    expect(flushed).toHaveBeenCalledOnce();
    expect(getIsolationScope().getSession()).toBeDefined();
  });
});
