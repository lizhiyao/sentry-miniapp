import {
  captureException,
  captureMessage,
  getClient,
  type Envelope,
  type Transport,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetConsentState } from '../src/consent';
import { resetPlatformCache } from '../src/crossPlatform';
import { init, setConsent } from '../src/index';

describe('小游戏生命周期同步发送链路（真 @sentry/core）', () => {
  const g = globalThis as any;
  const storage = new Map<string, unknown>();
  let rawRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage.clear();
    delete g.wx;
    resetPlatformCache();

    rawRequest = vi.fn((options: Record<string, any>) => {
      const response = { statusCode: 200, data: { ok: true }, header: {} };
      options.success?.(response);
      options.complete?.(response);
      return { abort: vi.fn() };
    });
    g.tt = {
      request: rawRequest,
      getSystemInfoSync: vi.fn(() => ({ platform: 'ios' })),
      getAccountInfoSync: vi.fn(() => ({ miniProgram: { appId: 'douyin-sync-test' } })),
      getStorageSync: vi.fn((key: string) => storage.get(key)),
      setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
      removeStorageSync: vi.fn((key: string) => storage.delete(key)),
    };
  });

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
    const client = getClient();
    if (client) await client.close(0);
    resetConsentState();
    delete g.tt;
    resetPlatformCache();
  });

  it('异常、消息和 transaction 在 capture 调用返回前到达 transport', () => {
    const captured: Envelope[] = [];
    const transport = (): Transport => ({
      send: (envelope) => {
        captured.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    });
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      defaultIntegrations: false,
      enableOfflineCache: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      tracesSampleRate: 1,
      transport,
    });

    captureException(new Error('sync exception'));
    expect(captured).toHaveLength(1);

    captureMessage('sync message');
    expect(captured).toHaveLength(2);

    client!.captureEvent({ type: 'transaction', transaction: 'sync transaction' });
    expect(captured).toHaveLength(3);
  });

  it('同意前同步写缓存，同意后在 capture 返回前调用 tt.request', async () => {
    vi.useFakeTimers();
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      defaultIntegrations: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      requireConsent: true,
      consentCacheMaxAge: 60_000,
      consentCacheMaxBytes: 128 * 1024,
      tracesSampleRate: 1,
    });

    client!.captureEvent({ type: 'transaction', transaction: 'before consent' });
    expect(rawRequest).not.toHaveBeenCalled();
    expect(String(storage.get('sentry_offline_store'))).toContain('before consent');

    setConsent(true);
    client!.captureEvent({ type: 'transaction', transaction: 'after consent' });
    expect(rawRequest).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await vi.runAllTimersAsync();
    expect(rawRequest).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(storage.get('sentry_offline_store')))).toEqual([]);
  });
});
