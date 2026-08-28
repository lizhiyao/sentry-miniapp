import type { Envelope, EnvelopeItemType, Event, Transport } from '@sentry/core';

export function assertDefined<T>(
  value: T,
  message = 'Expected test value to be defined',
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

export function createEventEnvelope(eventId: string): Envelope {
  const event: Event = { event_id: eventId };

  return [
    { event_id: eventId, sent_at: '2022-01-01T00:00:00.000Z' },
    [[{ type: 'event' }, event]],
  ];
}

export function createCapturingTransport(envelopes: Envelope[]): () => Transport {
  return () => ({
    send: (envelope) => {
      envelopes.push(envelope);
      return Promise.resolve({ statusCode: 200 });
    },
    flush: () => Promise.resolve(true),
  });
}

export function collectEnvelopePayloads<T>(
  envelopes: Envelope[],
  types: readonly EnvelopeItemType[],
): T[] {
  const payloads: T[] = [];

  for (const envelope of envelopes) {
    for (const item of envelope[1]) {
      if (types.includes(item[0].type)) {
        payloads.push(item[1] as T);
      }
    }
  }

  return payloads;
}
