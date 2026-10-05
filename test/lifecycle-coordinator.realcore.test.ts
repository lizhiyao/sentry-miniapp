import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  logger,
  getClient,
  getCurrentScope,
  metrics,
  startInactiveSpan,
  spanStreamingIntegration,
  type Envelope,
} from '@sentry/core';
import { init } from '../src/sdk';
import { getDiagnostics } from '../src/diagnostics';
import { MiniappClient } from '../src/client';
import { miniappLifecycleIntegration } from '../src/integrations/lifecycle';
import { getClientLifetime } from '../src/lifecycle';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { SessionIntegration } from '../src/integrations/session';
import { createCapturingTransport, collectEnvelopePayloads } from './support/envelopes';

describe('独立 runtime lifecycle 与真实 core flush', () => {
  let envelopes: Envelope[];
  let app: { onLaunch: () => void; onShow: () => void; onHide: () => unknown };
  const clients: MiniappClient[] = [];
  function start(extra: Parameters<typeof init>[0] = {}) {
    const client = init({
      dsn: 'https://test@example.com/0',
      release: 'lifecycle@2.0',
      enableLogs: true,
      tracesSampleRate: 1,
      defaultIntegrations: [spanStreamingIntegration(), miniappLifecycleIntegration()],
      transport: createCapturingTransport(envelopes),
      ...extra,
    })!;
    clients.push(client);
    return client;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    envelopes = [];
    _resetAppLifecycle();
    vi.stubGlobal('wx', {});
    vi.stubGlobal('App', (options: typeof app) => {
      app = options;
      return options;
    });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    _resetAppLifecycle();
  });

  it('禁用所有可选 producer 后，业务同步 onHide 的 span/log/metric 仍立即 flush', () => {
    const owner = start();
    const result = { preserved: true };
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({
      onHide: () => {
        startInactiveSpan({ name: 'business hide' }).end();
        logger.info('business hide');
        metrics.count('hide.count', 1);
        return result;
      },
    });
    app.onShow();
    expect(getClientLifetime(owner)?.visibility).toBe('foreground');
    expect(app.onHide()).toBe(result);
    expect(getClientLifetime(owner)?.visibility).toBe('background');
    const kinds = envelopes.flatMap((env) => env[1].map((item) => item[0].type));
    expect(kinds).toEqual(expect.arrayContaining(['span', 'log', 'trace_metric']));
    expect(getClientLifetime(owner)?.state).toBe('open');
  });

  it('业务 onHide 抛错仍 flush；flush 失败不遮蔽业务异常', () => {
    const owner = start();
    const error = new Error('business error');
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({
      onHide: () => {
        logger.info('before throw');
        throw error;
      },
    });
    expect(() => app.onHide()).toThrow(error);
    expect(envelopes.flatMap((env) => env[1].map((item) => item[0].type))).toContain('log');
    vi.spyOn(owner, 'flush').mockImplementation(() => {
      throw new Error('flush');
    });
    expect(() => app.onHide()).toThrow(error);
  });

  it('Session setup 在 coordinator 之后，最终 flush 仍位于 session 收尾之后', () => {
    const owner = start({
      defaultIntegrations: [miniappLifecycleIntegration(), new SessionIntegration()],
    });
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({});
    app.onLaunch();
    const order: string[] = [];
    owner.on('beforeSendSession', () => order.push('session'));
    owner.on('flush', () => order.push('flush'));
    app.onHide();
    expect(order).toEqual(['session', 'flush']);
  });

  it('native game listeners 无 off 能力时旧 handler 失效，show/hide 仍更新新 owner', () => {
    vi.stubGlobal('App', undefined);
    const shows: Array<() => void> = [];
    const hides: Array<() => void> = [];
    vi.stubGlobal('wx', {
      onShow: (handler: () => void) => shows.push(handler),
      onHide: (handler: () => void) => hides.push(handler),
    });
    const first = start();
    shows[0]!();
    expect(getClientLifetime(first)?.visibility).toBe('foreground');
    logger.info('native hide');
    hides[0]!();
    expect(collectEnvelopePayloads(envelopes, ['log'])).toHaveLength(1);
    const second = start();
    first.dispose();
    const flushed = vi.spyOn(second, 'flush');
    hides[0]!();
    expect(flushed).not.toHaveBeenCalled();
    shows[1]!();
    hides[1]!();
    expect(flushed).toHaveBeenCalledTimes(2);
    expect(getClientLifetime(second)?.visibility).toBe('background');
  });

  it('App getter 不可读时仍能初始化并回退原生小程序监听', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'App')!;
    const show = vi.fn();
    const hide = vi.fn();
    Object.defineProperty(globalThis, 'App', {
      configurable: true,
      get: () => {
        throw new Error('App unavailable');
      },
    });
    try {
      vi.stubGlobal('wx', { onAppShow: show, onAppHide: hide });
      const owner = start();
      expect(show).toHaveBeenCalledOnce();
      expect(hide).toHaveBeenCalledOnce();
      (hide.mock.calls[0]![0] as () => void)();
      expect(getClientLifetime(owner)?.visibility).toBe('background');
    } finally {
      Object.defineProperty(globalThis, 'App', original);
    }
  });

  it('App setter 忽略包装时回退原生监听，退休后旧 handler 失效', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'App')!;
    const appConstructor = vi.fn();
    const show = vi.fn();
    const hide = vi.fn();
    const offShow = vi.fn();
    const offHide = vi.fn();
    Object.defineProperty(globalThis, 'App', {
      configurable: true,
      get: () => appConstructor,
      set: () => {},
    });
    try {
      vi.stubGlobal('wx', {
        onAppShow: show,
        onAppHide: hide,
        offAppShow: offShow,
        offAppHide: offHide,
      });
      const owner = start();
      expect(show).toHaveBeenCalledOnce();
      expect(hide).toHaveBeenCalledOnce();
      const showHandler = show.mock.calls[0]![0] as () => void;
      const hideHandler = hide.mock.calls[0]![0] as () => void;
      showHandler();
      expect(getClientLifetime(owner)?.visibility).toBe('foreground');
      logger.info('fallback hide');
      hideHandler();
      expect(collectEnvelopePayloads(envelopes, ['log'])).toHaveLength(1);
      expect(getClientLifetime(owner)?.visibility).toBe('background');
      owner.dispose();
      expect(offShow).toHaveBeenCalledOnce();
      expect(offHide).toHaveBeenCalledOnce();
      hideHandler();
      expect(getClientLifetime(owner)?.visibility).toBe('stopped');
    } finally {
      Object.defineProperty(globalThis, 'App', original);
    }
  });

  it('late init 使用原生 App listeners，off 抛错仍退订另一个监听', () => {
    vi.stubGlobal('getApp', () => ({ alreadyRegistered: true }));
    const show = vi.fn();
    const hide = vi.fn();
    const offShow = vi.fn(() => {
      throw new Error('off');
    });
    const offHide = vi.fn();
    vi.stubGlobal('wx', {
      onAppShow: show,
      onAppHide: hide,
      offAppShow: offShow,
      offAppHide: offHide,
    });
    const owner = start();
    expect(getDiagnostics().warnings.map((warning) => warning.code)).toContain('late_init');
    expect(show).toHaveBeenCalledOnce();
    expect(hide).toHaveBeenCalledOnce();
    const showHandler = show.mock.calls[0]![0] as () => void;
    const hideHandler = hide.mock.calls[0]![0] as () => void;
    showHandler();
    hideHandler();
    expect(getClientLifetime(owner)?.visibility).toBe('background');
    owner.dispose();
    expect(offShow).toHaveBeenCalledOnce();
    expect(offHide).toHaveBeenCalledOnce();
    expect(() => hideHandler()).not.toThrow();
  });

  it('没有 native 能力或 listener getter/注册失败时安全降级，不伪造 lifecycle', () => {
    vi.stubGlobal('getApp', () => {
      throw new Error('not registered');
    });
    vi.stubGlobal('App', undefined);
    vi.stubGlobal('wx', {
      get onShow() {
        throw new Error('getter');
      },
      onHide: () => {
        throw new Error('register');
      },
    });
    expect(() => start()).not.toThrow();
    expect(getDiagnostics().warnings.map((warning) => warning.code)).toContain(
      'lifecycle_unavailable',
    );
    expect(envelopes).toEqual([]);
  });
  it('App 注册前 getApp 抛错，保留业务 App wrapper 的完整 before/after 边界', () => {
    vi.stubGlobal('getApp', () => {
      throw new Error('not registered yet');
    });
    const owner = start();
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({});
    app.onShow();
    app.onHide();
    expect(getClientLifetime(owner)?.visibility).toBe('background');
    expect(getDiagnostics().warnings.map((warning) => warning.code)).not.toContain('late_init');
  });
  it('native 注册部分成功后抛错仍在退休时解除；低层 client 不注册 coordinator', () => {
    vi.stubGlobal('App', undefined);
    const handlers: Array<() => void> = [];
    const off = vi.fn();
    const on = vi.fn((cb: () => void) => {
      handlers.push(cb);
      throw new Error('partial registration');
    });
    vi.stubGlobal('wx', { onShow: on, offShow: off });
    const first = start();
    start();
    expect(off).toHaveBeenCalledOnce();
    handlers[0]!();
    expect(getClientLifetime(first)?.visibility).toBe('stopped');
    const low = new MiniappClient({
      dsn: 'https://low@example.com/1',
      integrations: [miniappLifecycleIntegration()],
      transport: createCapturingTransport([]),
    });
    clients.push(low);
    getCurrentScope().setClient(low);
    low.init();
    expect(on).toHaveBeenCalledTimes(2);
  });

  it('native onShow 注册期间 dispose 后返回，不留下有效监听或继续安装 hide', () => {
    vi.stubGlobal('App', undefined);
    const handlers: Array<() => void> = [];
    const off = vi.fn();
    const hide = vi.fn();
    vi.stubGlobal('wx', {
      onShow: (cb: () => void) => {
        getClient()!.dispose();
        handlers.push(cb); // 模拟 off 已执行后才完成注册。
      },
      offShow: off,
      onHide: hide,
    });
    const owner = start();
    expect(off).toHaveBeenCalledTimes(2);
    expect(hide).not.toHaveBeenCalled();
    handlers[0]!();
    expect(getClientLifetime(owner)?.visibility).toBe('stopped');
  });
});
