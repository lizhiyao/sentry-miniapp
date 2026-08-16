import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  getClient,
  getIsolationScope,
  installedIntegrations,
} from '@sentry/core';

import { _resetAppLifecycle } from '../src/appLifecycle';
import { resetPlatformCache, sdk } from '../src/crossPlatform';
import { init } from '../src/index';

type PlatformGlobal = 'wx' | 'my' | 'tt' | 'dd' | 'qq' | 'swan' | 'ks';
type RequestMethod = 'request' | 'httpRequest';

interface PlatformContract {
  globalName: PlatformGlobal;
  platform: string;
  requestMethod: RequestMethod;
  objectStorage: boolean;
}

const PLATFORM_GLOBALS: PlatformGlobal[] = ['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks'];
const PLATFORM_CONTRACTS: PlatformContract[] = [
  { globalName: 'wx', platform: 'wechat', requestMethod: 'request', objectStorage: false },
  { globalName: 'my', platform: 'alipay', requestMethod: 'httpRequest', objectStorage: true },
  { globalName: 'tt', platform: 'bytedance', requestMethod: 'request', objectStorage: false },
  { globalName: 'dd', platform: 'dingtalk', requestMethod: 'httpRequest', objectStorage: true },
  { globalName: 'qq', platform: 'qq', requestMethod: 'request', objectStorage: false },
  { globalName: 'swan', platform: 'swan', requestMethod: 'request', objectStorage: false },
  { globalName: 'ks', platform: 'kuaishou', requestMethod: 'request', objectStorage: false },
];

function collectEvents(captured: any[]): any[] {
  const events: any[] = [];
  for (const envelope of captured) {
    const items = envelope[1];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item[0]?.type === 'event') events.push(item[1]);
    }
  }
  return events;
}

