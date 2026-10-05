import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  flush,
  getClient,
  getCurrentScope,
  startInactiveSpan,
  withActiveSpan,
  type Envelope,
  type Event,
} from '@sentry/core';
import { init } from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import {
  assertDefined,
  collectEnvelopePayloads,
  collectSpans,
  createCapturingTransport,
  spanAttribute,
} from './support/envelopes';

/**
 * core 11 的 streamed span 只携带 attributes：scope tags 不再继承，contexts 也只有
 * response / profile / culture 等白名单会被映射。这里用真 core 验证 SDK 自动采集的运行环境
 * 维度确实落到了 span envelope 上——只写在事件上的话，Performance / Traces 里就切不出来。
 */
describe('span 运行环境维度（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];

  beforeEach(() => {
    captured = [];
    resetPlatformCache();

    g.wx = {
      request: vi.fn((options) => {
        options.success?.({ statusCode: 200, data: { ok: true }, header: {} });
        options.complete?.({ statusCode: 200 });
        return { abort: vi.fn() };
      }),
      getSystemInfoSync: vi.fn(() => ({
        brand: 'Apple',
        model: 'iPhone 15',
        system: 'iOS 17.4',
        version: '8.0.40',
        language: 'zh_CN',
        platform: 'ios',
        screenWidth: 390,
        screenHeight: 844,
      })),
      getAccountInfoSync: vi.fn(() => ({ miniProgram: { appId: 'wx-app-id' } })),
      getNetworkType: vi.fn((options) => options.success?.({ networkType: 'wifi' })),
      onNetworkStatusChange: vi.fn(),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      onMemoryWarning: vi.fn(),
      getPerformance: vi.fn(() => ({ now: () => Date.now() * 1000 })),
    };
  });

  afterEach(async () => {
    await getClient()?.close(0);
    getCurrentScope().setAttribute('device.model', undefined);
    resetPlatformCache();
    delete g.getCurrentPages;
    delete g.wx;
  });

  function initWith(overrides: Record<string, unknown> = {}): void {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'wechat',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
      ...overrides,
    } as any);
  }

  it('独立 HTTP span 带上设备 / 系统 / 平台维度', async () => {
    initWith();

    g.wx.request({ url: 'https://api.example.com/v1/profile' });
    await flush(2000);

    const [span] = collectSpans(captured);
    assertDefined(span, '未产出请求 span');
    expect(spanAttribute(span, 'miniapp.platform')).toBe('wechat');
    expect(spanAttribute(span, 'device.manufacturer')).toBe('Apple');
    expect(spanAttribute(span, 'device.model')).toBe('iPhone 15');
    expect(spanAttribute(span, 'os.name')).toBe('iOS');
    expect(spanAttribute(span, 'os.version')).toBe('17.4');
    expect(spanAttribute(span, 'os.type')).toBe('ios');
    // 宿主版本与小程序自身版本各用独立键，避免与事件 context 同名不同义。
    expect(spanAttribute(span, 'miniapp.host_version')).toBe('8.0.40');
    expect(spanAttribute(span, 'app.app_version')).toBe(undefined);
    // 进程首次安装也必须带上：这条维度是 setup(client) 里登记到本 client 的，
    // 早期版本靠 setupOnce 抢跑，首次 init 时 client 还没绑上就丢了。
    expect(spanAttribute(span, 'network.type')).toBe('wifi');
  });

  it('关闭采集后重新初始化，不应把上一轮 client 的设备维度带进新 span', async () => {
    initWith();
    g.wx.request({ url: 'https://api.example.com/v1/profile' });
    await flush(2000);
    const [first] = collectSpans(captured);
    assertDefined(first);
    expect(spanAttribute(first, 'device.model')).toBe('iPhone 15');

    const previous = getClient();
    await previous?.close(0);
    getCurrentScope().setClient(undefined);
    captured = [];

    initWith({ enableSystemInfo: false });
    g.wx.request({ url: 'https://api.example.com/v1/profile' });
    await flush(2000);

    const [second] = collectSpans(captured);
    assertDefined(second);
    expect(spanAttribute(second, 'miniapp.platform')).toBe('wechat');
    // 自动维度属于「本轮 client 是否采集」，不能因为写进共享 isolation scope 而活过一轮初始化。
    expect(spanAttribute(second, 'device.model')).toBeUndefined();
    expect(spanAttribute(second, 'os.name')).toBeUndefined();
  });

  it('手动 span 不自动补结束时页面', async () => {
    const pages: Array<{ route: string }> = [{ route: 'pages/a' }];
    g.getCurrentPages = vi.fn(() => pages);

    initWith();

    const spanOnA = startInactiveSpan({ name: 'span.on.a', parentSpan: null });
    spanOnA.end();
    await getClient()?.flush(2000);

    pages.push({ route: 'pages/b' });
    startInactiveSpan({ name: 'span.on.b', parentSpan: null }).end();
    await getClient()?.flush(2000);

    pages.pop(); // navigateBack
    const spanBack = startInactiveSpan({ name: 'span.back', parentSpan: null });
    spanBack.end();
    await getClient()?.flush(2000);

    const spans = collectSpans(captured);
    const routeOf = (name: string): unknown => {
      const span = spans.find((item) => item.name === name);
      assertDefined(span, `未产出 ${name}`);
      return spanAttribute(span, 'route');
    };
    expect(routeOf('span.on.a')).toBeUndefined();
    expect(routeOf('span.on.b')).toBeUndefined();
    expect(routeOf('span.back')).toBeUndefined();

    delete g.getCurrentPages;
  });

  it('自动 HTTP 创建时的 route/network 进入 sampler，跨页面完成仍保留开始值', async () => {
    const pages = [{ route: 'pages/a' }];
    g.getCurrentPages = vi.fn(() => pages);
    let pending: any;
    g.wx.request = vi.fn((options) => {
      pending = options;
      return { abort: vi.fn() };
    });
    const sampler = vi.fn(() => 1);
    initWith({ tracesSampler: sampler });
    g.wx.request({ url: 'https://api.example.com/started-on-a' });
    expect(sampler).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ route: 'pages/a', 'network.type': 'wifi' }),
      }),
    );
    pages.push({ route: 'pages/b' });
    pending.success?.({ statusCode: 200, data: {}, header: {} });
    pending.complete?.({ statusCode: 200 });
    await flush(2000);
    const [span] = collectSpans(captured);
    assertDefined(span);
    expect(spanAttribute(span, 'route')).toBe('pages/a');
    expect(spanAttribute(span, 'network.type')).toBe('wifi');
    delete g.getCurrentPages;
  });

  it('最终 streamed span 保留 scope 单位，显式 span 值优先且不补动态维度', async () => {
    initWith();
    getCurrentScope().setAttribute('device.model', { value: 42, unit: 'byte' });
    const raw = startInactiveSpan({ name: 'scope-unit', parentSpan: null });
    raw.end();
    const explicit = startInactiveSpan({
      name: 'explicit-span',
      parentSpan: null,
      attributes: { 'device.model': 'explicit-model', route: 'business-route' },
    });
    explicit.end();
    await flush(2000);
    const spans = collectSpans(captured);
    const fromScope = spans.find((span) => span.name === 'scope-unit');
    const fromSpan = spans.find((span) => span.name === 'explicit-span');
    assertDefined(fromScope);
    assertDefined(fromSpan);
    expect(fromScope.attributes['device.model']).toMatchObject({
      value: 42,
      unit: 'byte',
      type: 'integer',
    });
    expect(spanAttribute(fromScope, 'route')).toBeUndefined();
    expect(spanAttribute(fromScope, 'network.type')).toBeUndefined();
    expect(spanAttribute(fromSpan, 'device.model')).toBe('explicit-model');
    expect(spanAttribute(fromSpan, 'route')).toBe('business-route');
  });

  it('有父 HTTP child 的 ignoreSpans 使用创建时页面与网络，而非结束后补值', async () => {
    const pages = [{ route: 'pages/ignored' }];
    g.getCurrentPages = vi.fn(() => pages);
    const hostRequest = g.wx.request;
    initWith({
      ignoreSpans: [
        { op: 'http.client', attributes: { route: 'pages/ignored', 'network.type': 'wifi' } },
      ],
    });
    const root = startInactiveSpan({ name: 'business-root', parentSpan: null });
    withActiveSpan(root, () => g.wx.request({ url: 'https://api.example.com/ignored-child' }));
    pages[0] = { route: 'pages/accepted' };
    withActiveSpan(root, () => g.wx.request({ url: 'https://api.example.com/accepted-child' }));
    root.end();
    await flush(2000);
    const spans = collectSpans(captured);
    expect(spans.map((span) => span.name)).toEqual(
      expect.arrayContaining(['business-root', 'GET https://api.example.com/accepted-child']),
    );
    expect(spans.some((span) => span.name.includes('ignored-child'))).toBe(false);
    expect(spans).toHaveLength(2);
    expect(hostRequest).toHaveBeenCalledTimes(2);
  });

  it('network.type 由 NetworkStatus 集成登记到所属 client 的 span 上', async () => {
    initWith();

    g.wx.request({ url: 'https://api.example.com/v1/profile' });
    await flush(2000);

    const [span] = collectSpans(captured);
    assertDefined(span);
    expect(spanAttribute(span, 'network.type')).toBe('wifi');
  });

  it('关掉网络状态监听后，span 不再带 network.type', async () => {
    // 反向对照：该属性只可能来自集成的登记，缺席才能说明上一条断言不是恒真。
    initWith({ enableNetworkStatusMonitoring: false });

    g.wx.request({ url: 'https://api.example.com/v1/profile' });
    await flush(2000);

    const [span] = collectSpans(captured);
    assertDefined(span);
    expect(spanAttribute(span, 'network.type')).toBeUndefined();
  });

  it('事件侧 context 与 tag 不因双写而丢失', async () => {
    initWith();

    captureException(new Error('dimension regression probe'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.exception?.values?.some((value: any) => value.value?.includes('dimension regression')),
    );
    assertDefined(event);
    expect(event.contexts?.device).toMatchObject({ model: 'iPhone 15', brand: 'Apple' });
    expect(event.contexts?.os).toMatchObject({ name: 'iOS', version: '17.4' });
    expect(event.contexts?.miniapp).toMatchObject({ platform: 'wechat' });
    expect(event.tags).toBeUndefined();
  });
});
