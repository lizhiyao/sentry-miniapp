import type {
  Envelope,
  EnvelopeItemType,
  Event,
  SerializedStreamedSpan,
  SerializedStreamedSpanContainer,
  SpanJSON,
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
 * @sentry/core 11 起 `span` item 改为 span/v2 容器（`{version, items}`，属性带 `type` 注解）。
 * 这里还原成扁平 `SpanJSON`，让用例继续断言 span 语义而不是传输格式。
 */
export function collectSpans(envelopes: Envelope[]): SpanJSON[] {
  const spans: SpanJSON[] = [];

  for (const envelope of envelopes) {
    for (const item of envelope[1]) {
      if (item[0].type !== 'span') {
        continue;
      }
      const container = item[1] as SerializedStreamedSpanContainer;
      for (const serializedSpan of container.items) {
        spans.push(streamedSpanToSpanJSON(serializedSpan));
      }
    }
  }

  return spans;
}

export function streamedSpanToSpanJSON(serializedSpan: SerializedStreamedSpan): SpanJSON {
  const data: Record<string, unknown> = {};
  for (const [key, attribute] of Object.entries(serializedSpan.attributes)) {
    data[key] = attribute.value;
  }

  const spanJSON: SpanJSON = {
    data: data as SpanJSON['data'],
    description: serializedSpan.name,
    is_segment: serializedSpan.is_segment,
    span_id: serializedSpan.span_id,
    start_timestamp: serializedSpan.start_timestamp,
    status: serializedSpan.status,
    trace_id: serializedSpan.trace_id,
  };

  // exactOptionalPropertyTypes 下只写实际存在的可选字段。
  if (serializedSpan.parent_span_id !== undefined) {
    spanJSON.parent_span_id = serializedSpan.parent_span_id;
  }
  const exclusiveTime = data['sentry.exclusive_time'];
  if (typeof exclusiveTime === 'number') {
    spanJSON.exclusive_time = exclusiveTime;
  }
  const op = data['sentry.op'];
  if (typeof op === 'string') {
    spanJSON.op = op;
  }
  const origin = data['sentry.origin'];
  if (typeof origin === 'string') {
    spanJSON.origin = origin as NonNullable<SpanJSON['origin']>;
  }
  const segmentId = data['sentry.segment.id'];
  if (typeof segmentId === 'string') {
    spanJSON.segment_id = segmentId;
  }

  return spanJSON;
}
