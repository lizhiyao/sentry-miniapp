/**
 * Polyfills for miniapp environment
 * 小程序环境的 polyfill 实现
 */

/**
 * URLSearchParams polyfill for miniapp environment
 * 小程序环境的 URLSearchParams polyfill
 */
class URLSearchParamsPolyfill {
  private _entries: Array<[string, string]> = [];

  constructor(init?: string | Record<string, string> | URLSearchParamsPolyfill | string[][]) {
    if (typeof init === 'string') {
      this._parseString(init);
    } else if (Array.isArray(init)) {
      for (const pair of init) {
        if (Array.isArray(pair) && pair.length >= 2) {
          this._entries.push([toScalarString(pair[0]), toScalarString(pair[1])]);
        }
      }
    } else if (init && typeof init === 'object') {
      if (init instanceof URLSearchParamsPolyfill) {
        this._entries = init._entries.map(([k, v]) => [k, v]);
      } else {
        for (const [key, value] of Object.entries(init)) {
          this._entries.push([toScalarString(key), toScalarString(value)]);
        }
      }
    }
  }

  get size(): number {
    return this._entries.length;
  }

  private _parseString(str: string): void {
    if (str.startsWith('?')) {
      str = str.slice(1);
    }

    if (!str) {
      return;
    }

    const pairs = str.split('&');
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        if (pair) {
          this._entries.push([decodeFormComponent(pair), '']);
        }
      } else {
        const key = pair.slice(0, eqIndex);
        const value = pair.slice(eqIndex + 1);
        this._entries.push([decodeFormComponent(key), decodeFormComponent(value)]);
      }
    }
  }

  append(name: string, value: string): void {
    this._entries.push([toScalarString(name), toScalarString(value)]);
  }

  delete(name: string): void {
    name = toScalarString(name);
    this._entries = this._entries.filter(([key]) => key !== name);
  }

  get(name: string): string | null {
    name = toScalarString(name);
    const entry = this._entries.find(([key]) => key === name);
    return entry ? entry[1] : null;
  }

  getAll(name: string): string[] {
    name = toScalarString(name);
    return this._entries.filter(([key]) => key === name).map(([, value]) => value);
  }

  has(name: string): boolean {
    name = toScalarString(name);
    return this._entries.some(([key]) => key === name);
  }

  set(name: string, value: string): void {
    name = toScalarString(name);
    const strValue = toScalarString(value);
    let found = false;
    this._entries = this._entries.filter(([key]) => {
      if (key === name) {
        if (!found) {
          found = true;
          return true;
        }
        return false;
      }
      return true;
    });
    if (found) {
      const idx = this._entries.findIndex(([key]) => key === name);
      if (idx !== -1) {
        this._entries[idx] = [name, strValue];
      }
    } else {
      this._entries.push([name, strValue]);
    }
  }

  sort(): void {
    this._entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }

  toString(): string {
    return this._entries
      .map(([key, value]) => `${encodeFormComponent(key)}=${encodeFormComponent(value)}`)
      .join('&');
  }

  forEach(callback: (value: string, key: string, parent: URLSearchParamsPolyfill) => void): void {
    for (const [key, value] of this._entries) {
      callback(value, key, this);
    }
  }

  private *_createIterator<T>(getValue: (entry: [string, string]) => T): IterableIterator<T> {
    const entries = this._entries;
    for (let index = 0; index < entries.length; index += 1) {
      yield getValue(entries[index]!);
    }
  }

  keys(): IterableIterator<string> {
    return this._createIterator(([key]) => key);
  }

  values(): IterableIterator<string> {
    return this._createIterator(([, value]) => value);
  }

  entries(): IterableIterator<[string, string]> {
    return this._createIterator((entry) => entry);
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
}

function toScalarString(value: unknown): string {
  let result = '';
  for (const character of String(value)) {
    const code = character.charCodeAt(0);
    result += character.length === 1 && code >= 0xd800 && code <= 0xdfff ? '\ufffd' : character;
  }
  return result;
}

/** String 方法遵循 RequireObjectCoercible，不把 null/undefined 当文本。 */
function stringReceiver(value: unknown): string {
  if (value === null || value === undefined || typeof value === 'symbol') {
    throw new TypeError('String well-formed methods require a string-coercible receiver');
  }
  return String(value);
}

