import { afterEach, describe, expect, it } from 'vitest';
import {
  dedupeIntegration as coreDedupeIntegration,
  type Envelope,
  type Event,
} from '@sentry/core';
import { init } from '../src/sdk';
import { dedupeIntegration } from '../src/integrations/dedupe';
import { MiniappClient } from '../src/client';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('单一 core Dedupe 管道', () => {
  let client: MiniappClient | undefined;
  afterEach(() => client?.dispose());
  it('factory 直接复用官方函数，不保留 fuzzy/time-window 第二套算法', () => {
    expect(dedupeIntegration).toBe(coreDedupeIntegration);
  });
  it('同 stack 的相邻错误只发送一次，不同位置与不同 fingerprint 保留', async () => {
    const envelopes: Envelope[] = [];
    client = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [dedupeIntegration()],
      transport: createCapturingTransport(envelopes),
    })!;
    const event = (line: number, fingerprint?: string[]): Event => ({
      ...(fingerprint && { fingerprint }),
      exception: {
        values: [
          {
            type: 'Error',
            value: 'same message',
            stacktrace: {
              frames: [{ filename: 'page.js', lineno: line, colno: 1, function: 'submit' }],
            },
          },
        ],
      },
    });
    client.captureEvent(event(1));
    client.captureEvent(event(1));
    client.captureEvent(event(2));
    client.captureEvent(event(2, ['explicit']));
    await client.flush();
    const errors = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(errors).toHaveLength(3);
    expect(
      errors.map((error) => error.exception!.values![0]!.stacktrace!.frames![0]!.lineno),
    ).toEqual([1, 2, 2]);
    expect(errors[2]!.fingerprint).toEqual(['explicit']);
  });
});
