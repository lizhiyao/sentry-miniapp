import type { Envelope, OfflineStore, Transport } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConsentAwareOfflineTransport } from '../src/transports/consent';
import { createEventEnvelope } from './support/envelopes';

function createClientReportEnvelope(): Envelope {
  return [
    { sent_at: '2022-01-01T00:00:00.000Z' },
    [[{ type: 'client_report' }, { timestamp: 1640995200, discarded_events: [] }]],
  ];
}

describe('createConsentAwareOfflineTransport', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('未同意时同步缓存事件、丢弃 client report，并只 flush 底层请求', () => {
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

    transport.send(createClientReportEnvelope());
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

  it('已安排的重试遇到撤回同意时同步放回缓存且不发送网络', async () => {
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

    expect(store.unshift).toHaveBeenCalledWith(envelope);
    expect(baseTransport.send).not.toHaveBeenCalled();
  });
});
