import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { getClient, flush, installedIntegrations } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init } from '../src/index';

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

describe('TryCatch（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: any[];
  let realSetTimeout: any;

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0;
    realSetTimeout = g.setTimeout;
    g.wx = {
      request: jest.fn(),
      getSystemInfoSync: () => ({ brand: 'Apple', SDKVersion: '3' }),
      onError: jest.fn(),
      onUnhandledRejection: jest.fn(),
    };
  });

  afterEach(async () => {
    g.setTimeout = realSetTimeout;
    const c = getClient();
    if (c) await c.close(0);
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    delete g.wx;
  });

  it('被包装的 setTimeout 回调抛错 → core 上报，带 instrument mechanism', async () => {
    // 同步桩替换 setTimeout，让 TryCatch 的包装与回调执行都同步发生，便于确定性断言。
    g.setTimeout = (cb: (...a: any[]) => any) => {
      cb();
      return 0 as any;
    };

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      enableOfflineCache: false,
      transport: () => ({
        send: (env: any) => {
          captured.push(env);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    // 经 TryCatch 包装的 setTimeout：回调抛错被 wrap 捕获上报后 re-throw，故 try 包住
    expect(() => {
      g.setTimeout(() => {
        throw new Error('timer boom');
      });
    }).toThrow('timer boom');

    await flush(2000);

    const events = collectEvents(captured);
    const errEvent = events.find((e) =>
      e.exception?.values?.some((v: any) => v.value?.includes('timer boom')),
    );
    expect(errEvent).toBeDefined();

    // wrap() 通过 scope event processor 给事件打上 instrument mechanism，并塞入 extra.arguments。
    // mechanism 必须落在标准位置 exception.values[].mechanism（Sentry 后端读这里），
    // 而非容器级 exception.mechanism——后者后端读不到，等于没标记。
    const val = errEvent.exception.values.find((v: any) => v.value?.includes('timer boom'));
    expect(val.mechanism?.type).toBe('instrument');
    expect(val.mechanism?.handled).toBe(true);
    expect((errEvent.exception as any).mechanism).toBeUndefined(); // 不再误挂容器级
    expect(Array.isArray(errEvent.extra?.arguments)).toBe(true);
  });
});
