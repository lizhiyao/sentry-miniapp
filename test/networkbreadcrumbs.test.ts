import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const {
  mockSpanSetAttribute,
  mockSpanSetStatus,
  mockSpanEnd,
  mockSpan,
  mockStartInactiveSpan,
  mockGetActiveSpan,
  mockHasSpansEnabled,
  mockIsSentryRequestUrl,
  mockGetTraceData,
  mockSetHttpStatus,
  mockGetClient,
} = vi.hoisted(() => {
  const mockSpanSetAttribute = vi.fn();
  const mockSpanSetStatus = vi.fn();
  const mockSpanEnd = vi.fn();
  const mockSpan = {
    setAttribute: mockSpanSetAttribute,
    setStatus: mockSpanSetStatus,
    end: mockSpanEnd,
  };

  return {
    mockSpanSetAttribute,
    mockSpanSetStatus,
    mockSpanEnd,
    mockSpan,
    mockStartInactiveSpan: vi.fn(() => mockSpan),
    mockGetActiveSpan: vi.fn(() => ({ spanContext: () => ({ spanId: 'parent' }) })),
    mockHasSpansEnabled: vi.fn(() => true),
    mockIsSentryRequestUrl: vi.fn(() => false),
    mockGetTraceData: vi.fn(() => ({
      'sentry-trace': 'trace-id-span-id-1',
      baggage: 'sentry-trace_id=trace-id,sentry-public_key=public-key,sentry-sampled=true',
    })),
    mockSetHttpStatus: vi.fn((span, statusCode) => {
      span.setAttribute('http.response.status_code', statusCode);
      span.setStatus({ code: statusCode >= 400 ? 2 : 1 });
    }),
    mockGetClient: vi.fn(),
  };
});
const mockTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

// Mock the core module to avoid redefine property errors
vi.mock('@sentry/core', () => {
  return {
    addBreadcrumb: vi.fn(),
    getActiveSpan: mockGetActiveSpan,
    getClient: mockGetClient,
    hasSpansEnabled: mockHasSpansEnabled,
    isSentryRequestUrl: mockIsSentryRequestUrl,
    getTraceData: mockGetTraceData,
    setHttpStatus: mockSetHttpStatus,
    SPAN_STATUS_OK: 1,
    SPAN_STATUS_ERROR: 2,
    startInactiveSpan: mockStartInactiveSpan,
  };
});
import { NetworkBreadcrumbs } from '../src/integrations/networkbreadcrumbs';
import * as crossPlatform from '../src/crossPlatform';
import { addBreadcrumb } from '@sentry/core';

function setupIntegration(integration: NetworkBreadcrumbs): void {
  const client = {
    getOptions: () => ({ dsn: 'https://key@sentry.io/123' }),
    registerCleanup: vi.fn(),
  } as any;
  mockGetClient.mockReturnValue(client);
  integration.setup(client);
}

