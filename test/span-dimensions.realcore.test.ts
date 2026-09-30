import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  flush,
  getClient,
  getCurrentScope,
  startInactiveSpan,
  type Client,
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
    resetPlatformCache();
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

  it('重叠 client 各自携带自己的平台与采集开关', async () => {
    initWith({ miniappPlatform: 'wechat' });
    const clientA = getClient() as Client;
    assertDefined(clientA);

    initWith({ miniappPlatform: 'bytedance', enableSystemInfo: false });
    const clientB = getClient() as Client;
    assertDefined(clientB);

    // 切回 A 建 span：A 采集设备信息，B 不采集，两边都不能看到对方的平台标记。
    getCurrentScope().setClient(clientA);
    startInactiveSpan({ name: 'span.on.a', parentSpan: null }).end();
    await clientA.flush(2000);
    const spanA = collectSpans(captured).find((span) => span.name === 'span.on.a');
    assertDefined(spanA);
    expect(spanAttribute(spanA, 'miniapp.platform')).toBe('wechat');
    expect(spanAttribute(spanA, 'device.model')).toBe('iPhone 15');

    getCurrentScope().setClient(clientB);
    startInactiveSpan({ name: 'span.on.b', parentSpan: null }).end();
    await clientB.flush(2000);
    const spanB = collectSpans(captured).find((span) => span.name === 'span.on.b');
    assertDefined(spanB);
    expect(spanAttribute(spanB, 'miniapp.platform')).toBe('bytedance');
    expect(spanAttribute(spanB, 'device.model')).toBeUndefined();
  });

  it('route 随页面栈实时变化，返回上一页后不停留在旧页面', async () => {
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
    expect(routeOf('span.on.a')).toBe('pages/a');
    expect(routeOf('span.on.b')).toBe('pages/b');
    expect(routeOf('span.back')).toBe('pages/a');

    delete g.getCurrentPages;
  });

  it('network.type 由 NetworkStatus 集成登记到所属 client 的 span 上', async () => {
    initWith();

    g.wx.request({ url: 'https://api.example.com/v1/profile' });
    await flush(2000);

    const [span] = collectSpans(captured);
    assertDefined(span);
    expect(spanAttribute(span, 'network.type')).toBe('wifi');
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
    expect(event.contexts?.os).toMatchObject({ name: 'iOS 17.4', version: '8.0.40' });
    expect(event.contexts?.miniapp).toMatchObject({ platform: 'wechat' });
    expect(event.tags).toBeUndefined();
  });
});
