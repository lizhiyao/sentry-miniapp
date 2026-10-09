import { getClientLifetime } from '../lifecycle';
import { automaticSpanAttributes } from '../spanDimensions';
import { OwnerToken } from '../owner';
import {
  addBreadcrumb,
  getUrlQuery,
  parseUrl,
  parseStringToURLObject,
  getHttpSpanDetailsFromUrlObject,
  getActiveSpan,
  getClient,
  hasSpansEnabled,
  isSentryRequestUrl,
  matchesTracePropagationTargets,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_OK,
  SPAN_STATUS_ERROR,
  getTraceData,
  setHttpStatus,
  startInactiveSpan,
} from '@sentry/core';
import type { Client, Integration, Span } from '@sentry/core';
import { collectBody, collectUrl, collectUrlName, resolveMaxBodyBytes } from '../dataCollection';
import type { MaxBodySizeOption } from '../dataCollection';
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
  private readonly _maxBodyBytes: number;
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
      /** 在 core 内置敏感片段与本 SDK 补齐的支付／证件片段**之上追加**的键名片段（大小写不敏感、按片段匹配） */
      sensitiveKeys?: string[];
      /** 请求 / 响应体上报的字节上限，与 core 的 `maxRequestBodySize` 同语义（small=1 KB、medium=10 KB、默认 1 MB） */
      maxRequestBodySize?: MaxBodySizeOption;
      /** 不记录请求／响应正文的 URL 正则模式；匹配不使用业务正则的 lastIndex。 */
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
    this._sensitiveKeys = (options.sensitiveKeys || []).map((key) => key.toLowerCase());
    this._maxBodyBytes = resolveMaxBodyBytes(options.maxRequestBodySize);
    this._denyUrls = (options.denyBodyUrls || []).map((pattern) =>
      typeof pattern === 'string'
        ? new RegExp(pattern)
        : new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')),
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
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
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
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
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
      for (const callback of cleanups.splice(0).reverse()) {
        try {
          callback();
        } catch (_error) {
          /* 继续解除其余订阅。 */
        }
      }
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
    const sensitiveKeys = this._sensitiveKeys;
    const maxBodyBytes = this._maxBodyBytes;
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

      if (!client) return originalRequest.call(this, options);
      const owner = new OwnerToken(client);
      if (!owner.isActive()) {
        owner.release();
        return originalRequest.call(this, options);
      }

      // 浅拷贝 options，后续回调包装与 header 注入不污染调用方对象。
      const requestOptions = { ...options };

      // 注入分布式追踪头
      const method = normalizeMethod(options.method);
      const requestData = options.data;
      const startTime = Date.now();
      // dataCollection.urlQueryParams 只管 SDK 自己采集的数据：span 与面包屑用过滤后的 URL，
      // 而 Sentry 自身请求识别、追踪头注入和 body 黑名单仍按原始 URL 匹配。
      const collectedUrl = collectUrl(url, client, sensitiveKeys);
      let requestSpan: RequestSpan | null = null;
      owner.run((activeClient) => {
        requestSpan = startRequestSpan(
          method,
          collectedUrl,
          enableStandaloneHttpSpans,
          activeClient,
        );
      });
      owner.onRelease(() => {
        requestSpan = null;
      });
      if (!owner.isActive()) {
        owner.release();
        return originalRequest.call(this, options);
      }
      const finishSpanOnce = (finish: RequestSpanFinishOptions): void => {
        const span = requestSpan;
        requestSpan = null;
        finishRequestSpan(span, finish);
      };

      owner.registerFinalizer((reason) =>
        finishSpanOnce({
          status: 'error',
          errorMessage: reason,
          collectionEndReason: reason,
          durationMs: Date.now() - startTime,
        }),
      );
      if (enableTracePropagation && shouldPropagateTrace(url)) {
        owner.run(() => injectTraceHeaders(requestOptions, requestSpan, propagateTraceparent));
      }

      // 面包屑的 url 只到 path（core 的 getSanitizedUrlString），query 单列成 url.query，
      // 与 core 的 fetch 集成同构；span 侧仍用带过滤后 query 的 url.full。
      const parsedUrl = parseUrl(collectedUrl);
      const breadcrumbData: Record<string, any> = {
        url: collectUrlName(collectedUrl),
        method,
      };
      const collectedQuery = getUrlQuery(parsedUrl.search);
      if (collectedQuery) {
        breadcrumbData['url.query'] = collectedQuery;
      }

      // dataCollection.httpBodies 约束 SDK 自采的数据体，判定方式与 core 自身集成一致；
      // traceNetworkBody 仍是本 SDK 的显式 opt-in，两者都放行才记录。
      const httpBodies = client?.getDataCollectionOptions?.().httpBodies;
      const traceRequestBody =
        traceNetworkBody && (httpBodies === undefined || httpBodies.includes('outgoingRequest'));
      const traceResponseBody =
        traceNetworkBody && (httpBodies === undefined || httpBodies.includes('outgoingResponse'));

      if (traceRequestBody && requestData && !shouldDenyBodyUrl(url)) {
        try {
          const collected = collectBody(
            requestData,
            maxBodyBytes,
            sensitiveKeys,
            bodyContentType(options.header) ?? bodyContentType(options.headers),
          );
          if (collected.body !== undefined) breadcrumbData['request_body'] = collected.body;
          if (collected.byteLength !== undefined)
            breadcrumbData['request_body_size'] = collected.byteLength;
        } catch (_e) {
          breadcrumbData['request_body'] = '[Cannot serialize request body]';
        }
      }

      const originalSuccess = options.success;
      const originalFail = options.fail;
      const originalComplete = options.complete;

      // SDK 观察只占同步 owner 范围；业务回调保持宿主的 this/参数/返回值/throw。
      const observe = (callback: (ownerClient: Client) => void): void => {
        try {
          owner.run(callback);
        } catch (_error) {
          // 不可读响应等采集故障仍结束本操作，不留下等待退休的 span。
          owner.run(() =>
            finishSpanOnce({
              status: 'error',
              errorMessage: 'telemetry_error',
              durationMs: Date.now() - startTime,
            }),
          );
        } finally {
          owner.release();
        }
      };
      requestOptions.success = function (this: any, ...args: any[]) {
        observe(() => {
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
          if (!owner.isActive()) return;
          if (traceResponseBody && res.data && !shouldDenyBodyUrl(url)) {
            try {
              const collected = collectBody(
                res.data,
                maxBodyBytes,
                sensitiveKeys,
                bodyContentType(res.header) ?? bodyContentType(res.headers),
              );
              if (collected.body !== undefined) breadcrumbData['response_body'] = collected.body;
              if (collected.byteLength !== undefined)
                breadcrumbData['response_body_size'] = collected.byteLength;
            } catch (_error) {
              breadcrumbData['response_body'] = '[Cannot serialize response body]';
            }
          }
          addBreadcrumb({
            type: 'http',
            category: 'xhr',
            data: breadcrumbData,
            level: isErrorStatusCode(statusCode) || duration > 3000 ? 'warning' : 'info',
          });
        });
        if (typeof originalSuccess === 'function') return originalSuccess.apply(this, args);
      };

      requestOptions.fail = function (this: any, ...args: any[]) {
        observe(() => {
          const err = args[0] || {};
          const duration = Date.now() - startTime;
          const errorMessage = err.errMsg || err.errorMessage || 'Network request failed';
          breadcrumbData['error'] = errorMessage;
          breadcrumbData['duration'] = duration;
          finishSpanOnce({ status: 'error', errorMessage, durationMs: duration });
          if (!owner.isActive()) return;
          addBreadcrumb({ type: 'http', category: 'xhr', data: breadcrumbData, level: 'error' });
        });
        if (typeof originalFail === 'function') return originalFail.apply(this, args);
      };

      requestOptions.complete = function (this: any, ...args: any[]) {
        observe(() => {
          const res = args[0] || {};
          const statusCode = getResponseStatusCode(res);
          finishSpanOnce({
            statusCode,
            status: isErrorStatusCode(statusCode) ? 'error' : 'ok',
            durationMs: Date.now() - startTime,
          });
        });
        if (typeof originalComplete === 'function') return originalComplete.apply(this, args);
      };

      try {
        return originalRequest.call(this, requestOptions);
      } catch (error) {
        observe(() =>
          finishSpanOnce({
            status: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startTime,
          }),
        );
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
    // 复用 core 11 的匹配语义：大小写不敏感，并忽略 RegExp 的 g / y 状态（避免 lastIndex 串味）。
    return matchesTracePropagationTargets(url, this._tracePropagationTargets);
  }

  /**
   * 检查 URL 是否在拒绝记录请求体的列表中
   */
  private _shouldDenyBodyUrl(url: string): boolean {
    return this._denyUrls.some((pattern) => pattern.test(url));
  }
}

