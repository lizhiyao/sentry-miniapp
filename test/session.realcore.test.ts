import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { getClient, flush } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init } from '../src/index';

/**
 * Session 的真 @sentry/core 端到端验证。
 *
 * 同时锁两件事，防止悄悄回归：
 * - F2：Session 经全局 `App.onLaunch` 真正启动（历史上曾因找 `wx.App` 而恒不生效）。
 * - F1：未处理错误（mechanism.handled=false）由 core 自动把 Session 标记为 crashed，
 *   故 SessionIntegration 删掉那段恒为 no-op 的 onError 手动标记后，crashed 仍照常上报。
 */
describe('Session（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: any[];
  let savedApp: any;

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    savedApp = g.App;
    g.wx = {
      request: jest.fn(),
      getSystemInfoSync: jest.fn(() => ({ brand: 'Apple', SDKVersion: '3.1.0' })),
      onError: jest.fn(),
      onUnhandledRejection: jest.fn(),
      getNetworkType: jest.fn(),
    };
    // 提供全局 App，让 appLifecycle 能包装；原 App 被调用时回放 onLaunch（模拟平台触发）。
    g.App = jest.fn((opts: any) => {
      if (opts && typeof opts.onLaunch === 'function') opts.onLaunch({});
    });
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    g.App = savedApp;
    _resetAppLifecycle();
    resetPlatformCache();
    delete g.wx;
  });

  function collectSessions(): any[] {
    const sessions: any[] = [];
    for (const env of captured) {
      const items = env[1] as any[];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const header = item[0];
        if (header && header.type === 'session') sessions.push(item[1]);
      }
    }
    return sessions;
  }

  it('App.onLaunch 启动 Session，未处理错误经 core 自动标记 crashed', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      release: 'test@1.0.0',
      enableAutoSessionTracking: true,
      transport: () => ({
        send: (envelope: any) => {
          captured.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    // 平台注册 App → wrapper 注入并回放 onLaunch → SessionIntegration 开启 Session。
    (globalThis as any).App({ onLaunch: jest.fn() });
    await flush(2000);

    const afterLaunch = collectSessions();
    // F2：Session 确实通过全局 App 启动并上报（若回退到旧 wx.App 死路，这里会是 0）。
    expect(afterLaunch.length).toBeGreaterThanOrEqual(1);
    expect(afterLaunch.some((s) => s.status !== 'crashed')).toBe(true);

    // 模拟未处理错误（GlobalHandlers 上报的形态：mechanism.handled=false）。
    getClient()?.captureEvent({
      exception: {
        values: [{ type: 'Error', value: 'boom', mechanism: { handled: false, type: 'onerror' } }],
      },
    } as any);
    await flush(2000);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // F1：core 自动把当前 Session 标记为 crashed 并补发，无需本集成手动钩子。
    expect(collectSessions().some((s) => s.status === 'crashed')).toBe(true);
  });
});
