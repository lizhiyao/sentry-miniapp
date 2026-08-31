import { describe, expect, it } from 'vitest';

import {
  isMarkedSentryRequest,
  markSentryRequest,
} from '../src/transports/requestMarker';

describe('transport request marker', () => {
  it('recognizes the original request options', () => {
    const options = { url: 'https://sentry.example/api/envelope/' };

    markSentryRequest(options);

    expect(isMarkedSentryRequest(options)).toBe(true);
  });

  it.each(['header', 'headers'] as const)(
    'survives a shallow options clone through the %s object identity',
    (headerName) => {
      const options = {
        url: 'https://sentry.example/api/envelope/',
        [headerName]: { 'Content-Type': 'application/x-sentry-envelope' },
      };
      markSentryRequest(options);

      expect(isMarkedSentryRequest({ ...options })).toBe(true);
    },
  );

  it('does not classify unrelated or deeply cloned options as marked', () => {
    const options = {
      url: 'https://sentry.example/api/envelope/',
      header: { 'Content-Type': 'application/x-sentry-envelope' },
    };
    markSentryRequest(options);

    expect(isMarkedSentryRequest(null)).toBe(false);
    expect(isMarkedSentryRequest({ ...options, header: { ...options.header } })).toBe(false);
  });
});
