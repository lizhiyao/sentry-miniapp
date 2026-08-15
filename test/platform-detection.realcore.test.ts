import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureException, flush, getClient, installedIntegrations } from '@sentry/core';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { resetPlatformCache } from '../src/crossPlatform';
import { init } from '../src/index';

function collectEvents(captured: any[]): any[] {
  const events: any[] = [];
  for (const envelope of captured) {
    const items = envelope[1];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item[0]?.type === 'event') events.push(item[1]);
    }
  }
  return events;
}

describe('平台识别与显式覆盖（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: any[];
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
      transport: () => ({
        send: (envelope: any) => {
          captured.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
    expect(client).toBeDefined();
    expect(tt.onError).toHaveBeenCalledTimes(1);
    expect(wxOnError).not.toHaveBeenCalled();

    captureException(new Error('bytedance auto detection'));
    await flush(2000);

    const event = collectEvents(captured).find((item) =>
      item.exception?.values?.some((value: any) =>
        value.value?.includes('bytedance auto detection'),
      ),
    );
    expect(event).toBeDefined();
    expect(event.platform).toBe('javascript');
    expect(event.contexts?.miniapp?.platform).toBe('bytedance');
    expect(event.contexts?.device?.brand).toBe('ByteDance');
  });

  it('宿主信号不足时允许 platform=bytedance 覆盖小程序宿主标记', async () => {
    tt.getSystemInfoSync.mockReturnValue({
      brand: 'Unknown Adapter',
      model: 'Unknown Device',
      system: 'iOS 18',
      SDKVersion: '3.0.0',
    });
    const wxOnError = g.wx.onError;
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      enableAutoSessionTracking: false,
      transport: () => ({
        send: (envelope: any) => {
          captured.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
    expect(client).toBeDefined();
    expect(wxOnError).toHaveBeenCalledTimes(1);
    expect(tt.onError).not.toHaveBeenCalled();

    captureException(new Error('bytedance explicit fallback'));
    await flush(2000);

    const event = collectEvents(captured).find((item) =>
      item.exception?.values?.some((value: any) =>
        value.value?.includes('bytedance explicit fallback'),
      ),
    );
    expect(event).toBeDefined();
    expect(event.platform).toBe('javascript');
    expect(event.contexts?.miniapp?.platform).toBe('bytedance');
  });
});
