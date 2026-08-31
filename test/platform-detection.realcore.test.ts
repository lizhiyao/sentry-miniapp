import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  flush,
  getClient,
  installedIntegrations,
  type Envelope,
  type Event,
} from '@sentry/core';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { resetPlatformCache } from '../src/crossPlatform';
import { init } from '../src/index';
import {
  assertDefined,
  collectEnvelopePayloads,
  createCapturingTransport,
} from './support/envelopes';

describe('平台识别与显式覆盖（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];
  let tt: any;

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0;

    // 复现 issue #288 的可观测状态：wx / tt 同时存在，默认顺序先命中 wx。
    tt = {
      request: vi.fn(),
      getSystemInfoSync: vi.fn(() => ({
        brand: 'ByteDance',
        model: 'Douyin Device',
        system: 'iOS 18',
        appName: 'Douyin',
        SDKVersion: '3.0.0',
      })),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
    };
    g.tt = tt;
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    delete g.tt;
  });

  it('wx / tt 共存时自动识别抖音宿主，并兼容 beforeSend 顶层 platform', async () => {
    const wxOnError = g.wx.onError;
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      beforeSend: (event) => ({ ...event, platform: 'javascript' }),
      transport: createCapturingTransport(captured),
    });
    expect(client).toBeDefined();
    expect(tt.onError).toHaveBeenCalledTimes(1);
    expect(wxOnError).not.toHaveBeenCalled();

    captureException(new Error('bytedance auto detection'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.exception?.values?.some((value: any) =>
        value.value?.includes('bytedance auto detection'),
      ),
    );
    assertDefined(event);
    expect(event.platform).toBe('javascript');
    expect(event.contexts?.miniapp?.platform).toBe('bytedance');
    expect(event.contexts?.device?.brand).toBe('ByteDance');
  });

  it('宿主信号不足时允许 miniappPlatform=bytedance 覆盖小程序宿主标记', async () => {
    tt.getSystemInfoSync.mockReturnValue({
      brand: 'Unknown Adapter',
      model: 'Unknown Device',
      system: 'iOS 18',
      SDKVersion: '3.0.0',
    });
    const wxOnError = g.wx.onError;
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      miniappPlatform: 'bytedance',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    });
    expect(client).toBeDefined();
    expect(wxOnError).toHaveBeenCalledTimes(1);
    expect(tt.onError).not.toHaveBeenCalled();

    captureException(new Error('bytedance explicit fallback'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.exception?.values?.some((value: any) =>
        value.value?.includes('bytedance explicit fallback'),
      ),
    );
    assertDefined(event);
    expect(event.platform).toBe('javascript');
    expect(event.contexts?.miniapp?.platform).toBe('bytedance');
  });

  it('兼容旧 platform 别名，但事件顶层 platform 始终是 javascript', async () => {
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    });
    expect(client).toBeDefined();

    captureException(new Error('legacy platform alias'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.exception?.values?.some((value: any) => value.value?.includes('legacy platform alias')),
    );
    assertDefined(event);
    expect(event.platform).toBe('javascript');
    expect(event.contexts?.miniapp?.platform).toBe('bytedance');
  });

  it('JavaScript 传入无效 platform 时警告并回退自动识别', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'javascript',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    } as any);
    expect(client).toBeDefined();

    captureException(new Error('invalid platform fallback'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.exception?.values?.some((value: any) =>
        value.value?.includes('invalid platform fallback'),
      ),
    );
    assertDefined(event);
    expect(event.platform).toBe('javascript');
    expect(event.contexts?.miniapp?.platform).toBe('bytedance');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('无效的 platform=javascript'));
    warnSpy.mockRestore();
  });

  it('miniappPlatform 优先于兼容 platform 别名', () => {
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      miniappPlatform: 'qq',
      platform: 'wechat',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    });

    expect(client?.getOptions().miniappPlatform).toBe('qq');
    expect(client?.getOptions().platform).toBe('javascript');
  });
});
