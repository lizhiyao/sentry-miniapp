import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { getClient, installedIntegrations } from '@sentry/core';
import type { Envelope, Event } from '@sentry/core';
import { init } from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

/**
 * F2：close() 后再 init() 必须能通过 setup(client) 重新挂载。
 *
 * core 用进程级 installedIntegrations 门禁 setupOnce，SDK 不应篡改这个全局数组。
 * 需要回收的副作用改由每个 client 的 setup(client) / registerCleanup 配对管理。
 */
describe('close → re-init 重新挂载（F2）', () => {
  const g = global as any;
  const envelopes: Envelope[] = [];

  const makeOpts = () => ({
    dsn: 'https://test@o0.ingest.sentry.io/0',
    enableAutoSessionTracking: false,
    transport: createCapturingTransport(envelopes),
  });

  beforeEach(() => {
    resetPlatformCache();
    _resetAppLifecycle();
    envelopes.length = 0;
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
    // 宿主监听由每个 client 的 setup 安装；无需空 setupOnce 占位。
    expect((g.wx.onError as Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(getClient()!.getIntegrationByName('GlobalHandlers')).toBeDefined();
    const firstHandler = (g.wx.onError as Mock).mock.calls[0]![0] as (error: Error) => void;
    firstHandler(new Error('first client error'));
    expect(await getClient()!.flush(100)).toBe(true);
    const setupOnceRecords = [...installedIntegrations];

    await getClient()!.close(0);
    // close 不应修改 core 的进程级 setupOnce 记录。
    expect(installedIntegrations).toEqual(setupOnceRecords);
    (g.wx.onError as Mock).mockClear();

    init(makeOpts() as any);
    // 新监听生效，缺少 offError 的宿主保留的旧监听也不能污染新 client。
    expect(g.wx.onError).toHaveBeenCalled();
    expect(getClient()!.getIntegrationByName('GlobalHandlers')).toBeDefined();
    firstHandler(new Error('retired client error'));
    const secondHandler = (g.wx.onError as Mock).mock.calls[0]![0] as (error: Error) => void;
    secondHandler(new Error('second client error'));
    expect(await getClient()!.flush(100)).toBe(true);
    expect(installedIntegrations).toEqual(setupOnceRecords);
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).map(
        (event) => event.exception?.values?.[0]?.value,
      ),
    ).toEqual(['first client error', 'second client error']);
  });
});
