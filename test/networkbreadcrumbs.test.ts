import { NetworkBreadcrumbs } from '../src/integrations/networkbreadcrumbs';
import * as crossPlatform from '../src/crossPlatform';

// Mock the core module to avoid redefine property errors
jest.mock('@sentry/core', () => {
  return {
    addBreadcrumb: jest.fn(),
  };
});
import { addBreadcrumb } from '@sentry/core';

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
        request_body: '{"userId":1}',
        response_body: '{"status":"ok"}',
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
      },
    });
  });
});
