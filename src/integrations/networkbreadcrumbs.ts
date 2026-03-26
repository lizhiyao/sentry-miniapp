import { addBreadcrumb, getClient, getCurrentScope } from '@sentry/core';
import type { Integration } from '@sentry/core';
import { fill } from '../helpers';
import { sdk } from '../crossPlatform';

/**
 * Network Breadcrumbs Integration.
 * Monkey patches miniapp network API (e.g. wx.request, my.httpRequest)
 * to record network breadcrumbs, including request and response body if configured.
 * Supports distributed tracing via sentry-trace/baggage header injection.
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
  private readonly _enableTracePropagation: boolean;
  private readonly _tracePropagationTargets: Array<string | RegExp>;
  private _originalRequest: Function | null = null;
  private _originalHttpRequest: Function | null = null;

  public constructor(
    options: {
      traceNetworkBody?: boolean | undefined;
      /** 需要脱敏的字段名列表（不区分大小写匹配） */
      sensitiveKeys?: string[];
      /** 不记录请求体的 URL 模式 */
      denyBodyUrls?: Array<string | RegExp>;
      /** 是否启用分布式追踪头注入（默认 true） */
      enableTracePropagation?: boolean;
      /** 追踪目标 URL 白名单，匹配的请求才注入追踪头 */
      tracePropagationTargets?: Array<string | RegExp>;
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
    this._enableTracePropagation = options.enableTracePropagation !== false;
    this._tracePropagationTargets = options.tracePropagationTargets || [];
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const miniappSdk = sdk();

    // Intercept standard request (WeChat, ByteDance, Swan, etc.)
    if (miniappSdk && typeof miniappSdk.request === 'function') {
      this._originalRequest = miniappSdk.request;
      fill(miniappSdk, 'request', this._createRequestWrapper.bind(this));
    }

    // Intercept Alipay request
    if (miniappSdk && typeof miniappSdk.httpRequest === 'function') {
      this._originalHttpRequest = miniappSdk.httpRequest;
      fill(miniappSdk, 'httpRequest', this._createRequestWrapper.bind(this));
    }
  }

  /**
   * 清理集成，恢复原始网络请求方法
   */
  public cleanup(): void {
    const miniappSdk = sdk();
    if (miniappSdk) {
      if (this._originalRequest && typeof miniappSdk.request === 'function') {
        miniappSdk.request = this._originalRequest;
      }
      if (this._originalHttpRequest && typeof miniappSdk.httpRequest === 'function') {
        miniappSdk.httpRequest = this._originalHttpRequest;
      }
    }
    this._originalRequest = null;
    this._originalHttpRequest = null;
  }

  /**
   * Wraps the miniapp request API to capture breadcrumbs
   */
  private _createRequestWrapper(originalRequest: Function): Function {
    const traceNetworkBody = this._traceNetworkBody;
    const sanitizeBody = this._sanitizeBody.bind(this);
    const shouldDenyBodyUrl = this._shouldDenyBodyUrl.bind(this);
    const enableTracePropagation = this._enableTracePropagation;
    const shouldPropagateTrace = this._shouldPropagateTrace.bind(this);

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

      // 注入分布式追踪头
      if (enableTracePropagation && shouldPropagateTrace(url)) {
        try {
          const scope = getCurrentScope();
          const propagationContext = scope.getPropagationContext();
          if (propagationContext) {
            const { traceId, parentSpanId } = propagationContext;
            if (traceId) {
              const header = options.header || options.headers || {};
              header['sentry-trace'] = `${traceId}-${parentSpanId || '0000000000000000'}-1`;
              // baggage header
              const dsn = client?.getOptions()?.dsn || '';
              const release = client?.getOptions()?.release || '';
              const environment = client?.getOptions()?.environment || '';
              const baggageItems: string[] = [];
              if (traceId) baggageItems.push(`sentry-trace_id=${traceId}`);
              if (dsn) baggageItems.push(`sentry-public_key=${extractPublicKey(dsn)}`);
              if (release) baggageItems.push(`sentry-release=${release}`);
              if (environment) baggageItems.push(`sentry-environment=${environment}`);
              if (baggageItems.length > 0) {
                header['baggage'] = baggageItems.join(',');
              }
              // 支持微信用 header、支付宝用 headers
              options.header = header;
              options.headers = header;
            }
          }
        } catch (_e) {
          // 追踪头注入失败不影响请求
        }
      }

      const method = (options.method || 'GET').toUpperCase();
      const requestData = options.data;
      const startTime = Date.now();

      const breadcrumbData: Record<string, any> = {
        url,
        method,
      };

      if (traceNetworkBody && requestData && !shouldDenyBodyUrl(url)) {
        try {
          const body = typeof requestData === 'string' ? requestData : JSON.stringify(requestData);
          breadcrumbData['request_body'] = sanitizeBody(body);
          breadcrumbData['request_size'] = body.length;
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
        const duration = Date.now() - startTime;
        breadcrumbData['status_code'] = statusCode;
        breadcrumbData['duration'] = duration;

        if (traceNetworkBody && res.data && !shouldDenyBodyUrl(url)) {
          try {
            const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            breadcrumbData['response_body'] = sanitizeBody(body);
            breadcrumbData['response_size'] = body.length;
          } catch (_e) {
            breadcrumbData['response_body'] = '[Cannot serialize response body]';
          }
        }

        // 慢请求标记为 warning
        const level = statusCode >= 400 ? 'warning' : duration > 3000 ? 'warning' : 'info';

        addBreadcrumb({
          type: 'http',
          category: 'xhr',
          data: breadcrumbData,
          level,
        });

        if (typeof originalSuccess === 'function') {
          return originalSuccess.apply(this, args);
        }
      };

      // Wrap fail callback
      options.fail = function (this: any, ...args: any[]) {
        const err = args[0] || {};
        const duration = Date.now() - startTime;
        breadcrumbData['error'] = err.errMsg || err.errorMessage || 'Network request failed';
        breadcrumbData['duration'] = duration;

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
   * 判断是否应该对该 URL 注入追踪头
   */
  private _shouldPropagateTrace(url: string): boolean {
    if (this._tracePropagationTargets.length === 0) {
      return true; // 无白名单则全部注入
    }
    return this._tracePropagationTargets.some((target) => {
      if (typeof target === 'string') {
        return url.includes(target);
      }
      return target.test(url);
    });
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

/**
 * 从 DSN 中提取 public key
 */
function extractPublicKey(dsn: string): string {
  try {
    const match = dsn.match(/^https?:\/\/([^@]+)@/);
    return match ? match[1]! : '';
  } catch (_e) {
    return '';
  }
}
