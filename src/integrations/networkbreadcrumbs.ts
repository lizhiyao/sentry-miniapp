import {
  addBreadcrumb,
  getClient,
  SPAN_STATUS_OK,
  SPAN_STATUS_ERROR,
  getTraceData,
  setHttpStatus,
  startInactiveSpan,
} from '@sentry/core';
import type { Integration, Span } from '@sentry/core';
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

      const url = normalizeUrl(options.url);

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
      const hostMatch = url.match(/^https?:\/\/([^:/\n]+)/i);
      const requestHost = hostMatch && hostMatch[1] ? hostMatch[1] : '';
      const isSentryRequest =
        (dsnUrl && requestHost === dsnUrl) ||
        requestHost === 'sentry.io' ||
        requestHost.endsWith('.sentry.io');
      if (isSentryRequest) {
        return originalRequest.call(this, options);
      }

      // 注入分布式追踪头
      const method = normalizeMethod(options.method);
      const requestData = options.data;
      const startTime = Date.now();
      const requestSpan = startRequestSpan(method, url);
      let requestSpanFinished = false;
      const finishSpanOnce = (finish: RequestSpanFinishOptions): void => {
        if (requestSpanFinished) return;
        requestSpanFinished = true;
        finishRequestSpan(requestSpan, finish);
      };

      if (enableTracePropagation && shouldPropagateTrace(url)) {
        injectTraceHeaders(options, requestSpan);
      }

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
      const originalComplete = options.complete;

      // Wrap success callback
      options.success = function (this: any, ...args: any[]) {
        const res = args[0] || {};
        const statusCode = getResponseStatusCode(res);
        const duration = Date.now() - startTime;
        breadcrumbData['status_code'] = statusCode;
        breadcrumbData['duration'] = duration;
        finishSpanOnce({
          statusCode,
          status: isErrorStatusCode(statusCode) ? 'error' : 'ok',
        });

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
        const level = isErrorStatusCode(statusCode)
          ? 'warning'
          : duration > 3000
            ? 'warning'
            : 'info';

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
        const errorMessage = err.errMsg || err.errorMessage || 'Network request failed';
        breadcrumbData['error'] = errorMessage;
        breadcrumbData['duration'] = duration;
        finishSpanOnce({
          status: 'error',
          errorMessage,
        });

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

      options.complete = function (this: any, ...args: any[]) {
        const res = args[0] || {};
        const statusCode = getResponseStatusCode(res);
        finishSpanOnce({
          statusCode,
          status: isErrorStatusCode(statusCode) ? 'error' : 'ok',
        });

        if (typeof originalComplete === 'function') {
          return originalComplete.apply(this, args);
        }
      };

      try {
        return originalRequest.call(this, options);
      } catch (error) {
        finishSpanOnce({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
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

type RequestSpanFinishOptions = {
  status: 'ok' | 'error';
  statusCode?: unknown;
  errorMessage?: string;
};

function startRequestSpan(method: string, url: string): Span | null {
  try {
    const serverAddress = extractHost(url);
    return startInactiveSpan({
      name: `${method} ${url}`,
      op: 'http.client',
      attributes: {
        'http.request.method': method,
        'url.full': url,
        'server.address': serverAddress || undefined,
      },
    });
  } catch (_e) {
    return null;
  }
}

function injectTraceHeaders(options: any, span: Span | null): void {
  if (!span) return;

  try {
    const traceData = getTraceData({ span });
    const sentryTrace = traceData['sentry-trace'];
    if (!sentryTrace) return;

    const header = {
      ...(isRecord(options.headers) ? options.headers : {}),
      ...(isRecord(options.header) ? options.header : {}),
    };
    if (!header['sentry-trace']) {
      header['sentry-trace'] = sentryTrace;
    }

    if (traceData.baggage) {
      header['baggage'] = mergeBaggageHeader(header['baggage'], traceData.baggage);
    }

    // 支持微信用 header、支付宝用 headers
    options.header = header;
    options.headers = header;
  } catch (_e) {
    // 追踪头注入失败不影响请求
  }
}

function finishRequestSpan(span: Span | null, options: RequestSpanFinishOptions): void {
  if (!span) return;

  try {
    const statusCode = normalizeStatusCode(options.statusCode);
    if (statusCode !== undefined) {
      setHttpStatus(span, statusCode);
    } else {
      span.setStatus({
        code: options.status === 'error' ? SPAN_STATUS_ERROR : SPAN_STATUS_OK,
        message: options.status === 'error' ? options.errorMessage || 'error' : 'ok',
      });
    }
    if (options.errorMessage) {
      span.setAttribute('error.message', options.errorMessage);
    }
    span.end();
  } catch (_e) {
    // ignore
  }
}

function normalizeUrl(url: unknown): string {
  if (typeof url === 'string') {
    return url;
  }

  if (url === undefined || url === null) {
    return '';
  }

  return String(url);
}

function normalizeMethod(method: unknown): string {
  return typeof method === 'string' && method.trim() !== '' ? method.toUpperCase() : 'GET';
}

function getResponseStatusCode(response: any): unknown {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  if (response.statusCode !== undefined && response.statusCode !== null) {
    return response.statusCode;
  }

  return response.status;
}

function isErrorStatusCode(statusCode: unknown): boolean {
  const normalizedStatusCode = normalizeStatusCode(statusCode);
  return normalizedStatusCode !== undefined && normalizedStatusCode >= 400;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeBaggageHeader(existingBaggage: unknown, sentryBaggage: string): string {
  const existing =
    typeof existingBaggage === 'string'
      ? existingBaggage
      : Array.isArray(existingBaggage)
        ? existingBaggage.filter((item) => typeof item === 'string').join(',')
        : '';

  if (!existing) {
    return sentryBaggage;
  }

  const hasSentryBaggage = existing.split(',').some((item) => item.trim().startsWith('sentry-'));

  return hasSentryBaggage ? existing : `${existing},${sentryBaggage}`;
}

function normalizeStatusCode(statusCode: unknown): number | undefined {
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
    return statusCode;
  }

  if (typeof statusCode === 'string' && statusCode.trim() !== '') {
    const parsed = Number(statusCode);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function extractHost(url: string): string {
  try {
    const hostMatch = url.match(/^https?:\/\/([^:/\n]+)/i);
    return hostMatch && hostMatch[1] ? hostMatch[1] : '';
  } catch (_e) {
    return '';
  }
}
