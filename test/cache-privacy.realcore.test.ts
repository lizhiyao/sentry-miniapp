import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope, getIsolationScope } from '@sentry/core';
import { init } from '../src/sdk';
import type { MiniappClient } from '../src/client';
import type { MiniappOptions } from '../src/types';
import { sdk, resetPlatformCache } from '../src/crossPlatform';
import { OFFLINE_STORE_KEY } from '../src/transports/offlineRecords';

describe('缓存隐私策略（真实 Core 与宿主请求）', () => {
  const clients: MiniappClient[] = [];
  let disk: Map<string, string>;
  let sent: string[];
  let online: boolean;
  let onRead: (() => void) | undefined;
  let remove: ReturnType<typeof vi.fn>;
  let request: ReturnType<typeof vi.fn>;
  function start(options: MiniappOptions = {}) {
    // 模拟重新启动后的 scope：本契约不清理业务仍保留在 scope 中的旧面包屑。
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();
    const client = init({
      dsn: 'https://key@example.com/1',
      requireConsent: true,
      enableAutoSessionTracking: false,
      traceNetworkBody: true,
      ...options,
    })!;
    clients.push(client);
    return client;
  }
  async function cache(client: MiniappClient) {
    sdk().request!({
      url: 'https://api.example.com/?order=query-canary',
      data: { order: 'body-canary' },
    });
    client.captureMessage('cached-marker');
    const flushed = client.flush(50);
    await vi.advanceTimersByTimeAsync(50);
    await flushed;
    expect(disk.get(OFFLINE_STORE_KEY)).toContain('cached-marker');
  }
  async function grant(client: MiniappClient) {
    client.setConsent(true);
    await vi.advanceTimersByTimeAsync(1000);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    resetPlatformCache();
    disk = new Map();
    sent = [];
    online = true;
    onRead = undefined;
    remove = vi.fn((key: string) => disk.delete(key));
    request = vi.fn((options) => {
      if (options.url.includes('/envelope/')) {
        if (!online) {
          options.fail?.({ errMsg: 'offline' });
          return {};
        }
        sent.push(String(options.data));
      }
      options.success?.({ statusCode: 200, data: { order: 'response-canary' }, header: {} });
      options.complete?.({ statusCode: 200 });
      return { abort: vi.fn() };
    });
    vi.stubGlobal('wx', {
      request,
      getStorageSync: (key: string) => {
        if (key === OFFLINE_STORE_KEY) onRead?.();
        return disk.get(key);
      },
      setStorageSync: (key: string, value: string) => disk.set(key, value),
      removeStorageSync: remove,
    });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });

  it.each<MiniappOptions>([
    { dataCollection: { urlQueryParams: false } },
    { dataCollection: { urlQueryParams: { allow: ['page'] } } },
    { dataCollection: { userInfo: false } },
    { dataCollection: { httpBodies: ['outgoingRequest'] } },
    { traceNetworkBody: false },
    { maxRequestBodySize: 'small' },
    { sensitiveKeys: ['order'] },
    { cachePrivacyVersion: 'policy-2' },
    { _metadata: { sdk: { settings: { infer_ip: 'never' } } } },
  ])('策略变化 %j 后不重放旧记录', async (options) => {
    const first = start();
    await cache(first);
    expect(disk.get(OFFLINE_STORE_KEY)).toContain('query-canary');
    expect(disk.get(OFFLINE_STORE_KEY)).toContain('body-canary');
    const drop = vi.fn();
    const second = start({ ...options, onConsentCacheDrop: drop });
    await grant(second);
    expect(sent.join('')).not.toContain('cached-marker');
    expect(second.getOfflineStoreDiagnostics()?.codes).toContain('policy_changed');
    expect(drop).toHaveBeenCalledWith({ reason: 'policy_changed', dropped: 1 });
    expect(disk.get(OFFLINE_STORE_KEY)).toBe('');
  });

  it.each<[MiniappOptions, MiniappOptions]>([
    [
      {},
      {
        dataCollection: {
          userInfo: true,
          urlQueryParams: { deny: [] },
          httpBodies: ['outgoingResponse', 'outgoingRequest'],
        },
        maxRequestBodySize: 1048576,
      },
    ],
    [
      {
        sensitiveKeys: ['Member', 'member'],
        dataCollection: { urlQueryParams: { deny: ['PHONE', 'Email'] } },
      },
      {
        sensitiveKeys: ['member'],
        dataCollection: { urlQueryParams: { deny: ['email', 'phone', 'EMAIL'] } },
      },
    ],
    [
      { traceNetworkBody: false },
      { traceNetworkBody: false, maxRequestBodySize: 'small', dataCollection: { httpBodies: [] } },
    ],
    [
      {},
      {
        consentCacheLimit: 2,
        consentCacheMaxAge: 60000,
        consentCacheMaxBytes: 900000,
        dataCollection: { cookies: false, httpHeaders: false },
      },
    ],
  ])('等价策略保留缓存（%j → %j）', async (previous, next) => {
    await cache(start(previous));
    const second = start(next);
    await grant(second);
    expect(sent.join('')).toContain('cached-marker');
    expect(second.getOfflineStoreDiagnostics()?.codes).not.toContain('policy_changed');
  });

  it('默认弱网缓存恢复网络时也先校验策略', async () => {
    online = false;
    await cache(start({ requireConsent: false }));
    const second = start({ requireConsent: false, dataCollection: { urlQueryParams: false } });
    online = true;
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent.join('')).not.toContain('cached-marker');
    expect(second.getOfflineStoreDiagnostics()?.codes).toContain('policy_changed');
  });

  it('非法业务修订号在退休原 runtime 前报错', () => {
    const first = start();
    // @ts-expect-error JS 使用者传入非法值也不能使策略身份碰撞。
    expect(() => init({ cachePrivacyVersion: 2 })).toThrow('cachePrivacyVersion');
    expect(getClient()).toBe(first);
    expect(first.isActiveRuntime()).toBe(true);
  });

  it('放宽策略也失效，空 allow 不等于 false', async () => {
    await cache(start({ dataCollection: { urlQueryParams: false } }));
    const second = start({ dataCollection: { urlQueryParams: { allow: [] } } });
    await grant(second);
    expect(sent.join('')).not.toContain('cached-marker');
    expect(second.getOfflineStoreDiagnostics()?.codes).toContain('policy_changed');
  });

  it('删除失败不重放旧值、不虚报丢弃，降级后仍可缓存当前数据', async () => {
    await cache(start());
    const old = disk.get(OFFLINE_STORE_KEY);
    remove.mockImplementation(() => {
      throw new Error('storage denied');
    });
    const drop = vi.fn();
    const second = start({ dataCollection: { urlQueryParams: false }, onConsentCacheDrop: drop });
    await grant(second);
    expect(sent.join('')).not.toContain('cached-marker');
    expect(disk.get(OFFLINE_STORE_KEY)).toBe(old);
    expect(drop).not.toHaveBeenCalled();
    expect(second.getOfflineStoreDiagnostics()).toMatchObject({
      mode: 'memory',
      codes: expect.arrayContaining(['storage_error', 'memory_only']),
    });
    second.setConsent(false);
    await cache(second);
    await grant(second);
    expect(sent.join('')).toContain('cached-marker');
    expect(sent.join('')).not.toContain('query-canary');
  });

  it('shift 读取期间撤回同意，原记录按原身份回填，重新同意后才发送', async () => {
    await cache(start());
    const original = JSON.parse(disk.get(OFFLINE_STORE_KEY)!).records[0];
    const second = start();
    onRead = () => {
      onRead = undefined;
      second.setConsent(false);
    };
    await grant(second);
    expect(sent.join('')).not.toContain('cached-marker');
    const retained = JSON.parse(disk.get(OFFLINE_STORE_KEY)!).records[0];
    expect(retained.recordId).toBe(original.recordId);
    expect(retained.createdAt).toBe(original.createdAt);
    await grant(second);
    expect(sent.join('')).toContain('cached-marker');
  });

  it('旧 privacy-v2 根在授权重放前丢弃', async () => {
    await cache(start());
    const root = JSON.parse(disk.get(OFFLINE_STORE_KEY)!);
    root.policyId = JSON.stringify(['miniapp-privacy-v2', true]);
    disk.set(OFFLINE_STORE_KEY, JSON.stringify(root));
    const second = start();
    await grant(second);
    expect(sent.join('')).not.toContain('cached-marker');
    expect(second.getOfflineStoreDiagnostics()?.codes).toContain('policy_changed');
  });

  it('原配置数组修改不改变本 client 的采集和身份快照', async () => {
    const deny = ['order'];
    const sensitive = ['member'];
    const bodies: NonNullable<NonNullable<MiniappOptions['dataCollection']>['httpBodies']> = [
      'outgoingRequest',
    ];
    const first = start({
      sensitiveKeys: sensitive,
      dataCollection: { urlQueryParams: { deny }, httpBodies: bodies },
    });
    deny.length = 0;
    sensitive.push('order');
    bodies.push('outgoingResponse');
    await cache(first);
    expect(disk.get(OFFLINE_STORE_KEY)).not.toContain('query-canary');
    expect(disk.get(OFFLINE_STORE_KEY)).toContain('body-canary');
    expect(disk.get(OFFLINE_STORE_KEY)).not.toContain('response-canary');
    const second = start({
      sensitiveKeys: ['member'],
      dataCollection: { urlQueryParams: { deny: ['order'] }, httpBodies: ['outgoingRequest'] },
    });
    await grant(second);
    expect(sent.join('')).toContain('cached-marker');
  });
});
