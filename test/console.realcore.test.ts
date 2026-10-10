import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient,
  getCurrentScope,
  getIsolationScope,
  type Envelope,
  type Event,
} from '@sentry/core';
import { consoleBreadcrumbsIntegration, init } from '../src/index';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('Console 面包屑（真实 Core）', () => {
  let captured: Envelope[];

  beforeEach(() => {
    captured = [];
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();
  });
  afterEach(() => {
    getClient()?.dispose();
    vi.restoreAllMocks();
  });

  it('undefined 参数保留文字，原 console 的 receiver、参数和返回身份不变', async () => {
    const receiver = {};
    const object = { value: 1 };
    const result = {};
    const original = vi.fn(function (this: unknown) {
      expect(this).toBe(receiver);
      return result;
    });
    vi.spyOn(console, 'log').mockImplementation(original);
    const client = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [consoleBreadcrumbsIntegration({ levels: ['log'] })],
      transport: createCapturingTransport(captured),
    })!;
    expect(console.log.call(receiver, 'before', undefined, null, object, 'after')).toBe(result);
    expect(original).toHaveBeenCalledExactlyOnceWith('before', undefined, null, object, 'after');
    client.captureMessage('console argument probe');
    await client.flush();
    expect(collectEnvelopePayloads<Event>(captured, ['event'])[0]?.breadcrumbs).toContainEqual(
      expect.objectContaining({
        category: 'console',
        message: 'before undefined null {"value":1} after',
      }),
    );
  });

  it.each([false, true])(
    '观测 hook 抛错=%s 时仍只调用原 console 一次，保留业务异常',
    async (hookThrows) => {
      const receiver = {};
      const businessError = new Error('business console failure');
      const original = vi.fn(function (this: unknown) {
        expect(this).toBe(receiver);
        throw businessError;
      });
      vi.spyOn(console, 'log').mockImplementation(original);
      const client = init({
        dsn: 'https://test@example.com/1',
        defaultIntegrations: [consoleBreadcrumbsIntegration({ levels: ['log'] })],
        beforeBreadcrumb: (breadcrumb) => {
          if (hookThrows) throw new Error('observation failure');
          return breadcrumb;
        },
        transport: createCapturingTransport(captured),
      })!;
      let thrown;
      try {
        console.log.call(receiver, undefined);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(businessError);
      expect(original).toHaveBeenCalledExactlyOnceWith(undefined);
      client.captureMessage('console throw probe');
      await client.flush();
      const event = collectEnvelopePayloads<Event>(captured, ['event'])[0]!;
      const breadcrumbs =
        event.breadcrumbs?.filter((breadcrumb) => breadcrumb.category === 'console') ?? [];
      expect(breadcrumbs.map((breadcrumb) => breadcrumb.message)).toEqual(
        hookThrows ? [] : ['undefined'],
      );
    },
  );
});
