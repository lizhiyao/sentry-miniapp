import type { BaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { createTransport } from '@sentry/core';

import { sdk, appName } from '../crossPlatform';
import { exactArrayBuffer } from '../coreCompat';
import { markSentryRequest } from './requestMarker';

const SENTRY_ENVELOPE_CONTENT_TYPE = 'application/x-sentry-envelope';
export const DEFAULT_TRANSPORT_REQUEST_TIMEOUT = 3000;
export const DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS = 2;

export interface MiniappTransportOptions extends BaseTransportOptions {
  /** 默认仅在已确认的 wx/tt request 上使用 ArrayBuffer；其他宿主须验证后显式配置。 */
  binaryRequestBody?: 'arraybuffer' | 'unsupported';
  /** Custom headers for the request */
  headers?: Record<string, string>;
  /** Sentry envelope request timeout in milliseconds. Defaults to 3000. */
  requestTimeout?: number;
  /** Maximum number of Sentry requests using host network slots at once. Defaults to 2. */
  maxConcurrentRequests?: number;
}

/** 永久能力错误不应进入离线重试。 */
export class UnsupportedBinaryRequestError extends Error {
  public constructor() {
    super('Binary Sentry request body is unsupported by this miniapp transport');
  }
}

interface MiniappTransportRequest {
  body: string | Uint8Array;
  headers?: Record<string, string>;
}

interface MiniappRequestTask {
  abort?: () => void;
}

const controls = new WeakMap<Transport, { shutdown: () => void; revoke: () => void }>();

/** 内部 runtime 关闭入口；公开 transport 配置不暴露 SDK 控制回调。 */
export function shutdownMiniappTransport(transport: Transport): void {
  controls.get(transport)?.shutdown();
}

/** 撤回仅处理 SDK 遥测请求；正常拒绝交由唯一 core offline 层入库。 */
export function revokeMiniappTransport(transport: Transport): void {
  controls.get(transport)?.revoke();
}

export function normalizeRequestTimeout(timeout: number | undefined): number {
  return typeof timeout === 'number' && isFinite(timeout) && timeout > 0
    ? Math.max(1, Math.floor(timeout))
    : DEFAULT_TRANSPORT_REQUEST_TIMEOUT;
}

export function normalizeMaxConcurrentRequests(maxConcurrentRequests: number | undefined): number {
  return typeof maxConcurrentRequests === 'number' &&
    isFinite(maxConcurrentRequests) &&
    maxConcurrentRequests > 0
    ? Math.max(1, Math.floor(maxConcurrentRequests))
    : DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS;
}

function networkError(error: any): Error {
  const message =
    typeof error === 'string'
      ? error
      : error?.errMsg || error?.errorMessage || error?.message || 'Unknown error';
  return new Error(`Network request failed: ${message}`);
}

/**
 * Creates a Transport that uses the miniapp request API to send events to Sentry.
 */
export function createMiniappTransport(
  options: MiniappTransportOptions,
  canSend: () => boolean = () => true,
  hasConsent: () => boolean = () => true,
  onBinaryUnsupported: () => void = () => {},
): Transport {
  const binaryRequestBody =
    options.binaryRequestBody ??
    (appName() === 'wechat' || appName() === 'bytedance' ? 'arraybuffer' : 'unsupported');
  // 保存 URL 到局部变量
  const transportUrl = options.url;
  const transportHeaders = options.headers || {};
  const requestTimeout = normalizeRequestTimeout(options.requestTimeout);
  const maxConcurrentRequests = normalizeMaxConcurrentRequests(options.maxConcurrentRequests);
  const requestQueue: Array<{
    request: MiniappTransportRequest;
    resolve: (response: TransportMakeRequestResponse) => void;
    reject: (error: unknown) => void;
  }> = [];
  let activeRequests = 0;
  let stopped = false;
  const cancellations = new Set<(error?: Error) => void>();

  /**
   * Execute a request using the miniapp request API.
   */
  function executeRequest(request: MiniappTransportRequest): Promise<TransportMakeRequestResponse> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let requestTask: MiniappRequestTask | undefined;

      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        cancellations.delete(cancel);
        callback();
      };

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settle(() => {
          abort();
          reject(new Error(`Sentry request timed out after ${requestTimeout}ms`));
        });
      }, requestTimeout);

      const abort = (): void => {
        try {
          requestTask?.abort?.();
        } catch (_error) {
          /* 宿主 abort 故障不能阻断结算。 */
        }
      };
      const cancel = (error?: Error): void =>
        settle(() => {
          abort();
          if (error) reject(error);
          else resolve({});
        });
      cancellations.add(cancel);

      try {
        const requestOptions = {
          url: transportUrl,
          method: 'POST' as const,
          data: typeof request.body === 'string' ? request.body : exactArrayBuffer(request.body),
          header: {
            'Content-Type': SENTRY_ENVELOPE_CONTENT_TYPE,
            ...transportHeaders,
            ...request.headers,
          },
          // Alipay uses `headers` instead of `header`
          headers: {
            'Content-Type': SENTRY_ENVELOPE_CONTENT_TYPE,
            ...transportHeaders,
            ...request.headers,
          },
          timeout: requestTimeout,
          success: (res: any) => {
            settle(() => {
              // Alipay uses `status` instead of `statusCode`, and `headers` instead of `header`
              const status = res.statusCode ?? res.status;
              const resHeaders = {
                ...(res.headers || {}),
                ...(res.header || {}),
              };

              resolve({
                statusCode: status,
                headers: {
                  'x-sentry-rate-limits': getHeaderValue(resHeaders, 'x-sentry-rate-limits'),
                  'retry-after': getHeaderValue(resHeaders, 'retry-after'),
                },
              });
            });
          },
          fail: (error: any) => {
            settle(() => reject(networkError(error)));
          },
        };

        markSentryRequest(requestOptions);

        // Use the appropriate request method based on the platform
        const currentSdk = sdk();
        const requestApi = currentSdk.request ?? currentSdk.httpRequest;
        if (stopped || !canSend()) {
          cancel();
        } else if (!hasConsent()) {
          cancel(new Error('Sentry request blocked by consent'));
        } else if (typeof requestApi === 'function') {
          requestTask = requestApi.call(currentSdk, requestOptions) as
            MiniappRequestTask | undefined;
          // 宿主 request 内可同步触发 dispose，返回的 task 此前尚不可 abort。
          if (stopped || !canSend() || !hasConsent()) abort();
        } else {
          settle(() =>
            reject(new Error('No request method available in current miniapp environment')),
          );
        }
      } catch (error) {
        settle(() => reject(networkError(error)));
      }
    });
  }

  function drainRequestQueue(): void {
    while (activeRequests < maxConcurrentRequests && requestQueue.length > 0) {
      const pending = requestQueue.shift();
      if (!pending) return;

      if (stopped || !canSend()) {
        pending.resolve({});
        continue;
      }
      if (!hasConsent()) {
        pending.reject(new Error('Sentry request blocked by consent'));
        continue;
      }
      activeRequests += 1;
      void executeRequest(pending.request).then(
        (response) => {
          activeRequests -= 1;
          drainRequestQueue();
          pending.resolve(response);
        },
        (error) => {
          activeRequests -= 1;
          drainRequestQueue();
          pending.reject(error);
        },
      );
    }
  }

  /**
   * @sentry/core keeps a bounded envelope buffer, while this queue separately limits how many
   * requests can occupy scarce miniapp network slots at the same time.
   */
  function makeRequest(request: MiniappTransportRequest): Promise<TransportMakeRequestResponse> {
    if (stopped || !canSend()) return Promise.resolve({});
    if (!hasConsent()) return Promise.reject(new Error('Sentry request blocked by consent'));
    if (typeof request.body !== 'string' && binaryRequestBody !== 'arraybuffer') {
      try {
        onBinaryUnsupported();
      } catch (_error) {
        /* Diagnostic hooks cannot change rejection. */
      }
      return Promise.reject(new UnsupportedBinaryRequestError());
    }
    return new Promise((resolve, reject) => {
      requestQueue.push({ request, resolve, reject });
      drainRequestQueue();
    });
  }

  const transport = createTransport(options, makeRequest);
  controls.set(transport, {
    shutdown: () => {
      if (stopped) return;
      stopped = true;
      for (const pending of requestQueue.splice(0)) pending.resolve({});
      for (const cancel of [...cancellations]) cancel();
    },
    revoke: () => {
      if (stopped) return;
      const error = new Error('Sentry request blocked by consent');
      for (const pending of requestQueue.splice(0)) pending.reject(error);
      for (const cancel of [...cancellations]) cancel(error);
    },
  });
  return transport;
}

function getHeaderValue(headers: Record<string, unknown>, name: string): string | null {
  const normalizedName = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === normalizedName);
  const value = key === undefined ? undefined : headers[key];
  return typeof value === 'string' ? value : null;
}
