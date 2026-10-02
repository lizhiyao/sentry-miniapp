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
import { resetPlatformCache } from '../src/crossPlatform';
import {
  assertDefined,
  collectEnvelopePayloads,
  createCapturingTransport,
} from './support/envelopes';

/**
 * 页面 `onLoad` 的 query 就是小程序页面的入参，业务常往里塞 id、单据号甚至 token。
 * 这块默认开启，必须和 core 11 的 `dataCollection.urlQueryParams` 语义一致：
 * 敏感键就地脱敏、`false` 整块不采、`{deny}`／`{allow}` 按片段匹配。
 */
describe('页面入参采集与 dataCollection（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];
  let originalPage: unknown;

  beforeEach(() => {
    captured = [];
    getIsolationScope().clearBreadcrumbs();
    getCurrentScope().clearBreadcrumbs();
    resetPlatformCache();

    originalPage = g.Page;
    g.Page = vi.fn((options: any) => options);
    g.tt = {
      request: vi.fn(),
      getPerformance: vi.fn(() => ({ now: () => Date.now() * 1000 })),
      getSystemInfoSync: vi.fn(() => ({ platform: 'ios', hostName: 'Toutiao' })),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      onMemoryWarning: vi.fn(),
    };
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    delete g.tt;
    g.Page = originalPage;
    resetPlatformCache();
  });

  /** 注册一个页面并触发 onLoad，返回该页 onLoad 面包屑里的 data。 */
  async function loadPage(
    query: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
      ...options,
    } as any);

    const pageOptions: any = g.Page({
      onLoad: vi.fn(),
      onReady: vi.fn(),
      onShow: vi.fn(),
      onHide: vi.fn(),
    });
    pageOptions.onLoad.call({ route: 'pages/detail/detail' }, query);

    captureException(new Error('page query probe'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.breadcrumbs?.some(
        (breadcrumb) => breadcrumb.category === 'page.lifecycle' && breadcrumb.data?.action === 'onLoad',
      ),
    );
    assertDefined(event, '事件里没有 page.lifecycle onLoad 面包屑');
    const crumb = event.breadcrumbs?.find(
      (breadcrumb) =>
        breadcrumb.category === 'page.lifecycle' && breadcrumb.data?.action === 'onLoad',
    );
    assertDefined(crumb);
    return crumb.data as Record<string, unknown>;
  }

  it('默认只抹掉敏感键，其余入参照常记录', async () => {
    const data = await loadPage({ id: '42', token: 'secret-token', openId: 'o-1' });

    expect(data.query).toEqual({ id: '42', token: '[Filtered]', openId: 'o-1' });
    expect(data.page).toBe('pages/detail/detail');
  });

  it('敏感键按片段匹配，accessToken / xApiKey / sid 都跑不掉', async () => {
    const data = await loadPage({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      xApiKey: 'k-1',
      sid: 's-1',
      orderId: 'o-9',
    });

    expect(data.query).toEqual({
      accessToken: '[Filtered]',
      refreshToken: '[Filtered]',
      xApiKey: '[Filtered]',
      sid: '[Filtered]',
      orderId: 'o-9',
    });
  });

  it('urlQueryParams=false 时整个入参对象都不采', async () => {
    const data = await loadPage(
      { id: '42', token: 'secret-token' },
      { dataCollection: { urlQueryParams: false } },
    );

    expect('query' in data).toBe(false);
  });

  it('deny 命中的键被抹掉，其余保留', async () => {
    const data = await loadPage(
      { phone: '138', id: '42' },
      { dataCollection: { urlQueryParams: { deny: ['phone'] } } },
    );

    expect(data.query).toEqual({ phone: '[Filtered]', id: '42' });
  });

  it('allow 只放行列出的键，未列出的按敏感处理', async () => {
    const data = await loadPage(
      { nickname: 'xiao', id: '42' },
      { dataCollection: { urlQueryParams: { allow: ['id'] } } },
    );

    expect(data.query).toEqual({ nickname: '[Filtered]', id: '42' });
  });

  it('嵌套对象里的敏感键同样被抹掉', async () => {
    // 面包屑 data 会先过 core 的 normalize（深层折成 [Object]），所以这里只断言一层嵌套；
    // 更深的数组／对象结构在请求体用例里验（体是字符串，不经 normalize）。
    const data = await loadPage({
      id: '42',
      profile: { nickname: 'xiao', sessionKey: 'sk-1' },
    });

    expect(data.query).toEqual({
      id: '42',
      profile: { nickname: 'xiao', sessionKey: '[Filtered]' },
    });
  });

  it('支付与证件类键虽不在 core 内置片段里，也一并脱敏', async () => {
    const data = await loadPage({
      cardNumber: '622202',
      cvv: '123',
      ssn: '110101',
      idCard: '11010119900101001X',
      channel: 'wxpay',
    });

    expect(data.query).toEqual({
      cardNumber: '[Filtered]',
      cvv: '[Filtered]',
      ssn: '[Filtered]',
      idCard: '[Filtered]',
      channel: 'wxpay',
    });
  });

  it('sensitiveKeys 追加的片段对页面入参生效', async () => {
    const data = await loadPage(
      { memberNo: 'm-1', token: 't-1', id: '9' },
      { sensitiveKeys: ['memberNo'] },
    );

    expect(data.query).toEqual({ memberNo: '[Filtered]', token: '[Filtered]', id: '9' });
  });

  it('交互事件 dataset 里的敏感键同样脱敏', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    } as any);

    const pageOptions: any = g.Page({ onLoad: vi.fn(), onTap: vi.fn() });
    pageOptions.onTap.call(
      { route: 'pages/detail/detail' },
      { target: { id: 'pay-btn', dataset: { orderToken: 'ot-1', amount: 12 } }, type: 'tap' },
    );

    captureException(new Error('dataset probe'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
      item.breadcrumbs?.some((breadcrumb) => breadcrumb.category === 'user.interaction'),
    );
    assertDefined(event, '事件里没有 user.interaction 面包屑');
    const crumb = event.breadcrumbs?.find(
      (breadcrumb) => breadcrumb.category === 'user.interaction',
    );
    assertDefined(crumb);
    expect(crumb.data?.dataset).toEqual({ orderToken: '[Filtered]', amount: 12 });
  });
});
