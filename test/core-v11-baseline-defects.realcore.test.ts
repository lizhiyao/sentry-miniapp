import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, serializeEnvelope, type Envelope } from '@sentry/core';
import { MiniappClient } from '../src/client';
import { resetConsentState, setConsentGranted } from '../src/consent';
import { resetPlatformCache } from '../src/crossPlatform';
import { createMiniappOfflineStore } from '../src/transports/offlineStore';
import { assertDefined, createCapturingTransport, createEventEnvelope } from './support/envelopes';

/**
 * it.fails 断言的是期望契约，当前基线必须失败；将来修复后应改为普通 it。
 * CI 绿色仅表示复现仍成立，不表示这些缺陷已经修复。
 */
describe('#428 当前 SDK 缺陷复现（预期失败）', () => {
  let clients: MiniappClient[];
  let requests: any[];
  let storage: Record<string, string>;
  beforeEach(() => {
    vi.useFakeTimers();
    clients = [];
    requests = [];
    storage = {};
    (globalThis as any).wx = {
      request: vi.fn((options) => { requests.push(options); return { abort: vi.fn() }; }),
      setStorageSync: vi.fn((key: string, value: string) => { storage[key] = value; }),
      getStorageSync: vi.fn((key: string) => storage[key]),
    };
    resetPlatformCache();
    resetConsentState();
  });
  afterEach(async () => {
    for (const request of requests) request.success?.({ statusCode: 200, header: {} });
    for (const client of clients) await client.close(0);
    getCurrentScope().setClient(undefined);
    resetConsentState();
    vi.clearAllTimers();
  });

  function makeClient(requireConsent: boolean): MiniappClient {
    const client = new MiniappClient({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      requireConsent, enableOfflineCache: false, enableSystemInfo: false,
      transportOptions: { maxConcurrentRequests: 1 },
    });
    clients.push(client);
    return client;
  }

  it.fails('新建 B 不应解开 A 未获授权的 consent 网络门禁', async () => {
    const a = makeClient(true);
    makeClient(false);
    const transport = a.getTransport();
    assertDefined(transport);
    const pending = transport.send(createEventEnvelope('A without consent'));
    const started = requests.length;
    for (const request of requests) request.success?.({ statusCode: 200, header: {} });
    await pending;
    expect(started).toBe(0);
  });

  it.fails('撤回 consent 后，已经排在 host slot 队列里的请求不得再启动', async () => {
    const a = makeClient(true);
    setConsentGranted(true);
    const transport = a.getTransport();
    assertDefined(transport);
    const first = transport.send(createEventEnvelope('active'));
    const queued = transport.send(createEventEnvelope('queued'));
    expect(requests).toHaveLength(1);
    setConsentGranted(false);
    requests[0].success({ statusCode: 200, header: {} });
    // 允许 core offline transport 和宿主队列的 Promise 链完成，不依赖 timer。
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const started = requests.length;
    for (const request of requests.slice(1)) request.success?.({ statusCode: 200, header: {} });
    await Promise.all([first, queued]);
    expect(started).toBe(1);
  });

  it.fails('dispose 后直接 client.captureMessage 不得发起新遥测', async () => {
    const envelopes: Envelope[] = [];
    const client = new MiniappClient({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableOfflineCache: false, enableSystemInfo: false,
      transport: createCapturingTransport(envelopes),
    });
    clients.push(client);
    client.dispose();
    client.captureMessage('after dispose');
    await client.flush(100);
    expect(envelopes).toHaveLength(0);
  });

  it.fails('现有离线 store 必须保留 attachment Uint8Array 类型及线上 bytes', async () => {
    const envelope: Envelope = [
      { event_id: 'binary' },
      [[{ type: 'attachment', filename: 'probe.bin' }, new Uint8Array([0, 255, 10])]],
    ];
    const store = createMiniappOfflineStore({
      url: 'https://o0.ingest.sentry.io/api/0/envelope/',
      recordDroppedEvent: () => {},
    });
    await store.push(envelope);
    const restored = await store.shift();
    assertDefined(restored);
    expect(serializeEnvelope(restored)).toEqual(serializeEnvelope(envelope));
  });
});
