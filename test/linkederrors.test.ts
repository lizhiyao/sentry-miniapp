import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '@sentry/core';

const { mockGetCurrentScope } = vi.hoisted(() => ({
  mockGetCurrentScope: vi.fn(),
}));

vi.mock('@sentry/core', () => ({
  exceptionFromError: vi.fn(() => ({ type: 'Error', value: 'linked' })),
  getCurrentScope: mockGetCurrentScope,
  linkedErrorsIntegration: vi.fn(() => ({ name: 'LinkedErrors' })),
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

  it('prepends a linked cause chain while preserving root-to-parent order', () => {
    mockGetCurrentScope.mockReturnValue({ getClient: () => ({}) });
    const root = new NativeError('root');
    const middle = new NativeError('middle', { cause: root });
    const outer = new NativeError('outer', { cause: middle });
    const event: Event = {
      exception: { values: [{ type: 'Error', value: 'outer' }] },
    };

    const processed = new LinkedErrors({ limit: 3 }).processEvent(event, {
      originalException: outer,
    });

    expect(processed.exception?.values).toEqual([
      { type: 'Error', value: 'linked' },
      { type: 'Error', value: 'linked' },
      { type: 'Error', value: 'outer' },
    ]);
  });

  it('supports a custom link key and stops at the configured limit', () => {
    mockGetCurrentScope.mockReturnValue({ getClient: () => ({}) });
    const root = new NativeError('root');
    const outer = new NativeError('outer') as Error & { reason?: Error };
    outer.reason = root;
    const event: Event = {
      exception: { values: [{ type: 'Error', value: 'outer' }] },
    };

    new LinkedErrors({ key: 'reason', limit: 2 }).processEvent(event, {
      originalException: outer,
    });

    expect(event.exception?.values).toEqual([
      { type: 'Error', value: 'linked' },
      { type: 'Error', value: 'outer' },
    ]);
  });
});
