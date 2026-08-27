import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { makeOfflineTransport } from '@sentry/core';
import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { createMiniappTransport } from '../src/transports/xhr';
import { resetPlatformCache } from '../src/crossPlatform';
import { createEventEnvelope } from './support/envelopes';

/**
 * 离线缓存的真 @sentry/core 集成验证：把本 SDK 的 createMiniappOfflineStore 接到 core 的
 * makeOfflineTransport 上，确认「底层 send 失败 → envelope 真落进小程序 storage」这条接缝跑通，
 * 以及恢复后能从 storage 取回重发。store 本身的增删改另由 offlineStore.test 覆盖。
 */
const OFFLINE_KEY = 'sentry_offline_store';

describe('离线缓存（真 makeOfflineTransport + 小程序 store）', () => {
  const g = global as any;
  let mem: Record<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    mem = {};
    g.wx = {
      setStorageSync: vi.fn((k: string, v: string) => {
        mem[k] = v;
      }),
      getStorageSync: vi.fn((k: string) => mem[k]),
      removeStorageSync: vi.fn((k: string) => {
        delete mem[k];
      }),
      request: vi.fn(),
    };
    resetPlatformCache();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete g.wx;
    resetPlatformCache();
  });

  it('底层 send 失败 → envelope 落入小程序 storage', async () => {
    const baseSend = vi.fn(() => Promise.reject(new Error('network down')));
    const makeBase = () => ({ send: baseSend, flush: () => Promise.resolve(true) });

    const offline = makeOfflineTransport(makeBase as any)({
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
      createStore: (o: any) => createMiniappOfflineStore(o),
      flushAtStartup: false,
    } as any);

    await offline.send(createEventEnvelope('off-1'));

    // 底层确实尝试发送但失败，envelope 被存进我们的小程序 store
    expect(baseSend).toHaveBeenCalled();
    expect(mem[OFFLINE_KEY]).toBeDefined();
    expect(mem[OFFLINE_KEY]).toContain('off-1');
  });

  it('内置请求超时并 abort 后，envelope 落入小程序 storage', async () => {
    const abort = vi.fn();
    g.wx.request = vi.fn(() => ({ abort }));
    resetPlatformCache();

    const offline = makeOfflineTransport((options: any) =>
      createMiniappTransport({ ...options, requestTimeout: 10 }),
    )({
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
      createStore: (o: any) => createMiniappOfflineStore(o),
      flushAtStartup: false,
    } as any);

    const sendPromise = offline.send(createEventEnvelope('timeout-1'));
    await vi.advanceTimersByTimeAsync(10);
    await sendPromise;

    expect(abort).toHaveBeenCalledTimes(1);
    expect(mem[OFFLINE_KEY]).toBeDefined();
    expect(mem[OFFLINE_KEY]).toContain('timeout-1');
  });

  it('storage 中已有积压 → 恢复后经 makeOfflineTransport 取回重发', async () => {
    // 预置一条积压（新格式：{envelope, timestamp}[]）
    mem[OFFLINE_KEY] = JSON.stringify([
      { envelope: createEventEnvelope('queued-1'), timestamp: 1640995200000 },
    ]);

    const sent: any[] = [];
    const baseSend = vi.fn((env: any) => {
      sent.push(env);
      return Promise.resolve({ statusCode: 200 });
    });
    const makeBase = () => ({ send: baseSend, flush: () => Promise.resolve(true) });

    const offline = makeOfflineTransport(makeBase as any)({
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
      createStore: (o: any) => createMiniappOfflineStore(o),
      flushAtStartup: false,
    } as any);

    // 主动触发 flush：transport.flush() 用 MIN_DELAY(100ms) 排一次取回重发
    // （flushAtStartup 走 START_DELAY=5s，太慢不适合单测）。
    void offline.flush();
    await vi.runOnlyPendingTimersAsync();

    // 积压的 envelope 被取回并通过底层 send 重发
    expect(baseSend).toHaveBeenCalled();
    const resent = sent.find(
      (env) => Array.isArray(env) && env[0] && env[0].event_id === 'queued-1',
    );
    expect(resent).toBeDefined();
  });
});
