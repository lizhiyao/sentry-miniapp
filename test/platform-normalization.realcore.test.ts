import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope } from '@sentry/core';
import { init } from '../src/sdk';
import { resetPlatformCache, sdk } from '../src/crossPlatform';
import { OFFLINE_STORE_KEY } from '../src/transports/offlineRecords';
import type { MiniappClient } from '../src/client';

const platforms = ['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks'] as const;
const clients: MiniappClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.clearAllTimers();
  vi.useRealTimers();
  getCurrentScope().setClient(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetPlatformCache();
});

describe('宿主归一化不会阻断其它能力（真实默认 transport）', () => {
  it.each(['my-request-getter', 'my-frozen', 'dd-frozen', 'dd-storage-getter'] as const)(
    '%s 的 httpRequest 仍可初始化和交付最终事件',
    async (mode) => {
      platforms.forEach((name) => vi.stubGlobal(name, undefined));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const httpRequest = vi.fn(function (this: unknown, options: any) {
        expect(this).toBe(host);
        options.success({ status: 200, headers: {} });
        return {};
      });
      const host = { httpRequest };
      if (mode === 'my-request-getter') {
        Object.defineProperty(host, 'request', {
          get() {
            throw new Error('optional request unavailable');
          },
        });
      } else if (mode === 'dd-storage-getter') {
        Object.defineProperty(host, 'getStorageSync', {
          get() {
            throw new Error('optional storage unavailable');
          },
        });
      } else {
        Object.freeze(host);
      }
      vi.stubGlobal(mode.startsWith('my-') ? 'my' : 'dd', host);
      resetPlatformCache();
      const client = init({
        dsn: 'https://key@example.com/1',
        enableOfflineCache: false,
        sendClientReports: false,
      })!;
      clients.push(client);
      const eventId = client.captureException(new Error('available native httpRequest'));
      await expect(client.flush(1000)).resolves.toBe(true);
      expect(httpRequest).toHaveBeenCalledOnce();
      const lines = (httpRequest.mock.calls[0]![0].data as string).split('\n');
      expect(JSON.parse(lines[1]!)).toMatchObject({ type: 'event' });
      expect(JSON.parse(lines[2]!)).toMatchObject({
        event_id: eventId,
        exception: { values: [{ value: 'available native httpRequest' }] },
      });
      expect(host).not.toHaveProperty('__sentryStorageAdapted');
    },
  );

  it.each(['my', 'dd'] as const)(
    '%s 冻结宿主仍以原生对象参数持久缓存，并在授权后重放实际事件',
    async (platform) => {
      vi.useFakeTimers();
      platforms.forEach((name) => vi.stubGlobal(name, undefined));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const disk = new Map<string, unknown>();
      const httpRequest = vi.fn(function (this: unknown, options: any) {
        expect(this).toBe(host);
        options.success({ status: 200, headers: {} });
        return {};
      });
      const get = vi.fn(function (this: unknown, { key }: { key: string }) {
        expect(this).toBe(host);
        return { data: disk.get(key) };
      });
      const set = vi.fn(function (this: unknown, { key, data }: { key: string; data: unknown }) {
        expect(this).toBe(host);
        disk.set(key, data);
        return { success: true };
      });
      const remove = vi.fn(function (this: unknown, { key }: { key: string }) {
        expect(this).toBe(host);
        disk.delete(key);
        return { success: true };
      });
      const host = Object.freeze({
        httpRequest,
        getStorageSync: get,
        setStorageSync: set,
        removeStorageSync: remove,
      });
      vi.stubGlobal(platform, host);
      resetPlatformCache();
      const client = init({
        dsn: 'https://key@example.com/1',
        requireConsent: true,
        sendClientReports: false,
      })!;
      clients.push(client);
      expect(sdk()).toBe(host);
      expect(host.getStorageSync).toBe(get);
      expect(host.setStorageSync).toBe(set);
      expect(host.removeStorageSync).toBe(remove);
      expect(host).not.toHaveProperty('request');
      const nativeValue = { nested: 'business payload' };
      expect(host.setStorageSync({ key: 'business', data: nativeValue })).toEqual({
        success: true,
      });
      expect(host.getStorageSync({ key: 'business' })).toEqual({ data: nativeValue });
      expect(host.removeStorageSync({ key: 'business' })).toEqual({ success: true });
      const eventId = client.captureException(new Error('frozen host pending consent'));
      await vi.advanceTimersByTimeAsync(1);
      const pendingFlush = client.flush(1000);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pendingFlush).resolves.toBe(true);
      expect(httpRequest).not.toHaveBeenCalled();
      expect(disk.get(OFFLINE_STORE_KEY)).toEqual(expect.stringContaining(eventId));
      expect(client.getOfflineStoreDiagnostics()).toEqual({ mode: 'persistent', codes: [] });
      client.setConsent(true);
      await vi.advanceTimersByTimeAsync(101);
      const replayFlush = client.flush(1000);
      await vi.advanceTimersByTimeAsync(1);
      await expect(replayFlush).resolves.toBe(true);
      expect(httpRequest).toHaveBeenCalledOnce();
      const lines = (httpRequest.mock.calls[0]![0].data as string).split('\n');
      expect(JSON.parse(lines[2]!)).toMatchObject({
        event_id: eventId,
        exception: { values: [{ value: 'frozen host pending consent' }] },
      });
      expect(disk.get(OFFLINE_STORE_KEY)).toBe('');
      expect(client.getOfflineStoreDiagnostics()).toEqual({ mode: 'persistent', codes: [] });
      expect(host).not.toHaveProperty('__sentryStorageAdapted');
    },
  );

  it('可选 Storage getter 不可读时仅降级缓存，授权后仍交付内存事件', async () => {
    vi.useFakeTimers();
    platforms.forEach((name) => vi.stubGlobal(name, undefined));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const httpRequest = vi.fn((options: any) => {
      options.success({ status: 200, headers: {} });
      return {};
    });
    const host = Object.defineProperty({ httpRequest }, 'getStorageSync', {
      get() {
        throw new Error('optional storage unavailable');
      },
    });
    vi.stubGlobal('dd', host);
    resetPlatformCache();
    const client = init({
      dsn: 'https://key@example.com/1',
      requireConsent: true,
      sendClientReports: false,
    })!;
    clients.push(client);
    const eventId = client.captureException(new Error('memory fallback pending consent'));
    await vi.advanceTimersByTimeAsync(1);
    const pendingFlush = client.flush(1000);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pendingFlush).resolves.toBe(true);
    expect(httpRequest).not.toHaveBeenCalled();
    expect(client.getOfflineStoreDiagnostics()).toEqual({
      mode: 'memory',
      codes: ['storage_error', 'memory_only'],
    });
    client.setConsent(true);
    await vi.advanceTimersByTimeAsync(101);
    const replayFlush = client.flush(1000);
    await vi.advanceTimersByTimeAsync(1);
    await expect(replayFlush).resolves.toBe(true);
    expect(httpRequest).toHaveBeenCalledOnce();
    expect(httpRequest.mock.calls[0]![0].data).toContain(eventId);
  });
});
