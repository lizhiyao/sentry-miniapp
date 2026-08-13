import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  createMiniappTransport,
  DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS,
  DEFAULT_TRANSPORT_REQUEST_TIMEOUT,
} from '../src/transports/xhr';
import { Envelope } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';

const SENTRY_ENVELOPE_CONTENT_TYPE = 'application/x-sentry-envelope';

describe('Transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMiniappTransport', () => {
    it('should create transport that makes successful HTTP request', async () => {
      const mockRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          statusCode: 200,
          data: 'OK',
          header: {},
        });
      });
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: () => {},
      });

      // Create a proper envelope format
      const envelope: Envelope = [
        { event_id: 'test-id', sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'test message', event_id: 'test-id' }]],
      ];

      const response = await transport.send(envelope as any);

      expect(mockRequest).toHaveBeenCalledWith({
        url: 'https://sentry.io/api/123/store/',
        method: 'POST',
        data: expect.any(String),
        header: {
          'Content-Type': SENTRY_ENVELOPE_CONTENT_TYPE,
        },
        headers: {
          'Content-Type': SENTRY_ENVELOPE_CONTENT_TYPE,
        },
        timeout: DEFAULT_TRANSPORT_REQUEST_TIMEOUT,
        success: expect.any(Function),
        fail: expect.any(Function),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers).toBeDefined();
    });

    it('aborts a hanging request at the default timeout to release the network slot', async () => {
      jest.useFakeTimers();
      const abort = jest.fn();
      const mockRequest = jest.fn(() => ({ abort }));
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      try {
        const transport = createMiniappTransport({
          url: 'https://sentry.io/api/123/envelope/',
          recordDroppedEvent: () => {},
        });
        const envelope: Envelope = [
          { event_id: 'timeout', sent_at: '2022-01-01T00:00:00.000Z' },
          [[{ type: 'event' }, { message: 'timeout', event_id: 'timeout' }]],
        ];

        const rejection = expect(transport.send(envelope as any)).rejects.toThrow(
          `Sentry request timed out after ${DEFAULT_TRANSPORT_REQUEST_TIMEOUT}ms`,
        );
        await jest.advanceTimersByTimeAsync(DEFAULT_TRANSPORT_REQUEST_TIMEOUT);

        await rejection;
        expect(abort).toHaveBeenCalledTimes(1);
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    it('uses a custom request timeout and ignores the fail callback triggered by abort', async () => {
      jest.useFakeTimers();
      let requestOptions: any;
      const abort = jest.fn(() => requestOptions.fail({ errMsg: 'request:fail abort' }));
      const mockRequest = jest.fn((options) => {
        requestOptions = options;
        return { abort };
      });
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      try {
        const transport = createMiniappTransport({
          url: 'https://sentry.io/api/123/envelope/',
          recordDroppedEvent: () => {},
          requestTimeout: 1200,
        });
        const envelope: Envelope = [
          { event_id: 'custom-timeout', sent_at: '2022-01-01T00:00:00.000Z' },
          [[{ type: 'event' }, { message: 'timeout', event_id: 'custom-timeout' }]],
        ];

        const rejection = expect(transport.send(envelope as any)).rejects.toThrow(
          'Sentry request timed out after 1200ms',
        );
        expect(requestOptions.timeout).toBe(1200);
        await jest.advanceTimersByTimeAsync(1200);

        await rejection;
        expect(abort).toHaveBeenCalledTimes(1);
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    it('falls back to safe transport limits for invalid values', async () => {
      const pendingRequests: any[] = [];
      const mockRequest = jest.fn((options) => {
        pendingRequests.push(options);
        return { abort: jest.fn() };
      });
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/envelope/',
        recordDroppedEvent: () => {},
        requestTimeout: 0,
        maxConcurrentRequests: 0,
      });
      const makeEnvelope = (id: string): Envelope => [
        { event_id: id, sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: id, event_id: id }]],
      ];

      const active = Array.from({ length: DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS }, (_, index) =>
        transport.send(makeEnvelope(`invalid-${index}`) as any),
      );
      const queued = transport.send(makeEnvelope('invalid-queued') as any);

      expect(mockRequest).toHaveBeenCalledTimes(DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS);
      expect(pendingRequests[0].timeout).toBe(DEFAULT_TRANSPORT_REQUEST_TIMEOUT);

      pendingRequests[0].success({ statusCode: 200, header: {} });
      await Promise.resolve();
      await Promise.resolve();
      expect(mockRequest).toHaveBeenCalledTimes(DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS + 1);

      pendingRequests[1].success({ statusCode: 200, header: {} });
      pendingRequests[2].success({ statusCode: 200, header: {} });
      await Promise.all(active);
      await queued;
    });

    it('queues envelopes while limiting requests that occupy host network slots', async () => {
      const pendingRequests: any[] = [];
      const mockRequest = jest.fn((options) => {
        pendingRequests.push(options);
        return { abort: jest.fn() };
      });
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/envelope/',
        recordDroppedEvent: () => {},
      });
      const makeEnvelope = (id: string): Envelope => [
        { event_id: id, sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: id, event_id: id }]],
      ];

      const active = Array.from({ length: DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS }, (_, index) =>
        transport.send(makeEnvelope(`active-${index}`) as any),
      );
      let queuedSettled = false;
      const queued = transport.send(makeEnvelope('queued') as any).then((response) => {
        queuedSettled = true;
        return response;
      });

      await Promise.resolve();
      expect(mockRequest).toHaveBeenCalledTimes(DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS);
      expect(queuedSettled).toBe(false);

      pendingRequests[0].success({ statusCode: 200, header: {} });
      await Promise.resolve();
      await Promise.resolve();
      expect(mockRequest).toHaveBeenCalledTimes(DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS + 1);

      pendingRequests[1].success({ statusCode: 200, header: {} });
      pendingRequests[2].success({ statusCode: 200, header: {} });
      await Promise.all(active);
      await queued;
      expect(queuedSettled).toBe(true);
    });

    it('should send envelope as newline-delimited text with Sentry envelope content type', async () => {
      const mockRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          statusCode: 200,
          data: 'OK',
          header: {},
        });
      });
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/envelope/',
        recordDroppedEvent: () => {},
      });

      const envelope: Envelope = [
        { event_id: 'test-envelope-type', sent_at: '2022-01-01T00:00:00.000Z' },
        [
          [
            { type: 'event' },
            {
              message: 'Windows WeChat should not JSON stringify this envelope',
              event_id: 'test-envelope-type',
            },
          ],
        ],
      ];

      await transport.send(envelope as any);

      expect(mockRequest).toHaveBeenCalledTimes(1);
      const callArgs = (mockRequest.mock.calls as any)[0][0] as any;

      expect(callArgs.data).toEqual(expect.any(String));
      expect(callArgs.data).toContain('\n');
      expect(callArgs.data).not.toMatch(/^"/);
      expect(callArgs.header['Content-Type']).toBe(SENTRY_ENVELOPE_CONTENT_TYPE);
      expect(callArgs.headers['Content-Type']).toBe(SENTRY_ENVELOPE_CONTENT_TYPE);
    });

    it('should handle request failure', async () => {
      const mockRequest = jest.fn().mockImplementation((options) => {
        setTimeout(() => {
          (options as any).fail({ errMsg: 'request:fail timeout' });
        }, 0);
      });
      (global as any).wx = { request: mockRequest };
      // 必须清缓存，否则 sdk() 命中上一个用例/ setup.ts 的旧 wx（其 request 走 success），
      // 这个「失败」用例就根本没在测失败——历史上它接受任意结果正是被此遮蔽。
      resetPlatformCache();

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: () => {},
      });

      // Create a proper envelope format
      const envelope: Envelope = [
        { event_id: 'test-id-2', sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'test failure', event_id: 'test-id-2' }]],
      ];

      // 真实行为：wx.request 触发 fail → makeRequest reject → send() 抛出（而非静默吞成成功）
      await expect(transport.send(envelope as any)).rejects.toBeDefined();
    });

    it('429 + X-Sentry-Rate-Limits 后，后续同类 envelope 被丢弃（不再发起底层请求）', async () => {
      // setup.ts 已冻结 Date.now（恒定值），限流窗口在两次发送间不会过期。
      const mockRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          statusCode: 429,
          data: 'Rate limited',
          header: { 'x-sentry-rate-limits': '60::organization' },
        });
      });
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      const dropped: Array<{ reason: string; category: string }> = [];
      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/envelope/',
        recordDroppedEvent: (reason: any, category: any) => dropped.push({ reason, category }),
      });

      const makeEnvelope = (id: string): Envelope => [
        { event_id: id, sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'rl', event_id: id }]],
      ];

      // 第一次：发起请求，拿到 429 + 限流头 → core 记录限流
      const r1 = await transport.send(makeEnvelope('a') as any);
      expect(r1.statusCode).toBe(429);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // 第二次：同类（error）仍在限流窗口内 → core 直接丢弃，不再发起底层请求
      await transport.send(makeEnvelope('b') as any);
      expect(mockRequest).toHaveBeenCalledTimes(1); // 关键：没有第二次真实请求
      expect(dropped.some((d) => d.category === 'error')).toBe(true);
    });

    it('should handle non-200 status codes', async () => {
      const mockRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          statusCode: 400,
        });
      });
      (global as any).wx = { request: mockRequest };

      // Reset the SDK cache to pick up the new mock
      resetPlatformCache();

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: () => {},
      });

      // Create a proper envelope format
      const envelope: Envelope = [
        { event_id: 'test-id-4', sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'status code test', event_id: 'test-id-4' }]],
      ];

      const response = await transport.send(envelope as any);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('createMiniappTransport', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should create transport with correct configuration', () => {
      const options = {
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: jest.fn(),
      };

      const transport = createMiniappTransport(options);
      expect(transport).toBeDefined();
    });

    it('should send envelope successfully', async () => {
      const mockRequest = jest.fn((requestOptions: any) => {
        requestOptions.success({ statusCode: 200, header: {} });
      });
      (global as any).wx = { request: mockRequest };
      resetPlatformCache();

      const options = {
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: jest.fn(),
      };

      const transport = createMiniappTransport(options);

      // Create a mock envelope
      const envelope: Envelope = [
        { event_id: 'test-id', sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'test message', event_id: 'test-id' }]],
      ];

      await expect(transport.send(envelope)).resolves.toMatchObject({ statusCode: 200 });
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should handle transport configuration', async () => {
      const mockRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          statusCode: 200,
          data: 'OK',
          header: {},
        });
      });
      // We must set it to a fresh object to clear the memoized _sdk in crossPlatform
      jest.isolateModules(async () => {
        (global as any).wx = { request: mockRequest };
        const { createMiniappTransport } = await import('../src/transports');

        const transport = createMiniappTransport({
          url: 'https://sentry.io/api/123/store/',
          recordDroppedEvent: jest.fn(),
          headers: {
            'Content-Type': 'application/x-sentry-envelope; charset=utf-8',
            'X-Custom-Header': 'value',
          },
        });

        const envelope = [
          { event_id: 'test-id', sent_at: '2022-01-01T00:00:00.000Z' },
          [[{ type: 'event' }, { message: 'test message', event_id: 'test-id' }]],
        ];

        const response = await transport.send(envelope as any);

        expect(mockRequest).toHaveBeenCalled();
        const callArgs = (mockRequest.mock.calls as any)[0][0] as any;

        expect(callArgs.url).toBe('https://sentry.io/api/123/store/');
        expect(callArgs.method).toBe('POST');
        expect(callArgs.header).toMatchObject({
          'Content-Type': 'application/x-sentry-envelope; charset=utf-8',
          'X-Custom-Header': 'value',
        });
        expect(callArgs.headers).toMatchObject({
          'Content-Type': 'application/x-sentry-envelope; charset=utf-8',
          'X-Custom-Header': 'value',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    it('should create transport with default options', () => {
      const options = {
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: jest.fn(),
      };

      const transport = createMiniappTransport(options);

      // Test basic transport functionality
      expect(transport).toBeDefined();
      expect(transport.send).toBeDefined();
      expect(typeof transport.send).toBe('function');
    });
  });

  describe('Alipay/DingTalk transport differences', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Clear the memoized SDK cache so each test picks up the new global
      resetPlatformCache();
      delete (global as any).wx;
      delete (global as any).my;
      delete (global as any).dd;
    });

    it('should work with httpRequest instead of request (DingTalk style)', async () => {
      const mockHttpRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          statusCode: 200,
          data: 'OK',
          header: {},
        });
      });
      // DingTalk exposes httpRequest but no request
      (global as any).dd = { httpRequest: mockHttpRequest };

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: () => {},
      });

      const envelope: Envelope = [
        { event_id: 'test-httpRequest', sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'httpRequest test', event_id: 'test-httpRequest' }]],
      ];

      const response = await transport.send(envelope as any);

      expect(mockHttpRequest).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });

    it('aborts a hanging httpRequest after the configured timeout', async () => {
      jest.useFakeTimers();
      const abort = jest.fn();
      const mockHttpRequest = jest.fn(() => ({ abort }));
      (global as any).dd = { httpRequest: mockHttpRequest };
      resetPlatformCache();

      try {
        const transport = createMiniappTransport({
          url: 'https://sentry.io/api/123/store/',
          recordDroppedEvent: () => {},
          requestTimeout: 800,
        });
        const envelope: Envelope = [
          { event_id: 'dingtalk-timeout', sent_at: '2022-01-01T00:00:00.000Z' },
          [[{ type: 'event' }, { message: 'timeout', event_id: 'dingtalk-timeout' }]],
        ];

        const rejection = expect(transport.send(envelope as any)).rejects.toThrow(
          'Sentry request timed out after 800ms',
        );
        await jest.advanceTimersByTimeAsync(800);

        await rejection;
        expect(mockHttpRequest).toHaveBeenCalledTimes(1);
        expect(abort).toHaveBeenCalledTimes(1);
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    it('should handle response with status instead of statusCode (Alipay style)', async () => {
      const mockRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          status: 200,
          data: 'OK',
          header: {},
        });
      });
      (global as any).wx = { request: mockRequest };

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: () => {},
      });

      const envelope: Envelope = [
        { event_id: 'test-status', sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'status field test', event_id: 'test-status' }]],
      ];

      const response = await transport.send(envelope as any);

      expect(mockRequest).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });

    it('should handle response with headers instead of header (Alipay style)', async () => {
      const mockRequest = jest.fn().mockImplementation((options) => {
        (options as any).success({
          statusCode: 200,
          data: 'OK',
          headers: {
            'x-sentry-rate-limits': '60::organization:key',
            'retry-after': '30',
          },
        });
      });
      (global as any).wx = { request: mockRequest };

      const transport = createMiniappTransport({
        url: 'https://sentry.io/api/123/store/',
        recordDroppedEvent: () => {},
      });

      const envelope: Envelope = [
        { event_id: 'test-headers', sent_at: '2022-01-01T00:00:00.000Z' },
        [[{ type: 'event' }, { message: 'headers field test', event_id: 'test-headers' }]],
      ];

      const response = await transport.send(envelope as any);

      expect(mockRequest).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(response.headers).toBeDefined();
      expect(response.headers?.['x-sentry-rate-limits']).toBe('60::organization:key');
      expect(response.headers?.['retry-after']).toBe('30');
    });
  });
});