type RequestSpanFinishOptions = {
  status: 'ok' | 'error';
  statusCode?: unknown;
  errorMessage?: string;
  durationMs: number;
  collectionEndReason?: string;
};

type RequestSpan = {
  span: Span;
  standalone: boolean;
};

function startRequestSpan(
  method: string,
  url: string,
  enableStandaloneHttpSpans: boolean,
  client: Client | undefined,
): RequestSpan | null {
  try {
    if (!hasSpansEnabled()) return null;
    const parentSpan = getActiveSpan();
    if (!parentSpan && !enableStandaloneHttpSpans) return null;

    const serverAddress = extractHost(url);
    const spanName = `${method} ${collectUrlName(url)}`;
    const standalone = !parentSpan;
    const [, urlAttributes] = getHttpSpanDetailsFromUrlObject(
      parseStringToURLObject(url),
      'client',
      'auto.http.miniapp',
      { method },
      undefined,
      client,
    );
    const span = startInactiveSpan({
      name: spanName,
      op: 'http.client',
      parentSpan: parentSpan ?? null,
      attributes: automaticSpanAttributes(client, {
        ...urlAttributes,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.miniapp',
        // core 11 移除了数字 `kind`，OTEL SpanKind.CLIENT 改由 'sentry.kind' 属性表达。
        'sentry.kind': 'client',
        'http.request.method': method,
        'url.full': url,
        'server.address': serverAddress || undefined,
      }),
    });
    return { span, standalone };
  } catch (_e) {
    return null;
  }
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
    if (options.collectionEndReason) {
      span.setAttribute('miniapp.collection_end_reason', options.collectionEndReason);
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

/** 只用于识别正文格式，不把请求/响应 headers 写入遥测。 */
function bodyContentType(headers: unknown): string | undefined {
  if (!isRecord(headers)) return undefined;
  const key = findHeaderKey(headers, 'content-type');
  const value: unknown = key === undefined ? undefined : headers[key];
  return typeof value === 'string' ? value : undefined;
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

/** 每次装配创建独立实例，资源仍由 client lifetime 管理。 */
export type NetworkBreadcrumbsOptions = ConstructorParameters<typeof NetworkBreadcrumbs>[0];
export function networkBreadcrumbsIntegration(
  options: NetworkBreadcrumbsOptions = {},
): Integration {
  return new NetworkBreadcrumbs(options);
}