describe.each(PLATFORM_CONTRACTS)(
  '$platform ($globalName) 宿主契约',
  ({ globalName, platform, requestMethod, objectStorage }) => {
    const g = globalThis as any;
    const captured: any[] = [];
    const errorHandlers = new Set<(error: string | Error) => void>();
    const networkHandlers = new Set<(status: unknown) => void>();
    const storage = new Map<string, unknown>();
    let originalApp: unknown;
    let originalPage: unknown;
    let host: Record<string, any>;
    let originalRequest: ReturnType<typeof vi.fn>;

    const transport = () => ({
      send: (envelope: any) => {
        captured.push(envelope);
        return Promise.resolve({ statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    });

    const initClient = () =>
      init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        release: 'platform-contract@1.19.0',
        enableOfflineCache: false,
        enableMinigameLifecycle: false,
        enableMinigameFrameRate: false,
        transport,
      });

    beforeEach(() => {
      captured.length = 0;
      errorHandlers.clear();
      networkHandlers.clear();
      storage.clear();
      installedIntegrations.length = 0;
      _resetAppLifecycle();
      getIsolationScope().clearBreadcrumbs();
      resetPlatformCache();

      for (const name of PLATFORM_GLOBALS) delete g[name];

      originalApp = g.App;
      originalPage = g.Page;
      g.App = vi.fn((options: unknown) => options);
      g.Page = vi.fn((options: unknown) => options);

      originalRequest = vi.fn(function (this: unknown, options: Record<string, any>) {
        options.success?.({ statusCode: 200, data: { ok: true } });
        options.complete?.({ statusCode: 200 });
        return { abort: vi.fn() };
      });

      const getStorageSync = vi.fn((input: string | { key: string }) => {
        const key = objectStorage ? (input as { key: string }).key : (input as string);
        const value = storage.get(key);
        return objectStorage ? { data: value } : value;
      });
      const setStorageSync = vi.fn(
        (input: string | { key: string; data: unknown }, value?: unknown) => {
          const key = objectStorage ? (input as { key: string }).key : (input as string);
          const data = objectStorage ? (input as { data: unknown }).data : value;
          storage.set(key, data);
        },
      );
      const removeStorageSync = vi.fn((input: string | { key: string }) => {
        const key = objectStorage ? (input as { key: string }).key : (input as string);
        storage.delete(key);
      });

      host = {
        [requestMethod]: originalRequest,
        getSystemInfoSync: vi.fn(() => ({
          brand: `${platform}-brand`,
          model: `${platform}-model`,
          system: `${platform}-os`,
          version: `${platform}-host`,
          SDKVersion: `${platform}-base`,
        })),
        getAccountInfoSync: vi.fn(() => ({
          miniProgram: { appId: `${platform}-app`, version: '1.19.0-test' },
        })),
        onError: vi.fn((handler: (error: string | Error) => void) => {
          errorHandlers.add(handler);
        }),
        offError: vi.fn((handler: (error: string | Error) => void) => {
          errorHandlers.delete(handler);
        }),
        onUnhandledRejection: vi.fn(),
        offUnhandledRejection: vi.fn(),
        onPageNotFound: vi.fn(),
        offPageNotFound: vi.fn(),
        onMemoryWarning: vi.fn(),
        offMemoryWarning: vi.fn(),
        getNetworkType: vi.fn(({ success }: { success?: (value: unknown) => void }) => {
          success?.({ networkType: 'wifi' });
        }),
        onNetworkStatusChange: vi.fn((handler: (status: unknown) => void) => {
          networkHandlers.add(handler);
        }),
        offNetworkStatusChange: vi.fn((handler: (status: unknown) => void) => {
          networkHandlers.delete(handler);
        }),
        getStorageSync,
        setStorageSync,
        removeStorageSync,
      };
      g[globalName] = host;
    });

    afterEach(async () => {
      const client = getClient();
      if (client) await client.close(0);
      installedIntegrations.length = 0;
      _resetAppLifecycle();
      getIsolationScope().clearBreadcrumbs();
      resetPlatformCache();
      for (const name of PLATFORM_GLOBALS) delete g[name];
      g.App = originalApp;
      g.Page = originalPage;
    });

    it('初始化、错误、请求、Storage、生命周期和重初始化遵守统一契约', async () => {
      const originalHostApp = g.App;
      const originalHostPage = g.Page;
      const client = initClient();
      expect(client).toBeDefined();
      expect(errorHandlers.size).toBe(1);
      expect(networkHandlers.size).toBe(1);
      expect(host[requestMethod]).not.toBe(originalRequest);

      const platformSdk = sdk();
      platformSdk.setStorageSync?.('contract-key', `${platform}-value`);
      expect(platformSdk.getStorageSync?.('contract-key')).toBe(`${platform}-value`);
      platformSdk.removeStorageSync?.('contract-key');
      expect(platformSdk.getStorageSync?.('contract-key')).toBeUndefined();

      const success = vi.fn();
      const complete = vi.fn();
      const requestOptions = {
        url: 'https://api.example.com/contracts',
        method: 'POST',
        header: { 'X-Business': 'preserved' },
        data: { platform },
        success,
        complete,
      };
      const requestTask = host[requestMethod](requestOptions);
      expect(requestTask).toEqual(expect.objectContaining({ abort: expect.any(Function) }));
      expect(originalRequest).toHaveBeenCalledTimes(1);
      expect(originalRequest.mock.instances[0]).toBe(host);
      const forwardedOptions = originalRequest.mock.calls[0]![0];
      expect(forwardedOptions).not.toBe(requestOptions);
      expect(forwardedOptions.header).toEqual({ 'X-Business': 'preserved' });
      expect(requestOptions.success).toBe(success);
      expect(requestOptions.complete).toBe(complete);
      expect(success).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledTimes(1);

      const appOptions = g.App({ onLaunch: vi.fn(), onShow: vi.fn(), onHide: vi.fn() });
      appOptions.onLaunch({ scene: 1001 });
      appOptions.onShow({ scene: 1001 });
      const pageOptions = g.Page({ onLoad: vi.fn(), onShow: vi.fn() });
      pageOptions.onLoad.call({ route: 'pages/contract/index' }, { source: platform });
      pageOptions.onShow.call({ route: 'pages/contract/index' });

      for (const handler of errorHandlers) handler(`contract error: ${platform}`);
      await client!.flush(2000);

      const event = collectEvents(captured).find((candidate) =>
        candidate.exception?.values?.some((value: any) =>
          value.value?.includes(`contract error: ${platform}`),
        ),
      );
      expect(event?.platform).toBe('javascript');
      expect(event?.contexts?.miniapp?.platform).toBe(platform);
      expect(event?.contexts?.device?.brand).toBe(`${platform}-brand`);
      expect(event?.contexts?.app?.app_version).toBe('1.19.0-test');
      expect(event?.exception?.values?.[0]?.mechanism).toEqual({
        type: 'onerror',
        handled: false,
      });
      expect(event?.breadcrumbs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'xhr' }),
          expect.objectContaining({ category: 'app.lifecycle' }),
          expect.objectContaining({ category: 'page.lifecycle' }),
        ]),
      );

      await client!.close(2000);
      expect(errorHandlers.size).toBe(0);
      expect(networkHandlers.size).toBe(0);
      expect(host[requestMethod]).toBe(originalRequest);
      expect(g.App).toBe(originalHostApp);
      expect(g.Page).toBe(originalHostPage);

      captured.length = 0;
      const nextClient = initClient();
      expect(nextClient).toBeDefined();
      expect(errorHandlers.size).toBe(1);
      for (const handler of errorHandlers) handler(`reinitialized error: ${platform}`);
      await nextClient!.flush(2000);
      expect(
        collectEvents(captured).some((candidate) =>
          candidate.exception?.values?.some((value: any) =>
            value.value?.includes(`reinitialized error: ${platform}`),
          ),
        ),
      ).toBe(true);
      await nextClient!.close(2000);
    });

    it('宿主缺少可选能力时仍能初始化并手动上报', async () => {
      delete g[globalName];
      host = { [requestMethod]: originalRequest };
      g[globalName] = host;
      resetPlatformCache();

      const client = initClient();
      expect(client).toBeDefined();
      captureException(new Error(`minimal host: ${platform}`));
      await client!.flush(2000);

      const event = collectEvents(captured).find((candidate) =>
        candidate.exception?.values?.some((value: any) =>
          value.value?.includes(`minimal host: ${platform}`),
        ),
      );
      expect(event?.contexts?.miniapp?.platform).toBe(platform);
      expect(event?.contexts?.device?.brand).toBe('unknown');
      await client!.close(2000);
    });
  },
);
