import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeDsn, serializeEnvelope, type AttachmentItem } from '@sentry/core';
import {
  OfflineRecordCodec,
  offlineTargetId,
  readOfflineRoot,
} from '../src/transports/offlineRecords';
import { MAX_STORE_BYTES } from '../src/transports/envelopeCodec';
import { assertDefined, createEventEnvelope } from './support/envelopes';

afterEach(() => vi.restoreAllMocks());

describe('offline target identity', () => {
  function target(dsn: string, tunnel?: string): string {
    const parsed = makeDsn(dsn);
    assertDefined(parsed);
    return offlineTargetId(parsed, tunnel);
  }

  it('normalizes host/default port and ignores the deprecated private key', () => {
    expect(target('https://key:secret@SENTRY.example:443/path/42')).toBe(
      target('https://key@sentry.example/path/42'),
    );
    expect(target('http://key@sentry.example:80/42')).toBe(target('http://key@sentry.example/42'));
  });

  it.each([
    'http://key@sentry.example/path/42',
    'https://key@other.example/path/42',
    'https://key@sentry.example:8443/path/42',
    'https://key@sentry.example/other/42',
    'https://key@sentry.example/path/43',
    'https://other@sentry.example/path/42',
  ])('keeps target-changing DSN components: %s', (dsn) => {
    expect(target(dsn)).not.toBe(target('https://key@sentry.example/path/42'));
  });

  it('includes the exact tunnel destination', () => {
    const dsn = 'https://key@sentry.example/42';
    expect(target(dsn, '/a')).not.toBe(target(dsn, '/b'));
    expect(target(dsn, '/a')).not.toBe(target(dsn));
  });
});

describe('offline record protocol', () => {
  const targetId = 'target-A';
  const policyId = 'privacy-v2:required';
  function root(records: unknown[], extra: object = {}): string {
    return JSON.stringify({ schemaVersion: 1, targetId, policyId, records, ...extra });
  }

  it('preserves original age and record identity through repeated cold-start retries', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    let codec = new OfflineRecordCodec(targetId);
    let record = codec.encode(createEventEnvelope('retry'));
    const original = record;
    for (let attempt = 1; attempt <= 4; attempt++) {
      now.mockReturnValue(1000 + attempt * 1000);
      codec = new OfflineRecordCodec(targetId);
      const { envelope } = codec.decode(JSON.parse(JSON.stringify(record)));
      record = codec.encode(envelope);
      expect(record.createdAt).toBe(1000);
      expect(record.recordId).toBe(original.recordId);
      expect(envelope[0]).not.toHaveProperty('recordId');
      expect(envelope[0]).not.toHaveProperty('createdAt');
    }
  });

  it('does not share retry identity between independent target codecs', () => {
    const envelope = createEventEnvelope('same-object');
    const a = new OfflineRecordCodec(targetId).encode(envelope);
    const b = new OfflineRecordCodec('target-B').encode(envelope);
    expect(a.recordId).not.toBe(b.recordId);
    expect(b.targetId).toBe('target-B');
  });

  it('round-trips an offset binary attachment with core wire bytes unchanged', () => {
    const envelope = createEventEnvelope('binary');
    const attachment: AttachmentItem = [
      { type: 'attachment', filename: 'data.bin', length: 3 },
      new Uint8Array([99, 0, 128, 255, 99]).subarray(1, 4),
    ];
    envelope[1].push(attachment);
    const codec = new OfflineRecordCodec(targetId);
    const restored = codec.decode(JSON.parse(JSON.stringify(codec.encode(envelope)))).envelope;
    expect(serializeEnvelope(restored)).toEqual(serializeEnvelope(envelope));
  });

  it.each([undefined, null, ''])('recognizes empty storage %s', (raw) => {
    expect(readOfflineRoot(raw, targetId, policyId, new OfflineRecordCodec(targetId))).toEqual({
      state: 'empty',
    });
  });

  it.each([
    '{}',
    '{',
    '[]',
    4,
    { records: [] },
    root([], { schemaVersion: 2 }),
    root([], { policyId: null }),
    'a'.repeat(MAX_STORE_BYTES + 1),
    JSON.stringify({ text: '中'.repeat(MAX_STORE_BYTES / 2) }),
  ])('rejects unknown/malformed/oversized roots', (raw) => {
    expect(readOfflineRoot(raw, targetId, policyId, new OfflineRecordCodec(targetId))).toEqual({
      state: 'discard',
      reason: 'migration_drop',
    });
  });

  it.each([
    [{ targetId: 'target-B' }, 'target_changed'],
    [{ policyId: 'privacy-v3' }, 'policy_changed'],
  ])('rejects an incompatible container before decoding records', (extra, reason) => {
    expect(
      readOfflineRoot(root([null], extra), targetId, policyId, new OfflineRecordCodec(targetId)),
    ).toEqual({ state: 'discard', reason, dropped: 1 });
  });

  it('isolates bad records and duplicate IDs while retaining valid neighbors in order', () => {
    const codec = new OfflineRecordCodec(targetId);
    const a = codec.encode(createEventEnvelope('A'));
    const b = codec.encode(createEventEnvelope('B'));
    const invalid = [
      null,
      { ...a, schemaVersion: 2 },
      { ...a, targetId: 'target-B' },
      { ...a, recordId: 'invalid' },
      { ...a, createdAt: -1 },
      { ...a, createdAt: 1.5 },
      { ...a, createdAt: Number.MAX_SAFE_INTEGER + 1 },
      {
        ...a,
        payload: {
          headers: {},
          items: [[{ type: 'attachment' }, { kind: 'bytes', data: '?===' }]],
        },
      },
    ];
    const result = readOfflineRoot(root([a, ...invalid, a, b]), targetId, policyId, codec);
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('Expected compatible root');
    expect(result.invalidRecords).toBe(invalid.length + 1);
    expect(result.root.records.map((record) => codec.decode(record).envelope[0].event_id)).toEqual([
      'A',
      'B',
    ]);
  });
});
