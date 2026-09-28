import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getClient,
  makeOfflineTransport,
  startInactiveSpan,
  type Envelope,
  type SerializedStreamedSpanContainer,
} from '@sentry/core';
import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { createMiniappTransport } from '../src/transports/xhr';
import { resetPlatformCache } from '../src/crossPlatform';
import { init } from '../src/index';
import {
  assertDefined,
  collectSpanItems,
  createCapturingTransport,
  createEventEnvelope,
} from './support/envelopes';

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

  it('core 11 的 span/v2 envelope 落入离线缓存，恢复后按原 item 头重发', async () => {
    // stream 生命周期下 span 是流量主体之一；离线缓存按 item 类型决定淘汰优先级（错误优先保留），
    // 且重发必须带回报文 item 头，否则 Sentry 认不出这个 item。这条接缝此前只用手写的 event
    // envelope 覆盖过，span/v2 容器没测过。
    // 本文件的其余用例用假定时器跑 core 的重试调度；这条要驱动真实 client（close 会轮询
    // 处理队列），假定时器会和轮询互相等死，所以整条改回真定时器。
    vi.useRealTimers();

    const produced: Envelope[] = [];
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(produced),
    } as any);

    startInactiveSpan({ name: 'offline.probe', parentSpan: null }).end();
    // client.flush() 会同步排空 SpanStreaming 的 span buffer，不需要等它的 500ms 定时器。
    await getClient()?.flush();

    const spanEnvelope = produced.find((envelope) =>
      envelope[1].some(([header]) => header.type === 'span'),
    );
    assertDefined(spanEnvelope, '未产出 span envelope');

    const resent: Envelope[] = [];
    let online = false;
    const baseSend = vi.fn((envelope: Envelope) => {
      if (!online) {
        return Promise.reject(new Error('network down'));
      }
      resent.push(envelope);
      return Promise.resolve({ statusCode: 200 });
    });

    const offline = makeOfflineTransport(
      () => ({ send: baseSend, flush: () => Promise.resolve(true) }) as any,
    )({
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
      createStore: (options: any) => createMiniappOfflineStore(options),
      flushAtStartup: false,
    } as any);

    await offline.send(spanEnvelope);
    expect(baseSend).toHaveBeenCalledOnce();
    // 落盘的序列化文本必须保留 span/v2 的 item 头
    expect(mem[OFFLINE_KEY]).toContain('application/vnd.sentry.items.span.v2+json');

    online = true;
    await offline.flush();
    // makeOfflineTransport 的取回重发经过一次 MIN_DELAY 调度
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(resent).toHaveLength(1);
    const spanItem = collectSpanItems(resent);
    expect(spanItem).toHaveLength(1);
    assertDefined(spanItem[0]);
    expect(spanItem[0].header).toEqual(
      expect.objectContaining({
        type: 'span',
        content_type: 'application/vnd.sentry.items.span.v2+json',
      }),
    );
    expect((spanItem[0].body as SerializedStreamedSpanContainer).items[0].name).toBe(
      'offline.probe',
    );

    await getClient()?.close(0);
  });
});
