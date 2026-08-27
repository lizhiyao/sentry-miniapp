import type { Envelope, EnvelopeItemType, Transport } from '@sentry/core';

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
