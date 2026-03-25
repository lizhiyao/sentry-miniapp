import { addBreadcrumb, getClient } from '@sentry/core';
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
  private readonly _sensitiveKeys: string[];
  private readonly _denyUrls: RegExp[];

  public constructor(
    options: {
      traceNetworkBody?: boolean | undefined;
      /** 需要脱敏的字段名列表（不区分大小写匹配） */
      sensitiveKeys?: string[];
      /** 不记录请求体的 URL 模式 */
      denyBodyUrls?: Array<string | RegExp>;
    } = {},
  ) {
    this._traceNetworkBody = !!options.traceNetworkBody;
    this._sensitiveKeys = (
      options.sensitiveKeys || [
        'password',
        'passwd',
        'secret',
        'token',
        'access_token',
        'refresh_token',
        'authorization',
        'cookie',
        'session',
        'creditcard',
        'credit_card',
        'card_number',
        'cvv',
        'ssn',
        'id_card',
      ]
    ).map((k) => k.toLowerCase());
    this._denyUrls = (options.denyBodyUrls || []).map((pattern) =>
      typeof pattern === 'string' ? new RegExp(pattern) : pattern,
    );
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
    const sanitizeBody = this._sanitizeBody.bind(this);
    const shouldDenyBodyUrl = this._shouldDenyBodyUrl.bind(this);

    return function (this: any, options: any): any {
      if (!options || typeof options !== 'object') {
        return originalRequest.call(this, options);
      }

      const url = options.url || '';

      // Get the configured DSN/Transport URL from the current client
      const client = getClient();
      let dsnUrl = '';
      if (client) {
        const dsn = client.getOptions().dsn;
        if (dsn) {
          // A DSN looks like https://key@sentry.io/123
          // We extract just the host part to filter against
          try {
            const dsnMatch = dsn.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?([^:/\n]+)/i);
            if (dsnMatch && dsnMatch[1]) {
              dsnUrl = dsnMatch[1];
            }
          } catch (_e) {
            // fallback
          }
        }
      }

      // Ignore Sentry's own requests to prevent infinite loops
      if (typeof url === 'string') {
        const hostMatch = url.match(/^https?:\/\/([^:/\n]+)/i);
        const requestHost = hostMatch && hostMatch[1] ? hostMatch[1] : '';
        const isSentryRequest =
          (dsnUrl && requestHost === dsnUrl) ||
          requestHost === 'sentry.io' ||
          requestHost.endsWith('.sentry.io');
        if (isSentryRequest) {
          return originalRequest.call(this, options);
        }
      }

      const method = (options.method || 'GET').toUpperCase();
      const requestData = options.data;

      const breadcrumbData: Record<string, any> = {
        url,
        method,
      };

      if (traceNetworkBody && requestData && !shouldDenyBodyUrl(url)) {
        try {
          const body = typeof requestData === 'string' ? requestData : JSON.stringify(requestData);
          breadcrumbData['request_body'] = sanitizeBody(body);
        } catch (_e) {
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

        if (traceNetworkBody && res.data && !shouldDenyBodyUrl(url)) {
          try {
            const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            breadcrumbData['response_body'] = sanitizeBody(body);
          } catch (_e) {
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

  /**
   * 检查 URL 是否在拒绝记录请求体的列表中
   */
  private _shouldDenyBodyUrl(url: string): boolean {
    return this._denyUrls.some((pattern) => pattern.test(url));
  }

  /**
   * 对请求/响应体进行敏感字段脱敏
   */
  private _sanitizeBody(body: string): string {
    if (this._sensitiveKeys.length === 0) return body;

    try {
      const parsed = JSON.parse(body);
      if (typeof parsed === 'object' && parsed !== null) {
        this._sanitizeObject(parsed);
        return JSON.stringify(parsed);
      }
    } catch (_e) {
      // 非 JSON 格式，尝试正则替换常见的 key=value 模式
      for (const key of this._sensitiveKeys) {
        const regex = new RegExp(`(${key})=[^&]*`, 'gi');
        body = body.replace(regex, '$1=[Filtered]');
      }
    }
    return body;
  }

  /**
   * 递归脱敏对象中的敏感字段
   */
  private _sanitizeObject(obj: Record<string, any>): void {
    for (const key of Object.keys(obj)) {
      if (this._sensitiveKeys.includes(key.toLowerCase())) {
        obj[key] = '[Filtered]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this._sanitizeObject(obj[key]);
      }
    }
  }
}
