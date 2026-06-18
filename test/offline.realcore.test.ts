import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { makeOfflineTransport } from '@sentry/core';
import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { resetPlatformCache } from '../src/crossPlatform';

/**
 * 离线缓存的真 @sentry/core 集成验证：把本 SDK 的 createMiniappOfflineStore 接到 core 的
 * makeOfflineTransport 上，确认「底层 send 失败 → envelope 真落进小程序 storage」这条接缝跑通，
 * 以及恢复后能从 storage 取回重发。store 本身的增删改另由 offlineStore.test 覆盖。
 */
const OFFLINE_KEY = 'sentry_offline_store';

function makeEnvelope(id: string): any {
  return [
    { event_id: id, sent_at: '2022-01-01T00:00:00.000Z' },
    [[{ type: 'event' }, { event_id: id }]],
  ];
}

describe('离线缓存（真 makeOfflineTransport + 小程序 store）', () => {
  const g = global as any;
  let mem: Record<string, string>;

  beforeEach(() => {
    mem = {};
    g.wx = {
      setStorageSync: jest.fn((k: string, v: string) => {
        mem[k] = v;
      }),
      getStorageSync: jest.fn((k: string) => mem[k]),
      removeStorageSync: jest.fn((k: string) => {
        delete mem[k];
      }),
      request: jest.fn(),
    };
    resetPlatformCache();
  });

  afterEach(() => {
    delete g.wx;
    resetPlatformCache();
  });

  it('底层 send 失败 → envelope 落入小程序 storage', async () => {
    const baseSend = jest.fn(() => Promise.reject(new Error('network down')));
    const makeBase = () => ({ send: baseSend, flush: () => Promise.resolve(true) });

    const offline = makeOfflineTransport(makeBase as any)({
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
      createStore: (o: any) => createMiniappOfflineStore(o),
      flushAtStartup: false,
    } as any);

    await offline.send(makeEnvelope('off-1') as any);
    await new Promise((r) => setTimeout(r, 20));

    // 底层确实尝试发送但失败，envelope 被存进我们的小程序 store
    expect(baseSend).toHaveBeenCalled();
    expect(mem[OFFLINE_KEY]).toBeDefined();
    expect(mem[OFFLINE_KEY]).toContain('off-1');
  });

  it('storage 中已有积压 → 恢复后经 makeOfflineTransport 取回重发', async () => {
    // 预置一条积压（新格式：{envelope, timestamp}[]）
    mem[OFFLINE_KEY] = JSON.stringify([{ envelope: makeEnvelope('queued-1'), timestamp: 1640995200000 }]);

    const sent: any[] = [];
    const baseSend = jest.fn((env: any) => {
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
    await new Promise((r) => setTimeout(r, 300));

    // 积压的 envelope 被取回并通过底层 send 重发
    expect(baseSend).toHaveBeenCalled();
    const resent = sent.find(
      (env) => Array.isArray(env) && env[0] && env[0].event_id === 'queued-1',
    );
    expect(resent).toBeDefined();
  });
});
