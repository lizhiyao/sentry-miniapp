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
          this._entries.push([pair[0] || '', pair[1] || '']);
        }
      }
    } else if (init && typeof init === 'object') {
      if (init instanceof URLSearchParamsPolyfill) {
        this._entries = init._entries.map(([k, v]) => [k, v]);
      } else {
        for (const [key, value] of Object.entries(init)) {
          this._entries.push([key, value]);
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
          this._entries.push([decodeURIComponent(pair), '']);
        }
      } else {
        const key = pair.slice(0, eqIndex);
        const value = pair.slice(eqIndex + 1);
        if (key) {
          this._entries.push([decodeURIComponent(key), decodeURIComponent(value)]);
        }
      }
    }
  }

  append(name: string, value: string): void {
    this._entries.push([name, String(value)]);
  }

  delete(name: string): void {
    this._entries = this._entries.filter(([key]) => key !== name);
  }

  get(name: string): string | null {
    const entry = this._entries.find(([key]) => key === name);
    return entry ? entry[1] : null;
  }

  getAll(name: string): string[] {
    return this._entries.filter(([key]) => key === name).map(([, value]) => value);
  }

  has(name: string): boolean {
    return this._entries.some(([key]) => key === name);
  }

  set(name: string, value: string): void {
    const strValue = String(value);
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
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  forEach(callback: (value: string, key: string, parent: URLSearchParamsPolyfill) => void): void {
    for (const [key, value] of this._entries) {
      callback(value, key, this);
    }
  }

  *keys(): IterableIterator<string> {
    for (const [key] of this._entries) {
      yield key;
    }
  }

  *values(): IterableIterator<string> {
    for (const [, value] of this._entries) {
      yield value;
    }
  }

  *entries(): IterableIterator<[string, string]> {
    for (const entry of this._entries) {
      yield entry;
    }
  }

  *[Symbol.iterator](): IterableIterator<[string, string]> {
    yield* this.entries();
  }
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
  try {
    return Function('return this')();
  } catch (_e) {
    // 某些严格 CSP 环境下 Function 构造器不可用，继续按下方兜底
  }
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  if (typeof self !== 'undefined') return self;
  return undefined;
}

/**
 * Install polyfills for miniapp environment
 * 为小程序环境安装 polyfill
 */
export function installPolyfills(): void {
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

    // Also install to the global scope for direct access
    // 同时安装到全局作用域以便直接访问
    const globalScope = Function('return this')();
    if (globalScope && typeof globalScope.URLSearchParams === 'undefined') {
      globalScope.URLSearchParams = URLSearchParamsPolyfill as any;
    }

    // For environments where Function('return this')() doesn't work
    // 对于 Function('return this')() 不起作用的环境
    if (typeof globalThis !== 'undefined' && typeof globalThis.URLSearchParams === 'undefined') {
      (globalThis as any).URLSearchParams = URLSearchParamsPolyfill;
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

/**
 * Check if URLSearchParams is available in the current environment
 * 检查当前环境是否支持 URLSearchParams
 */
export function isURLSearchParamsSupported(): boolean {
  try {
    const globalObj = getGlobalObject();
    return globalObj && typeof globalObj.URLSearchParams !== 'undefined';
  } catch {
    return false;
  }
}

// Auto-install polyfills immediately when this module is loaded
// This runs before any other SDK functionality
ensurePolyfills();
