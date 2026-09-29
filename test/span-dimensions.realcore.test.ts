import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  flush,
  getClient,
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
