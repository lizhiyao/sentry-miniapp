import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getGlobalSingleton,
  serializeEnvelope,
  type Envelope,
  type AttachmentItem,
} from '@sentry/core';
import { encodeEnvelope, decodeEnvelope, MAX_STORE_BYTES } from '../src/transports/envelopeCodec';
import {
  encodeUtf8,
  utf8ByteLength,
  ensureEnvelopeEncoding,
  exactArrayBuffer,
} from '../src/coreCompat';
import { createEventEnvelope, createCapturingTransport } from './support/envelopes';
import {
  logger,
  metrics,
  startInactiveSpan,
  spanStreamingIntegration,
  makeSession,
  closeSession,
  getCurrentScope,
} from '@sentry/core';
import { init } from '../src/sdk';
import { resetPlatformCache } from '../src/crossPlatform';

function attachment(data: Uint8Array | string): AttachmentItem {
  return [
    {
      type: 'attachment',
      filename: 'test.bin',
      length: typeof data === 'string' ? encodeUtf8(data).length : data.length,
    },
    data,
  ];
}

const fixtures: Envelope[] = [
  createEventEnvelope('event'),
  [
    { sent_at: '2026-10-05T00:00:00Z' },
    [
      [
        { type: 'session' },
        {
          sid: 'session',
          init: true,
          started: '2026-10-05T00:00:00Z',
          timestamp: '2026-10-05T00:00:00Z',
          status: 'exited',
          errors: 0,
          attrs: { release: '2.0' },
        },
      ],
    ],
  ],
  [
    { event_id: 'feedback', sent_at: '2026-10-05T00:00:00Z' },
    [
      [
        { type: 'feedback' },
        { type: 'feedback', contexts: { feedback: { message: '中文反馈 😃' } } },
      ],
    ],
  ],
  [
    {},
    [
      [
        { type: 'span', item_count: 1, content_type: 'application/vnd.sentry.items.span.v2+json' },
        {
          version: 2,
          items: [
            {
              trace_id: 'trace',
              span_id: 'span',
              name: 'operation',
              start_timestamp: 1,
              end_timestamp: 2,
              status: 'ok',
              is_segment: true,
              attributes: {},
            },
          ],
        },
      ],
    ],
  ],
  [
    {},
    [
      [
        { type: 'log', item_count: 1, content_type: 'application/vnd.sentry.items.log+json' },
        { items: [{ body: '中文日志 😃', level: 'info', timestamp: 1, attributes: {} }] },
      ],
    ],
  ],
  [
    {},
    [
      [
        {
          type: 'trace_metric',
          item_count: 1,
          content_type: 'application/vnd.sentry.items.trace-metric+json',
        },
        {
          items: [
            {
              trace_id: 'trace',
              name: 'count',
              type: 'counter',
              value: 1,
              timestamp: 1,
              attributes: {},
            },
          ],
        },
      ],
    ],
  ],
  [
    {},
    [
      [
        { type: 'client_report' },
        {
          timestamp: 1,
          discarded_events: [{ reason: 'queue_overflow', category: 'error', quantity: 1 }],
        },
      ],
    ],
  ],
];

