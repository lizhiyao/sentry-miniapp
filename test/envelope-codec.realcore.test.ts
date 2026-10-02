import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope, logger, makeSession, metrics, serializeEnvelope,
  spanStreamingIntegration, startInactiveSpan, type Envelope,
} from '@sentry/core';
import { MiniappClient } from '../src/client';
import { decodeEnvelope, encodeEnvelope, toMiniappRequestBody } from '../src/internal/envelopeCodec';
import { assertDefined, createCapturingTransport } from './support/envelopes';

afterEach(() => { getCurrentScope().setClient(undefined); });

function roundTrip(envelope: Envelope): Envelope {
  const before = serializeEnvelope(envelope);
  const restored = decodeEnvelope(encodeEnvelope(envelope));
  expect(serializeEnvelope(restored)).toEqual(before);
  return restored;
}

describe('#428 typed envelope codec 原型', () => {
  it('真实 SDK 的 event/session/feedback、span/v2、log、trace_metric 无损往返', async () => {
    const envelopes: Envelope[] = [];
    const client = new MiniappClient({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      release: 'probe@1', enableLogs: true, tracesSampleRate: 1,
      enableSystemInfo: false, enableOfflineCache: false,
      integrations: [spanStreamingIntegration({ flushOnSegmentEnd: false })],
      transport: createCapturingTransport(envelopes),
    });
    getCurrentScope().setClient(client);
    client.init();
    try {
      client.captureMessage('中文 😀');
      client.captureSession(makeSession({ release: 'probe@1' }));
      client.captureFeedback({ message: 'feedback 中文' });
      startInactiveSpan({ name: 'codec span', parentSpan: null }).end();
      logger.info('codec log');
      metrics.count('codec.metric', 1);
      await client.flush(100);
      const types = envelopes.flatMap((envelope) => envelope[1].map((item) => item[0].type));
      expect(types).toEqual(expect.arrayContaining(['event', 'session', 'span', 'log', 'trace_metric']));
      expect(envelopes.some((envelope) => envelope[1].some(([, payload]) =>
        typeof payload === 'object' && payload !== null && 'type' in payload && payload.type === 'feedback'))).toBe(true);
      for (const envelope of envelopes) roundTrip(envelope);
    } finally {
      await client.close(0);
    }
  });

  it('mixed json/text/bytes 保留空 bytes、非零 offset 子视图与 item headers', () => {
    const backing = new Uint8Array([99, 0, 255, 10, 88]);
    const envelope: Envelope = [
      { event_id: 'mixed', sent_at: '2022-01-01T00:00:00Z' },
      [
        [{ type: 'event' }, { event_id: 'mixed', message: '中文 😀 \ud800' }],
        [{ type: 'attachment', filename: 'text.txt' }, '中文 😀'],
        [{ type: 'attachment', filename: 'view.bin', length: 3 }, backing.subarray(1, 4)],
        [{ type: 'attachment', filename: 'empty.bin', length: 0 }, new Uint8Array()],
      ],
    ];
    const restored = roundTrip(envelope);
    expect(restored[1][2][1]).toBeInstanceOf(Uint8Array);
    expect(restored[1][2][1]).toEqual(new Uint8Array([0, 255, 10]));
    expect(restored[1][3][1]).toEqual(new Uint8Array());
    expect(restored[1][2][0]).toEqual(envelope[1][2][0]);
  });

  it.each([0, 1, 2, 3, 4, 5, 256])('%i bytes 覆盖 base64 余数、全部 byte 值', (length) => {
    const bytes = Uint8Array.from({ length }, (_, i) => i);
    const envelope: Envelope = [{}, [[{ type: 'attachment', filename: 'probe.bin' }, bytes]]];
    const restored = roundTrip(envelope);
    expect(restored[1][0][1]).toEqual(bytes);
  });

  it('线上 serializer 产物转 ArrayBuffer 精确复制 bytes，文本保持字符串', () => {
    const binary = new Uint8Array([99, 0, 255, 88]).subarray(1, 3);
    const body = toMiniappRequestBody(binary);
    expect(body).toBeInstanceOf(ArrayBuffer);
    assertDefined(body);
    expect(new Uint8Array(body as ArrayBuffer)).toEqual(new Uint8Array([0, 255]));
    binary[0] = 1;
    expect(new Uint8Array(body as ArrayBuffer)).toEqual(new Uint8Array([0, 255]));
    expect(toMiniappRequestBody('中文')).toBe('中文');
    expect((toMiniappRequestBody(new Uint8Array()) as ArrayBuffer).byteLength).toBe(0);
  });

  it.each([
    'not json', 'null', '[]', '{}',
    '{"schemaVersion":2,"headers":{},"items":[]}',
    '{"schemaVersion":1,"headers":[],"items":[]}',
    '{"schemaVersion":1,"headers":{},"items":{}}',
  ])('拒收 record 格式错误：%s', (encoded) => {
    expect(() => decodeEnvelope(encoded)).toThrow();
  });

  it.each([
    null, [], [{ type: 'event' }], [{}, { kind: 'json', data: {} }],
    [[], { kind: 'json', data: {} }], [{ type: 'event' }, null],
    [{ type: 'event' }, { kind: 'unknown', data: {} }],
    [{ type: 'event' }, { kind: 'json' }],
    [{ type: 'attachment' }, { kind: 'text', data: 3 }],
    [{ type: 'attachment' }, { kind: 'bytes', data: [] }],
  ])('拒收 item 格式错误：%j', (item) => {
    expect(() => decodeEnvelope(JSON.stringify({ schemaVersion: 1, headers: {}, items: [item] }))).toThrow();
  });

  it.each(['?', 'A', 'AAA', '=AAA', 'A===', 'AB==', 'AAB='])('拒收损坏/非规范 base64：%s', (data) => {
    const encoded = JSON.stringify({
      schemaVersion: 1, headers: {},
      items: [[{ type: 'attachment' }, { kind: 'bytes', data }]],
    });
    expect(() => decodeEnvelope(encoded)).toThrow();
  });

  it('空 envelope 保留 headers；不能序列化的 payload 显式失败', () => {
    expect(roundTrip([{ tunnel: 'custom' }, []])).toEqual([{ tunnel: 'custom' }, []]);
    const circular: any = {};
    circular.self = circular;
    expect(() => encodeEnvelope([{}, [[{ type: 'event' }, circular]]])).toThrow();
  });
});
