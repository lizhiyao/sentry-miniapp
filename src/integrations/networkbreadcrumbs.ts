import { addBreadcrumb } from '@sentry/core';
import type { Integration } from '@sentry/core';
import { fill } from '../helpers';
import { sdk } from '../crossPlatform';

/**
 * Network Breadcrumbs Integration.
 * Monkey patches miniapp network API (e.g. wx.request, my.httpRequest)
 * to record network breadcrumbs, including request and response body if configured.
 */
export class NetworkBreadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'NetworkBreadcrumbs';

  /**
   * @inheritDoc
   */
  public name: string = NetworkBreadcrumbs.id;

  private readonly _traceNetworkBody: boolean;

  public constructor(options: { traceNetworkBody?: boolean | undefined } = {}) {
    this._traceNetworkBody = !!options.traceNetworkBody;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const miniappSdk = sdk();

    // Intercept standard request (WeChat, ByteDance, Swan, etc.)
    if (miniappSdk && typeof miniappSdk.request === 'function') {
      fill(miniappSdk, 'request', this._createRequestWrapper.bind(this));
    }

    // Intercept Alipay request
    if (miniappSdk && typeof miniappSdk.httpRequest === 'function') {
      fill(miniappSdk, 'httpRequest', this._createRequestWrapper.bind(this));
    }
  }

  /**
   * Wraps the miniapp request API to capture breadcrumbs
   */
  private _createRequestWrapper(originalRequest: Function): Function {
    const traceNetworkBody = this._traceNetworkBody;

    return function (this: any, options: any): any {
      if (!options || typeof options !== 'object') {
        return originalRequest.call(this, options);
      }

      const url = options.url || '';
      // Ignore Sentry's own requests to prevent infinite loops
      if (typeof url === 'string' && url.indexOf('sentry.io') !== -1) {
        return originalRequest.call(this, options);
      }

      const method = (options.method || 'GET').toUpperCase();
      const requestData = options.data;

      const breadcrumbData: Record<string, any> = {
        url,
        method,
      };

      if (traceNetworkBody && requestData) {
        try {
          breadcrumbData['request_body'] = typeof requestData === 'string'
            ? requestData
            : JSON.stringify(requestData);
        } catch (e) {
          breadcrumbData['request_body'] = '[Cannot serialize request body]';
        }
      }

      const originalSuccess = options.success;
      const originalFail = options.fail;

      // Wrap success callback
      options.success = function (this: any, ...args: any[]) {
        const res = args[0] || {};
        const statusCode = res.statusCode || res.status;
        breadcrumbData['status_code'] = statusCode;

        if (traceNetworkBody && res.data) {
          try {
            breadcrumbData['response_body'] = typeof res.data === 'string'
              ? res.data
              : JSON.stringify(res.data);
          } catch (e) {
            breadcrumbData['response_body'] = '[Cannot serialize response body]';
          }
        }

        addBreadcrumb({
          type: 'http',
          category: 'xhr',
          data: breadcrumbData,
          level: statusCode >= 400 ? 'warning' : 'info',
        });

        if (typeof originalSuccess === 'function') {
          return originalSuccess.apply(this, args);
        }
      };

      // Wrap fail callback
      options.fail = function (this: any, ...args: any[]) {
        const err = args[0] || {};
        breadcrumbData['error'] = err.errMsg || err.errorMessage || 'Network request failed';

        addBreadcrumb({
          type: 'http',
          category: 'xhr',
          data: breadcrumbData,
          level: 'error',
        });

        if (typeof originalFail === 'function') {
          return originalFail.apply(this, args);
        }
      };

      return originalRequest.call(this, options);
    };
  }
}
