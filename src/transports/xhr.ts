import type { BaseTransportOptions, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { createTransport } from '@sentry/core';

import { sdk } from '../crossPlatform';

export interface MiniappTransportOptions extends BaseTransportOptions {
  /** Custom headers for the request */
  headers?: Record<string, string>;
}

/**
 * Creates a Transport that uses the miniapp request API to send events to Sentry.
 */
export function createMiniappTransport(options: MiniappTransportOptions): Transport {
  // 保存 URL 到局部变量
  const transportUrl = options.url;
  const transportHeaders = options.headers;

  /**
   * Make a request using miniapp request API
   */
  function makeRequest(request: any): Promise<TransportMakeRequestResponse> {
    
    return new Promise((resolve, reject) => {
      const requestOptions = {
        url: transportUrl,
        method: 'POST' as const,
        data: request.body,
        header: {
          'Content-Type': 'application/json',
          ...request.headers,
        },
        timeout: 10000,
        success: (res: any) => {
          const status = res.statusCode;
          
          resolve({
            statusCode: status,
            headers: {
              'x-sentry-rate-limits': res.header?.['x-sentry-rate-limits'],
              'retry-after': res.header?.['retry-after'],
            },
          });
        },
        fail: (error: any) => {
          reject(new Error(`Network request failed: ${error.errMsg || error.message || 'Unknown error'}`));
        },
      };

      // Use the appropriate request method based on the platform
      if (sdk().request) {
        sdk().request?.(requestOptions);
      } else if (sdk().httpRequest) {
        sdk().httpRequest?.(requestOptions);
      } else {
        reject(new Error('No request method available in current miniapp environment'));
      }
    });
  }

  return createTransport(options, makeRequest);
}