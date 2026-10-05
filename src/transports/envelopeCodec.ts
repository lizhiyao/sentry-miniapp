import type { Envelope, EnvelopeItemType } from '@sentry/core';
import { utf8ByteLength } from '../coreCompat';

export const MAX_STORE_BYTES = 900 * 1024;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const itemTypes = new Set<EnvelopeItemType>([
  'client_report',
  'user_report',
  'feedback',
  'session',
  'sessions',
  'transaction',
  'attachment',
  'event',
  'profile',
  'profile_chunk',
  'replay_event',
  'replay_recording',
  'check_in',
  'span',
  'log',
  'metric',
  'trace_metric',
  'raw_security',
]);

type EncodedPayload =
  | { kind: 'json'; data: unknown }
  | { kind: 'text'; data: string }
  | { kind: 'bytes'; data: string };
export interface EncodedEnvelope {
  headers: Record<string, unknown>;
  items: Array<[Record<string, unknown>, EncodedPayload]>;
}

function invalid(): never {
  throw new Error('Invalid or oversized offline envelope');
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function snapshot(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text === undefined || text.length > MAX_STORE_BYTES || utf8ByteLength(text) > MAX_STORE_BYTES)
    invalid();
  return JSON.parse(text);
}

function headers(value: unknown, item = false): Record<string, unknown> {
  if (!object(value)) invalid();
  if (item) {
    const type = value['type'];
    if (typeof type !== 'string' || !itemTypes.has(type as EnvelopeItemType)) invalid();
    const length = value['length'];
    if (length !== undefined && (!Number.isSafeInteger(length) || (length as number) < 0))
      invalid();
  }
  return value;
}

function encodeBytes(bytes: Uint8Array): string {
  if (Math.ceil(bytes.byteLength / 3) * 4 > MAX_STORE_BYTES) invalid();
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    output += b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    output += c === undefined ? '=' : alphabet[c & 63]!;
  }
  return output;
}

function decodeBytes(data: unknown): Uint8Array {
  if (typeof data !== 'string' || data.length > MAX_STORE_BYTES || data.length % 4 !== 0) invalid();
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const length = (data.length / 4) * 3 - padding;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < data.length; index += 4) {
    const last = index + 4 === data.length;
    const a = alphabet.indexOf(data[index]!);
    const b = alphabet.indexOf(data[index + 1]!);
    const c = last && padding === 2 ? 0 : alphabet.indexOf(data[index + 2]!);
    const d = last && padding > 0 ? 0 : alphabet.indexOf(data[index + 3]!);
    if (
      a < 0 ||
      b < 0 ||
      c < 0 ||
      d < 0 ||
      (last && ((padding === 2 && b & 15) || (padding === 1 && c & 3)))
    )
      invalid();
    bytes[offset++] = (a << 2) | (b >> 4);
    if (offset < length) bytes[offset++] = (b << 4) | (c >> 2);
    if (offset < length) bytes[offset++] = (c << 6) | d;
  }
  return bytes;
}

/** 存储协议保存 payload 类型；线上 envelope 仍由 core.serializeEnvelope 负责。 */
export function encodeEnvelope(envelope: Envelope): EncodedEnvelope {
  if (!Array.isArray(envelope) || envelope.length !== 2 || !Array.isArray(envelope[1])) invalid();
  const encoded: EncodedEnvelope = {
    headers: headers(snapshot(envelope[0])),
    items: envelope[1].map(([itemHeaders, payload]) => {
      const item = headers(snapshot(itemHeaders), true);
      if (
        payload instanceof ArrayBuffer ||
        (ArrayBuffer.isView(payload) && !(payload instanceof Uint8Array))
      )
        invalid();
      const value: EncodedPayload =
        payload instanceof Uint8Array
          ? { kind: 'bytes', data: encodeBytes(payload) }
          : typeof payload === 'string'
            ? { kind: 'text', data: payload }
            : { kind: 'json', data: snapshot(payload) };
      return [item, value];
    }),
  };
  // 同一校验路径拒绝不合法 header/length，不把 bytes 偷换成 JSON object。
  decodeEnvelope(encoded);
  return encoded;
}

export function decodeEnvelope(input: unknown): Envelope {
  if (!object(input) || !Array.isArray(input['items'])) invalid();
  const serialized = JSON.stringify(input);
  if (serialized.length > MAX_STORE_BYTES || utf8ByteLength(serialized) > MAX_STORE_BYTES)
    invalid();
  const envelopeHeaders = headers(input['headers']);
  const items = input['items'].map((item: unknown) => {
    if (!Array.isArray(item) || item.length !== 2) invalid();
    const itemHeaders = headers(item[0], true);
    const payload: unknown = item[1];
    if (!object(payload) || !Object.prototype.hasOwnProperty.call(payload, 'data')) invalid();
    let data: unknown;
    if (payload['kind'] === 'bytes') data = decodeBytes(payload['data']);
    else if (payload['kind'] === 'text') {
      if (typeof payload['data'] !== 'string') invalid();
      data = payload['data'];
    } else if (payload['kind'] === 'json') data = snapshot(payload['data']);
    else invalid();
    const length =
      data instanceof Uint8Array
        ? data.byteLength
        : typeof data === 'string'
          ? utf8ByteLength(data)
          : undefined;
    if (
      length !== undefined &&
      itemHeaders['length'] !== undefined &&
      itemHeaders['length'] !== length
    )
      invalid();
    return [itemHeaders, data];
  });
  // 运行时已校验 envelope/item header 与 payload discriminator；core 联合类型仅在此处适配。
  return [envelopeHeaders, items] as Envelope;
}
