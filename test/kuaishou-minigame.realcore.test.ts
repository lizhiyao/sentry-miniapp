import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient,
  parseEnvelope,
  type Envelope,
  type Event,
  type SerializedSession,
} from '@sentry/core';
import { init, getDiagnostics } from '../src/sdk';
import { resetPlatformCache, sdk, isMinigame } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { getClientLifetime } from '../src/lifecycle';
import { collectEnvelopePayloads, collectSpans, spanAttribute } from './support/envelopes';

type Launch = { from: string; query: Record<string, string> };
interface RequestOptions {
  url: string;
  data?: string | Uint8Array;
  header?: Record<string, string>;
  success?: (response: { statusCode: number; header: Record<string, string> }) => void;
}

describe.each([
  { name: 'ks', globals: ['ks'], shim: false },
  { name: 'kwaigame', globals: ['kwaigame'], shim: false },
  { name: '双入口', globals: ['ks', 'kwaigame'], shim: false },
  { name: 'wx 兼容对象', globals: ['ks', 'kwaigame'], shim: true },
  { name: '旧入口与 wx 兼容对象', globals: ['kwaigame'], shim: true },
])('快手小游戏 $name（真实 Core 与宿主请求）', ({ globals, shim }) => {
  const envelopes: Envelope[] = [];
  const disk = new Map<string, unknown>();
  const frames = new Map<number, FrameRequestCallback>();
  const shows = new Set<(launch: Launch) => void>();
  const hides = new Set<() => void>();
  const errors = new Set<(error: unknown) => void>();
  const rejections = new Set<(payload: { reason: unknown }) => void>();
  let host: Record<string, unknown>;
  let compatibilityHost: Record<string, unknown>;
  let nextFrame: number;
  const launch = { from: 'sidebar', query: { source: 'menu', token: 'private-query' } };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    envelopes.length = 0;
    disk.clear();
    frames.clear();
    shows.clear();
    hides.clear();
    errors.clear();
    rejections.clear();
    nextFrame = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    for (const key of ['wx', 'App', 'Page', 'getCurrentPages', 'GameGlobal'])
      vi.stubGlobal(key, undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    host = {
      request: vi.fn(function (this: unknown, options: RequestOptions) {
        expect(this).toBe(host);
        if (options.header?.['Content-Type'] === 'application/x-sentry-envelope') {
          expect(options.data).toBeDefined();
          envelopes.push(parseEnvelope(options.data!));
        }
        options.success?.({ statusCode: 200, header: {} });
        return { abort: vi.fn() };
      }),
      getSystemInfoSync: () => ({ brand: 'Kuaishou device', host: { env: '快手极速版' } }),
      getLaunchOptionsSync: () => launch,
      onShow: (callback: (value: Launch) => void) => shows.add(callback),
      offShow: (callback: (value: Launch) => void) => shows.delete(callback),
      onHide: (callback: () => void) => hides.add(callback),
      offHide: (callback: () => void) => hides.delete(callback),
      onError: (callback: (error: unknown) => void) => errors.add(callback),
      offError: (callback: (error: unknown) => void) => errors.delete(callback),
      onUnhandledRejection: (callback: (payload: { reason: unknown }) => void) =>
        rejections.add(callback),
      offUnhandledRejection: (callback: (payload: { reason: unknown }) => void) =>
        rejections.delete(callback),
      setStorageSync: function (this: unknown, key: string, value: unknown) {
        expect(this).toBe(host);
        expect(typeof key).toBe('string');
        disk.set(key, JSON.parse(JSON.stringify(value)));
      },
      getStorageSync: function (this: unknown, key: string) {
        expect(this).toBe(host);
        return disk.get(key);
      },
      removeStorageSync: function (this: unknown, key: string) {
        expect(this).toBe(host);
        disk.delete(key);
      },
    };
    for (const key of globals) vi.stubGlobal(key, host);
    compatibilityHost = {
      ...host,
      request: vi.fn(function (this: unknown, options: RequestOptions) {
        expect(this).toBe(compatibilityHost);
        const request = host.request;
        if (typeof request !== 'function') throw new Error('Expected native request');
        return Function.prototype.apply.call(request, host, [options]);
      }),
    };
    if (shim) vi.stubGlobal('wx', compatibilityHost);
  });

  afterEach(() => {
    getClient()?.dispose();
    _resetAppLifecycle();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetPlatformCache();
  });

  async function frame(elapsed: number) {
    await vi.advanceTimersByTimeAsync(elapsed);
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) callback(Date.now());
  }

  if (shim) {
    it.each(['missing-host', 'unknown-host', 'wxfile-conflict', 'wx-appid-conflict'])(
      '%s 保留候选顺序回退；显式平台标签不切换宿主请求',
      async (mode) => {
        if (mode === 'missing-host' || mode === 'unknown-host') {
          const systemInfo = () => ({
            brand: 'Kuaishou device',
            ...(mode === 'unknown-host' ? { host: { env: 'unrecognized-host' } } : {}),
          });
          host.getSystemInfoSync = compatibilityHost.getSystemInfoSync = systemInfo;
        } else if (mode === 'wxfile-conflict') {
          compatibilityHost.getEnvInfoSync = () => ({
            common: { USER_DATA_PATH: 'wxfile://compatibility' },
          });
        } else {
          compatibilityHost.getSystemInfoSync = () => ({ brand: 'Kuaishou device' });
          compatibilityHost.getAccountInfoSync = () => ({
            miniProgram: { appId: 'wx-compatibility' },
          });
        }
        const nativeRequest = host.request;
        for (const miniappPlatform of [undefined, 'kuaishou'] as const) {
          const client = init({
            dsn: 'https://test@example.com/1',
            ...(miniappPlatform ? { miniappPlatform } : {}),
            enableOfflineCache: false,
            enableAutoSessionTracking: false,
          })!;
          expect(sdk()).toBe(compatibilityHost);
          expect(getDiagnostics().platform).toMatchObject({ name: 'wechat', isMinigame: true });
          const id = client.captureException(new Error(`${mode}: ${miniappPlatform ?? 'auto'}`));
          const flushing = client.flush(2000);
          await vi.advanceTimersByTimeAsync(10);
          expect(await flushing).toBe(true);
          const event = collectEnvelopePayloads<Event>(envelopes, ['event']).find(
            ({ event_id }) => event_id === id,
          );
          expect(event?.contexts?.miniapp?.platform).toBe(miniappPlatform ?? 'wechat');
          expect(event?.contexts?.device?.brand).toBe('Kuaishou device');
          expect(host.request).toBe(nativeRequest);
          const closing = client.close(2000);
          await vi.advanceTimersByTimeAsync(10);
          expect(await closing).toBe(true);
        }
        expect(compatibilityHost.request).toHaveBeenCalledTimes(2);
      },
    );
  }

  it('默认识别、同意缓冲、错误、from、请求追踪和前后台会话按官方接口工作', async () => {
    const client = init({
      dsn: 'https://test@example.com/1',
      release: 'kuaishou-game@contract',
      requireConsent: true,
      tracesSampleRate: 1,
      tracePropagationTargets: ['api.example.com'],
      enableMinigameFrameRate: true,
    })!;
    expect(sdk()).toBe(host);
    expect(isMinigame()).toBe(true);
    expect(getDiagnostics().platform).toMatchObject({ name: 'kuaishou', isMinigame: true });
    expect(shows.size).toBe(1);
    expect(hides.size).toBe(1);
    expect(errors.size).toBe(1);
    client.captureMessage('held-before-consent');
    await frame(16);
    expect(envelopes).toEqual([]);
    expect(disk.size).toBeGreaterThan(0);
    client.setConsent(true);
    await vi.advanceTimersByTimeAsync(1000);
    for (const handler of errors) handler(new Error('kuaishou native error'));
    for (const handler of rejections) handler({ reason: new Error('kuaishou rejection') });
    (host.request as (options: RequestOptions) => unknown)({ url: 'https://api.example.com/game' });
    await frame(16);
    for (const callback of shows) callback({ ...launch, from: 'shortcut' });
    for (const callback of hides) callback();
    const flushing = client.flush(2000);
    await vi.advanceTimersByTimeAsync(150);
    expect(await flushing).toBe(true);

    const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(events.some((event) => event.message === 'held-before-consent')).toBe(true);
    const nativeError = events.find(
      (event) => event.exception?.values?.[0]?.value === 'kuaishou native error',
    );
    expect(nativeError?.platform).toBe('javascript');
    expect(nativeError?.contexts?.miniapp?.platform).toBe('kuaishou');
    expect(nativeError?.contexts?.minigame).toMatchObject({
      scene: 'sidebar',
      query: { source: 'menu', token: '[Filtered]' },
    });
    expect(
      events.some(
        (event) => event.exception?.values?.[0]?.mechanism?.type === 'onunhandledrejection',
      ),
    ).toBe(true);
    const spans = collectSpans(envelopes);
    expect(spans.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'minigame.init_to_first_frame',
        'minigame.framerate.summary',
        'GET https://api.example.com/game',
      ]),
    );
    expect(
      spanAttribute(
        spans.find(({ name }) => name === 'minigame.init_to_first_frame')!,
        'minigame.scene',
      ),
    ).toBe('sidebar');
    expect(collectEnvelopePayloads<SerializedSession>(envelopes, ['session']).at(-1)?.status).toBe(
      'unhandled',
    );
    const previousSid = collectEnvelopePayloads<SerializedSession>(envelopes, ['session']).at(
      -1,
    )?.sid;
    for (const callback of shows) callback({ ...launch, from: 'shortcut' });
    for (const callback of hides) callback();
    const resumed = collectEnvelopePayloads<SerializedSession>(envelopes, ['session']).at(-1)!;
    expect(resumed.sid).not.toBe(previousSid);
    expect(resumed.status).toBe('exited');
    client.captureMessage('after-show-hide');
    const lastFlush = client.flush(2000);
    await vi.advanceTimersByTimeAsync(150);
    await lastFlush;
    const lastEvent = collectEnvelopePayloads<Event>(envelopes, ['event']).at(-1)!;
    expect(lastEvent.breadcrumbs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'minigame.lifecycle', data: { scene: 'shortcut' } }),
      ]),
    );
    expect(JSON.stringify(envelopes)).not.toContain('private-query');
    const closing = client.close(2000);
    await vi.advanceTimersByTimeAsync(150);
    expect(await closing).toBe(true);
    expect(shows.size + hides.size + errors.size + rejections.size + frames.size).toBe(0);
  });

  it('缺少异常监听、rAF 和退订 API 时可手动上报，重复初始化复用有界监听', async () => {
    for (const key of ['onError', 'onUnhandledRejection', 'offShow', 'offHide']) delete host[key];
    vi.stubGlobal('requestAnimationFrame', undefined);
    const options = {
      dsn: 'https://test@example.com/1',
      release: 'kuaishou-minimal',
      enableOfflineCache: false,
    };
    const old = init(options)!;
    expect(frames.size).toBe(0);
    expect(errors.size).toBe(0);
    const next = init(options)!;
    expect(getClientLifetime(old)?.canCollectAutomatic()).toBe(false);
    expect(shows.size).toBe(1);
    expect(hides.size).toBe(1);
    next.captureException(new Error('manual game exception'));
    const flushing = next.flush(2000);
    await vi.advanceTimersByTimeAsync(10);
    expect(await flushing).toBe(true);
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).at(-1)?.exception?.values?.[0]?.value,
    ).toBe('manual game exception');
    next.dispose();
    const count = envelopes.length;
    for (const callback of shows) callback(launch);
    for (const callback of hides) callback();
    await vi.advanceTimersByTimeAsync(150);
    expect(envelopes).toHaveLength(count);
  });
});
