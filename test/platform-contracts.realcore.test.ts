import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  getClient,
  getIsolationScope,
  installedIntegrations,
  type SerializedStreamedSpan,
  type SerializedStreamedSpanContainer,
} from '@sentry/core';

import { _resetAppLifecycle } from '../src/appLifecycle';
import { resetPlatformCache, sdk, getStorageApi } from '../src/crossPlatform';
import { spanAttribute } from './support/envelopes';
import { init } from '../src/index';

type PlatformGlobal = 'wx' | 'my' | 'tt' | 'dd' | 'qq' | 'swan' | 'ks';
type RequestMethod = 'request' | 'httpRequest';
type MiniappPlatform =
  | 'wechat'
  | 'alipay'
  | 'bytedance'
  | 'dingtalk'
  | 'qq'
  | 'swan'
  | 'kuaishou';

interface PlatformContract {
  globalName: PlatformGlobal;
  platform: MiniappPlatform;
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

function collectEnvelopePayloads<T>(
  capturedRequests: Array<Record<string, any>>,
  itemType: string,
): T[] {
  const payloads: T[] = [];
  for (const request of capturedRequests) {
    const body =
      typeof request.data === 'string'
        ? request.data
        : new TextDecoder().decode(request.data as Uint8Array);
    const lines = body.split('\n');
    for (let index = 1; index + 1 < lines.length; index += 2) {
      const itemHeader = JSON.parse(lines[index]!);
      const payload = JSON.parse(lines[index + 1]!);
      if (itemHeader.type === itemType) payloads.push(payload as T);
    }
  }
  return payloads;
}

/** core 11 的 span item 是 span/v2 容器，直接取容器里的 span 断言。 */
function collectSpans(capturedRequests: Array<Record<string, any>>): SerializedStreamedSpan[] {
  return collectEnvelopePayloads<SerializedStreamedSpanContainer>(capturedRequests, 'span')
    .map((container) => container.items)
    .flat();
}

function collectEvents(capturedRequests: Array<Record<string, any>>): any[] {
  return collectEnvelopePayloads(capturedRequests, 'event');
}

describe.each(PLATFORM_CONTRACTS)(
  '$platform ($globalName) 宿主契约',
  ({ globalName, platform, requestMethod, objectStorage }) => {
    const g = globalThis as any;
    const capturedRequests: Array<Record<string, any>> = [];
    const errorHandlers = new Set<(error: string | Error) => void>();
    const rejectionHandlers = new Set<
      (payload: { reason: string | Error; promise: Promise<unknown> }) => void
    >();
    const pageNotFoundHandlers = new Set<
      (payload: { path: string; query: Record<string, unknown>; isEntryPage: boolean }) => void
    >();
    const memoryWarningHandlers = new Set<(payload: { level: number }) => void>();
    const networkHandlers = new Set<(status: unknown) => void>();
    const storage = new Map<string, unknown>();
    let originalApp: unknown;
    let originalPage: unknown;
    let host: Record<string, any>;
    let originalRequest: ReturnType<typeof vi.fn>;

    const initClient = () =>
      init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        release: 'platform-contract@1.19.0',
        enableOfflineCache: false,
        enableMinigameLifecycle: false,
        enableMinigameFrameRate: false,
      });