describe('NetworkBreadcrumbs Integration', () => {
  let requestMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockReturnValue(undefined);

    requestMock = vi.fn((options) => {
      if (options.success) {
        options.success({ statusCode: 200, data: { status: 'ok' } });
      }
    });

    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: requestMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should patch request and add breadcrumb without body by default', () => {
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/users',
      method: 'POST',
      data: { userId: 1 },
    });

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith({
      type: 'http',
      category: 'xhr',
      level: 'info',
      data: {
        url: 'https://api.example.com/users',
        method: 'POST',
        status_code: 200,
        duration: 0,
      },
    });
    expect(mockStartInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'POST https://api.example.com/users',
        op: 'http.client',
        kind: 2,
        attributes: expect.objectContaining({
          'http.request.method': 'POST',
          'url.full': 'https://api.example.com/users',
          'server.address': 'api.example.com',
        }),
      }),
    );
    const requestOptions = requestMock.mock.calls[0]![0];
    expect(requestOptions.header).toBeUndefined();
    expect(requestOptions.headers).toBeUndefined();
    expect(mockGetTraceData).not.toHaveBeenCalled();
    expect(mockSetHttpStatus).toHaveBeenCalledWith(mockSpan, 200);
    expect(mockSpanSetAttribute).toHaveBeenCalledWith('http.response.status_code', 200);
    expect(mockSpanSetStatus).toHaveBeenCalledWith({ code: 1 });
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('setupOnce only installs a neutral request wrapper', () => {
    const integration = new NetworkBreadcrumbs();

    integration.setupOnce();
    crossPlatform.sdk().request({ url: 'https://api.example.com/users' });

    expect(requestMock).toHaveBeenCalledOnce();
    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
  });

  it('should patch a configurable request accessor and restore its descriptor on cleanup', () => {
    const getter = vi.fn(() => requestMock);
    const setter = vi.fn();
    const miniappSdk = {} as { request: Function };

    Object.defineProperty(miniappSdk, 'request', {
      configurable: true,
      enumerable: true,
      get: getter,
      set: setter,
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue(miniappSdk as any);

    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    expect(setter).toHaveBeenCalledTimes(1);
    expect(miniappSdk.request).not.toBe(requestMock);

    miniappSdk.request({
      url: 'https://api.example.com/accessor',
      method: 'GET',
    });

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'xhr',
        data: expect.objectContaining({ url: 'https://api.example.com/accessor' }),
      }),
    );

    integration.cleanup();

    const restoredDescriptor = Object.getOwnPropertyDescriptor(miniappSdk, 'request');
    expect(restoredDescriptor?.get).toBe(getter);
    expect(restoredDescriptor?.set).toBe(setter);
    expect(restoredDescriptor?.configurable).toBe(true);
    expect(restoredDescriptor?.enumerable).toBe(true);
    expect(miniappSdk.request).toBe(requestMock);
  });

  it('warns when host request APIs are non-configurable', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const miniappSdk = {} as any;
    for (const name of ['request', 'httpRequest']) {
      Object.defineProperty(miniappSdk, name, {
        configurable: false,
        value: vi.fn(),
        writable: false,
      });
    }
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue(miniappSdk);

    new NetworkBreadcrumbs().setupOnce();

    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('request API'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('httpRequest API'));
  });

  it('should sanitize query and fragment from request span name', () => {
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/users?token=secret#profile',
    });

    expect(mockStartInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET https://api.example.com/users',
        attributes: expect.objectContaining({
          'url.full': 'https://api.example.com/users?token=secret#profile',
        }),
      }),
    );
  });

  it('should remove data URL payloads from span names', () => {
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);
    const miniappSdk = crossPlatform.sdk();

    miniappSdk.request({ url: 'data:image/png;base64,very-large-image-data' });
    miniappSdk.request({ url: 'data:,plain-text-payload' });

    expect(mockStartInactiveSpan).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'GET data:image/png' }),
    );
    expect(mockStartInactiveSpan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'GET data:text/plain' }),
    );
  });

  it('should include request and response body when traceNetworkBody is true', () => {
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/users',
      method: 'POST',
      data: { userId: 1 },
    });

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith({
      type: 'http',
      category: 'xhr',
      level: 'info',
      data: {
        url: 'https://api.example.com/users',
        method: 'POST',
        status_code: 200,
        duration: 0,
        request_body: '{"userId":1}',
        request_size: 12,
        response_body: '{"status":"ok"}',
        response_size: 15,
      },
    });
  });

  it('should replace cyclic request and response bodies with serialization markers', () => {
    const cyclicRequest: Record<string, any> = {};
    cyclicRequest.self = cyclicRequest;
    const cyclicResponse: Record<string, any> = {};
    cyclicResponse.self = cyclicResponse;
    const cyclicRequestMock = vi.fn((options) => {
      options.success({ statusCode: 200, data: cyclicResponse });
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: cyclicRequestMock });
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    setupIntegration(integration);

    crossPlatform.sdk().request({
      url: 'https://api.example.com/cyclic',
      method: 'POST',
      data: cyclicRequest,
    });

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request_body: '[Cannot serialize request body]',
          response_body: '[Cannot serialize response body]',
        }),
      }),
    );
  });

  it('should ignore requests identified as SDK envelopes by core', () => {
    mockIsSentryRequestUrl.mockReturnValueOnce(true);
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://sentry.io/api/123/store/',
      method: 'POST',
    });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalled();
    expect(mockIsSentryRequestUrl).toHaveBeenCalledWith(
      'https://sentry.io/api/123/store/',
      expect.anything(),
    );
  });

  it('should NOT ignore URLs that merely contain sentry.io as substring', () => {
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();

    // evil-sentry.io should NOT be filtered
    miniappSdk.request({
      url: 'https://evil-sentry.io/steal',
      method: 'POST',
    });
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // sentry.io.evil.com should NOT be filtered
    miniappSdk.request({
      url: 'https://sentry.io.evil.com/steal',
      method: 'POST',
    });
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('should ignore an ingest envelope URL identified by core', () => {
    mockIsSentryRequestUrl.mockReturnValueOnce(true);
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://o113510.ingest.sentry.io/api/123/envelope/?sentry_key=key',
      method: 'POST',
    });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalled();
  });

  it('should ignore self-hosted or tunneled envelopes identified by core', () => {
    mockIsSentryRequestUrl.mockReturnValueOnce(true);

    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'http://sentry.mycompany.com:9000/api/1/store/',
      method: 'POST',
    });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalled();
  });

  it('should capture failure and add error breadcrumb', () => {
    const failRequestMock = vi.fn((options) => {
      if (options.fail) {
        options.fail({ errMsg: 'request:fail timeout' });
      }
    });

    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: failRequestMock,
    });

    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/timeout',
    });

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith({
      type: 'http',
      category: 'xhr',
      level: 'error',
      data: {
        url: 'https://api.example.com/timeout',
        method: 'GET',
        error: 'request:fail timeout',
        duration: 0,
      },
    });
    expect(mockSpanSetAttribute).toHaveBeenCalledWith('error.message', 'request:fail timeout');
    expect(mockSpanSetStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'request:fail timeout',
    });
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('normalizes missing and Alipay-style failure details', () => {
    const failRequestMock = vi.fn((options) => {
      if (options.url.includes('alipay')) {
        options.fail({ errorMessage: 'alipay network error' });
      } else {
        options.fail(undefined);
      }
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: failRequestMock });
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);
    const miniappSdk = crossPlatform.sdk();

    miniappSdk.request({ url: 'https://api.example.com/missing-error' });
    miniappSdk.request({ url: 'https://api.example.com/alipay-error' });

    expect(addBreadcrumb).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ error: 'Network request failed' }),
      }),
    );
    expect(addBreadcrumb).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ error: 'alipay network error' }),
      }),
    );
  });

  it('preserves the failure callback return value', () => {
    const fail = vi.fn(() => 'handled');
    const failRequestMock = vi.fn(options => options.fail({ errMsg: 'request:fail' }));
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: failRequestMock });
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    const result = crossPlatform.sdk().request({
      url: 'https://api.example.com/fail',
      fail,
    });

    expect(result).toBe('handled');
    expect(fail).toHaveBeenCalledWith({ errMsg: 'request:fail' });
  });

  it('should not inject trace headers when trace propagation is disabled', () => {
    const integration = new NetworkBreadcrumbs({ enableTracePropagation: false });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/users',
    });

    const requestOptions = requestMock.mock.calls[0]![0];
    expect(requestOptions.header).toBeUndefined();
    expect(requestOptions.headers).toBeUndefined();
    expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('should inject W3C traceparent when propagateTraceparent is enabled', () => {
    mockGetTraceData.mockReturnValueOnce({
      'sentry-trace': 'trace-id-span-id-1',
      baggage: 'sentry-trace_id=trace-id,sentry-public_key=public-key,sentry-sampled=true',
      traceparent: mockTraceparent,
    } as any);

    const integration = new NetworkBreadcrumbs({
      propagateTraceparent: true,
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/users',
    });

    const requestOptions = requestMock.mock.calls[0]![0];
    expect(requestOptions.header).toEqual({
      'sentry-trace': 'trace-id-span-id-1',
      baggage: 'sentry-trace_id=trace-id,sentry-public_key=public-key,sentry-sampled=true',
      traceparent: mockTraceparent,
    });
    expect(requestOptions.headers).toBe(requestOptions.header);
    expect(mockGetTraceData).toHaveBeenCalledWith({
      span: mockSpan,
      propagateTraceparent: true,
    });
  });

  it('should preserve existing traceparent when propagateTraceparent is enabled', () => {
    mockGetTraceData.mockReturnValueOnce({
      'sentry-trace': 'trace-id-span-id-1',
      baggage: 'sentry-trace_id=trace-id,sentry-public_key=public-key,sentry-sampled=true',
      traceparent: mockTraceparent,
    } as any);

    const integration = new NetworkBreadcrumbs({
      propagateTraceparent: true,
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/users',
      header: {
        Traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
      },
    });

    const requestOptions = requestMock.mock.calls[0]![0];
    expect(requestOptions.header).toEqual({
      'sentry-trace': 'trace-id-span-id-1',
      baggage: 'sentry-trace_id=trace-id,sentry-public_key=public-key,sentry-sampled=true',
      Traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
    });
    expect(requestOptions.header.traceparent).toBeUndefined();
  });

  it('preserves existing trace headers case-insensitively', () => {
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    crossPlatform.sdk().request({
      url: 'https://api.example.com/users',
      headers: {
        'Sentry-Trace': 'existing-trace',
        Baggage: 'tenant=demo,sentry-trace_id=existing',
      },
    });

    const forwarded = requestMock.mock.calls[0]![0];
    expect(forwarded.header['Sentry-Trace']).toBe('existing-trace');
    expect(forwarded.header['sentry-trace']).toBeUndefined();
    expect(forwarded.header.Baggage).toBe('tenant=demo,sentry-trace_id=existing');
    expect(forwarded.header.baggage).toBeUndefined();
  });

  it('should only inject trace headers for matching tracePropagationTargets', () => {
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://cdn.example.com/asset',
    });

    const requestOptions = requestMock.mock.calls[0]![0];
    expect(requestOptions.header).toBeUndefined();
    expect(requestOptions.headers).toBeUndefined();
    expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('should not let global tracePropagationTargets regexp lastIndex break repeated matches', () => {
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: [/api\.example\.com/g],
    });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/first',
    });
    miniappSdk.request({
      url: 'https://api.example.com/second',
    });

    expect(requestMock.mock.calls[0]![0].header).toEqual(
      expect.objectContaining({ 'sentry-trace': 'trace-id-span-id-1' }),
    );
    expect(requestMock.mock.calls[1]![0].header).toEqual(
      expect.objectContaining({ 'sentry-trace': 'trace-id-span-id-1' }),
    );
  });

  it('should finish request span from complete callback when success/fail are not called', () => {
    const completeOnlyRequestMock = vi.fn((options) => {
      if (options.complete) {
        options.complete({ statusCode: 204 });
      }
    });

    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: completeOnlyRequestMock,
    });

    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/complete-only',
    });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(mockSetHttpStatus).toHaveBeenCalledWith(mockSpan, 204);
    expect(mockSpanSetAttribute).toHaveBeenCalledWith('http.response.status_code', 204);
    expect(mockSpanSetStatus).toHaveBeenCalledWith({ code: 1 });
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('should wrap Alipay httpRequest and create request span', () => {
    const httpRequestMock = vi.fn((options) => {
      if (options.success) {
        options.success({ status: 201, data: { status: 'ok' } });
      }
    });

    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: vi.fn(),
      httpRequest: httpRequestMock,
    } as any);

    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk() as any;
    miniappSdk.httpRequest({
      url: 'https://api.example.com/alipay',
      method: 'POST',
    });

    expect(mockStartInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'POST https://api.example.com/alipay',
        op: 'http.client',
      }),
    );
    expect(mockSetHttpStatus).toHaveBeenCalledWith(mockSpan, 201);
    expect(mockSpanSetAttribute).toHaveBeenCalledWith('http.response.status_code', 201);
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('should preserve existing non-Sentry baggage when injecting trace headers', () => {
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://api.example.com/users',
      header: {
        baggage: 'tenant=demo',
      },
    });

    const requestOptions = requestMock.mock.calls[0]![0];
    expect(requestOptions.header).toEqual({
      'sentry-trace': 'trace-id-span-id-1',
      baggage:
        'tenant=demo,sentry-trace_id=trace-id,sentry-public_key=public-key,sentry-sampled=true',
    });
  });

  it('should preserve baggage that already contains Sentry entries', () => {
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    crossPlatform.sdk().request({
      url: 'https://api.example.com/users',
      header: { baggage: 'tenant=demo,sentry-trace_id=existing' },
    });

    expect(requestMock.mock.calls[0]![0].header.baggage).toBe(
      'tenant=demo,sentry-trace_id=existing',
    );
  });

  it('should normalize array baggage values before injecting Sentry baggage', () => {
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    crossPlatform.sdk().request({
      url: 'https://api.example.com/users',
      header: {
        baggage: ['tenant=demo', 42, 'region=cn'],
      },
    });

    expect(requestMock.mock.calls[0]![0].header.baggage).toBe(
      'tenant=demo,region=cn,sentry-trace_id=trace-id,sentry-public_key=public-key,sentry-sampled=true',
    );
  });

  it('recursively filters sensitive fields from request and response bodies', () => {
    const bodyRequestMock = vi.fn((options) => {
      options.success({
        statusCode: 200,
        data: { token: 'response-secret', nested: { password: 'response-password' } },
      });
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: bodyRequestMock });
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    setupIntegration(integration);

    crossPlatform.sdk().request({
      url: 'https://api.example.com/private',
      method: 'POST',
      data: { password: 'request-secret', nested: { access_token: 'request-token' } },
    });

    const breadcrumb = (addBreadcrumb as Mock).mock.calls[0]![0];
    expect(JSON.parse(breadcrumb.data.request_body)).toEqual({
      password: '[Filtered]',
      nested: { access_token: '[Filtered]' },
    });
    expect(JSON.parse(breadcrumb.data.response_body)).toEqual({
      token: '[Filtered]',
      nested: { password: '[Filtered]' },
    });
  });

  it('filters form-encoded sensitive values and honors string body deny patterns', () => {
    const integration = new NetworkBreadcrumbs({
      traceNetworkBody: true,
      denyBodyUrls: ['do-not-record'],
    });
    setupIntegration(integration);
    const miniappSdk = crossPlatform.sdk();

    miniappSdk.request({
      url: 'https://api.example.com/form',
      method: 'POST',
      data: 'password=secret&token=abc&safe=yes',
    });
    const formBreadcrumb = (addBreadcrumb as Mock).mock.calls[0]![0];
    expect(formBreadcrumb.data.request_body).toBe(
      'password=[Filtered]&token=[Filtered]&safe=yes',
    );

    miniappSdk.request({
      url: 'https://api.example.com/do-not-record',
      method: 'POST',
      data: { password: 'must-not-appear' },
    });
    const deniedBreadcrumb = (addBreadcrumb as Mock).mock.calls[1]![0];
    expect(deniedBreadcrumb.data.request_body).toBeUndefined();
    expect(deniedBreadcrumb.data.response_body).toBeUndefined();
  });

  it('normalizes unusual request options and preserves callbacks', () => {
    const success = vi.fn();
    const complete = vi.fn();
    const callbackRequestMock = vi.fn((options) => {
      options.success(undefined);
      options.complete(undefined);
      return { abort: vi.fn() };
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: callbackRequestMock });
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    const task = crossPlatform.sdk().request({
      url: 42,
      method: '   ',
      success,
      complete,
    } as any);

    expect(task).toEqual({ abort: expect.any(Function) });
    expect(success).toHaveBeenCalledWith(undefined);
    expect(complete).toHaveBeenCalledWith(undefined);
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ url: '42', method: 'GET' }),
      }),
    );
  });

  it('handles non-object responses and missing trace data', () => {
    mockGetTraceData.mockReturnValueOnce({});
    const unusualRequestMock = vi.fn(options => options.success(null));
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: unusualRequestMock });
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    expect(() =>
      crossPlatform.sdk().request({ url: 'https://api.example.com/no-response' }),
    ).not.toThrow();

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status_code: undefined }) }),
    );
    expect(mockSpanSetStatus).toHaveBeenCalledWith({ code: 1, message: 'ok' });
    expect(unusualRequestMock.mock.calls[0]![0].header).toBeUndefined();
  });

  it('keeps the request working when finishing a span throws', () => {
    mockSetHttpStatus.mockImplementationOnce(() => {
      throw new Error('span status failed');
    });
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    expect(() =>
      crossPlatform.sdk().request({ url: 'https://api.example.com/span-finish-error' }),
    ).not.toThrow();
  });

  it('does not mutate caller request options or header objects', () => {
    const success = vi.fn();
    const header = { Authorization: 'Bearer secret' };
    const requestOptions = {
      url: 'https://api.example.com/users',
      header,
      success,
    };
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    crossPlatform.sdk().request(requestOptions);

    const forwarded = requestMock.mock.calls[0]![0];
    expect(forwarded).not.toBe(requestOptions);
    expect(forwarded.header).not.toBe(header);
    expect(forwarded.header).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer secret',
        'sentry-trace': 'trace-id-span-id-1',
      }),
    );
    expect(requestOptions).toEqual({
      url: 'https://api.example.com/users',
      header: { Authorization: 'Bearer secret' },
      success,
    });
  });

  it('injects scope trace headers without creating a standalone request transaction', () => {
    mockGetActiveSpan.mockReturnValueOnce(undefined);
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    crossPlatform.sdk().request({ url: 'https://api.example.com/users' });

    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    expect(mockGetTraceData).toHaveBeenCalledWith({});
    expect(requestMock.mock.calls[0]![0].header).toEqual(
      expect.objectContaining({ 'sentry-trace': 'trace-id-span-id-1' }),
    );
  });

  it('forwards non-object request options without instrumentation', () => {
    const passthroughRequest = vi.fn((options) => options);
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: passthroughRequest });
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    expect(crossPlatform.sdk().request(null as any)).toBeNull();
    expect(passthroughRequest).toHaveBeenCalledWith(null);
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('normalizes missing and null URLs to an empty string', () => {
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);
    const miniappSdk = crossPlatform.sdk();

    miniappSdk.request({});
    miniappSdk.request({ url: null });

    expect(mockStartInactiveSpan).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'GET ',
        attributes: expect.objectContaining({ 'url.full': '' }),
      }),
    );
    expect(mockStartInactiveSpan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'GET ',
        attributes: expect.objectContaining({ 'url.full': '' }),
      }),
    );
  });

  it('handles string error statuses and marks slow successful requests as warnings', () => {
    const responseRequestMock = vi.fn((options) => {
      options.success({ statusCode: options.url.includes('error') ? '503' : 200 });
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: responseRequestMock });
    vi.mocked(Date.now)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1001)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(6001);
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);
    const miniappSdk = crossPlatform.sdk();

    miniappSdk.request({ url: 'https://api.example.com/error' });
    miniappSdk.request({ url: 'https://api.example.com/slow' });

    expect(mockSetHttpStatus).toHaveBeenCalledWith(mockSpan, 503);
    expect(addBreadcrumb).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ level: 'warning' }),
    );
    expect(addBreadcrumb).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'warning',
        data: expect.objectContaining({ duration: 4001 }),
      }),
    );
  });

  it('keeps requests working when span creation or trace header injection fails', () => {
    mockStartInactiveSpan.mockImplementationOnce(() => {
      throw new Error('span unavailable');
    });
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);
    const miniappSdk = crossPlatform.sdk();

    expect(() => miniappSdk.request({ url: 'https://api.example.com/no-span' })).not.toThrow();
    expect(requestMock.mock.calls[0]![0].header).toEqual(
      expect.objectContaining({ 'sentry-trace': 'trace-id-span-id-1' }),
    );

    mockGetTraceData.mockImplementationOnce(() => {
      throw new Error('trace data unavailable');
    });
    expect(() => miniappSdk.request({ url: 'https://api.example.com/no-trace' })).not.toThrow();
    expect(requestMock.mock.calls[1]![0].header).toBeUndefined();
  });

  it('finishes the span and rethrows synchronous host request errors', () => {
    const throwingRequest = vi.fn(() => {
      throw new Error('request crashed');
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: throwingRequest });
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    expect(() =>
      crossPlatform.sdk().request({ url: 'https://api.example.com/crash' }),
    ).toThrow('request crashed');
    expect(mockSpanSetAttribute).toHaveBeenCalledWith('error.message', 'request crashed');
    expect(mockSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('normalizes non-Error synchronous host failures', () => {
    const throwingRequest = vi.fn(() => {
      throw 'request crashed';
    });
    vi.spyOn(crossPlatform, 'sdk').mockReturnValue({ request: throwingRequest });
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    expect(() =>
      crossPlatform.sdk().request({ url: 'https://api.example.com/crash' }),
    ).toThrow('request crashed');
    expect(mockSpanSetAttribute).toHaveBeenCalledWith('error.message', 'request crashed');
  });
});
