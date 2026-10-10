import { afterEach, describe, expect, it, vi } from 'vitest';

const nativeFetch = globalThis.fetch;
const nativeRequest = globalThis.Request;
const nativePromise = Promise;
const nativeURLSearchParams = URLSearchParams;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('标准能力启动边界', () => {
  // 原生／空壳与冻结原型的能力检测在实际包的独立进程中检查，避免依赖 CommonJS 缓存。
  it('启动时补齐缺失的查询参数能力，保留宿主请求与 Promise 身份', async () => {
    vi.stubGlobal('URLSearchParams', undefined);
    await import('../src/polyfills-bootstrap');
    const params = new URLSearchParams({ sentry_key: 'key', sentry_client: 'sdk / 中文🙂' });
    expect(params.toString()).toBe(
      'sentry_key=key&sentry_client=sdk+%2F+%E4%B8%AD%E6%96%87%F0%9F%99%82',
    );
    expect(globalThis.fetch).toBe(nativeFetch);
    expect(globalThis.Request).toBe(nativeRequest);
    expect(Promise).toBe(nativePromise);

    const fallback = URLSearchParams;
    const { ensureURLSearchParams } = await import('../src/coreCompat');
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(fallback);

    vi.stubGlobal('URL', undefined);
    vi.stubGlobal('URLSearchParams', nativeURLSearchParams);
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(nativeURLSearchParams);

    for (const incomplete of [
      class URLSearchParams {},
      class URLSearchParams {
        constructor() {
          throw new Error('Unavailable query API');
        }
      },
    ]) {
      vi.stubGlobal('URLSearchParams', incomplete);
      ensureURLSearchParams(fallback);
      expect(URLSearchParams).toBe(fallback);
    }
    Object.defineProperty(globalThis, 'URLSearchParams', {
      configurable: true,
      get() {
        throw new Error('Unreadable query API');
      },
    });
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(fallback);
  });
});
