import { getClientLifetime } from '../lifecycle';
import { automaticSpanAttributes } from '../spanDimensions';
import { OwnerToken } from '../owner';
import {
  addBreadcrumb,
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
  spanIsIgnored,
  startInactiveSpan,
} from '@sentry/core';
import type { Client, Integration, Span } from '@sentry/core';
import { collectBody, collectUrlParts, resolveMaxBodyBytes } from '../dataCollection';
import type { MaxBodySizeOption } from '../dataCollection';
import { sdk } from '../crossPlatform';
import {
  addFunctionInstrumentationHandler,
  ensureFunctionInstrumentation,
} from '../instrumentation';
import { isMarkedSentryRequest, isMarkedSentryRequestOptions } from '../transports/requestMarker';

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
      /** 追踪头 URL 匹配规则；字符串匹配完整 URL 子串，匹配的请求才注入追踪头。 */
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
      try {
        if (typeof miniappSdk[name] !== 'function') continue;
        cleanups.push(
          addFunctionInstrumentationHandler(miniappSdk, name, client, (original, thisArg, args) =>
            this._invokeRequestWrapper(original, thisArg, args),
          ),
        );
      } catch (_error) {
        /* 一项宿主能力不可读不阻断其它网络入口或 SDK 初始化。 */
      }
    }
    const cleanup = this._trackCleanup(cleanups);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
  }

  private _ensureInstrumentation(
    miniappSdk: Partial<Record<'request' | 'httpRequest', unknown>>,
    name: 'request' | 'httpRequest',
  ): void {
    try {
      if (typeof miniappSdk[name] !== 'function') return;
      if (!ensureFunctionInstrumentation(miniappSdk, name)) {
        console.warn(
          `[sentry-miniapp] 无法包装当前平台的 ${name} API，网络面包屑和请求追踪将不可用`,
        );
      }
    } catch (_error) {
      /* 不可读能力或诊断故障不阻断其它网络入口。 */
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
    };
    return cleanup;
  }

  private _invokeRequestWrapper(original: Function, thisArg: unknown, args: unknown[]): unknown {
    let wrapper = this._requestWrappers.get(original);
    if (!wrapper) {
      wrapper = this._createRequestWrapper(original);
      this._requestWrappers.set(original, wrapper);
    }
    return Function.prototype.apply.call(wrapper, thisArg, args);
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

    return function (this: any, ...requestArgs: any[]): any {
      const options = requestArgs[0];
      let preparedOptions = options;
      let pendingOwner: OwnerToken | undefined;
      let requestThrew: ((error: unknown) => void) | undefined;
      const prepareObservation = (): void => {
        if (!options || typeof options !== 'object') {
          return;
        }

        // 内置 transport 会标记 options 及 header 身份，常见浅拷贝 wrapper 也无需依赖全局 URL。
        if (isMarkedSentryRequestOptions(options)) {
          return;
        }
        let client = getClient();
        if (!client) return;
        let lifetime = getClientLifetime(client);
        const ensureActive = (): void => {
          if (
            !client ||
            getClient() !== client ||
            client.getOptions().enabled === false ||
            (lifetime && !lifetime.canCollectAutomatic())
          )
            throw new Error('Request observation retired');
        };
        // getter、不可枚举／继承字段都只读取一次；发送与观测共用该快照。
        const requestOptions = snapshotRequestOptions(options, ensureActive);
        if (isMarkedSentryRequest(requestOptions)) return;
        const url = normalizeUrl(requestOptions['url']);
        ensureActive();
        // 使用 core 的 DSN/tunnel 规则识别 SDK 自身 envelope，避免将同域业务请求误排除。
        if (isSentryRequestUrl(url, client) || isSentryDsnRequestWithoutURL(url, client)) {
          return;
        }

        // 注入分布式追踪头
        const method = normalizeMethod(requestOptions['method']);
        const requestData = requestOptions['data'];
        const startTime = Date.now();
        // dataCollection.urlQueryParams 只管 SDK 自己采集的数据：span 与面包屑用过滤后的 URL，
        // 而 Sentry 自身请求识别、追踪头注入和 body 黑名单仍按原始 URL 匹配。
        const collected = collectUrlParts(url, client, sensitiveKeys);
        // 宿主契约是字符串 URL；对象的重复 String 转换可能给出不同目标，不能据此放行。
        const stableUrl = typeof requestOptions['url'] === 'string';
        const propagate = stableUrl && enableTracePropagation && shouldPropagateTrace(url);

        // 面包屑的 url 只到 path（core 的 getSanitizedUrlString），query 单列成 url.query，
        // 与 core 的 fetch 集成同构；span 侧仍用带过滤后 query 的 url.full。
        const breadcrumbData: Record<string, any> = {
          url: collected.name,
          method,
        };
        if (collected.query) {
          breadcrumbData['url.query'] = collected.query;
        }

        // dataCollection.httpBodies 约束 SDK 自采的数据体，判定方式与 core 自身集成一致；
        // traceNetworkBody 仍是本 SDK 的显式 opt-in，两者都放行才记录。
        const httpBodies = client?.getDataCollectionOptions?.().httpBodies;
        const traceRequestBody =
          stableUrl &&
          traceNetworkBody &&
          (httpBodies === undefined || httpBodies.includes('outgoingRequest'));
        const traceResponseBody =
          stableUrl &&
          traceNetworkBody &&
          (httpBodies === undefined || httpBodies.includes('outgoingResponse'));

        if (traceRequestBody && requestData && !shouldDenyBodyUrl(url)) {
          try {
            const collected = collectBody(
              requestData,
              maxBodyBytes,
              sensitiveKeys,
              readBodyContentType(requestOptions, ensureActive),
            );
            if (collected.body !== undefined) breadcrumbData['request_body'] = collected.body;
            if (collected.byteLength !== undefined)
              breadcrumbData['request_body_size'] = collected.byteLength;
          } catch (_e) {
            breadcrumbData['request_body'] = '[Cannot serialize request body]';
          }
        }

        ensureActive();
        const originalSuccess = requestOptions['success'];
        const originalFail = requestOptions['fail'];
        const originalComplete = requestOptions['complete'];

        // 先完成可失败的观测读取，再创建 span；失败时宿主仍收到原 options。
        const owner = new OwnerToken(client);
        pendingOwner = owner;
        if (!owner.isActive()) {
          owner.release();
          return;
        }
        let requestSpan: RequestSpan | null = null;
        owner.run((activeClient) => {
          requestSpan = startRequestSpan(
            method,
            collected,
            enableStandaloneHttpSpans,
            activeClient,
          );
        });
        owner.onRelease(() => {
          requestSpan = null;
          // 业务请求可以长期持有包装回调，门禁闭包不能因此保留整个退休 client。
          client = undefined;
          lifetime = undefined;
        });
        if (!owner.isActive()) {
          owner.release();
          return;
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
        if (propagate) {
          owner.run(() => injectTraceHeaders(requestOptions, requestSpan, propagateTraceparent));
        }
        ensureActive();

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
        requestOptions['success'] = function (this: any, ...args: any[]) {
          observe(() => {
            const res = args[0] || {};
            const statusCode = getResponseStatusCode(res, ensureActive);
            const duration = Date.now() - startTime;
            breadcrumbData['status_code'] = statusCode;
            breadcrumbData['duration'] = duration;
            finishSpanOnce({
              statusCode,
              status: isErrorStatusCode(statusCode) ? 'error' : 'ok',
              durationMs: duration,
            });
            if (!owner.isActive()) return;
            if (traceResponseBody && !shouldDenyBodyUrl(url)) {
              try {
                const data = res.data;
                ensureActive();
                if (data) {
                  const collected = collectBody(
                    data,
                    maxBodyBytes,
                    sensitiveKeys,
                    readBodyContentType(res, ensureActive),
                  );
                  if (collected.body !== undefined)
                    breadcrumbData['response_body'] = collected.body;
                  if (collected.byteLength !== undefined)
                    breadcrumbData['response_body_size'] = collected.byteLength;
                }
              } catch (_error) {
                breadcrumbData['response_body'] = '[Cannot serialize response body]';
              }
            }
            if (!owner.isActive()) return;
            addBreadcrumb({
              type: 'http',
              category: 'xhr',
              data: breadcrumbData,
              level: isErrorStatusCode(statusCode) || duration > 3000 ? 'warning' : 'info',
            });
          });
          if (typeof originalSuccess === 'function')
            return Function.prototype.apply.call(originalSuccess, this, args);
        };

        requestOptions['fail'] = function (this: any, ...args: any[]) {
          observe(() => {
            const err = args[0] || {};
            const duration = Date.now() - startTime;
            const primaryMessage = err.errMsg;
            ensureActive();
            const errorMessage = primaryMessage || err.errorMessage || 'Network request failed';
            ensureActive();
            breadcrumbData['error'] = errorMessage;
            breadcrumbData['duration'] = duration;
            finishSpanOnce({ status: 'error', errorMessage, durationMs: duration });
            if (!owner.isActive()) return;
            addBreadcrumb({ type: 'http', category: 'xhr', data: breadcrumbData, level: 'error' });
          });
          if (typeof originalFail === 'function')
            return Function.prototype.apply.call(originalFail, this, args);
        };

        requestOptions['complete'] = function (this: any, ...args: any[]) {
          observe(() => {
            const res = args[0] || {};
            const statusCode = getResponseStatusCode(res, ensureActive);
            finishSpanOnce({
              statusCode,
              status: isErrorStatusCode(statusCode) ? 'error' : 'ok',
              durationMs: Date.now() - startTime,
            });
          });
          if (typeof originalComplete === 'function')
            return Function.prototype.apply.call(originalComplete, this, args);
        };

        requestThrew = (error) =>
          observe(() =>
            finishSpanOnce({
              status: 'error',
              errorMessage: error instanceof Error ? error.message : String(error),
              durationMs: Date.now() - startTime,
            }),
          );
        preparedOptions = requestOptions;
      };
      try {
        prepareObservation();
      } catch (_error) {
        pendingOwner?.release();
        preparedOptions = options;
        requestThrew = undefined;
      }
      // 宿主调用在降级边界之外，仅执行一次；业务异常不能触发请求重试。
      try {
        if (requestArgs.length) requestArgs[0] = preparedOptions;
        return Function.prototype.apply.call(originalRequest, this, requestArgs);
      } catch (error) {
        try {
          requestThrew?.(error);
        } catch (_observationError) {
          /* 保留原宿主异常。 */
        }
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

const requestFields = ['url', 'method', 'data', 'header', 'headers', 'success', 'fail', 'complete'];

/** 保留业务扩展字段，补齐宿主会读取的非枚举／继承字段，避免重复触发 getter。 */
function snapshotRequestOptions(
  options: Record<PropertyKey, unknown>,
  ensureActive: () => void,
): Record<PropertyKey, unknown> {
  const snapshot: Record<PropertyKey, unknown> = {};
  const keys =
    typeof Reflect !== 'undefined' && typeof Reflect.ownKeys === 'function'
      ? Reflect.ownKeys(options)
      : [...Object.getOwnPropertyNames(options), ...Object.getOwnPropertySymbols(options)];
  ensureActive();
  for (const key of new Set<PropertyKey>([...keys, ...requestFields])) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    ensureActive();
    if (!descriptor?.enumerable && !(typeof key === 'string' && requestFields.includes(key)))
      continue;
    const present = descriptor !== undefined || key in options;
    ensureActive();
    if (!present) continue;
    const value = options[key];
    ensureActive();
    Object.defineProperty(snapshot, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return snapshot;
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
  collected: ReturnType<typeof collectUrlParts>,
  enableStandaloneHttpSpans: boolean,
  client: Client | undefined,
): RequestSpan | null {
  try {
    if (!hasSpansEnabled()) return null;
    const parentSpan = getActiveSpan();
    if (!parentSpan && !enableStandaloneHttpSpans) return null;

    const { url, name } = collected;
    const serverAddress = extractHost(url);
    const spanName = `${method} ${name}`;
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
    const header = {
      ...(isRecord(options.headers) ? options.headers : {}),
      ...(isRecord(options.header) ? options.header : {}),
    };
    // 调用方已有 trace 标识时整组传播由其管理，不能混入本地 span 的另一条 trace。
    if (hasHeader(header, 'sentry-trace') || hasHeader(header, 'traceparent')) return;

    let span = requestSpan?.span;
    // 忽略本地 HTTP 子 span 不应把已采样的父 trace 改为未采样；与 Core fetch / Browser XHR 一致。
    // 无父的 ignored segment 仍使用自身明确的未采样决策。
    if (span && spanIsIgnored(span) && getActiveSpan()) span = undefined;
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

    header['sentry-trace'] = sentryTrace;

    if (traceData.baggage) {
      const baggageKey = findHeaderKey(header, 'baggage') || 'baggage';
      header[baggageKey] = mergeBaggageHeader(header[baggageKey], traceData.baggage);
    }

    if (propagateTraceparent && traceData.traceparent) {
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

function getResponseStatusCode(response: any, ensureActive: () => void): unknown {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const statusCode = response.statusCode;
  ensureActive();
  if (statusCode !== undefined && statusCode !== null) return statusCode;
  const status = response.status;
  ensureActive();
  return status;
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

function readBodyContentType(
  options: Record<string, unknown>,
  ensureActive: () => void,
): string | undefined {
  for (const key of ['header', 'headers']) {
    const headers = options[key];
    ensureActive();
    const contentType = bodyContentType(headers);
    ensureActive();
    if (contentType !== undefined) return contentType;
  }
  return undefined;
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
