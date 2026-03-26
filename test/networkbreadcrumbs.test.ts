import { NetworkBreadcrumbs } from '../src/integrations/networkbreadcrumbs';
import * as crossPlatform from '../src/crossPlatform';

// Mock the core module to avoid redefine property errors
jest.mock('@sentry/core', () => {
  return {
    addBreadcrumb: jest.fn(),
    getClient: jest.fn(() => ({
      getOptions: () => ({ dsn: 'https://key@sentry.io/123' }),
    })),
    getCurrentScope: jest.fn(() => ({
      getPropagationContext: () => ({ traceId: 'abc123', parentSpanId: 'def456' }),
    })),
  };
});
import { addBreadcrumb, getClient } from '@sentry/core';

describe('NetworkBreadcrumbs Integration', () => {
  let requestMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    requestMock = jest.fn((options) => {
      if (options.success) {
        options.success({ statusCode: 200, data: { status: 'ok' } });
      }
    });

    jest.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: requestMock,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should patch request and add breadcrumb without body by default', () => {
    const integration = new NetworkBreadcrumbs();
    integration.setupOnce();

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
  });

  it('should include request and response body when traceNetworkBody is true', () => {
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    integration.setupOnce();

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

  it('should ignore sentry.io requests', () => {
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    integration.setupOnce();

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://sentry.io/api/123/store/',
      method: 'POST',
    });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalled();
  });

  it('should NOT ignore URLs that merely contain sentry.io as substring', () => {
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    integration.setupOnce();

    const miniappSdk = crossPlatform.sdk();

    // evil-sentry.io should NOT be filtered
    miniappSdk.request({
      url: 'https://evil-sentry.io/steal',
      method: 'POST',
    });
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    // sentry.io.evil.com should NOT be filtered
    miniappSdk.request({
      url: 'https://sentry.io.evil.com/steal',
      method: 'POST',
    });
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('should ignore subdomain of sentry.io', () => {
    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    integration.setupOnce();

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'https://o113510.ingest.sentry.io/api/123/envelope/',
      method: 'POST',
    });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalled();
  });

  it('should ignore self-hosted sentry requests based on DSN', () => {
    // Override the getClient mock for this test
    (getClient as jest.Mock).mockReturnValueOnce({
      getOptions: () => ({ dsn: 'http://mykey@sentry.mycompany.com:9000/1' }),
    });

    const integration = new NetworkBreadcrumbs({ traceNetworkBody: true });
    integration.setupOnce();

    const miniappSdk = crossPlatform.sdk();
    miniappSdk.request({
      url: 'http://sentry.mycompany.com:9000/api/1/store/',
      method: 'POST',
    });

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalled();
  });

  it('should capture failure and add error breadcrumb', () => {
    const failRequestMock = jest.fn((options) => {
      if (options.fail) {
        options.fail({ errMsg: 'request:fail timeout' });
      }
    });

    jest.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: failRequestMock,
    });

    const integration = new NetworkBreadcrumbs();
    integration.setupOnce();

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
  });
});
