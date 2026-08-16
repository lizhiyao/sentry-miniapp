import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getIsolationScope, installedIntegrations } from '@sentry/core';
import type { Client, Integration, Transport } from '@sentry/core';

import { _resetAppLifecycle } from '../src/appLifecycle';
import { resetPlatformCache } from '../src/crossPlatform';
import { NetworkBreadcrumbs } from '../src/integrations/networkbreadcrumbs';
import { PageBreadcrumbs } from '../src/integrations/pagebreadcrumbs';
import { GlobalHandlers } from '../src/integrations/globalhandlers';
import { SessionIntegration } from '../src/integrations/session';
import { init } from '../src/sdk';

describe('重叠 client 的全局 instrumentation 所有权', () => {
  const g = globalThis as any;
  const clients: Client[] = [];
  let originalApp: unknown;
  let originalPage: unknown;

  beforeEach(() => {
    originalApp = g.App;
    originalPage = g.Page;
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    getIsolationScope().clearBreadcrumbs();
  });

  afterEach(async () => {
    for (const client of clients.splice(0).reverse()) {
      await client.close(0);
    }
    getIsolationScope().clearBreadcrumbs();
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    delete g.wx;
    g.App = originalApp;
    g.Page = originalPage;
  });

  function makeTransport(onSend: () => void = () => {}): () => Transport {
    return () => ({
      send: async () => {
        onSend();
        return { statusCode: 200 };
      },
      flush: async () => true,
    });
  }

  function start(integrations: Integration[], transport = makeTransport()): Client {
    const client = init({
      dsn: 'https://public@example.com/1',
      release: 'miniapp@1.0.0',
      environment: 'test',
      defaultIntegrations: integrations,
      transport,
    })!;
    clients.push(client);
    return client;
  }

  it('只采用当前 client 的网络隐私和追踪传播配置', async () => {
    const originalRequest = vi.fn((options: any) => {
      options.success?.({ statusCode: 200, data: { privateResponse: 'secret' } });
      options.complete?.({ statusCode: 200 });
      return {};
    });
    g.wx = {
      request: originalRequest,
      getSystemInfoSync: () => ({}),
      getAccountInfoSync: () => ({ miniProgram: {} }),
    };
    g.App = vi.fn();
    g.Page = vi.fn();

    const first = start([
      new NetworkBreadcrumbs({
        traceNetworkBody: true,
        tracePropagationTargets: ['thirdparty.example'],
      }),
    ]);
    const second = start([
      new NetworkBreadcrumbs({
        traceNetworkBody: false,
        tracePropagationTargets: [],
      }),
    ]);
    const sharedWrapper = g.wx.request;
    getIsolationScope().clearBreadcrumbs();

    g.wx.request({
      url: 'https://thirdparty.example/api',
      data: { privateRequest: 'secret' },
      header: {},
    });

    const firstRequestOptions = originalRequest.mock.calls[0]![0];
    expect(firstRequestOptions.header).toEqual({});
    const breadcrumbs = getIsolationScope()
      .getScopeData()
      .breadcrumbs.filter((breadcrumb) => breadcrumb.category === 'xhr');
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]?.data).not.toHaveProperty('request_body');
    expect(breadcrumbs[0]?.data).not.toHaveProperty('response_body');

    await first.close(0);
    expect(g.wx.request).toBe(sharedWrapper);
    g.wx.request({ url: 'https://thirdparty.example/after-old-close', header: {} });
    expect(
      getIsolationScope()
        .getScopeData()
        .breadcrumbs.filter((breadcrumb) => breadcrumb.category === 'xhr'),
    ).toHaveLength(2);

    await second.close(0);
    expect(g.wx.request).toBe(originalRequest);
  });

  it('旧 client 关闭后 Page 包装和当前 client 面包屑仍然有效', async () => {
    const originalPage = vi.fn((options: any) => options);
    g.wx = { getSystemInfoSync: () => ({}), getAccountInfoSync: () => ({ miniProgram: {} }) };
    g.App = vi.fn((options: any) => options);
    g.Page = originalPage;

    const first = start([new PageBreadcrumbs()]);
    const second = start([new PageBreadcrumbs()]);
    const sharedWrapper = g.Page;
    expect(sharedWrapper).not.toBe(originalPage);

    await first.close(0);
    expect(g.Page).toBe(sharedWrapper);
    getIsolationScope().clearBreadcrumbs();
    const page = g.Page({ onShow: vi.fn() });
    page.onShow.call({ route: 'pages/current/index' });
    expect(
      getIsolationScope()
        .getScopeData()
        .breadcrumbs.filter((breadcrumb) => breadcrumb.category === 'page.lifecycle'),
    ).toHaveLength(1);

    await second.close(0);
    expect(g.Page).toBe(originalPage);
  });

  it('App 生命周期只驱动当前 client 的 Session subscriber', async () => {
    let appOptions: any;
    g.wx = { getSystemInfoSync: () => ({}), getAccountInfoSync: () => ({ miniProgram: {} }) };
    g.App = vi.fn((options: any) => {
      appOptions = options;
      return options;
    });
    g.Page = vi.fn();
    let firstSends = 0;
    let secondSends = 0;

    const first = start([new SessionIntegration()], makeTransport(() => firstSends++));
    start([new SessionIntegration()], makeTransport(() => secondSends++));
    g.App({ onLaunch: vi.fn() });
    appOptions.onLaunch({ scene: 1001 });
    await Promise.resolve();

    expect(firstSends).toBe(0);
    expect(secondSends).toBe(1);

    await first.close(0);
    appOptions.onHide();
    await Promise.resolve();
    expect(secondSends).toBe(2);
  });

  it('GlobalHandlers 订阅共存，旧 client 关闭不影响当前 client', async () => {
    const errorHandlers = new Set<(error: string | Error) => void>();
    g.wx = {
      getSystemInfoSync: () => ({}),
      getAccountInfoSync: () => ({ miniProgram: {} }),
      onError: (handler: (error: string | Error) => void) => errorHandlers.add(handler),
      offError: (handler: (error: string | Error) => void) => errorHandlers.delete(handler),
    };
    g.App = vi.fn();
    g.Page = vi.fn();
    let firstSends = 0;
    let secondSends = 0;

    const first = start([new GlobalHandlers()], makeTransport(() => firstSends++));
    const second = start([new GlobalHandlers()], makeTransport(() => secondSends++));
    expect(errorHandlers).toHaveLength(2);

    for (const handler of errorHandlers) handler(new Error('current client failure'));
    await second.flush(100);
    expect(firstSends).toBe(0);
    expect(secondSends).toBe(1);

    await first.close(0);
    expect(errorHandlers).toHaveLength(1);
    for (const handler of errorHandlers) handler(new Error('after old client close'));
    await second.flush(100);
    expect(secondSends).toBe(2);

    await second.close(0);
    expect(errorHandlers).toHaveLength(0);
  });
});
