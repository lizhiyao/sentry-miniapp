import { getCurrentHub } from '@sentry/core';
import { sdk } from '../../crossPlatform';
import { getActiveTransaction, msToSec } from '../utils';

export interface RequestInstrumentationOptions {
  traceRequest: boolean;
  shouldCreateSpanForRequest?(url: string): boolean;
}

export const defaultRequestInstrumentationOptions: RequestInstrumentationOptions = {
  traceRequest: true,
};

/** Registers span creators for miniapp request/httpRequest */
export function instrumentOutgoingRequests(_options?: Partial<RequestInstrumentationOptions>): void {
  const { traceRequest, shouldCreateSpanForRequest } = {
    ...defaultRequestInstrumentationOptions,
    ..._options,
  };

  if (!traceRequest) {
    return;
  }

  const requestTargets: Array<['request' | 'httpRequest', any]> = [
    ['request', (sdk as any).request],
    ['httpRequest', (sdk as any).httpRequest],
  ];

  requestTargets.forEach(([key, original]) => {
    if (typeof original !== 'function') {
      return;
    }

    const wrapped = (options: any = {}) => {
      const url = options.url || options.uri;

      if (typeof shouldCreateSpanForRequest === 'function' && !shouldCreateSpanForRequest(String(url || ''))) {
        return original.call(sdk, options);
      }

      // Skip Sentry intake requests
      const client = getCurrentHub().getClient();
      const dsnHost = client && (client as any).getDsn && (client as any).getDsn()?.host;
      if (dsnHost && typeof url === 'string' && url.indexOf(dsnHost) !== -1) {
        return original.call(sdk, options);
      }

      const activeTransaction = getActiveTransaction();
      const startTime = Date.now();
      const method = (options.method || 'GET').toUpperCase();

      const span =
        activeTransaction &&
        activeTransaction.startChild({
          op: 'http.client',
          description: `${method} ${url || 'unknown'}`,
          data: {
            url,
            method,
          },
          startTimestamp: msToSec(startTime),
        });

      let finished = false;
      const finish = (statusCode?: number) => {
        if (finished) {
          return;
        }
        finished = true;

        if (span) {
          if (typeof statusCode === 'number') {
            span.setData('http.status_code', statusCode);
          }
          span.finish(msToSec(Date.now()));
        }
      };

      const wrappedOptions = {
        ...options,
        success: (res: any) => {
          finish(res && res.statusCode);
          if (typeof options.success === 'function') {
            options.success(res);
          }
        },
        fail: (err: any) => {
          finish();
          if (typeof options.fail === 'function') {
            options.fail(err);
          }
        },
        complete: (res: any) => {
          finish(res && (res.statusCode || res.status));
          if (typeof options.complete === 'function') {
            options.complete(res);
          }
        },
      };

      return original.call(sdk, wrappedOptions);
    };

    (sdk as any)[key] = wrapped;
  });
}