    beforeEach(() => {
      capturedRequests.length = 0;
      errorHandlers.clear();
      rejectionHandlers.clear();
      pageNotFoundHandlers.clear();
      memoryWarningHandlers.clear();
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
        const contentType = options.header?.['Content-Type'] ?? options.headers?.['Content-Type'];
        const isSentryEnvelope = contentType === 'application/x-sentry-envelope';
        if (isSentryEnvelope) capturedRequests.push(options);

        const response =
          globalName === 'my'
            ? { status: 200, data: { ok: true }, headers: {} }
            : { statusCode: 200, data: { ok: true }, header: {} };
        options.success?.(response);
        options.complete?.(response);
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
        onUnhandledRejection: vi.fn(
          (
            handler: (payload: {
              reason: string | Error;
              promise: Promise<unknown>;
            }) => void,
          ) => {
            rejectionHandlers.add(handler);
          },
        ),
        offUnhandledRejection: vi.fn(
          (
            handler: (payload: {
              reason: string | Error;
              promise: Promise<unknown>;
            }) => void,
          ) => {
            rejectionHandlers.delete(handler);
          },
        ),
        onPageNotFound: vi.fn(
          (
            handler: (payload: {
              path: string;
              query: Record<string, unknown>;
              isEntryPage: boolean;
            }) => void,
          ) => {
            pageNotFoundHandlers.add(handler);
          },
        ),
        offPageNotFound: vi.fn(
          (
            handler: (payload: {
              path: string;
              query: Record<string, unknown>;
              isEntryPage: boolean;
            }) => void,
          ) => {
            pageNotFoundHandlers.delete(handler);
          },
        ),
        onMemoryWarning: vi.fn((handler: (payload: { level: number }) => void) => {
          memoryWarningHandlers.add(handler);
        }),
        offMemoryWarning: vi.fn((handler: (payload: { level: number }) => void) => {
          memoryWarningHandlers.delete(handler);
        }),
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
      const extension = Symbol('framework capability');
      const capability = {};
      Object.defineProperty(originalRequest, 'capability', {
        value: 'initial',
        configurable: true,
        writable: true,
      });
      Object.defineProperty(originalRequest, extension, { value: capability });
      Object.defineProperty(originalRequest, 'apply', { value: 'framework extension' });
      const originals = [originalRequest, originalHostApp, originalHostPage];
      const descriptors = originals.map((fn) => Object.getOwnPropertyDescriptors(fn));
      const sourceStrings = originals.map((fn) => fn.toString());
      const client = initClient();
      expect(client).toBeDefined();
      expect(errorHandlers.size).toBe(1);
      expect(rejectionHandlers.size).toBe(1);
      expect(pageNotFoundHandlers.size).toBe(1);
      expect(memoryWarningHandlers.size).toBe(1);
      expect(networkHandlers.size).toBe(1);
      expect(host[requestMethod]).not.toBe(originalRequest);
      for (const [index, fn] of [host[requestMethod], g.App, g.Page].entries()) {
        expect(fn.toString()).toBe(sourceStrings[index]);
        expect(fn.name).toBe(originals[index].name);
        expect(fn.length).toBe(originals[index].length);
        expect(Reflect.ownKeys(fn)).toEqual(Reflect.ownKeys(originals[index]));
        expect(Object.getOwnPropertyDescriptors(originals[index])).toEqual(descriptors[index]);
      }
      expect(host[requestMethod].capability).toBe('initial');
      expect(host[requestMethod][extension]).toBe(capability);
      expect(host[requestMethod].apply).toBe('framework extension');
      Reflect.set(originalRequest, 'capability', 'updated');
      expect(host[requestMethod].capability).toBe('updated');
      host[requestMethod].capability = 'business update';
      expect(Reflect.get(originalRequest, 'capability')).toBe('business update');

      const platformSdk = sdk();
      const source = platformSdk as unknown as Record<string, unknown>;
      const set = getStorageApi(source, 'setStorageSync')!;
      const get = getStorageApi(source, 'getStorageSync')!;
      const remove = getStorageApi(source, 'removeStorageSync')!;
      set.call(source, 'contract-key', `${platform}-value`);
      expect(get.call(source, 'contract-key')).toBe(`${platform}-value`);
      remove.call(source, 'contract-key');
      expect(get.call(source, 'contract-key')).toBeUndefined();

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

      const launchOptions = { scene: 1001 };
      const appContext = { kind: 'app-context' };
      const appOnLaunch = vi.fn(function (this: unknown, options: unknown) {
        expect(this).toBe(appContext);
        expect(options).toBe(launchOptions);
        return 'app-launch-result';
      });
      const appOnShow = vi.fn(function (this: unknown, options: unknown) {
        expect(this).toBe(appContext);
        expect(options).toBe(launchOptions);
        return 'app-show-result';
      });
      const appOnHide = vi.fn(function (this: unknown) {
        expect(this).toBe(appContext);
        return 'app-hide-result';
      });
      const appOptions = g.App({ onLaunch: appOnLaunch, onShow: appOnShow, onHide: appOnHide });
      expect(appOptions.onLaunch.call(appContext, launchOptions)).toBe('app-launch-result');
      expect(appOptions.onShow.call(appContext, launchOptions)).toBe('app-show-result');
      expect(appOptions.onHide.call(appContext)).toBe('app-hide-result');
      expect(appOnLaunch).toHaveBeenCalledTimes(1);
      expect(appOnShow).toHaveBeenCalledTimes(1);
      expect(appOnHide).toHaveBeenCalledTimes(1);

      const pageQuery = { source: platform };
      const pageContext = { route: 'pages/contract/index' };
      const pageOnLoad = vi.fn(function (this: unknown, query: unknown) {
        expect(this).toBe(pageContext);
        expect(query).toBe(pageQuery);
        return 'page-load-result';
      });
      const pageOnShow = vi.fn(function (this: unknown) {
        expect(this).toBe(pageContext);
        return 'page-show-result';
      });
      const pageOptions = g.Page({ onLoad: pageOnLoad, onShow: pageOnShow });
      expect(pageOptions.onLoad.call(pageContext, pageQuery)).toBe('page-load-result');
      expect(pageOptions.onShow.call(pageContext)).toBe('page-show-result');
      expect(pageOnLoad).toHaveBeenCalledTimes(1);
      expect(pageOnShow).toHaveBeenCalledTimes(1);

      for (const handler of errorHandlers) handler(`contract error: ${platform}`);
      for (const handler of rejectionHandlers) {
        handler({
          reason: new Error(`contract rejection: ${platform}`),
          promise: Promise.resolve(),
        });
      }
      for (const handler of pageNotFoundHandlers) {
        handler({
          path: `pages/missing/index?platform=${platform}&token=canary-path#canary-fragment`,
          query: { platform, token: 'canary-token', card_number: 'canary-card' },
          isEntryPage: false,
        });
      }
      for (const handler of memoryWarningHandlers) handler({ level: 10 });
      await client!.flush(2000);

      expect(capturedRequests.length).toBeGreaterThan(0);
      expect(capturedRequests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            header: expect.objectContaining({
              'Content-Type': 'application/x-sentry-envelope',
            }),
          }),
        ]),
      );
      const events = collectEvents(capturedRequests);
      const event = events.find((candidate) =>
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
      const rejectionEvent = events.find((candidate) =>
        candidate.exception?.values?.some((value: any) =>
          value.value?.includes(`contract rejection: ${platform}`),
        ),
      );
      expect(rejectionEvent?.exception?.values?.[0]?.mechanism).toEqual({
        type: 'onunhandledrejection',
        handled: false,
      });
      const pageNotFoundEvent = events.find((candidate) =>
        candidate.exception?.values?.some((value: any) =>
          value.value?.includes('页面无法找到: pages/missing/index'),
        ),
      );
      expect(pageNotFoundEvent?.exception?.values?.[0]?.mechanism).toEqual({
        type: 'onpagenotfound',
        handled: true,
      });
      expect(pageNotFoundEvent?.contexts?.page_not_found).toEqual({
        path: 'pages/missing/index',
        query: { platform, token: '[Filtered]', card_number: '[Filtered]' },
        isEntryPage: false,
      });
      expect(JSON.stringify(pageNotFoundEvent)).not.toContain('canary');
      const memoryWarningEvent = events.find((candidate) =>
        candidate.exception?.values?.some((value: any) => value.value?.includes('内存不足告警')),
      );
      expect(memoryWarningEvent?.exception?.values?.[0]?.mechanism).toEqual({
        type: 'onmemorywarning',
        handled: true,
      });
      expect(memoryWarningEvent?.contexts?.memory_warning).toEqual({
        level: 10,
        message: 'TRIM_MEMORY_RUNNING_LOW',
      });

      await client!.close(2000);
      expect(errorHandlers.size).toBe(0);
      expect(rejectionHandlers.size).toBe(0);
      expect(pageNotFoundHandlers.size).toBe(0);
      expect(memoryWarningHandlers.size).toBe(0);
      expect(networkHandlers.size).toBe(0);
      expect(host[requestMethod]).toBe(originalRequest);
      expect(host[requestMethod].capability).toBe('business update');
      expect(host[requestMethod][extension]).toBe(capability);
      expect(g.App).toBe(originalHostApp);
      expect(g.Page).toBe(originalHostPage);

      capturedRequests.length = 0;
      const nextClient = initClient();
      expect(nextClient).toBeDefined();
      expect(errorHandlers.size).toBe(1);
      expect(rejectionHandlers.size).toBe(1);
      expect(pageNotFoundHandlers.size).toBe(1);
      expect(memoryWarningHandlers.size).toBe(1);
      for (const handler of errorHandlers) handler(`reinitialized error: ${platform}`);
      await nextClient!.flush(2000);
      expect(
        collectEvents(capturedRequests).some((candidate) =>
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

      const event = collectEvents(capturedRequests).find((candidate) =>
        candidate.exception?.values?.some((value: any) =>
          value.value?.includes(`minimal host: ${platform}`),
        ),
      );
      expect(event?.contexts?.miniapp?.platform).toBe(platform);
      expect(event?.contexts?.device?.brand).toBeUndefined();
      await client!.close(2000);
    });

    it('无 active span 时通过宿主请求 API 上报独立 HTTP span', async () => {
      const client = init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        platform,
        tracesSampleRate: 1,
        tracePropagationTargets: ['api.example.com'],
        enableOfflineCache: false,
        enableAutoSessionTracking: false,
        enableMinigameLifecycle: false,
        enableMinigameFrameRate: false,
      });

      const requestTask = host[requestMethod]({
        url: `https://api.example.com/${platform}/users?token=secret`,
        method: 'POST',
        header: { 'X-Business': 'preserved' },
      });
      expect(requestTask).toEqual(expect.objectContaining({ abort: expect.any(Function) }));
      await client!.flush(2000);

      const spans = collectSpans(capturedRequests);
      expect(spans).toHaveLength(1);
      const [span] = spans;
      expect(span).toBeDefined();
      const span0 = span!;
      expect(span0.name).toBe(`POST https://api.example.com/${platform}/users`);
      expect(span0.is_segment).toBe(true);
      expect(span0.status).toBe('ok');
      expect(spanAttribute(span0, 'sentry.op')).toBe('http.client');
      expect(spanAttribute(span0, 'sentry.origin')).toBe('auto.http.miniapp');
      expect(spanAttribute(span0, 'sentry.segment.id')).toEqual(expect.any(String));
      expect(spanAttribute(span0, 'http.request.method')).toBe('POST');
      expect(spanAttribute(span0, 'http.response.status_code')).toBe(200);
      // dataCollection 默认抹掉 token 这类敏感键值；下面还会断言转发给业务的请求仍是原始 URL，
      // 过滤只作用于上报数据，不改变宿主实际发出的请求。
      expect(spanAttribute(span0, 'url.full')).toBe(
        `https://api.example.com/${platform}/users?token=[Filtered]`,
      );
      expect(spanAttribute(span0, 'server.address')).toBe('api.example.com');

      const forwardedRequest = originalRequest.mock.calls.find(
        ([options]) => options.url === `https://api.example.com/${platform}/users?token=secret`,
      )?.[0];
      expect(forwardedRequest?.header).toEqual(
        expect.objectContaining({
          'X-Business': 'preserved',
          'sentry-trace': expect.any(String),
          baggage: expect.stringContaining('sentry-'),
        }),
      );

      await client!.close(2000);
    });
  },
);
