import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { getClient, flush, installedIntegrations } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init } from '../src/index';

/**
 * GlobalHandlers 的真 @sentry/core 端到端验证：
 * 平台 `wx.onError` 触发 → 经真 core 上报为 exception 事件，并带 `mechanism.handled=false`
 * （未处理错误的标志，core 据此把 Session 标记为 crashed）。
 *
 * 历史单测把 captureException mock 掉，只断言「调用了」，测不到事件实际形态——本用例补这个真窟窿。
 */
function collectEvents(captured: any[]): any[] {
  const events: any[] = [];
  for (const env of captured) {
    const items = env[1];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const header = item[0];
      if (header && header.type === 'event') events.push(item[1]);
    }
  }
  return events;
}

describe('GlobalHandlers（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: any[];
  let onErrorHandler: ((e: string | Error) => void) | undefined;

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0;
    onErrorHandler = undefined;
    g.wx = {
      request: jest.fn(),
      getSystemInfoSync: () => ({ brand: 'Apple', SDKVersion: '3' }),
      onError: jest.fn((h: (e: string | Error) => void) => {
        onErrorHandler = h;
      }),
      onUnhandledRejection: jest.fn(),
    };
  });

  afterEach(async () => {
    const c = getClient();
    if (c) await c.close(0);
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    delete g.wx;
  });

  it('wx.onError 触发 → core 上报 exception，mechanism.handled=false', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      transport: () => ({
        send: (env: any) => {
          captured.push(env);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    // GlobalHandlers.setupOnce 应已注册 wx.onError
    expect(typeof onErrorHandler).toBe('function');

    // 模拟平台抛出未处理错误
    onErrorHandler!('boom from platform');
    await flush(2000);

    const events = collectEvents(captured);
    const errEvent = events.find((e) => e.exception?.values?.length);
    expect(errEvent).toBeDefined();
    const val = errEvent.exception.values[0];
    expect(val.value).toContain('boom from platform');
    expect(val.mechanism).toEqual({ type: 'onerror', handled: false });
  });
});