describe('typed codec 与真实 core 线上序列化', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(fixtures.map((envelope) => [envelope[1][0]![0].type, envelope] as const))(
    '%s 的 headers、payload 和 core wire bytes 往返一致',
    (_type, envelope) => {
      const serialized = JSON.stringify(encodeEnvelope(envelope));
      const decoded = decodeEnvelope(JSON.parse(serialized));
      expect(decoded).toEqual(envelope);
      expect(serializeEnvelope(decoded)).toEqual(serializeEnvelope(envelope));
    },
  );

  it('生产 init 的真实 span/log/metric/event/session/feedback 最终 envelopes 均保持 core wire', async () => {
    const captured: Envelope[] = [];
    vi.stubGlobal('wx', { request: vi.fn() });
    resetPlatformCache();
    const previous = getCurrentScope().getClient();
    const client = init({
      dsn: 'https://codec@example.com/1',
      release: 'codec@2.0',
      tracesSampleRate: 1,
      defaultIntegrations: [spanStreamingIntegration()],
      transport: createCapturingTransport(captured),
    })!;
    try {
      const bytes = new Uint8Array([88, 0, 255, 99]);
      client.captureEvent(
        { message: '真实中文事件' },
        { attachments: [{ filename: 'bytes.bin', data: bytes.subarray(1, 3) }] },
      );
      client.captureFeedback({ message: '真实中文反馈' });
      const session = makeSession({ release: 'codec@2.0' });
      closeSession(session);
      client.captureSession(session);
      startInactiveSpan({ name: 'actual operation' }).end();
      logger.info('真实日志 😃');
      metrics.count('actual.count', 1);
      await client.flush();
      const types = captured.flatMap((envelope) => envelope[1].map((item) => item[0].type));
      expect(types).toEqual(
        expect.arrayContaining([
          'event',
          'attachment',
          'feedback',
          'session',
          'span',
          'log',
          'trace_metric',
        ]),
      );
      for (const envelope of captured) {
        const expected = serializeEnvelope(envelope);
        expect(
          serializeEnvelope(decodeEnvelope(JSON.parse(JSON.stringify(encodeEnvelope(envelope))))),
        ).toEqual(expected);
      }
    } finally {
      client.dispose();
      getCurrentScope().setClient(previous);
      resetPlatformCache();
    }
  });

  it('mixed attachments 保留空 bytes、非零 byteOffset、所有字节和原始 text', () => {
    const allBytes = Uint8Array.from({ length: 256 }, (_value, index) => index);
    const backing = new Uint8Array([9, 8, 0, 255, 7]);
    const envelope = createEventEnvelope('mixed');
    envelope[1].push(
      attachment(backing.subarray(2, 4)),
      attachment(new Uint8Array()),
      attachment(allBytes),
      attachment('中文\n😃'),
    );
    const encoded = encodeEnvelope(envelope);
    expect(encoded.items.slice(1).map((item) => item[1].kind)).toEqual([
      'bytes',
      'bytes',
      'bytes',
      'text',
    ]);
    const decoded = decodeEnvelope(JSON.parse(JSON.stringify(encoded)));
    expect(serializeEnvelope(decoded)).toEqual(serializeEnvelope(envelope));
    expect(decoded[1][1]![1]).toEqual(new Uint8Array([0, 255]));
    expect(decoded[1][2]![1]).toBeInstanceOf(Uint8Array);
    expect(decoded[1][2]![1]).toHaveLength(0);
  });

  it.each([1, 2, 3, 4, 5, 255, 256])('%i 字节的 base64 padding 往返精确', (length) => {
    const data = Uint8Array.from({ length }, (_value, index) => (index * 137) % 256);
    const envelope = createEventEnvelope('bytes');
    envelope[1].push(attachment(data));
    expect(decodeEnvelope(JSON.parse(JSON.stringify(encodeEnvelope(envelope))))).toEqual(envelope);
  });

  it('编码快照不随原始 JSON payload/header 修改；非有限数字遵守 JSON wire 语义', () => {
    const envelope = createEventEnvelope('snapshot');
    const payload = envelope[1][0]![1] as Record<string, unknown>;
    payload['extra'] = { infinity: Infinity, skipped: undefined };
    const before = serializeEnvelope(envelope);
    const encoded = encodeEnvelope(envelope);
    envelope[0]['event_id'] = 'changed';
    payload['extra'] = {};
    expect(serializeEnvelope(decodeEnvelope(encoded))).toEqual(before);
  });

  it.each(['A', 'AA', 'AAA', '====', 'AA=A', 'A===', 'AB==', 'AAB=', '!!!!', 'AA-_'])(
    '拒绝畸形或非规范 base64 %s',
    (data) => {
      expect(() =>
        decodeEnvelope({ headers: {}, items: [[{ type: 'attachment' }, { kind: 'bytes', data }]] }),
      ).toThrow();
    },
  );

  it.each([
    null,
    [],
    {},
    { headers: [], items: [] },
    { headers: {}, items: [null] },
    { headers: {}, items: [[{}, { kind: 'json', data: {} }]] },
    { headers: {}, items: [[{ type: 'unknown' }, { kind: 'json', data: {} }]] },
    {
      headers: {},
      items: [
        [
          { type: 'event', length: -1 },
          { kind: 'json', data: {} },
        ],
      ],
    },
    {
      headers: {},
      items: [
        [
          { type: 'event', length: 1.5 },
          { kind: 'json', data: {} },
        ],
      ],
    },
    { headers: {}, items: [[{ type: 'event' }, { kind: 'other', data: {} }]] },
    { headers: {}, items: [[{ type: 'event' }, { kind: 'json' }]] },
    { headers: {}, items: [[{ type: 'event' }, { kind: 'text', data: {} }]] },
    {
      headers: {},
      items: [
        [
          { type: 'attachment', length: 3 },
          { kind: 'bytes', data: 'AA==' },
        ],
      ],
    },
    {
      headers: {},
      items: [
        [
          { type: 'attachment', length: 1 },
          { kind: 'text', data: '中文' },
        ],
      ],
    },
  ])('拒绝坏结构或不一致长度 %#', (input) => expect(() => decodeEnvelope(input)).toThrow());

  it('拒绝超预算记录、未知 binary 类型及无法 JSON 编码的 payload', () => {
    const envelope = createEventEnvelope('oversized');
    envelope[1].push(attachment(new Uint8Array(MAX_STORE_BYTES)));
    expect(() => encodeEnvelope(envelope)).toThrow();
    expect(() =>
      decodeEnvelope({
        headers: {},
        items: [[{ type: 'event' }, { kind: 'text', data: '😃'.repeat(MAX_STORE_BYTES / 4) }]],
      }),
    ).toThrow();
    expect(() =>
      encodeEnvelope([{}, [[{ type: 'event' }, new ArrayBuffer(2)]]] as unknown as Envelope),
    ).toThrow();
    expect(() =>
      encodeEnvelope([{}, [[{ type: 'event' }, new Uint16Array(2)]]] as unknown as Envelope),
    ).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() =>
      encodeEnvelope([{}, [[{ type: 'event' }, cyclic]]] as unknown as Envelope),
    ).toThrow();
    expect(() =>
      encodeEnvelope([{}, [[{ type: 'event' }, undefined]]] as unknown as Envelope),
    ).toThrow();
  });

  it.each([
    '',
    'ASCII',
    '\u007f\u0080\u07ff\u0800\uffff',
    '中文😃',
    '\ud800',
    '\udfff',
    '\ud800A\udfff',
    '\ud800\udc00\udbff\udfff',
  ])('UTF-8 与原生标量转换一致 %#', (input) => {
    const native = new TextEncoder().encode(input);
    expect(encodeUtf8(input)).toEqual(native);
    expect(utf8ByteLength(input)).toBe(native.length);
  });

  it('缺 TextEncoder 时真实 core binary 序列化正常，不要求 TextDecoder/Buffer', () => {
    const envelope = createEventEnvelope('unicode');
    envelope[1].push(attachment(new Uint8Array([0, 255])), attachment('中文😃\ud800'));
    const expected = serializeEnvelope(envelope);
    vi.stubGlobal('__SENTRY__', {});
    vi.stubGlobal('TextEncoder', undefined);
    vi.stubGlobal('TextDecoder', undefined);
    vi.stubGlobal('Buffer', undefined);
    ensureEnvelopeEncoding();
    expect(
      serializeEnvelope(decodeEnvelope(JSON.parse(JSON.stringify(encodeEnvelope(envelope))))),
    ).toEqual(expected);
  });

  it('原生 encoder 可用时不注册，缺 native 时保留已有公开 singleton', () => {
    vi.stubGlobal('__SENTRY__', {});
    ensureEnvelopeEncoding();
    const existing = vi.fn(encodeUtf8);
    expect(getGlobalSingleton('encodePolyfill', () => existing)).toBe(existing);
    vi.stubGlobal('TextEncoder', undefined);
    ensureEnvelopeEncoding();
    expect(getGlobalSingleton('encodePolyfill', () => encodeUtf8)).toBe(existing);
  });

  it('ArrayBuffer 只含子视图 bytes，并与可变源独立', () => {
    const backing = new Uint8Array([99, 0, 255, 88]);
    const buffer = exactArrayBuffer(backing.subarray(1, 3));
    backing[1] = 12;
    expect(buffer.byteLength).toBe(2);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([0, 255]));
    expect(exactArrayBuffer(new Uint8Array()).byteLength).toBe(0);
  });
});
