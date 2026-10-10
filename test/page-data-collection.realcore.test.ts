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
        (breadcrumb) =>
          breadcrumb.category === 'page.lifecycle' && breadcrumb.data?.action === 'onLoad',
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

  it.each([true, false])(
    '未定义生命周期的页面也采集页面流转，query 开关=%s',
    async (queryEnabled) => {
      const client = init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        enableAutoSessionTracking: false,
        dataCollection: { urlQueryParams: queryEnabled },
        transport: createCapturingTransport(captured),
      })!;
      const tap = vi.fn(() => 'business result');
      const page = g.Page({ onTap: tap, data: { count: 0 } });
      const receiver = { route: 'pages/without-handlers/index' };
      for (const method of ['onLoad', 'onShow', 'onReady', 'onHide', 'onUnload']) {
        // 宿主只调用定义中存在的生命周期；即使业务没有 handler，也应得到完整流转记录。
        expect(page[method]?.call(receiver, { id: '42', token: 'page-canary' })).toBeUndefined();
      }
      const input = { type: 'tap' };
      expect(page.onTap.call(receiver, input)).toBe('business result');
      expect(tap).toHaveBeenCalledWith(input);
      expect(tap.mock.contexts[0]).toBe(receiver);
      expect(page.data).toEqual({ count: 0 });
      client.captureMessage('page without callbacks');
      await client.flush();
      const event = collectEnvelopePayloads<Event>(captured, ['event'])[0]!;
      const lifecycle = event.breadcrumbs!.filter((crumb) => crumb.category === 'page.lifecycle');
      expect(lifecycle.map((crumb) => crumb.data?.action)).toEqual([
        'onLoad',
        'onShow',
        'onReady',
        'onHide',
        'onUnload',
      ]);
      const load = lifecycle[0]!.data!;
      expect(load.page).toBe(receiver.route);
      if (queryEnabled) expect(load.query).toEqual({ id: '42', token: '[Filtered]' });
      else expect(load).not.toHaveProperty('query');
      expect(JSON.stringify(captured)).not.toContain('page-canary');
      client.dispose();
      const before = getCurrentScope().getScopeData().breadcrumbs.length;
      page.onShow.call(receiver);
      expect(getCurrentScope().getScopeData().breadcrumbs).toHaveLength(before);
    },
  );

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

  it.each([true, false])('2.0 不读取交互 dataset，query=%s 不改变此边界', async (query) => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      dataCollection: { urlQueryParams: query },
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    } as any);

    const business = vi.fn();
    const dataset = vi.fn(() => {
      throw new Error('dataset must not be read');
    });
    const target = { id: 'pay-btn'.repeat(100) };
    Object.defineProperty(target, 'dataset', { get: dataset });
    const handler = `on${'Tap'.repeat(100)}`;
    const input = {
      target,
      type: 'tap',
      detail: { x: NaN, y: Infinity },
      touches: [{ pageX: { token: 'ot-1' }, pageY: 'ot-1' }],
    };
    const pageOptions: any = g.Page({ onLoad: vi.fn(), [handler]: business });
    pageOptions[handler].call({ route: 'pages/detail/detail' }, input);

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
    expect(crumb.data).not.toHaveProperty('dataset');
    for (const coordinate of ['x', 'y', 'touchX', 'touchY'])
      expect(crumb.data).not.toHaveProperty(coordinate);
    expect(crumb.data?.handler).toBe(handler.slice(0, 128));
    expect(crumb.message).toBe(`${handler.slice(0, 128)} on pages/detail/detail`);
    expect(crumb.data?.targetId).toBe(target.id.slice(0, 128));
    expect(target.id).toHaveLength(700);
    expect(dataset).not.toHaveBeenCalled();
    expect(business).toHaveBeenCalledOnce();
    expect(business.mock.calls[0]?.[0]).toBe(input);
    expect(input.touches[0]?.pageX).toEqual({ token: 'ot-1' });
    expect(JSON.stringify(event)).not.toContain('ot-1');
  });

  it('enableUserInteractionBreadcrumbs=false 只关闭交互面包屑，页面生命周期仍采集', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      enableUserInteractionBreadcrumbs: false,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    } as any);

    const pageOptions: any = g.Page({ onLoad: vi.fn(), onTap: vi.fn() });
    pageOptions.onLoad.call({ route: 'pages/index/index' }, {});
    pageOptions.onTap.call(
      { route: 'pages/index/index' },
      { target: { id: 'pay-btn' }, type: 'tap' },
    );

    captureException(new Error('interaction switch probe'));
    await flush(2000);

    const event = collectEnvelopePayloads<Event>(captured, ['event']).at(-1)!;
    const categories = (event.breadcrumbs ?? []).map((breadcrumb) => breadcrumb.category);
    expect(categories).toContain('page.lifecycle');
    expect(categories).not.toContain('user.interaction');
  });

  it('交互标识 getter 退休 owner 后不追加 breadcrumb，业务调用仍保留', () => {
    const owner = init({
      dsn: 'https://key@example.com/1',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    })!;
    const business = vi.fn();
    const page = g.Page({ onTap: business });
    const target = {
      get id() {
        owner.dispose();
        return 'retired target';
      },
    };
    const before = getCurrentScope().getScopeData().breadcrumbs.length;
    page.onTap({ target });
    expect(business).toHaveBeenCalledWith({ target });
    expect(getCurrentScope().getScopeData().breadcrumbs).toHaveLength(before);
  });
  it.each(['route', 'query'])(
    'Page %s getter 退休 owner 后不写 breadcrumb，业务生命周期仍执行',
    (mode) => {
      const owner = init({
        dsn: 'https://key@example.com/1',
        enableAutoSessionTracking: false,
        transport: createCapturingTransport(captured),
      })!;
      const business = vi.fn();
      const page = g.Page({ onLoad: business });
      const route =
        mode === 'route'
          ? {
              get route() {
                owner.dispose();
                return 'retired';
              },
            }
          : { route: 'home' };
      const query =
        mode === 'query'
          ? {
              get id() {
                owner.dispose();
                return 'retired';
              },
            }
          : {};
      const before = getCurrentScope().getScopeData().breadcrumbs.length;
      page.onLoad.call(route, query);
      expect(business).toHaveBeenCalledWith(query);
      expect(getCurrentScope().getScopeData().breadcrumbs).toHaveLength(before);
    },
  );
});
