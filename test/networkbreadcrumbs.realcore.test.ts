import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flush,
  getClient,
  startSpan,
  type Envelope,
  type EventHint,
  type SpanJSON,
  type TransactionEvent,
} from '@sentry/core';
import { init } from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('NetworkBreadcrumbs（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];
  let requestMock: ReturnType<typeof vi.fn>;
  let savedWx: unknown;

  beforeEach(() => {
    captured = [];
    savedWx = g.wx;
    delete g.wx;
    resetPlatformCache();

    requestMock = vi.fn((options) => {
      options.success?.({ statusCode: 201, data: { ok: true }, header: {} });
      options.complete?.({ statusCode: 201 });
      return { abort: vi.fn() };
    });

    g.tt = {
      request: requestMock,
      getPerformance: vi.fn(() => ({ now: () => Date.now() * 1000 })),
      getSystemInfoSync: vi.fn(() => ({ platform: 'ios', hostName: 'Toutiao' })),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      onMemoryWarning: vi.fn(),
    };
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    delete g.tt;
    g.wx = savedWx;
    resetPlatformCache();
  });

  it('无 PerformanceObserver 和 active span 时上报独立 http.client segment span', async () => {
    const beforeSendSpan = vi.fn((span: SpanJSON) => span);
    const beforeSendTransaction = vi.fn((event: TransactionEvent, _hint: EventHint) => event);

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampler: () => true,
      tracePropagationTargets: ['api.example.com'],
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      beforeSendSpan,
      beforeSendTransaction,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({
      url: 'https://api.example.com/v1/login?token=secret',
      method: 'POST',
      data: '{}',
    });
    await flush(2000);

    const spans = collectEnvelopePayloads<SpanJSON>(captured, ['span']);
    expect(spans).toEqual([
      expect.objectContaining({
        description: 'POST https://api.example.com/v1/login',
        op: 'http.client',
        origin: 'auto.http.miniapp',
        is_segment: true,
        segment_id: expect.any(String),
        status: 'ok',
        data: expect.objectContaining({
          'http.request.method': 'POST',
          'http.response.status_code': 201,
          'url.full': 'https://api.example.com/v1/login?token=secret',
          'server.address': 'api.example.com',
        }),
      }),
    ]);
    expect(collectEnvelopePayloads(captured, ['transaction'])).toEqual([]);
    expect(beforeSendSpan).toHaveBeenCalledOnce();
    expect(beforeSendTransaction).not.toHaveBeenCalled();
    expect(requestMock.mock.calls[0]?.[0].header).toEqual(
      expect.objectContaining({
        'sentry-trace': expect.any(String),
        baggage: expect.stringContaining('sentry-'),
      }),
    );
  });

  it('有 active span 时仍把请求记录为现有 transaction 的子 span', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    startSpan({ name: 'game.login', op: 'ui.action' }, () => {
      g.tt.request({ url: 'https://api.example.com/v1/login', method: 'POST' });
    });
    await flush(2000);

    expect(collectEnvelopePayloads(captured, ['span'])).toEqual([]);
    expect(collectEnvelopePayloads<Event>(captured, ['transaction'])).toEqual([
      expect.objectContaining({
        transaction: 'game.login',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: 'POST https://api.example.com/v1/login',
            op: 'http.client',
            origin: 'auto.http.miniapp',
          }),
        ]),
      }),
    ]);
  });

  it('采样率为 0 时请求正常执行但不发送 span', async () => {
    const beforeSendSpan = vi.fn((span: SpanJSON) => span);

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 0,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      beforeSendSpan,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/health' });
    await flush(2000);

    expect(requestMock).toHaveBeenCalledOnce();
    expect(collectEnvelopePayloads(captured, ['span', 'transaction'])).toEqual([]);
    expect(beforeSendSpan).not.toHaveBeenCalled();
  });

  it('关闭独立 HTTP span 后，无 active span 的请求不发送 span envelope', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableStandaloneHttpSpans: false,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/health' });
    await flush(2000);

    expect(requestMock).toHaveBeenCalledOnce();
    expect(collectEnvelopePayloads(captured, ['span', 'transaction'])).toEqual([]);
  });

  it('请求失败时把错误原因写入独立 span，并标记为失败', async () => {
    requestMock.mockImplementationOnce((options) => {
      const error = { errMsg: 'request:fail timeout' };
      options.fail?.(error);
      options.complete?.(error);
      return { abort: vi.fn() };
    });

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/timeout' });
    await flush(2000);

    const spans = collectEnvelopePayloads<SpanJSON>(captured, ['span']);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual(
      expect.objectContaining({
        op: 'http.client',
        is_segment: true,
        data: expect.objectContaining({
          'error.message': 'request:fail timeout',
        }),
      }),
    );
    expect(spans[0]?.status).toBe('request:fail timeout');
  });

  it('HTTP 5xx 响应保留状态码，并把独立 span 标记为失败', async () => {
    requestMock.mockImplementationOnce((options) => {
      const response = { statusCode: 503, data: { ok: false }, header: {} };
      options.success?.(response);
      options.complete?.(response);
      return { abort: vi.fn() };
    });

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/unavailable' });
    await flush(2000);

    const spans = collectEnvelopePayloads<SpanJSON>(captured, ['span']);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.data).toEqual(
      expect.objectContaining({
        'http.response.status_code': 503,
      }),
    );
    expect(spans[0]?.status).toBe('unavailable');
  });
});
