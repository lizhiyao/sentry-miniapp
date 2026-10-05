import type { Envelope, OfflineStore, Transport } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConsentAwareOfflineTransport, getTransportRuntime } from '../src/transports/consent';
import { createEventEnvelope } from './support/envelopes';

function createClientReportEnvelope(): Envelope {
  return [
    { sent_at: '2022-01-01T00:00:00.000Z' },
    [[{ type: 'client_report' }, { timestamp: 1640995200, discarded_events: [] }]],
  ];
}

describe('createConsentAwareOfflineTransport', () => {
  it('core retry failure reinserts through the same store rather than a second offline wrapper', async () => {
    vi.useFakeTimers();
    let queued: Envelope | undefined = createEventEnvelope('retry');
    const store: OfflineStore = {
      push: vi.fn(() => Promise.resolve()),
      unshift: vi.fn((envelope) => {
        queued = envelope;
        return Promise.resolve();
      }),
      shift: vi.fn(() => {
        const next = queued;
        queued = undefined;
        return Promise.resolve(next);
      }),
    };
    const send = vi.fn(() => Promise.reject(new Error('network unavailable')));
    const transport = createConsentAwareOfflineTransport(
      { send, flush: () => Promise.resolve(true) },
      { url: 'https://example.com/', recordDroppedEvent: vi.fn() },
      store,
      () => true,
    );
    getTransportRuntime(transport)!.requestReplay();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledOnce();
    expect(store.unshift).toHaveBeenCalledOnce();
    expect(store.push).not.toHaveBeenCalled();
    expect(queued?.[0].event_id).toBe('retry');
  });

  it('独立 runtime handle 可暂停、恢复及永久停止重放，正 timeout flush 不代替 replay 请求', async () => {
    vi.useFakeTimers();
    const queued = [createEventEnvelope('first'), createEventEnvelope('second')];
    const store: OfflineStore = {
      push: vi.fn(() => Promise.resolve()),
      unshift: vi.fn(() => Promise.resolve()),
      shift: vi.fn(() => Promise.resolve(queued.shift())),
    };
    const base: Transport = {
      send: vi.fn(() => Promise.resolve({ statusCode: 200 })),
      flush: vi.fn(() => Promise.resolve(true)),
    };
    const transport = createConsentAwareOfflineTransport(
      base,
      { url: 'https://example.com/', recordDroppedEvent: vi.fn() },
      store,
      () => true,
    );
    const runtime = getTransportRuntime(transport)!;
    expect(Object.keys(transport).sort()).toEqual(['flush', 'send']);
    await transport.flush(10);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.shift).not.toHaveBeenCalled();
    runtime.requestReplay();
    runtime.stopReplay();
    await vi.advanceTimersByTimeAsync(100);
    expect(store.shift).not.toHaveBeenCalled();
    runtime.requestReplay();
    await vi.advanceTimersByTimeAsync(100);
    expect(base.send).toHaveBeenCalledOnce();
    runtime.shutdown();
    runtime.requestReplay();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.shift).toHaveBeenCalledOnce();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('未同意时同步缓存事件，client report 不缓存且拒绝可观察', async () => {
    const store: OfflineStore = {
      push: vi.fn(() => Promise.resolve()),
      unshift: vi.fn(() => Promise.resolve()),
      shift: vi.fn(() => Promise.resolve(undefined)),
    };
    const baseTransport: Transport = {
      send: vi.fn(() => Promise.resolve({ statusCode: 200 })),
      flush: vi.fn(() => Promise.resolve(true)),
    };
    const transport = createConsentAwareOfflineTransport(
      baseTransport,
      { url: 'https://o0.ingest.sentry.io/api/0/envelope/', recordDroppedEvent: vi.fn() },
      store,
      () => false,
    );

    transport.send(createEventEnvelope('blocked-event'));
    expect(store.push).toHaveBeenCalledTimes(1);
    expect(baseTransport.send).not.toHaveBeenCalled();

    await expect(transport.send(createClientReportEnvelope())).rejects.toThrow('shouldSend');
    expect(store.push).toHaveBeenCalledTimes(1);

    transport.flush(10);
    expect(baseTransport.flush).toHaveBeenCalledWith(10);
  });

  it('已同意时同步调用底层 transport', () => {
    const store: OfflineStore = {
      push: vi.fn(() => Promise.resolve()),
      unshift: vi.fn(() => Promise.resolve()),
      shift: vi.fn(() => Promise.resolve(undefined)),
    };
    const baseTransport: Transport = {
      send: vi.fn(() => Promise.resolve({ statusCode: 200 })),
      flush: vi.fn(() => Promise.resolve(true)),
    };
    const transport = createConsentAwareOfflineTransport(
      baseTransport,
      { url: 'https://o0.ingest.sentry.io/api/0/envelope/', recordDroppedEvent: vi.fn() },
      store,
      () => true,
    );
    const envelope = createEventEnvelope('granted-event');

    transport.send(envelope);
    expect(baseTransport.send).toHaveBeenCalledWith(envelope);

    transport.flush(20);
    expect(baseTransport.flush).toHaveBeenCalledWith(20);
  });

  it('已安排的重试遇到撤回同意时不消费缓存且不发送网络', async () => {
    vi.useFakeTimers();
    const envelope = createEventEnvelope('revoked-before-retry');
    let granted = true;
    const store: OfflineStore = {
      push: vi.fn(() => Promise.resolve()),
      unshift: vi.fn(() => Promise.resolve()),
      shift: vi.fn(() => Promise.resolve(envelope)),
    };
    const baseTransport: Transport = {
      send: vi.fn(() => Promise.resolve({ statusCode: 200 })),
      flush: vi.fn(() => Promise.resolve(true)),
    };
    const transport = createConsentAwareOfflineTransport(
      baseTransport,
      { url: 'https://o0.ingest.sentry.io/api/0/envelope/', recordDroppedEvent: vi.fn() },
      store,
      () => granted,
    );

    transport.flush();
    granted = false;
    await vi.advanceTimersByTimeAsync(100);

    expect(store.shift).not.toHaveBeenCalled();
    expect(store.unshift).not.toHaveBeenCalled();
    expect(baseTransport.send).not.toHaveBeenCalled();
  });
});
