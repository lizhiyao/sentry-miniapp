import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getClient, flush, captureException, installedIntegrations } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init, wrap as sdkWrap } from '../src/index';

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
  let realRequestAnimationFrame: any;
  let onErrorHandler: ((e: unknown) => void) | undefined;

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0;
    realSetTimeout = g.setTimeout;
    realRequestAnimationFrame = g.requestAnimationFrame;
    onErrorHandler = undefined;
    g.wx = {
      request: vi.fn(),
      getSystemInfoSync: () => ({ brand: 'Apple', SDKVersion: '3' }),
      onError: vi.fn((h: (e: unknown) => void) => {
        onErrorHandler = h;
      }),
      onUnhandledRejection: vi.fn(),
    };
  });

  afterEach(async () => {
    g.setTimeout = realSetTimeout;
    if (realRequestAnimationFrame === undefined) {
      delete g.requestAnimationFrame;
    } else {
      g.requestAnimationFrame = realRequestAnimationFrame;
    }
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
    expect(val.mechanism?.handled).toBe(false);
    expect((errEvent.exception as any).mechanism).toBeUndefined(); // 不再误挂容器级
    expect(Array.isArray(errEvent.extra?.arguments)).toBe(true);
  });

  it('requestAnimationFrame 抛错 359ms 后按最终事件类型和消息去重', async () => {
    g.requestAnimationFrame = (callback: () => void) => callback();

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      enableOfflineCache: false,
      enableMinigameFrameRate: false,
      transport: () => ({
        send: (env: any) => {
          captured.push(env);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    let now = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const message = "Cannot read properties of null (reading 'TryChangeDataUserBySystemInit')";
    const error = new TypeError(message);
    // 部分 Cocos / 微信运行时 Error 最终会被 core 通过 constructor.name 识别为
    // TypeError，但捕获瞬间的 name 和 stack 首行并不携带类型。
    error.name = '';
    error.stack = [
      message,
      'at o.OnInit (engine/game.js:10555:48)',
      'at s.InvokeInit (engine/game.js:58020:2130)',
    ].join('\n');

    try {
      expect(() => {
        g.requestAnimationFrame(() => {
          throw error;
        });
      }).toThrow(message);

      // 微信真机在卡顿后可能延迟到后续任务才触发 onError，并把业务首帧替换成宿主 / SDK 包装帧。
      now += 359;
      onErrorHandler!({
        message: [
          'MiniProgramError',
          message,
          `TypeError: ${message}`,
          'at sentryWrapped (sentry-miniapp.js:100:20)',
          'at dispatchError (WAGameSubContext.js:1:200000)',
          'at reportError (WAGame.js:1:300000)',
        ].join('\n'),
        stack: '',
      });
    } finally {
      nowSpy.mockRestore();
    }
    await flush(2000);

    const events = collectEvents(captured).filter((event) =>
      event.exception?.values?.some((value: any) => value.value === message),
    );
    expect(events).toHaveLength(1);
    expect(events[0].exception.values[0].type).toBe('TypeError');
    expect(events[0].exception.values[0].mechanism).toMatchObject({
      type: 'instrument',
      handled: false,
    });
  });

  it('公开 wrap 重新抛出的错误也按事件层去重', async () => {
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

    const wrapped = sdkWrap(() => {
      throw new TypeError('public wrap boom');
    });
    expect(() => wrapped()).toThrow('public wrap boom');
    onErrorHandler!('MiniProgramError\npublic wrap boom\nTypeError: public wrap boom');
    await flush(2000);

    const events = collectEvents(captured).filter((event) =>
      event.exception?.values?.some((value: any) => value.value === 'public wrap boom'),
    );
    expect(events).toHaveLength(1);
    expect(events[0].exception.values[0].mechanism).toMatchObject({
      type: 'instrument',
      handled: false,
      data: { function: 'wrap' },
    });
  });

  it('Error.cause 链按官方 LinkedErrors 语义保留未处理标记', async () => {
    // 官方 LinkedErrors 在 preprocessEvent 阶段把 cause prepend 到 exception.values；
    // core 随后把 capture hint 的 instrument mechanism 施加到 values[0]（root cause）。
    // 父异常保留 generic / linked-errors 元数据，但整个事件仍有 handled=false，会被计为 crash。
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
    expect(outer.mechanism?.type).toBe('generic');
    expect(outer.mechanism?.handled).toBe(true);
    expect(root.mechanism?.type).toBe('instrument');
    expect(root.mechanism?.handled).toBe(false);
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
    expect(ev.exception.values[0].mechanism).toEqual({
      handled: true,
      type: 'generic',
    });
    expect(ev.extra?.arguments).toBeUndefined();
  });
});
