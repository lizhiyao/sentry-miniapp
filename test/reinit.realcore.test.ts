import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { getClient, installedIntegrations } from '@sentry/core';
import { init } from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';

/**
 * F2：close() 后再 init() 必须能通过 setup(client) 重新挂载。
 *
 * core 用进程级 installedIntegrations 门禁 setupOnce，SDK 不应篡改这个全局数组。
 * 需要回收的副作用改由每个 client 的 setup(client) / registerCleanup 配对管理。
 */
describe('close → re-init 重新挂载（F2）', () => {
  const g = global as any;

  const makeOpts = () => ({
    dsn: 'https://test@o0.ingest.sentry.io/0',
    enableAutoSessionTracking: false,
    transport: () => ({
      send: () => Promise.resolve({ statusCode: 200 }),
      flush: () => Promise.resolve(true),
    }),
  });

  beforeEach(() => {
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0; // 模拟全新进程
    g.wx = {
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      getSystemInfoSync: () => ({}),
      request: vi.fn(),
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

  it('init → close → init 后全局错误处理重新注册', async () => {
    init(makeOpts() as any);
    // init#1：GlobalHandlers.setupOnce + setup(client) 注册 wx.onError
    expect((g.wx.onError as Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(installedIntegrations).toContain('GlobalHandlers');

    await getClient()!.close(0);
    // close 不应修改 core 的进程级 setupOnce 记录。
    expect(installedIntegrations).toContain('GlobalHandlers');
    (g.wx.onError as Mock).mockClear();

    init(makeOpts() as any);
    // setupOnce 被 core 跳过，但新 client 的 setup(client) 仍会执行。
    expect(g.wx.onError).toHaveBeenCalled();
  });
});
