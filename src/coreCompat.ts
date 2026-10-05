import { getGlobalSingleton } from '@sentry/core';

function scalarAt(input: string, index: number): number {
  const first = input.charCodeAt(index);
  if (first >= 0xd800 && first <= 0xdbff) {
    const next = input.charCodeAt(index + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return 0x10000 + ((first - 0xd800) << 10) + next - 0xdc00;
  }
  return first >= 0xd800 && first <= 0xdfff ? 0xfffd : first;
}

/** 与 TextEncoder 的 UTF-8 标量值转换一致，孤立 surrogate 使用 U+FFFD。 */
export function utf8ByteLength(input: string): number {
  let length = 0;
  for (let index = 0; index < input.length; index++) {
    const scalar = scalarAt(input, index);
    length += scalar < 0x80 ? 1 : scalar < 0x800 ? 2 : scalar < 0x10000 ? 3 : 4;
    if (scalar >= 0x10000) index++;
  }
  return length;
}

export function encodeUtf8(input: string): Uint8Array {
  const bytes = new Uint8Array(utf8ByteLength(input));
  let offset = 0;
  for (let index = 0; index < input.length; index++) {
    const scalar = scalarAt(input, index);
    if (scalar < 0x80) bytes[offset++] = scalar;
    else if (scalar < 0x800) {
      bytes[offset++] = 0xc0 | (scalar >> 6);
      bytes[offset++] = 0x80 | (scalar & 0x3f);
    } else if (scalar < 0x10000) {
      bytes[offset++] = 0xe0 | (scalar >> 12);
      bytes[offset++] = 0x80 | ((scalar >> 6) & 0x3f);
      bytes[offset++] = 0x80 | (scalar & 0x3f);
    } else {
      bytes[offset++] = 0xf0 | (scalar >> 18);
      bytes[offset++] = 0x80 | ((scalar >> 12) & 0x3f);
      bytes[offset++] = 0x80 | ((scalar >> 6) & 0x3f);
      bytes[offset++] = 0x80 | (scalar & 0x3f);
      index++;
    }
  }
  return bytes;
}

/** 固定 core v11 的公开 carrier singleton；不替换已有 encoder，不安装 decoder。 */
export function ensureEnvelopeEncoding(): void {
  if (typeof TextEncoder === 'undefined') getGlobalSingleton('encodePolyfill', () => encodeUtf8);
}

/** 宿主请求只接受 ArrayBuffer 时复制精确视图，不包含共享 backing buffer 的其他字节。 */
export function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
