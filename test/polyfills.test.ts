import { afterEach, describe, expect, it, vi } from 'vitest';

const nativeFetch = globalThis.fetch;
const nativeRequest = globalThis.Request;
const nativePromise = Promise;

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
  });
});
