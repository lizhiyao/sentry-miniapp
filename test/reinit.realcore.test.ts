import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getClient, installedIntegrations } from '@sentry/core';
import { init } from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';

/**
 * F2：close() 后再 init() 必须能重新 setupOnce。
 *
 * core 用进程级 installedIntegrations（按 name 记、从不清除）门禁 setupOnce。close() 的
 * cleanup 仅还原补丁，若不同时把名从门禁移除，二次 init 会跳过 setup → 全局错误处理、
 * 面包屑、网络等集成静默哑火，init() 却返回一个看似健康的 client。
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
      onError: jest.fn(),
      onUnhandledRejection: jest.fn(),
      getSystemInfoSync: () => ({}),
      request: jest.fn(),
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
    // init#1：GlobalHandlers.setupOnce 注册 wx.onError
    expect((g.wx.onError as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);

    await getClient()!.close(0);
    (g.wx.onError as jest.Mock).mockClear();

    init(makeOpts() as any);
    // 修复前：'GlobalHandlers' 仍在 installedIntegrations 门禁里 → setupOnce 跳过 →
    // onError 不再注册（集成哑火）。修复后 close() 已把名移除 → 重新注册。
    expect(g.wx.onError).toHaveBeenCalled();
  });
});
