import {
  addBreadcrumb,
  getActiveSpan,
  getClient,
  hasSpansEnabled,
  isSentryRequestUrl,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SPAN_STATUS_OK,
  SPAN_STATUS_ERROR,
  getTraceData,
  setHttpStatus,
  startInactiveSpan,
} from '@sentry/core';
import type { Client, Integration, Span } from '@sentry/core';
import { sdk } from '../crossPlatform';
import {
  addFunctionInstrumentationHandler,
  ensureFunctionInstrumentation,
} from '../instrumentation';
import { isMarkedSentryRequest } from '../transports/requestMarker';

/**
 * Network Breadcrumbs Integration.
 * Monkey patches miniapp network API (e.g. wx.request, my.httpRequest)
 * to record network breadcrumbs, including request and response body if configured.
 * Supports distributed tracing via sentry-trace/baggage and optional traceparent header injection.
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
  private readonly _propagateTraceparent: boolean;
  private readonly _enableStandaloneHttpSpans: boolean;
  private readonly _cleanupCallbacks = new Set<() => void>();
  private readonly _requestWrappers = new WeakMap<Function, Function>();

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
      /** 是否额外注入 W3C traceparent 头（默认 false） */
      propagateTraceparent?: boolean;
      /** 无 active span 时是否把请求作为独立 segment span 上报（默认 true） */
      enableStandaloneHttpSpans?: boolean;
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
    this._propagateTraceparent = options.propagateTraceparent === true;
    this._enableStandaloneHttpSpans = options.enableStandaloneHttpSpans !== false;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    const miniappSdk = sdk();
    this._ensureInstrumentation(miniappSdk, 'request');
    this._ensureInstrumentation(miniappSdk, 'httpRequest');
  }

  public setup(client: Client): void {
    const miniappSdk = sdk();
    const cleanups: Array<() => void> = [];
    for (const name of ['request', 'httpRequest'] as const) {
      if (typeof miniappSdk[name] !== 'function') continue;
      cleanups.push(
        addFunctionInstrumentationHandler(miniappSdk, name, client, (original, thisArg, args) =>
          this._invokeRequestWrapper(original, thisArg, args),
        ),
      );
    }
    const cleanup = this._trackCleanup(cleanups);
    client.registerCleanup(cleanup);
  }

  /**
   * 清理集成，恢复原始网络请求方法
   */
  public cleanup(): void {
    for (const cleanup of [...this._cleanupCallbacks]) cleanup();
  }

  private _ensureInstrumentation(
    miniappSdk: Partial<Record<'request' | 'httpRequest', unknown>>,
    name: 'request' | 'httpRequest',
  ): void {
    if (typeof miniappSdk[name] !== 'function') return;
    if (!ensureFunctionInstrumentation(miniappSdk, name)) {
      console.warn(`[sentry-miniapp] 无法包装当前平台的 ${name} API，网络面包屑和请求追踪将不可用`);
    }
  }

  private _trackCleanup(cleanups: Array<() => void>): () => void {
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      for (const callback of cleanups.reverse()) callback();
      this._cleanupCallbacks.delete(cleanup);
    };
    this._cleanupCallbacks.add(cleanup);
    return cleanup;
  }

  private _invokeRequestWrapper(original: Function, thisArg: unknown, args: unknown[]): unknown {
    let wrapper = this._requestWrappers.get(original);
    if (!wrapper) {
      wrapper = this._createRequestWrapper(original);
      this._requestWrappers.set(original, wrapper);
    }
    return wrapper.apply(thisArg, args);
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
    const propagateTraceparent = this._propagateTraceparent;
    const enableStandaloneHttpSpans = this._enableStandaloneHttpSpans;

    return function (this: any, options: any): any {
      if (!options || typeof options !== 'object') {
        return originalRequest.call(this, options);
      }

      // 内置 transport 会标记 options 及 header 身份，常见浅拷贝 wrapper 也无需依赖全局 URL。
      if (isMarkedSentryRequest(options)) {
        return originalRequest.call(this, options);
      }

      const url = normalizeUrl(options.url);

      const client = getClient();
      // 使用 core 的 DSN/tunnel 规则识别 SDK 自身 envelope，避免将同域业务请求误排除。
      if (isSentryRequestUrl(url, client) || isSentryDsnRequestWithoutURL(url, client)) {
        return originalRequest.call(this, options);
      }

      // 浅拷贝 options，后续回调包装与 header 注入不污染调用方对象。
      const requestOptions = { ...options };

      // 注入分布式追踪头
      const method = normalizeMethod(options.method);
      const requestData = options.data;
      const startTime = Date.now();
      const requestSpan = startRequestSpan(method, url, enableStandaloneHttpSpans);
      let requestSpanFinished = false;
      const finishSpanOnce = (finish: RequestSpanFinishOptions): void => {
        if (requestSpanFinished) return;
        requestSpanFinished = true;
        finishRequestSpan(requestSpan, finish);
      };

      if (enableTracePropagation && shouldPropagateTrace(url)) {
        injectTraceHeaders(requestOptions, requestSpan, propagateTraceparent);
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
      requestOptions.success = function (this: any, ...args: any[]) {
        const res = args[0] || {};
        const statusCode = getResponseStatusCode(res);
        const duration = Date.now() - startTime;
        breadcrumbData['status_code'] = statusCode;
        breadcrumbData['duration'] = duration;
        finishSpanOnce({
          statusCode,
          status: isErrorStatusCode(statusCode) ? 'error' : 'ok',
          durationMs: duration,
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
      requestOptions.fail = function (this: any, ...args: any[]) {
        const err = args[0] || {};
        const duration = Date.now() - startTime;
        const errorMessage = err.errMsg || err.errorMessage || 'Network request failed';
        breadcrumbData['error'] = errorMessage;
        breadcrumbData['duration'] = duration;
        finishSpanOnce({
          status: 'error',
          errorMessage,
          durationMs: duration,
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

      requestOptions.complete = function (this: any, ...args: any[]) {
        const res = args[0] || {};
        const statusCode = getResponseStatusCode(res);
        finishSpanOnce({
          statusCode,
          status: isErrorStatusCode(statusCode) ? 'error' : 'ok',
          durationMs: Date.now() - startTime,
        });

        if (typeof originalComplete === 'function') {
          return originalComplete.apply(this, args);
        }
      };

      try {
        return originalRequest.call(this, requestOptions);
      } catch (error) {
        finishSpanOnce({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
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
      // 小程序没有可靠的“same-origin”概念。未配置白名单时不向任意域名泄露追踪头。
      return false;
    }
    return this._tracePropagationTargets.some((target) => {
      if (typeof target === 'string') {
        return url.includes(target);
      }
      target.lastIndex = 0;
      const matches = target.test(url);
      target.lastIndex = 0;
      return matches;
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
  durationMs: number;
};

type RequestSpan = {
  span: Span;
  standalone: boolean;
};

function startRequestSpan(
  method: string,
  url: string,
  enableStandaloneHttpSpans: boolean,
): RequestSpan | null {
  try {
    if (!hasSpansEnabled()) return null;
    const parentSpan = getActiveSpan();
    if (!parentSpan && !enableStandaloneHttpSpans) return null;

    const serverAddress = extractHost(url);
    const spanName = `${method} ${sanitizeSpanNameUrl(url)}`;
    const standalone = !parentSpan;
    const span = startInactiveSpan({
      name: spanName,
      op: 'http.client',
      kind: 2,
      parentSpan: parentSpan ?? null,
      // 静态 trace 生命周期下，无父普通 span 会被转换成 transaction。standalone segment
      // 直接发送 span envelope，既保留长生命周期小游戏的请求，又不制造高基数根 transaction。
      ...(!parentSpan && { experimental: { standalone: true } }),
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.miniapp',
        ...(standalone && { [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: spanName }),
        'http.request.method': method,
        'url.full': url,
        'server.address': serverAddress || undefined,
      },
    });
    return { span, standalone };
  } catch (_e) {
    return null;
  }
}

/**
 * 生成 `http.client` span 名用的 URL 清洗：去掉 query/fragment 与 URL 内的 userinfo（账号密码），
 * 既防敏感信息泄漏，也削掉一部分基数。
 *
 * **路径刻意保留原样**——SDK 无法推断 REST 路由模板（如 `/users/123` → `/users/:id`），强行参数化
 * 会误伤合法路径。若 REST 路径 id 造成 tracing 维度过高，请用 Sentry 的 `beforeSendTransaction`
 * 统一改写事务 / span 名（对网络与性能 resource span 均生效），见文档「配置 · 采样」。
 */
function sanitizeSpanNameUrl(url: string): string {
  if (url.startsWith('data:')) {
    return stripDataUrlContent(url);
  }

  const withoutQueryAndFragment = stripUrlQueryAndFragment(url);
  return withoutQueryAndFragment.replace(
    /^([a-z][a-z0-9+.-]*:\/\/)([^/?#@]+@)/i,
    '$1[filtered]:[filtered]@',
  );
}

function stripUrlQueryAndFragment(url: string): string {
  const stripped = url.split(/[?#]/, 1)[0];
  return stripped === undefined ? url : stripped;
}

function stripDataUrlContent(url: string): string {
  const mimeTypeMatch = url.match(/^data:([^;,]+)/);
  const mimeType = mimeTypeMatch && mimeTypeMatch[1] ? mimeTypeMatch[1] : 'text/plain';
  return `data:${mimeType}`;
}

function injectTraceHeaders(
  options: any,
  requestSpan: RequestSpan | null,
  propagateTraceparent: boolean,
): void {
  try {
    const span = requestSpan?.span;
    const traceData = getTraceData(
      span
        ? propagateTraceparent
          ? { span, propagateTraceparent: true }
          : { span }
        : propagateTraceparent
          ? { propagateTraceparent: true }
          : {},
    );
    const sentryTrace = traceData['sentry-trace'];
    if (!sentryTrace) return;

    const header = {
      ...(isRecord(options.headers) ? options.headers : {}),
      ...(isRecord(options.header) ? options.header : {}),
    };
    if (!hasHeader(header, 'sentry-trace')) {
      header['sentry-trace'] = sentryTrace;
    }

    if (traceData.baggage) {
      const baggageKey = findHeaderKey(header, 'baggage') || 'baggage';
      header[baggageKey] = mergeBaggageHeader(header[baggageKey], traceData.baggage);
    }

    if (propagateTraceparent && traceData.traceparent && !hasHeader(header, 'traceparent')) {
      header['traceparent'] = traceData.traceparent;
    }

    // 支持微信用 header、支付宝用 headers
    options.header = header;
    options.headers = header;
  } catch (_e) {
    // 追踪头注入失败不影响请求
  }
}

function finishRequestSpan(
  requestSpan: RequestSpan | null,
  options: RequestSpanFinishOptions,
): void {
  if (!requestSpan) return;

  try {
    const { span, standalone } = requestSpan;
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
    if (standalone) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME, Math.max(0, options.durationMs));
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

/**
 * `@sentry/core` 的自请求识别依赖全局 `URL`。部分小游戏运行时没有完整实现该 API，且外层请求库
 * 可能通过浅拷贝丢失 transport 的对象身份标记，因此这里用同一组 DSN 约束做无 `URL` 回退。
 * 同时要求匹配 DSN 主机和 `sentry_key` 查询参数，不能仅按域名过滤业务请求。
 */
function isSentryDsnRequestWithoutURL(url: string, client: Client | undefined): boolean {
  const dsnHost = client?.getDsn()?.host.toLowerCase();
  if (!dsnHost || !hasSentryKeyQueryParameter(url)) return false;

  const requestHost = extractHost(url).toLowerCase();
  return requestHost === dsnHost || requestHost.endsWith(`.${dsnHost}`);
}

function hasSentryKeyQueryParameter(url: string): boolean {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return false;

  const fragmentStart = url.indexOf('#');
  if (fragmentStart !== -1 && fragmentStart < queryStart) return false;

  const search = url.slice(queryStart, fragmentStart === -1 ? undefined : fragmentStart);
  return /(^|[?&])sentry_key=/.test(search);
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

function hasHeader(header: Record<string, any>, name: string): boolean {
  return findHeaderKey(header, name) !== undefined;
}

function findHeaderKey(header: Record<string, any>, name: string): string | undefined {
  const normalizedName = name.toLowerCase();
  return Object.keys(header).find((key) => key.toLowerCase() === normalizedName);
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
    const authorityMatch = url.match(/^https?:\/\/([^/?#\n]+)/i);
    if (!authorityMatch || !authorityMatch[1]) return '';

    const authority = authorityMatch[1].slice(authorityMatch[1].lastIndexOf('@') + 1);
    if (authority.startsWith('[')) {
      const closingBracket = authority.indexOf(']');
      return closingBracket === -1 ? '' : authority.slice(0, closingBracket + 1);
    }

    return authority.split(':', 1)[0] || '';
  } catch (_e) {
    return '';
  }
}