function isWellFormed(this: unknown): boolean {
  for (const character of stringReceiver(this)) {
    const code = character.charCodeAt(0);
    if (character.length === 1 && code >= 0xd800 && code <= 0xdfff) return false;
  }
  return true;
}

function toWellFormed(this: unknown): string {
  return toScalarString(stringReceiver(this));
}

/** 仅补缺失能力；core 在最终日志序列化时调用，不另建 payload 清洗管道。 */
function installStringPolyfills(): void {
  const prototype = String.prototype as unknown as Record<string, unknown>;
  for (const [name, method] of [
    ['isWellFormed', isWellFormed],
    ['toWellFormed', toWellFormed],
  ] as const) {
    try {
      if (prototype[name] === undefined) {
        Object.defineProperty(prototype, name, {
          value: method,
          enumerable: false,
          writable: true,
          configurable: true,
        });
      }
    } catch (error) {
      console.warn(`[sentry-miniapp] Failed to install String.${name} polyfill:`, error);
    }
  }
}

function encodeFormComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** WHATWG form 解码：坏百分号保留，非法 UTF-8 替换；不要求宿主有 TextDecoder。 */
function decodeFormComponent(value: string): string {
  return toScalarString(value)
    .replace(/\+/g, ' ')
    .replace(/(?:%[\da-f]{2})+/gi, (encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch (_error) {
        const bytes = encoded.match(/[\da-f]{2}/gi)!.map((byte) => parseInt(byte, 16));
        let output = '';
        for (let index = 0; index < bytes.length;) {
          const first = bytes[index++]!;
          if (first < 0x80) {
            output += String.fromCharCode(first);
            continue;
          }
          const count =
            first >= 0xc2 && first <= 0xdf
              ? 1
              : first >= 0xe0 && first <= 0xef
                ? 2
                : first >= 0xf0 && first <= 0xf4
                  ? 3
                  : 0;
          if (!count) {
            output += '\ufffd';
            continue;
          }
          let codePoint = first & (0x7f >> count);
          let consumed = 0;
          for (; consumed < count && index < bytes.length; consumed++) {
            const next = bytes[index]!;
            const lower =
              consumed === 0 && first === 0xe0
                ? 0xa0
                : consumed === 0 && first === 0xf0
                  ? 0x90
                  : 0x80;
            const upper =
              consumed === 0 && first === 0xed
                ? 0x9f
                : consumed === 0 && first === 0xf4
                  ? 0x8f
                  : 0xbf;
            if (next < lower || next > upper) break;
            codePoint = (codePoint << 6) | (next & 0x3f);
            index++;
          }
          output += consumed === count ? String.fromCodePoint(codePoint) : '\ufffd';
        }
        return output;
      }
    });
}

/**
 * Get the JS global scope for the current environment.
 * 获取当前环境的 JS 全局作用域。
 *
 * URLSearchParams 是全局构造器，不属于某个平台 SDK 对象（wx/my/…），因此这里只解析
 * 全局作用域，不再枚举平台全局——平台检测的唯一来源是 crossPlatform 的 PLATFORMS 表。
 */
function getGlobalObject(): any {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  if (typeof self !== 'undefined') return self;

  try {
    return Function('return this')();
  } catch (_e) {
    // 某些严格 CSP 环境下 Function 构造器不可用
    return undefined;
  }
}

/**
 * Install polyfills for miniapp environment
 * 为小程序环境安装 polyfill
 */
export function installPolyfills(): void {
  installStringPolyfills();
  try {
    const globalObj = getGlobalObject();

    if (!globalObj) {
      console.warn(
        '[sentry-miniapp] Unable to detect global object, polyfills may not work correctly',
      );
      return;
    }

    // Install URLSearchParams polyfill if not available
    if (typeof globalObj.URLSearchParams === 'undefined') {
      globalObj.URLSearchParams = URLSearchParamsPolyfill;
    }
  } catch (error) {
    console.warn('[sentry-miniapp] Failed to install polyfills:', error);
  }
}

/**
 * Check if we're in a miniapp environment and install polyfills
 * 检查是否在小程序环境中并安装 polyfill
 */
export function ensurePolyfills(): void {
  // Always install polyfills regardless of environment to ensure compatibility
  // This ensures URLSearchParams is always available when needed
  installPolyfills();
}

// 不在工具模块导入时隐式修改全局；SDK 入口通过 polyfills-bootstrap.ts 显式调用一次。
