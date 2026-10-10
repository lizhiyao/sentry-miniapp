import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, withScope, type Envelope, type SerializedLogContainer } from '@sentry/core';
import { init } from '../src/sdk';
import { MiniappClient } from '../src/client';
import '../src/polyfills-bootstrap';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('String 规范化与真实 core 日志最终 payload', () => {
  let client: MiniappClient | undefined;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    client?.dispose();
    client = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('body、template、scope 与 callback attributes 在最终日志中规范化', async () => {
    const envelopes: Envelope[] = [];
    client = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
      beforeSendLog: (log) => ({
        ...log,
        message: `callback ${String(log.message)}\ud800`,
        attributes: { ...log.attributes, ['callback\udc00']: '\ud800pair😀\udc00' },
      }),
    })!;
    let flushing!: PromiseLike<boolean>;
    withScope((scope) => {
      scope.setClient(client);
      scope.setAttribute('scope\ud800', 'value\udc00😀');
      logger.info(logger.fmt`template\ud800\n ${'param\udc00😀'}`);
      flushing = client!.flush();
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(await flushing).toBe(true);
    const log = collectEnvelopePayloads<SerializedLogContainer>(envelopes, ['log'])[0]!.items[0]!;
    expect(log.body).toBe('callback template�\n param�😀�');
    expect(log.attributes).toMatchObject({
      'scope�': { type: 'string', value: 'value�😀' },
      'callback�': { type: 'string', value: '�pair😀�' },
      'sentry.message.template': { type: 'string', value: 'template�\n %s' },
      'sentry.message.parameter.0': { type: 'string', value: 'param�😀' },
    });
  });
});
