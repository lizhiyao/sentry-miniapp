import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  flush,
  getClient,
  getCurrentScope,
  getIsolationScope,
  type Envelope,
  type Event,
} from '@sentry/core';
import { init } from '../src/index';
import { Router } from '../src/integrations/router';
import { resetPlatformCache } from '../src/crossPlatform';
import {
  assertDefined,
  collectEnvelopePayloads,
  createCapturingTransport,
} from './support/envelopes';

/**
 * `Router` 已废弃但仍是公开导出，opt-in 用户在用。`navigateTo` 之类 API 的 `url`
 * 常带业务 query（甚至 token），必须走 `dataCollection.urlQueryParams`，
 * 且 `route` 标签只能到路径，不能把 query 变成高基数标签。
 */
describe('Router 导航采集与 dataCollection（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];

  beforeEach(() => {
    captured = [];
    getIsolationScope().clearBreadcrumbs();
    getCurrentScope().clearBreadcrumbs();
    resetPlatformCache();

    g.tt = {
      request: vi.fn(),
      navigateTo: vi.fn(),
      redirectTo: vi.fn(),
      switchTab: vi.fn(),
      reLaunch: vi.fn(),
      navigateBack: vi.fn(),
      getPerformance: vi.fn(() => ({ now: () => Date.now() * 1000 })),
      getSystemInfoSync: vi.fn(() => ({ platform: 'ios', hostName: 'Toutiao' })),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      onMemoryWarning: vi.fn(),
    };
    g.getCurrentPages = vi.fn(() => [{ route: 'pages/index/index' }]);
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    delete g.tt;
    delete g.getCurrentPages;
    resetPlatformCache();
  });

  async function navigate(
    options: Record<string, unknown> = {},
  ): Promise<{ data: Record<string, unknown>; tags: Record<string, string> | undefined }> {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      integrations: [new Router()],
      transport: createCapturingTransport(captured),
      ...options,
    } as any);

    g.tt.navigateTo({ url: 'pages/detail/detail?id=1&token=abc' });

    captureException(new Error('router url probe'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.breadcrumbs?.some((breadcrumb) => breadcrumb.category === 'navigation'),
    );
    assertDefined(event, '事件里没有 navigation 面包屑');
    const crumb = event.breadcrumbs?.find(
      (breadcrumb) => breadcrumb.category === 'navigation' && breadcrumb.data?.action === 'navigateTo',
    );
    assertDefined(crumb);
    return {
      data: crumb.data as Record<string, unknown>,
      tags: event.tags as Record<string, string> | undefined,
    };
  }

  it('目标 URL 的敏感 query 就地脱敏，route 标签只到路径', async () => {
    const { data, tags } = await navigate();

    expect(data.to).toBe('pages/detail/detail?id=1&token=[Filtered]');
    expect(data.from).toBe('pages/index/index');
    expect(tags?.route).toBe('pages/detail/detail');
  });

  it('urlQueryParams=false 时目标 URL 不带任何 query', async () => {
    const { data, tags } = await navigate({ dataCollection: { urlQueryParams: false } });

    expect(data.to).toBe('pages/detail/detail');
    expect(tags?.route).toBe('pages/detail/detail');
  });
});
