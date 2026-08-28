import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type ActiveSpanStub = { spanContext: () => { spanId: string } };
type TraceDataStub = { 'sentry-trace'?: string; baggage?: string };

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
    mockGetActiveSpan: vi.fn<() => ActiveSpanStub | undefined>(() => ({
      spanContext: () => ({ spanId: 'parent' }),
    })),
    mockHasSpansEnabled: vi.fn(() => true),
    mockIsSentryRequestUrl: vi.fn(() => false),
    mockGetTraceData: vi.fn<() => TraceDataStub>(() => ({
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
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
    SPAN_STATUS_OK: 1,
    SPAN_STATUS_ERROR: 2,
    startInactiveSpan: mockStartInactiveSpan,
  };
});
import { NetworkBreadcrumbs } from '../src/integrations/networkbreadcrumbs';
import * as crossPlatform from '../src/crossPlatform';
import { addBreadcrumb } from '@sentry/core';
import { createNetworkBreadcrumbsTestHarness } from './support/networkbreadcrumbs';

const harness = createNetworkBreadcrumbsTestHarness({ crossPlatform, mockGetClient });

function setupIntegration(integration: NetworkBreadcrumbs): void {
  harness.setupIntegration(integration);
}

describe('NetworkBreadcrumbs tracing', () => {
  let requestMock: Mock;

  beforeEach(() => {
    requestMock = harness.beforeEach();
  });

  afterEach(() => {
    harness.afterEach();
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


  it('creates a standalone segment span when no active span exists', () => {
    mockGetActiveSpan.mockReturnValueOnce(undefined);
    const integration = new NetworkBreadcrumbs({
      tracePropagationTargets: ['api.example.com'],
    });
    setupIntegration(integration);

    crossPlatform.sdk().request({ url: 'https://api.example.com/users' });

    expect(mockStartInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET https://api.example.com/users',
        op: 'http.client',
        parentSpan: null,
        experimental: { standalone: true },
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.http.miniapp',
        }),
      }),
    );
    expect(mockGetTraceData).toHaveBeenCalledWith({ span: mockSpan });
    expect(requestMock.mock.calls[0]![0].header).toEqual(
      expect.objectContaining({ 'sentry-trace': 'trace-id-span-id-1' }),
    );
  });

  it('supports child-only request spans when standalone spans are disabled', () => {
    mockGetActiveSpan.mockReturnValueOnce(undefined);
    const integration = new NetworkBreadcrumbs({
      enableStandaloneHttpSpans: false,
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

  it('does not create request spans when tracing is disabled', () => {
    mockHasSpansEnabled.mockReturnValueOnce(false);
    const integration = new NetworkBreadcrumbs();
    setupIntegration(integration);

    crossPlatform.sdk().request({ url: 'https://api.example.com/users' });

    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    expect(mockGetActiveSpan).not.toHaveBeenCalled();
    expect(mockSpanEnd).not.toHaveBeenCalled();
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
