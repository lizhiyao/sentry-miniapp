import type { BaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { createTransport } from '@sentry/core';

import { sdk } from '../crossPlatform';

const SENTRY_ENVELOPE_CONTENT_TYPE = 'application/x-sentry-envelope';
export const DEFAULT_TRANSPORT_REQUEST_TIMEOUT = 3000;
export const DEFAULT_TRANSPORT_MAX_CONCURRENT_REQUESTS = 2;

export interface MiniappTransportOptions extends BaseTransportOptions {
  /** Custom headers for the request */
  headers?: Record<string, string>;
  /** Sentry envelope request timeout in milliseconds. Defaults to 3000. */
  requestTimeout?: number;
  /** Maximum number of Sentry requests using host network slots at once. Defaults to 2. */
  maxConcurrentRequests?: number;
}

interface MiniappTransportRequest {
  body: string | Uint8Array;
  headers?: Record<string, string>;
}

interface MiniappRequestTask {
  abort?: () => void;
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
export function createMiniappTransport(options: MiniappTransportOptions): Transport {
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
        callback();
      };

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          requestTask?.abort?.();
        } catch (_error) {
          // 某些宿主的 RequestTask.abort 可能抛错；超时仍需立即释放 SDK Promise。
        }
        reject(new Error(`Sentry request timed out after ${requestTimeout}ms`));
      }, requestTimeout);

      const requestOptions = {
        url: transportUrl,
        method: 'POST' as const,
        data: request.body,
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

      // Use the appropriate request method based on the platform
      try {
        const currentSdk = sdk();
        if (currentSdk.request) {
          requestTask = currentSdk.request(requestOptions) as MiniappRequestTask | undefined;
        } else if (currentSdk.httpRequest) {
          requestTask = currentSdk.httpRequest(requestOptions) as MiniappRequestTask | undefined;
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
    return new Promise((resolve, reject) => {
      requestQueue.push({ request, resolve, reject });
      drainRequestQueue();
    });
  }

  return createTransport(options, makeRequest);
}

function getHeaderValue(headers: Record<string, unknown>, name: string): string | null {
  const normalizedName = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === normalizedName);
  const value = key === undefined ? undefined : headers[key];
  return typeof value === 'string' ? value : null;
}
