import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  flush,
  getClient,
  getCurrentScope,
  getIsolationScope,
  type Envelope,
  type Event,
} from '@sentry/core';
import { init } from '../src/index';
import { pageBreadcrumbsIntegration } from '../src/integrations/pagebreadcrumbs';
import { resetPlatformCache } from '../src/crossPlatform';
import {
  assertDefined,
  collectEnvelopePayloads,
  createCapturingTransport,
} from './support/envelopes';

/**
 * Page collector 接管旧 Router 的导航 API breadcrumb。`navigateTo` 之类 API 的 `url`
 * 常带业务 query（甚至 token），必须走 `dataCollection.urlQueryParams`，
 * 尝试跳转不能伪造当前 route 或污染共享 scope。
 */
describe('Page 导航采集与 dataCollection（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];

  beforeEach(() => {
    captured = [];
    getIsolationScope().clearBreadcrumbs();
    getCurrentScope().clearBreadcrumbs();
    resetPlatformCache();

    g.tt = {
      request: vi.fn(),
      navigateTo: vi.fn(),
      redirectTo: vi.fn(),
      switchTab: vi.fn(),
      reLaunch: vi.fn(),
      navigateBack: vi.fn(),
      getPerformance: vi.fn(() => ({ now: () => Date.now() * 1000 })),
      getSystemInfoSync: vi.fn(() => ({ platform: 'ios', hostName: 'Toutiao' })),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      onMemoryWarning: vi.fn(),
    };
    g.getCurrentPages = vi.fn(() => [{ route: 'pages/index/index' }]);
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    delete g.tt;
    delete g.getCurrentPages;
    resetPlatformCache();
  });

  async function navigate(
    options: Record<string, unknown> = {},
  ): Promise<{ data: Record<string, unknown>; tags: Record<string, string> | undefined }> {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      defaultIntegrations: [pageBreadcrumbsIntegration()],
      transport: createCapturingTransport(captured),
      ...options,
    } as any);

    g.tt.navigateTo({ url: 'pages/detail/detail?id=1&token=abc' });

    captureException(new Error('router url probe'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.breadcrumbs?.some((breadcrumb) => breadcrumb.category === 'navigation'),
    );
    assertDefined(event, '事件里没有 navigation 面包屑');
    const crumb = event.breadcrumbs?.find(
      (breadcrumb) =>
        breadcrumb.category === 'navigation' && breadcrumb.data?.action === 'navigateTo',
    );
    assertDefined(crumb);
    return {
      data: crumb.data as Record<string, unknown>,
      tags: event.tags as Record<string, string> | undefined,
    };
  }

  it('目标 URL 的敏感 query 就地脱敏，不伪造已到达 route', async () => {
    const { data, tags } = await navigate();

    expect(data.to).toBe('pages/detail/detail?id=1&token=[Filtered]');
    expect(data.from).toBe('pages/index/index');
    expect(tags?.route).toBeUndefined();
  });

  it('urlQueryParams=false 时目标 URL 不带任何 query', async () => {
    const { data, tags } = await navigate({ dataCollection: { urlQueryParams: false } });

    expect(data.to).toBe('pages/detail/detail');
    expect(tags?.route).toBeUndefined();
  });
  it('全部导航 API 保留 receiver、参数、返回和 throw；无轮询，关闭后停止采集', async () => {
    const calls: Array<{ receiver: unknown; args: unknown[] }> = [];
    const originals = new Map<string, Function>();
    for (const name of ['navigateTo', 'redirectTo', 'switchTab', 'reLaunch', 'navigateBack']) {
      const original = function (this: unknown, ...args: unknown[]) {
        calls.push({ receiver: this, args });
        if (name === 'reLaunch') throw new Error('business throw');
        return name;
      };
      g.tt[name] = original;
      originals.set(name, original);
    }
    const interval = vi.spyOn(globalThis, 'setInterval');
    const owner = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [pageBreadcrumbsIntegration()],
      transport: createCapturingTransport(captured),
    })!;
    const receiver = {};
    const options = { url: 'pages/next?memberNo=secret#fragment', delta: 2 };
    for (const name of originals.keys()) {
      const invoke = () => g.tt[name].call(receiver, options, 'extra');
      if (name === 'reLaunch') expect(invoke).toThrow('business throw');
      else expect(invoke()).toBe(name);
    }
    expect(
      calls.every(
        (call) =>
          call.receiver === receiver && call.args[0] === options && call.args[1] === 'extra',
      ),
    ).toBe(true);
    owner.captureMessage('navigation snapshot');
    await owner.flush();
    const events = collectEnvelopePayloads<Event>(captured, ['event']);
    const navigation = events[0]!.breadcrumbs!.filter((crumb) => crumb.category === 'navigation');
    expect(navigation.map((crumb) => crumb.data?.action)).toEqual([...originals.keys()]);
    expect(navigation.at(-1)!.data).toMatchObject({ to: 'back', delta: 2 });
    expect(interval).not.toHaveBeenCalled();
    owner.dispose();
    for (const [name, original] of originals) expect(g.tt[name]).toBe(original);
    interval.mockRestore();
  });

  it('导航开关关闭时不安装；宿主 getter 关闭 owner 后不写 breadcrumb，业务仍执行', async () => {
    const original = g.tt.navigateTo;
    init({
      dsn: 'https://key@example.com/1',
      enableNavigationBreadcrumbs: false,
      enableUserInteractionBreadcrumbs: true,
      transport: createCapturingTransport(captured),
    });
    expect(g.tt.navigateTo).toBe(original);
    const owner = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [pageBreadcrumbsIntegration()],
      transport: createCapturingTransport(captured),
    })!;
    const before = getCurrentScope().getScopeData().breadcrumbs.length;
    const options = {
      get url() {
        owner.dispose();
        return 'page?token=secret';
      },
    };
    g.tt.navigateTo(options);
    expect(original).toHaveBeenCalledWith(options);
    expect(getCurrentScope().getScopeData().breadcrumbs).toHaveLength(before);
  });
  it('导航参数缺失、旧 route 字段或不可读时不改变业务入口', async () => {
    const navigateTo = g.tt.navigateTo;
    const owner = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [pageBreadcrumbsIntegration()],
      transport: createCapturingTransport(captured),
    })!;
    g.getCurrentPages = () => [{ __route__: 'pages/legacy?token=old' }];
    g.tt.navigateTo();
    g.tt.navigateBack();
    g.getCurrentPages = () => [];
    g.tt.navigateBack({ delta: -1 });
    g.getCurrentPages = () => {
      throw new Error('pages unreadable');
    };
    g.tt.navigateTo({ url: 'page?token=secret' });
    owner.captureMessage('snapshot');
    await owner.flush();
    expect(navigateTo).toHaveBeenCalledTimes(2);
    const crumbs = collectEnvelopePayloads<Event>(captured, ['event'])[0]!.breadcrumbs!.filter(
      (crumb) => crumb.category === 'navigation',
    );
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]!.data).toMatchObject({ from: 'pages/legacy', to: '' });
    expect(crumbs[2]!.data).toMatchObject({ from: '', to: 'back' });
    expect(crumbs[2]!.data).not.toHaveProperty('delta');
  });
  it('导航包装安装中的宿主 getter 退休 owner 后，立即回收迟到包装并停止读取后续能力', () => {
    const nextCapability = vi.fn(() => vi.fn());
    const original = g.tt.navigateTo;
    Object.defineProperty(g.tt, 'navigateTo', {
      configurable: true,
      get() {
        getClient()!.dispose();
        return original;
      },
    });
    Object.defineProperty(g.tt, 'redirectTo', { configurable: true, get: nextCapability });
    const owner = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [pageBreadcrumbsIntegration()],
      transport: createCapturingTransport(captured),
    })!;
    expect(owner.getOptions().enabled).toBe(false);
    expect(nextCapability).not.toHaveBeenCalled();
    expect(g.tt.navigateTo).toBe(original);
  });
  it('App 包装读取中退休 owner 后，回收订阅且不开始安装导航', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'App');
    const readNavigation = vi.fn(() => vi.fn());
    Object.defineProperty(g.tt, 'navigateTo', { configurable: true, get: readNavigation });
    Object.defineProperty(globalThis, 'App', {
      configurable: true,
      get() {
        getClient()?.dispose();
        return () => {};
      },
    });
    try {
      const owner = init({
        dsn: 'https://key@example.com/1',
        defaultIntegrations: [pageBreadcrumbsIntegration()],
        transport: createCapturingTransport(captured),
      })!;
      expect(owner.getOptions().enabled).toBe(false);
      expect(readNavigation).not.toHaveBeenCalled();
    } finally {
      if (saved) Object.defineProperty(globalThis, 'App', saved);
      else Reflect.deleteProperty(globalThis, 'App');
    }
  });
});
