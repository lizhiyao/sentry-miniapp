import type { Envelope } from '@sentry/core';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** #428 codec 验证原型：仅存储 envelope payload，不接管 core 网络协议或重试。 */
export function encodeEnvelope(envelope: Envelope): string {
  return JSON.stringify({
    schemaVersion: 1,
    headers: envelope[0],
    items: envelope[1].map(([header, payload]) => [
      header,
      payload instanceof Uint8Array
        ? { kind: 'bytes', data: encodeBytes(payload) }
        : { kind: typeof payload === 'string' ? 'text' : 'json', data: payload },
    ]),
  });
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 拒收格式损坏的数据；不把损坏数据当作发送成功。 */
export function decodeEnvelope(encoded: string): Envelope {
  const record: unknown = JSON.parse(encoded);
  if (!object(record) || record['schemaVersion'] !== 1 || !object(record['headers']) ||
      !Array.isArray(record['items'])) throw new Error('Invalid envelope record');

  const items = record['items'].map((item: unknown) => {
    if (!Array.isArray(item) || item.length !== 2 || !object(item[0]) ||
        typeof item[0]['type'] !== 'string' || !object(item[1])) {
      throw new Error('Invalid envelope item');
    }
    const { kind, data } = item[1];
    if (kind === 'bytes' && typeof data === 'string') return [item[0], decodeBytes(data)];
    if (kind === 'text' && typeof data === 'string') return [item[0], data];
    if (kind === 'json' && data !== undefined) return [item[0], data];
    throw new Error('Invalid envelope payload');
  });
  // Envelope 是 core 的联合类型；上述校验保证 tuple/kind 结构，不承担服务端各 item schema 校验。
  return [record['headers'], items] as Envelope;
}

function encodeBytes(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const bits = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    output += alphabet[(bits >>> 18) & 63]! + alphabet[(bits >>> 12) & 63]!;
    output += b === undefined ? '=' : alphabet[(bits >>> 6) & 63]!;
    output += c === undefined ? '=' : alphabet[bits & 63]!;
  }
  return output;
}

function decodeBytes(encoded: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Invalid base64');
  }
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i += 4) {
    const a = alphabet.indexOf(encoded[i]!);
    const b = alphabet.indexOf(encoded[i + 1]!);
    const c = alphabet.indexOf(encoded[i + 2]!);
    const d = alphabet.indexOf(encoded[i + 3]!);
    bytes.push((a << 2) | (b >>> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >>> 2));
    if (d >= 0) bytes.push(((c & 3) << 6) | d);
  }
  const result = new Uint8Array(bytes);
  if (encodeBytes(result) !== encoded) throw new Error('Noncanonical base64');
  return result;
}

/** 子视图只复制自身 bytes，不泄漏 backing buffer 的前后内容。 */
export function toMiniappRequestBody(body: string | Uint8Array): string | ArrayBuffer {
  if (typeof body === 'string') return body;
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  return bytes.buffer;
}
