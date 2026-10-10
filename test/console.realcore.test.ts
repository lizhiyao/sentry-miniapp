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
    client.getOptions().enabled = false;
    const unread = { toJSON: vi.fn(() => 'disabled-canary') };
    expect(console.log.call(receiver, unread)).toBe(result);
    expect(unread.toJSON).not.toHaveBeenCalled();
    expect(original).toHaveBeenLastCalledWith(unread);
    expect(original).toHaveBeenCalledTimes(2);
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

  it.each(['dispose', 'close'] as const)(
    '%s 在格式化或 beforeBreadcrumb 中发生时，不继续读取或污染下一个 client',
    async (stop) => {
      const receiver = {};
      const result = {};
      const original = vi.fn(function (this: unknown) {
        expect(this).toBe(receiver);
        return result;
      });
      vi.spyOn(console, 'log').mockImplementation(original);
      for (const phase of ['json', 'json-throw', 'string', 'hook'] as const) {
        getIsolationScope().clearBreadcrumbs();
        captured.length = 0;
        original.mockClear();
        let closing: Promise<boolean> | undefined;
        const retire = () => {
          if (stop === 'dispose') client.dispose();
          else closing = client.close(2000);
        };
        const client = init({
          dsn: 'https://test@example.com/1',
          defaultIntegrations: [consoleBreadcrumbsIntegration({ levels: ['log'] })],
          beforeBreadcrumb: (breadcrumb) => {
            if (phase === 'hook') retire();
            return breadcrumb;
          },
          transport: createCapturingTransport(captured),
        })!;
        const input = {
          toJSON() {
            if (phase === 'string') return undefined;
            if (phase !== 'hook') retire();
            if (phase === 'json-throw') throw new Error('serializer retired client');
            return { value: 'retired-canary' };
          },
          toString: vi.fn(() => {
            if (phase === 'string') retire();
            return 'retired-canary';
          }),
        };
        const later = { toJSON: vi.fn(() => 'later-canary') };
        expect(console.log.call(receiver, input, later)).toBe(result);
        expect(original).toHaveBeenCalledExactlyOnceWith(input, later);
        expect(later.toJSON).toHaveBeenCalledTimes(phase === 'hook' ? 1 : 0);
        expect(input.toString).toHaveBeenCalledTimes(phase === 'string' ? 1 : 0);
        if (closing) expect(await closing).toBe(true);

        const next = init({
          dsn: 'https://next@example.com/2',
          defaultIntegrations: false,
          transport: createCapturingTransport(captured),
        })!;
        next.captureMessage('new client');
        await next.close(2000);
        expect(collectEnvelopePayloads<Event>(captured, ['event'])).toEqual([
          expect.objectContaining({ message: 'new client', breadcrumbs: undefined }),
        ]);
      }
    },
  );
});
