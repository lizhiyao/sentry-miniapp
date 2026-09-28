import type {
  Envelope,
  EnvelopeItemType,
  Event,
  SerializedStreamedSpan,
  SerializedStreamedSpanContainer,
  Transport,
} from '@sentry/core';

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

/**
 * core 11 的 span envelope item：header + `{version, items}` 容器（span/v2）。
 * 连 header 一起返回，用例才能断言传输契约本身而不只是 span 语义。
 */
export interface CapturedSpanItem {
  header: Envelope[1][number][0];
  body: SerializedStreamedSpanContainer;
}

export function collectSpanItems(envelopes: Envelope[]): CapturedSpanItem[] {
  const items: CapturedSpanItem[] = [];

  for (const envelope of envelopes) {
    for (const [header, payload] of envelope[1]) {
      if (header.type === 'span') {
        items.push({ header, body: payload as SerializedStreamedSpanContainer });
      }
    }
  }

  return items;
}

/** 按 v11 线上格式取出所有 span（一条 envelope item 可以携带多个 span）。 */
export function collectSpans(envelopes: Envelope[]): SerializedStreamedSpan[] {
  return collectSpanItems(envelopes).flatMap((item) => item.body.items);
}

/** v11 的 span 属性统一带 `{type, value}` 注解，取值时展开一次。 */
export function spanAttribute(span: SerializedStreamedSpan, key: string): unknown {
  return span.attributes[key]?.value;
}
