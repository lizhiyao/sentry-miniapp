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
  it('精简入口拒绝缺失的必要能力，保留接入方负责补齐的边界', async () => {
    const { assertRequiredRuntime } = await import('../src/runtime-preflight');
    const root = globalThis;
    const cases: Array<[object, string, string, unknown]> = [
      [root, 'globalThis', 'globalThis', undefined],
      [Array.prototype, 'includes', 'Array.prototype.includes', undefined],
      [Object, 'entries', 'Object.entries', undefined],
      [Object, 'values', 'Object.values', undefined],
      [Object, 'fromEntries', 'Object.fromEntries', undefined],
      [Promise, 'allSettled', 'Promise.allSettled', undefined],
      [root, 'Promise', 'Promise.allSettled', undefined],
      [String.prototype, 'isWellFormed', 'String.prototype.isWellFormed', undefined],
      [String.prototype, 'toWellFormed', 'String.prototype.toWellFormed', undefined],
      [root, 'URLSearchParams', 'URLSearchParams', undefined],
      [root, 'URLSearchParams', 'URLSearchParams', class {}],
    ];
    for (const [owner, key, label, value] of cases) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key)!;
      let failure: unknown;
      try {
        Object.defineProperty(owner, key, { ...descriptor, value });
        try {
          assertRequiredRuntime();
        } catch (error) {
          failure = error;
        }
      } finally {
        Object.defineProperty(owner, key, descriptor);
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain(
        '[sentry-miniapp/lite] Missing runtime capabilities:',
      );
      expect((failure as Error).message).toContain(label);
    }
    expect(() => assertRequiredRuntime()).not.toThrow();
  });

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
    const { ensureURLSearchParams } = await import('../src/queryRuntime');
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(fallback);

    vi.stubGlobal('URL', undefined);
    vi.stubGlobal('URLSearchParams', nativeURLSearchParams);
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(nativeURLSearchParams);

    class CoreQueryParams extends nativeURLSearchParams {
      constructor(init?: ConstructorParameters<typeof URLSearchParams>[0]) {
        if (Array.isArray(init)) throw new Error('Pair inputs are unavailable');
        super(init);
      }
    }
    Object.defineProperty(CoreQueryParams.prototype, 'get', {
      get() {
        throw new Error('Unused method must not be probed');
      },
    });
    vi.stubGlobal('URLSearchParams', CoreQueryParams);
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(CoreQueryParams);

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
      writable: false,
      value: undefined,
    });
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(fallback);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams')).toMatchObject({
      configurable: true,
      writable: false,
    });

    Object.defineProperty(globalThis, 'URLSearchParams', {
      configurable: true,
      get() {
        throw new Error('Unreadable query API');
      },
    });
    ensureURLSearchParams(fallback);
    expect(URLSearchParams).toBe(fallback);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams')).toMatchObject({
      configurable: true,
      writable: true,
    });

    expect(Reflect.deleteProperty(globalThis, 'URLSearchParams')).toBe(true);
    ensureURLSearchParams(fallback);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams')).toMatchObject({
      value: fallback,
      configurable: true,
      writable: true,
    });

    vi.unstubAllGlobals();
    const regular = await import('../src/index');
    const lite = await import('../src/lite');
    expect(lite.init).toBe(regular.init);
    expect(lite.MiniappClient).toBe(regular.MiniappClient);
    expect(lite.setConsent).toBe(regular.setConsent);
  });
});
