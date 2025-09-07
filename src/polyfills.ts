/**
 * Polyfills for miniapp environment
 * 小程序环境的 polyfill 实现
 */

/**
 * URLSearchParams polyfill for miniapp environment
 * 小程序环境的 URLSearchParams polyfill
 */
class URLSearchParamsPolyfill {
  private params: Record<string, string> = {};

  constructor(init?: string | Record<string, string> | URLSearchParamsPolyfill | string[][]) {
    if (typeof init === 'string') {
      this.parseString(init);
    } else if (Array.isArray(init)) {
      // Handle string[][] format
      for (const pair of init) {
        if (Array.isArray(pair) && pair.length >= 2) {
           this.append(pair[0] || '', pair[1] || '');
         }
      }
    } else if (init && typeof init === 'object') {
      if (init instanceof URLSearchParamsPolyfill) {
        this.params = { ...init.params };
      } else {
        this.params = { ...init };
      }
    }
  }

  get size(): number {
    return Object.keys(this.params).length;
  }

  private parseString(str: string): void {
    if (str.startsWith('?')) {
      str = str.slice(1);
    }
    
    if (!str) {
      return;
    }

    const pairs = str.split('&');
    for (const pair of pairs) {
      const [key, value = ''] = pair.split('=');
      if (key) {
        this.params[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
  }

  append(name: string, value: string): void {
    // URLSearchParams.append should add to existing values, not replace
    const existing = this.params[name];
    if (existing) {
      this.params[name] = existing + ',' + value;
    } else {
      this.params[name] = value;
    }
  }

  delete(name: string): void {
    delete this.params[name];
  }

  get(name: string): string | null {
    return this.params[name] ?? null;
  }

  getAll(name: string): string[] {
    // For simplicity, we only store one value per key
    // In a full implementation, this would return an array of all values
    const value = this.params[name];
    return value ? [value] : [];
  }

  has(name: string): boolean {
    return name in this.params;
  }

  set(name: string, value: string): void {
    this.params[name] = String(value);
  }

  sort(): void {
    const sortedKeys = Object.keys(this.params).sort();
    const sortedParams: Record<string, string> = {};
    for (const key of sortedKeys) {
       sortedParams[key] = this.params[key] || '';
     }
    this.params = sortedParams;
  }

  toString(): string {
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(this.params)) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
    return pairs.join('&');
  }

  forEach(callback: (value: string, key: string, parent: URLSearchParamsPolyfill) => void): void {
    for (const [key, value] of Object.entries(this.params)) {
      callback(value, key, this);
    }
  }

  *keys(): IterableIterator<string> {
    for (const key of Object.keys(this.params)) {
      yield key;
    }
  }

  *values(): IterableIterator<string> {
    for (const value of Object.values(this.params)) {
      yield value;
    }
  }

  *entries(): IterableIterator<[string, string]> {
    for (const [key, value] of Object.entries(this.params)) {
      yield [key, value];
    }
  }

  // Symbol.iterator to make it iterable
  *[Symbol.iterator](): IterableIterator<[string, string]> {
    yield* this.entries();
  }
}

/**
 * Get the global object for the current environment
 * 获取当前环境的全局对象
 */
function getGlobalObject(): any {
  // 尝试获取全局对象
  const globalScope = Function('return this')();
  
  // 微信小程序环境
  if (globalScope && typeof globalScope.wx !== 'undefined' && globalScope.wx) {
    return globalScope.wx;
  }
  // 支付宝小程序环境
  if (globalScope && typeof globalScope.my !== 'undefined' && globalScope.my) {
    return globalScope.my;
  }
  // 百度小程序环境
  if (globalScope && typeof globalScope.swan !== 'undefined' && globalScope.swan) {
    return globalScope.swan;
  }
  // 字节跳动小程序环境
  if (globalScope && typeof globalScope.tt !== 'undefined' && globalScope.tt) {
    return globalScope.tt;
  }
  // QQ小程序环境
  if (globalScope && typeof globalScope.qq !== 'undefined' && globalScope.qq) {
    return globalScope.qq;
  }
  // 通用全局对象检测
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  // 浏览器环境
  if (typeof window !== 'undefined') {
    return window;
  }
  // Node.js 环境
  if (typeof global !== 'undefined') {
    return global;
  }
  // Web Worker 环境
  if (typeof self !== 'undefined') {
    return self;
  }
  // 返回全局作用域
  return globalScope;
}

/**
 * Install polyfills for miniapp environment
 * 为小程序环境安装 polyfill
 */
export function installPolyfills(): void {
  try {
    const globalObj = getGlobalObject();
    
    if (!globalObj) {
      console.warn('[Sentry] Unable to detect global object, polyfills may not work correctly');
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
    console.warn('[Sentry] Failed to install polyfills:', error);
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