import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope, spanStreamingIntegration, type Envelope } from '@sentry/core';
import { init } from '../src/sdk';
import { MiniappClient } from '../src/client';
import { ConsoleBreadcrumbs } from '../src/integrations/console';
import { PageBreadcrumbs } from '../src/integrations/pagebreadcrumbs';
import { NetworkStatusIntegration } from '../src/integrations/networkstatus';
import { NetworkBreadcrumbs } from '../src/integrations/networkbreadcrumbs';
import { PerformanceIntegration } from '../src/integrations/performance';
import { getClientEnvironment } from '../src/clientState';
import { resetPlatformCache } from '../src/crossPlatform';
import { collectSpans, createCapturingTransport } from './support/envelopes';

describe('Performance observer owner（真实 core）', () => {
  const clients: MiniappClient[] = [];
  const callbacks: Array<(entries: any) => void> = [];
  const disconnects: Array<ReturnType<typeof vi.fn>> = [];
  let manager: any;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    callbacks.length = disconnects.length = 0;
    getCurrentScope().setClient(undefined);
    resetPlatformCache();
    manager = {
      timeOrigin: 1699999990000,
      getEntries: () => [],
      getEntriesByType: () => [],
      getEntriesByName: () => [],
      mark() {},
      measure() {},
      clearMarks() {},
      clearMeasures() {},
      createObserver: vi.fn((callback: (entries: any) => void) => {
        callbacks.push(callback);
        const disconnect = vi.fn();
        disconnects.push(disconnect);
        return { observe: vi.fn(), disconnect };
      }),
    };
    vi.stubGlobal('wx', { getPerformance: () => manager });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });
  function start(
    envelopes: Envelope[],
    key: string,
    integration = new PerformanceIntegration(),
    extra: Record<string, unknown> = {},
  ) {
    const client = init({
      dsn: `https://${key}@example.com/1`,
      release: key,
      tracesSampleRate: 1,
      enableSystemInfo: false,
      defaultIntegrations: [spanStreamingIntegration(), integration],
      transport: createCapturingTransport(envelopes),
      ...extra,
    })!;
    clients.push(client);
    return client;
  }
  const navigation = () => [
    { name: 'pages/home', entryType: 'navigation', startTime: 0, duration: 20 },
  ];

  it('同对象 A/B 复用：A 同步收尾/disconnect，旧 observer 不读参数，B DSC/状态独立', async () => {
    const a: Envelope[] = [],
      b: Envelope[] = [];
    const integration = new PerformanceIntegration();
    const first = start(a, 'first', integration);
    integration.setup(first);
    expect(callbacks).toHaveLength(1);
    callbacks[0]!(navigation());
    const second = start(b, 'second', integration);
    expect(disconnects[0]).toHaveBeenCalledOnce();
    expect(getClientEnvironment(first).contexts.performance_summary).toBeUndefined();
    expect(a[0]![0].trace).toMatchObject({ public_key: 'first', release: 'first' });
    const read = vi.fn(() => {
      throw new Error('retired entry getter');
    });
    callbacks[0]!(new Proxy({}, { get: read }));
    expect(read).not.toHaveBeenCalled();
    callbacks[1]!(navigation());
    const flushing = second.flush();
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(collectSpans(b)).toHaveLength(1);
    expect(b[0]![0].trace).toMatchObject({ public_key: 'second', release: 'second' });
    first.dispose();
    expect(disconnects[1]).not.toHaveBeenCalled();
    expect(getClientEnvironment(second).contexts.performance_summary).toBeUndefined();
  });

  it('close 排空 core 一次；dispose 不发送，disconnect 失败后的迟到数据也失效', async () => {
    const a: Envelope[] = [];
    const first = start(a, 'first');
    callbacks[0]!(navigation());
    const context = vi.spyOn(getClientEnvironment(first), 'setContext');
    disconnects[0]!.mockImplementation(() => {
      throw new Error('disconnect failed');
    });
    const closing = first.close();
    expect(first.close()).toBe(closing);
    await vi.advanceTimersByTimeAsync(1);
    expect(await closing).toBe(true);
    callbacks[0]!(navigation());
    first.dispose();
    expect(context.mock.calls.filter(([name]) => name === 'performance_summary')).toHaveLength(0);
    expect(collectSpans(a)).toHaveLength(1);
    const b: Envelope[] = [];
    const second = start(b, 'second');
    callbacks[1]!(navigation());
    second.dispose();
    expect(getClientEnvironment(second).contexts.performance_summary).toBeUndefined();
    expect(b).toEqual([]);
  });

  it('observe 部分注册后抛错的资源仍解除；低层 client 不安装 observer', () => {
    const disconnect = vi.fn();
    manager.createObserver.mockImplementation((cb: (entries: any) => void) => {
      callbacks.push(cb);
      return {
        observe() {
          throw new Error('observe failed');
        },
        disconnect,
      };
    });
    const owner = start([], 'first');
    owner.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    const low = new MiniappClient({
      dsn: 'https://low@example.com/1',
      transport: createCapturingTransport([]),
      integrations: [new PerformanceIntegration()],
    });
    clients.push(low);
    getCurrentScope().setClient(low);
    low.init();
    expect(manager.createObserver).toHaveBeenCalledOnce();
  });

  it('createObserver 内 dispose 后返回的资源立即解除，不能创建报告 timer', () => {
    const disconnect = vi.fn();
    manager.createObserver.mockImplementation(() => {
      getClient()!.dispose();
      return { observe: vi.fn(), disconnect };
    });
    start([], 'first');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sampler 重入 dispose 后不结束 span/填 buffer，旧 observer 和 timer 不重启', async () => {
    const envelopes: Envelope[] = [];
    const owner = start(envelopes, 'first', new PerformanceIntegration(), {
      tracesSampler: () => {
        getClient()!.dispose();
        return 1;
      },
    });
    callbacks[0]!(navigation());
    await vi.advanceTimersByTimeAsync(30001);
    expect(owner.getOptions().enabled).toBe(false);
    expect(getClientEnvironment(owner).contexts.performance_summary).toBeUndefined();
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('不可读 entry 安全省略；getEntries 内关闭后不生成新的 operation', () => {
    const envelopes: Envelope[] = [];
    start(envelopes, 'first');
    expect(() =>
      callbacks[0]!({
        getEntries() {
          throw new Error('entry read failed');
        },
      }),
    ).not.toThrow();
    callbacks[0]!({
      getEntries() {
        getClient()!.dispose();
        return navigation();
      },
    });
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('低层 client 即使手动绑定，也不启动 Page/Console/HTTP/网络状态 producer', () => {
    const page = vi.fn((options: unknown) => options);
    const request = vi.fn();
    const query = vi.fn();
    vi.stubGlobal('Page', page);
    vi.stubGlobal('wx', { request, getNetworkType: query });
    const low = new MiniappClient({
      dsn: 'https://low@example.com/1',
      transport: createCapturingTransport([]),
      integrations: [
        new PageBreadcrumbs(),
        new ConsoleBreadcrumbs({ levels: ['log'] }),
        new NetworkBreadcrumbs(),
        new NetworkStatusIntegration(),
      ],
    });
    clients.push(low);
    getCurrentScope().setClient(low);
    low.init();
    const onShow = vi.fn();
    const options = { onShow };
    (globalThis as any).Page(options);
    expect(options.onShow).toBe(onShow);
    expect(query).not.toHaveBeenCalled();
  });

  it('observe 同步回调内 dispose 后不启动报告或写入环境', () => {
    const disconnect = vi.fn();
    manager.createObserver.mockImplementation(() => ({
      observe: () => getClient()!.dispose(),
      disconnect,
    }));
    const owner = start([], 'first');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(getClientEnvironment(owner).contexts.performance).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
