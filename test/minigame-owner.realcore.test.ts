import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient,
  getCurrentScope,
  getIsolationScope,
  spanStreamingIntegration,
  type Envelope,
} from '@sentry/core';
import { init, getDiagnostics } from '../src/sdk';
import { MiniappClient } from '../src/client';
import { MinigameIntegration } from '../src/integrations/minigame';
import { MinigameFrameRateIntegration } from '../src/integrations/minigame-framerate';
import { getClientEnvironment } from '../src/clientState';
import { resetPlatformCache } from '../src/crossPlatform';
import { collectSpans, createCapturingTransport, spanAttribute } from './support/envelopes';

describe('Minigame 资源 owner（真实 core）', () => {
  const clients: MiniappClient[] = [];
  const frames: Array<() => void> = [];
  const shows: Array<(res: unknown) => void> = [];
  const hides: Array<() => void> = [];
  let clock: number;
  let cancel: ReturnType<typeof vi.fn>;
  let host: any;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    clock = 0;
    frames.length = shows.length = hides.length = 0;
    getCurrentScope().setClient(undefined);
    getIsolationScope().clearBreadcrumbs();
    resetPlatformCache();
    cancel = vi.fn();
    vi.stubGlobal('App', undefined);
    vi.stubGlobal('Page', undefined);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: () => void) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', cancel);
    host = {
      getLaunchOptionsSync: () => ({ scene: 1001, path: 'game.js', query: { id: '1' } }),
      onShow: vi.fn((handler: (typeof shows)[number]) => shows.push(handler)),
      onHide: vi.fn((handler: (typeof hides)[number]) => hides.push(handler)),
      offShow: vi.fn(),
      offHide: vi.fn(),
    };
    vi.stubGlobal('wx', host);
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });
  function start(
    target: Envelope[],
    key: string,
    integration: MinigameIntegration | MinigameFrameRateIntegration = new MinigameIntegration(),
    extra: Record<string, unknown> = {},
  ) {
    const client = init({
      dsn: `https://${key}@example.com/1`,
      release: key,
      tracesSampleRate: 1,
      defaultIntegrations: [spanStreamingIntegration(), integration],
      transport: createCapturingTransport(target),
      ...extra,
    })!;
    clients.push(client);
    return client;
  }
  function frame(index: number, elapsed: number) {
    clock += elapsed;
    vi.setSystemTime(1700000000000 + clock);
    frames[index]!();
  }

  it.each([
    ['Minigame', () => new MinigameIntegration()],
    ['FPS', () => new MinigameFrameRateIntegration()],
  ] as const)('%s 在监听注册中退休，解除 cleanup 返回后才保存的监听', (_name, factory) => {
    const handlers: Array<Function> = [];
    const register = vi.fn((handler: Function) => {
      getClient()!.dispose();
      handlers.push(handler);
    });
    host.onShow = register;
    host.onHide = register;
    start([], 'retired', factory());
    expect(register).toHaveBeenCalledOnce();
    expect(host.offShow.mock.calls.length + host.offHide.mock.calls.length).toBe(2);
    const read = vi.fn();
    handlers[0]!(new Proxy({}, { get: read }));
    expect(read).not.toHaveBeenCalled();
  });

  it('同对象 A/B 复用：A 退休取消 SDK 帧，旧监听/帧不采集；B span 的 DSC 属于 B', async () => {
    const firstEnvelopes: Envelope[] = [];
    const secondEnvelopes: Envelope[] = [];
    const integration = new MinigameIntegration();
    const first = start(firstEnvelopes, 'first', integration);
    integration.setup(first);
    expect(frames).toHaveLength(1);
    // 模拟无 off 的宿主；失效仍应靠 owner，而非解除成功。
    delete host.offShow;
    delete host.offHide;
    const second = start(secondEnvelopes, 'second', integration);
    expect(cancel).toHaveBeenCalledWith(1);
    getIsolationScope().clearBreadcrumbs();
    const read = vi.fn(() => {
      throw new Error('retired payload');
    });
    shows[0]!(new Proxy({}, { get: read }));
    hides[0]!();
    frame(0, 25);
    expect(read).not.toHaveBeenCalled();
    expect(getIsolationScope().getScopeData().breadcrumbs).toEqual([]);
    expect(firstEnvelopes).toEqual([]);
    frame(1, 25);
    const flushed = second.flush();
    await vi.advanceTimersByTimeAsync(1);
    await flushed;
    expect(collectSpans(secondEnvelopes)).toHaveLength(1);
    expect(secondEnvelopes[0]![0].trace).toMatchObject({ public_key: 'second', release: 'second' });
    expect(getClientEnvironment(second).contexts.minigame?.initToFirstFrameMs).toBe(50);
    const firstFrame = collectSpans(secondEnvelopes)[0]!;
    expect(firstFrame.name).toBe('minigame.init_to_first_frame');
    expect(spanAttribute(firstFrame, 'sentry.op')).toBe('ui.first_frame');
    expect(spanAttribute(firstFrame, 'minigame.init_to_first_frame_ms')).toBe(50);
    first.dispose();
    shows[1]!({ scene: 1007 });
    expect(getClient()).toBe(second);
  });

  it('完成帧不再取消；offShow 抛错仍解除 hide，迟到重复帧不重复发送', async () => {
    const envelopes: Envelope[] = [];
    const owner = start(envelopes, 'first');
    frame(0, 50);
    host.offShow.mockImplementation(() => {
      throw new Error('off show failed');
    });
    const closing = owner.close();
    await vi.advanceTimersByTimeAsync(1);
    expect(await closing).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    expect(host.offShow).toHaveBeenCalledOnce();
    expect(host.offHide).toHaveBeenCalledOnce();
    frame(0, 5);
    expect(collectSpans(envelopes)).toHaveLength(1);
  });

  it('注册/getter/不可读 native 数据安全降级；低层 client 不安装自动资源', () => {
    const envelopes: Envelope[] = [];
    Object.defineProperty(host, 'getLaunchOptionsSync', {
      configurable: true,
      get() {
        throw new Error('launch capability getter');
      },
    });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => {
        throw new Error('rAF register');
      }),
    );
    host.onShow.mockImplementation((handler: (typeof shows)[number]) => {
      shows.push(handler);
      throw new Error('show register');
    });
    const owner = start(envelopes, 'first');
    expect(hides).toHaveLength(1);
    const invalid = Object.defineProperty({}, 'scene', {
      get() {
        throw new Error('scene getter');
      },
    });
    expect(() => shows[0]!(invalid)).not.toThrow();
    expect(() => hides[0]!()).not.toThrow();
    owner.dispose();
    host.onShow.mockClear();
    const low = new MiniappClient({
      dsn: 'https://test@example.com/1',
      integrations: [new MinigameIntegration()],
      transport: createCapturingTransport(envelopes),
    });
    clients.push(low);
    getCurrentScope().setClient(low);
    low.init();
    expect(host.onShow).not.toHaveBeenCalled();
  });

  it('rAF 返回任务前 dispose 时，晚返回的 SDK task 仍取消且不再注册监听', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => {
        getClient()!.dispose();
        return 88;
      }),
    );
    const envelopes: Envelope[] = [];
    start(envelopes, 'first');
    expect(cancel).toHaveBeenCalledExactlyOnceWith(88);
    expect(host.onShow).not.toHaveBeenCalled();
    expect(host.onHide).not.toHaveBeenCalled();
    expect(envelopes).toEqual([]);
  });

  it('frame sampler 重入 dispose 后不 end span 或重建 timer/bucket', () => {
    const envelopes: Envelope[] = [];
    const owner = start(envelopes, 'first', new MinigameIntegration(), {
      tracesSampler: () => {
        owner.dispose();
        return 1;
      },
    });
    frame(0, 50);
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('FPS 同对象 A/B：替换同步发 A summary、取消帧并释放监听；旧回调不写 B', async () => {
    const a: Envelope[] = [];
    const b: Envelope[] = [];
    const integration = new MinigameFrameRateIntegration({ reportInterval: 10000 });
    const first = start(a, 'first', integration);
    integration.setup(first);
    expect(frames).toHaveLength(1);
    frame(0, 20);
    frame(1, 30);
    delete host.offShow;
    delete host.offHide;
    const second = start(b, 'second', integration);
    expect(collectSpans(a)).toHaveLength(1);
    expect(a[0]![0].trace).toMatchObject({ public_key: 'first', release: 'first' });
    expect(cancel).toHaveBeenCalledWith(3);
    getIsolationScope().clearBreadcrumbs();
    const count = frames.length;
    frame(2, 100);
    shows[0]!({});
    hides[0]!();
    expect(frames).toHaveLength(count);
    expect(getIsolationScope().getScopeData().breadcrumbs).toEqual([]);
    frame(3, 20);
    hides[1]!();
    const flushing = second.flush();
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(collectSpans(b)).toHaveLength(1);
    expect(b[0]![0].trace).toMatchObject({ public_key: 'second', release: 'second' });
    first.dispose();
    expect(collectSpans(a)).toHaveLength(1);
  });

  it('FPS hide 暂停帧；重复 hide/show 不重复汇总或循环，恢复排除后台时长', () => {
    const envelopes: Envelope[] = [];
    start(envelopes, 'first', new MinigameFrameRateIntegration());
    frame(0, 20);
    hides[0]!();
    hides[0]!();
    expect(collectSpans(envelopes)).toHaveLength(1);
    expect(cancel).toHaveBeenCalledWith(2);
    frame(1, 600000);
    expect(frames).toHaveLength(2);
    shows[0]!({});
    shows[0]!({});
    expect(frames).toHaveLength(3);
    frame(1, 0); // 上个窗口的迟到帧，不能接管新循环。
    expect(frames).toHaveLength(3);
    frame(2, 16);
    hides[0]!();
    expect(collectSpans(envelopes)).toHaveLength(2);
    const summary = collectSpans(envelopes)[1]!;
    expect(spanAttribute(summary, 'frames.total')).toBe(1);
    expect(spanAttribute(summary, 'frame.worst_ms')).toBe(16);
  });

  it('FPS close finalizer 一次；offHide 抛错不阻断 offShow；dispose 没有 summary', async () => {
    const a: Envelope[] = [];
    const first = start(a, 'first', new MinigameFrameRateIntegration());
    frame(0, 20);
    host.offHide.mockImplementation(() => {
      throw new Error('off failed');
    });
    const closing = first.close();
    expect(first.close()).toBe(closing);
    await vi.advanceTimersByTimeAsync(1);
    expect(await closing).toBe(true);
    expect(host.offShow).toHaveBeenCalledOnce();
    expect(collectSpans(a)).toHaveLength(1);
    hides[0]!();
    first.dispose();
    expect(collectSpans(a)).toHaveLength(1);
    const b: Envelope[] = [];
    const second = start(b, 'second', new MinigameFrameRateIntegration());
    frame(2, 20);
    second.dispose();
    frame(3, 20);
    hides[1]!();
    expect(b).toEqual([]);
  });

  it('FPS sampler 内 dispose 不结束 span、不重填 buffer；同步 rAF shim 不递归', async () => {
    const envelopes: Envelope[] = [];
    const first = start(envelopes, 'first', new MinigameFrameRateIntegration(), {
      tracesSampler: () => {
        getClient()!.dispose();
        return 1;
      },
    });
    frame(0, 20);
    hides[0]!();
    await vi.advanceTimersByTimeAsync(5001);
    expect(envelopes).toEqual([]);
    expect(first.getOptions().enabled).toBe(false);
    const raf = vi.fn((cb: () => void) => {
      cb();
      return 99;
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    start([], 'second', new MinigameFrameRateIntegration());
    expect(raf).toHaveBeenCalledOnce();
  });
  it('FPS 帧注册过程中 dispose 后返回的句柄仍取消；能力 getter 失败/低层构造不启动采集', () => {
    const envelopes: Envelope[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => {
        getClient()!.dispose();
        return 88;
      }),
    );
    start(envelopes, 'first', new MinigameFrameRateIntegration());
    expect(cancel).toHaveBeenCalledWith(88);
    expect(shows).toEqual([]);
    expect(hides).toEqual([]);
    expect(envelopes).toEqual([]);
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      get() {
        throw new Error('rAF capability');
      },
    });
    start([], 'second', new MinigameFrameRateIntegration());
    expect(hides).toEqual([]);
    start([], 'third', new MinigameIntegration());
    expect(frames).toEqual([]);
    const hideCount = hides.length;
    const low = new MiniappClient({
      dsn: 'https://low@example.com/1',
      transport: createCapturingTransport([]),
      integrations: [new MinigameFrameRateIntegration()],
    });
    clients.push(low);
    getCurrentScope().setClient(low);
    low.init();
    expect(hides).toHaveLength(hideCount);
  });

  it('FPS hide 注册失败不阻断 show；cancel 抛错后旧帧仍失效；异步 flush reject 被接住', async () => {
    const envelopes: Envelope[] = [];
    host.onHide.mockImplementation((cb: () => void) => {
      hides.push(cb);
      throw new Error('hide registration');
    });
    cancel.mockImplementation(() => {
      throw new Error('cancel failed');
    });
    const owner = start(envelopes, 'first', new MinigameFrameRateIntegration());
    expect(shows).toHaveLength(1);
    frame(0, 20);
    vi.spyOn(owner, 'flush').mockRejectedValue(new Error('flush failed'));
    hides[0]!();
    await Promise.resolve();
    frame(1, 20);
    expect(frames).toHaveLength(2);
    shows[0]!({});
    expect(frames).toHaveLength(3);
    owner.dispose();
    expect(envelopes).toEqual([]);
  });

  it('FPS breadcrumb callback 重入 dispose 后不继续写 summary/context 或重建帧循环', () => {
    const envelopes: Envelope[] = [];
    const owner = start(
      envelopes,
      'first',
      new MinigameFrameRateIntegration({ reportInterval: 16 }),
      {
        beforeBreadcrumb: (breadcrumb: unknown) => {
          getClient()!.dispose();
          return breadcrumb;
        },
      },
    );
    frame(0, 60);
    expect(owner.getOptions().enabled).toBe(false);
    expect(getClientEnvironment(owner).contexts['minigame.framerate']).toBeUndefined();
    expect(frames).toHaveLength(1);
    expect(envelopes).toEqual([]);
  });
  it('FPS 保留最多 2000 个窗口样本，长期运行的 P95 不保留已淘汰高帧率窗口', () => {
    const envelopes: Envelope[] = [];
    start(
      envelopes,
      'first',
      new MinigameFrameRateIntegration({
        reportInterval: 16,
        maxJankBreadcrumbsPerWindow: 0,
      }),
    );
    for (let i = 0; i < 120; i++) frame(i, 16);
    for (let i = 120; i < 2120; i++) frame(i, 100);
    hides[0]!();
    const summary = collectSpans(envelopes)[0]!;
    expect(spanAttribute(summary, 'frames.total')).toBe(2120);
    expect(spanAttribute(summary, 'fps.p95')).toBe(10);
  });

  it('FPS rAF 注册失败保持生命周期可用；零/负时钟差值不污染帧数或 duration', () => {
    const envelopes: Envelope[] = [];
    const raf = vi.fn(() => {
      throw new Error('rAF registration');
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    const first = start(envelopes, 'first', new MinigameFrameRateIntegration());
    expect(shows).toHaveLength(1);
    expect(hides).toHaveLength(1);
    hides[0]!();
    expect(envelopes).toEqual([]);
    first.dispose();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: () => void) => {
        frames.push(cb);
        return frames.length;
      }),
    );
    start(envelopes, 'second', new MinigameFrameRateIntegration());
    frame(0, 0);
    frame(1, -10);
    frame(2, 16);
    hides[1]!();
    const summary = collectSpans(envelopes)[0]!;
    expect(spanAttribute(summary, 'frames.total')).toBe(1);
    expect(spanAttribute(summary, 'frame.worst_ms')).toBe(16);
  });
  it('小游戏 launch 或首帧 breadcrumb 重入 dispose 后不继续创建 span/注册监听', () => {
    const a: Envelope[] = [];
    start(a, 'first', new MinigameIntegration(), {
      beforeBreadcrumb: (breadcrumb: unknown) => {
        getClient()!.dispose();
        return breadcrumb;
      },
    });
    expect(frames).toEqual([]);
    expect(shows).toEqual([]);
    expect(hides).toEqual([]);
    expect(a).toEqual([]);
    const b: Envelope[] = [];
    start(b, 'second', new MinigameIntegration(), {
      beforeBreadcrumb: (breadcrumb: { category?: string }) => {
        if (breadcrumb.category === 'minigame.performance') getClient()!.dispose();
        return breadcrumb;
      },
    });
    frame(0, 20);
    expect(b).toEqual([]);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('首帧时钟回拨有实际 diagnostics，省略无可信 interval 而非发送 0', () => {
    const envelopes: Envelope[] = [];
    const client = start(envelopes, 'clock');
    frame(0, -1);
    expect(getClientEnvironment(client).contexts.minigame?.initToFirstFrameMs).toBeUndefined();
    expect(envelopes).toEqual([]);
    expect(getDiagnostics().warnings.map((warning) => warning.code)).toContain(
      'performance_clock_invalid',
    );
  });
});
