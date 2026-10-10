import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient,
  getCurrentScope,
  getIsolationScope,
  installedIntegrations,
  type Envelope,
  type Event,
} from '@sentry/core';
import { init, networkStatusIntegration, pageBreadcrumbsIntegration } from '../src/index';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { resetPlatformCache } from '../src/crossPlatform';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('自动观测保留可用宿主能力与业务参数（真实 Core）', () => {
  let envelopes: Envelope[];

  beforeEach(() => {
    envelopes = [];
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();
    resetPlatformCache();
  });

  afterEach(() => {
    getClient()?.dispose();
    vi.unstubAllGlobals();
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
  });

  it.for(['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks'])(
    '%s 不可读 offNetworkStatusChange 不阻断订阅、重连 flush 和最终事件',
    async (platform) => {
      delete (globalThis as Record<string, unknown>)['wx'];
      let handler: ((value: unknown) => void) | undefined;
      const host = {
        onNetworkStatusChange(callback: (value: unknown) => void) {
          expect(this).toBe(host);
          handler = callback;
        },
        get offNetworkStatusChange(): never {
          throw new Error('off unavailable');
        },
      };
      vi.stubGlobal(platform, host);
      const owner = init({
        dsn: 'https://key@example.com/1',
        defaultIntegrations: [networkStatusIntegration()],
        transport: createCapturingTransport(envelopes),
      })!;
      expect(handler).toBeTypeOf('function');
      const flush = vi.fn();
      owner.on('flush', flush);
      handler!({ networkType: 'none', isConnected: false });
      handler!({ networkType: 'wifi', isConnected: true });
      expect(flush).toHaveBeenCalledOnce();
      owner.captureMessage('network subscriber preserved');
      await owner.flush();
      const event = collectEnvelopePayloads<Event>(envelopes, ['event'])[0]!;
      expect(event.contexts?.network).toEqual({ type: 'wifi', isConnected: true });
      expect(event.breadcrumbs?.filter((item) => item.category === 'network.change')).toHaveLength(
        2,
      );
      owner.dispose();
      const read = vi.fn();
      handler!(new Proxy({}, { get: read }));
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.for([
    { name: '零参数', args: [] },
    { name: '显式 undefined', args: [undefined] },
    { name: '多个参数', args: [{ type: 'tap' }, 'extra'] },
  ])('页面交互保留$name及关闭后的调用', async ({ args }) => {
    vi.stubGlobal('Page', (options: unknown) => options);
    const owner = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: [pageBreadcrumbsIntegration()],
      transport: createCapturingTransport(envelopes),
    })!;
    const receiver = { route: 'pages/home' };
    const result = {};
    const business = vi.fn(function (this: unknown, ...received: unknown[]) {
      expect(this).toBe(receiver);
      expect(received).toEqual(args);
      return result;
    });
    const page = (
      globalThis as typeof globalThis & {
        Page: (options: { handleTap: typeof business }) => { handleTap: typeof business };
      }
    ).Page({ handleTap: business });
    expect(page.handleTap.apply(receiver, args)).toBe(result);
    owner.captureMessage('page interaction preserved');
    await owner.flush();
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0]?.breadcrumbs).toContainEqual(
      expect.objectContaining({ category: 'user.interaction' }),
    );
    owner.dispose();
    expect(page.handleTap.apply(receiver, args)).toBe(result);
    expect(business).toHaveBeenCalledTimes(2);
  });
});
