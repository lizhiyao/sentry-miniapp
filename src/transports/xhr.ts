import { createTransport } from '@sentry/core';
import { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { SyncPromise } from '@sentry/utils';

import { sdk } from '../crossPlatform';

const CONTENT_TYPE = 'application/json';

export function makeMiniappTransport(options: BaseTransportOptions): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    return new SyncPromise((resolve, reject) => {
      const requestFn = (sdk as any).request || (sdk as any).httpRequest;
      if (typeof requestFn !== 'function') {
        reject(new Error('Miniapp request function is not available'));
        return;
      }

      requestFn({
        url: options.url,
        method: 'POST',
        data: request.body,
        header: { 'content-type': CONTENT_TYPE },
        success(res: { statusCode?: number; headers?: Record<string, string> }): void {
          resolve({
            statusCode: res?.statusCode,
            headers: {
              'x-sentry-rate-limits': res?.headers?.['X-Sentry-Rate-Limits'] ?? null,
              'retry-after': res?.headers?.['Retry-After'] ?? null,
            },
          });
        },
        fail(error: object): void {
          reject(error);
        },
      });
    });
  }

  return createTransport(options, makeRequest);
}
