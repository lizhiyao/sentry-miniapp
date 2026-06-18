import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { getClient, flush, captureException, installedIntegrations } from '@sentry/core';
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

  it('Error.cause 链存在时，instrument mechanism 标在原始抛错而非 cause', async () => {
    // LinkedErrors 是 client event processor，会先把 cause 链 prepend 到 exception.values。
    // wrap() 的 mechanism 必须经 captureException hint 交给 core 在这之前处理；若在 scope
    // processor 阶段手写 values[0]，这里会误标到 root cause 上。
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

    expect(() => {
      g.setTimeout(() => {
        const root = new Error('root cause');
        const outer = new Error('outer timer boom') as Error & { cause?: Error };
        outer.cause = root;
        throw outer;
      });
    }).toThrow('outer timer boom');

    await flush(2000);

    const events = collectEvents(captured);
    const errEvent = events.find((e) =>
      e.exception?.values?.some((v: any) => v.value?.includes('outer timer boom')),
    );
    expect(errEvent).toBeDefined();

    const values = errEvent.exception.values;
    const root = values.find((v: any) => v.value?.includes('root cause'));
    const outer = values.find((v: any) => v.value?.includes('outer timer boom'));
    expect(root).toBeDefined();
    expect(outer).toBeDefined();
    expect(outer.mechanism?.type).toBe('instrument');
    expect(outer.mechanism?.handled).toBe(true);
    expect(root.mechanism?.type).not.toBe('instrument');
  });

  it('包装处理器不泄漏：后续 unrelated 错误不被误标 instrument', async () => {
    // 防回归：wrap() 必须用 withScope 把 mechanism 处理器限定在本次 capture，
    // 若退回 getCurrentScope().addEventProcessor，处理器会常驻并污染之后每个事件——
    // 把未处理错误误标成 handled:true，进而虚高 crash-free 率。
    const captured: any[] = [];
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

    // 先触发一次被包装回调抛错（注册了 instrument mechanism 处理器）
    expect(() => {
      g.setTimeout(() => {
        throw new Error('wrapped boom');
      });
    }).toThrow('wrapped boom');

    // 之后一个完全 unrelated 的直接 capture
    captureException(new Error('unrelated later error'));
    await flush(2000);

    const ev = collectEvents(captured).find((e) =>
      e.exception?.values?.some((v: any) => v.value?.includes('unrelated later error')),
    );
    expect(ev).toBeDefined();
    // 不被上一次 wrap 的 mechanism / arguments 污染
    expect(ev.exception.values[0].mechanism).toBeUndefined();
    expect(ev.extra?.arguments).toBeUndefined();
  });
});
