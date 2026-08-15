import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '@sentry/core';

const { mockGetCurrentScope } = vi.hoisted(() => ({
  mockGetCurrentScope: vi.fn(),
}));

vi.mock('@sentry/core', () => ({
  exceptionFromError: vi.fn(() => ({ type: 'Error', value: 'linked' })),
  getCurrentScope: mockGetCurrentScope,
}));

import { LinkedErrors } from '../src/integrations/linkederrors';

describe('LinkedErrors fallbacks', () => {
  const NativeError = globalThis.Error;

  afterEach(() => {
    globalThis.Error = NativeError;
    vi.clearAllMocks();
  });

  it('returns the original event when no Sentry client is bound', () => {
    mockGetCurrentScope.mockReturnValue({ getClient: () => undefined });
    const event: Event = { message: 'no client' };

    expect(new LinkedErrors().processEvent(event)).toBe(event);
  });

  it('contains instanceof failures from non-standard runtimes', () => {
    mockGetCurrentScope.mockReturnValue({ getClient: () => ({}) });
    const event: Event = {
      exception: { values: [{ type: 'Error', value: 'outer' }] },
    };
    const throwingError = new Proxy(NativeError, {
      get(target, property, receiver) {
        if (property === Symbol.hasInstance) {
          throw new NativeError('instanceof unavailable');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    globalThis.Error = throwingError;

    expect(
      new LinkedErrors().processEvent(event, { originalException: { cause: 'unknown' } }),
    ).toBe(event);
  });
});
