import { getGlobalSingleton } from '@sentry/core';

// 固定版本的内部依赖仅从此处进入；过滤语义继续由 core 实现，不复制名单或算法。
export { _INTERNAL_filterKeyValueData as filterKeyValueData } from '@sentry/core';

/** 独立检查 Core 的查询参数接缝，不以完整 URL 或浏览器请求能力为前提。 */
export function ensureURLSearchParams(fallback: typeof URLSearchParams): void {
  try {
    const Native = globalThis.URLSearchParams;
    if (typeof Native === 'function') {
      const record = new Native({ sentry_key: 'key', sentry_client: 'sdk/1.0' });
      const query = new Native('sentry%5Fkey+%E4%B8%AD%2B=');
      if (
        record.toString() === 'sentry_key=key&sentry_client=sdk%2F1.0' &&
        query.keys().next().value === 'sentry_key 中+'
      )
        return;
    }
  } catch (_error) {
    // 构造器空壳、不可读 getter 或不完整的方法均使用独立回退。
  }
  // 保留已有数据属性的约束；不可配置但可写的宿主属性同样能够安装回退。
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams');
  Object.defineProperty(globalThis, 'URLSearchParams', {
    value: fallback,
    configurable: descriptor?.configurable ?? true,
    writable: descriptor && 'writable' in descriptor ? descriptor.writable : true,
  });
}

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

/** 使用 Core 的公开编码接缝；构造器空壳不能视作可用能力，已有 encoder 保持优先。 */
export function ensureEnvelopeEncoding(): void {
  try {
    if (typeof TextEncoder === 'function') {
      const expected = [0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x99, 0x82, 0xef, 0xbf, 0xbd];
      const bytes = new TextEncoder().encode('中🙂\ud800');
      if (
        bytes instanceof Uint8Array &&
        bytes.length === expected.length &&
        expected.every((byte, index) => bytes[index] === byte)
      )
        return;
    }
  } catch (_error) {
    // 宿主实现可能不可构造或无法编码；不改写全局 TextEncoder。
  }
  getGlobalSingleton('encodePolyfill', () => encodeUtf8);
}

/** 宿主请求只接受 ArrayBuffer 时复制精确视图，不包含共享 backing buffer 的其他字节。 */
export function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
