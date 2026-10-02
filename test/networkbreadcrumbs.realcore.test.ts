import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureException,
  flush,
  getClient,
  getCurrentScope,
  getIsolationScope,
  startSpan,
  type Envelope,
  type Event,
  type EventHint,
  type StreamedSpanJSON,
  type TransactionEvent,
} from '@sentry/core';
import { init } from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import {
  assertDefined,
  collectEnvelopePayloads,
  collectSpanItems,
  collectSpans,
  createCapturingTransport,
  spanAttribute,
} from './support/envelopes';

/** 取事件里 SDK 记录的那条 xhr 面包屑 data。 */
function xhrBreadcrumbData(captured: Envelope[]): Record<string, unknown> {
  const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
    item.breadcrumbs?.some((breadcrumb) => breadcrumb.category === 'xhr'),
  );
  assertDefined(event, '事件里没有 xhr 面包屑');
  const crumb = event.breadcrumbs?.find((breadcrumb) => breadcrumb.category === 'xhr');
  assertDefined(crumb);
  return crumb.data as Record<string, unknown>;
}

// 测试自己按 TextEncoder 量字节，不复用被测实现，免得体积断言变成自证。
function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

describe('NetworkBreadcrumbs（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: Envelope[];
  let requestMock: ReturnType<typeof vi.fn>;
  let savedWx: unknown;
  let savedURL: unknown;

  beforeEach(() => {
    captured = [];
    // 面包屑挂在作用域上；同一文件里连续用例不清就会互相污染。
    getIsolationScope().clearBreadcrumbs();
    getCurrentScope().clearBreadcrumbs();
    savedWx = g.wx;
    savedURL = g.URL;
    delete g.wx;
    resetPlatformCache();

    requestMock = vi.fn((options) => {
      options.success?.({ statusCode: 201, data: { ok: true }, header: {} });
      options.complete?.({ statusCode: 201 });
      return { abort: vi.fn() };
    });

    g.tt = {
      request: requestMock,
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
    g.wx = savedWx;
    g.URL = savedURL;
    resetPlatformCache();
  });

  it('无 PerformanceObserver 和 active span 时上报独立 http.client segment span', async () => {
    const beforeSendSpan = vi.fn((span: StreamedSpanJSON) => span);
    const beforeSendTransaction = vi.fn((event: TransactionEvent, _hint: EventHint) => event);

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      release: 'minigame@1.2.3',
      environment: 'staging',
      tracesSampler: () => true,
      tracePropagationTargets: ['api.example.com'],
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      beforeSendSpan,
      beforeSendTransaction,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({
      url: 'https://api.example.com/v1/login?token=secret',
      method: 'POST',
      data: '{}',
    });
    await flush(2000);

    const spans = collectSpans(captured);
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.name).toBe('POST https://api.example.com/v1/login');
    expect(span.is_segment).toBe(true);
    expect(span.status).toBe('ok');
    expect(spanAttribute(span, 'sentry.op')).toBe('http.client');
    expect(spanAttribute(span, 'sentry.origin')).toBe('auto.http.miniapp');
    expect(spanAttribute(span, 'sentry.exclusive_time')).toEqual(expect.any(Number));
    expect(spanAttribute(span, 'sentry.segment.name')).toBe('POST https://api.example.com/v1/login');
    expect(spanAttribute(span, 'http.request.method')).toBe('POST');
    expect(spanAttribute(span, 'http.response.status_code')).toBe(201);
    // core 11 的 dataCollection 默认就会抹掉 token 这类敏感键值（此前我们原样上报）。
    expect(spanAttribute(span, 'url.full')).toBe(
      'https://api.example.com/v1/login?token=[Filtered]',
    );
    expect(spanAttribute(span, 'server.address')).toBe('api.example.com');
    expect(spanAttribute(span, 'sentry.release')).toBe('minigame@1.2.3');
    expect(spanAttribute(span, 'sentry.environment')).toBe('staging');

    // stream 生命周期不产出 transaction 事件，beforeSendTransaction 由 core 忽略。
    expect(collectEnvelopePayloads(captured, ['transaction'])).toEqual([]);
    expect(beforeSendSpan).toHaveBeenCalledOnce();
    expect(beforeSendTransaction).not.toHaveBeenCalled();
    expect(requestMock.mock.calls[0]?.[0].header).toEqual(
      expect.objectContaining({
        'sentry-trace': expect.any(String),
        baggage: expect.stringContaining('sentry-'),
      }),
    );
  });

  it('独立 span 按 span/v2 传输契约发送', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/health' });
    await flush(2000);

    const items = collectSpanItems(captured);
    expect(items).toHaveLength(1);
    assertDefined(items[0]);
    expect(items[0].header).toEqual(
      expect.objectContaining({
        type: 'span',
        item_count: 1,
        content_type: 'application/vnd.sentry.items.span.v2+json',
      }),
    );
    expect(items[0].body.version).toBe(2);
    expect(items[0].body.items).toHaveLength(1);
  });

  it.each([
    ['缺失', () => delete g.URL],
    [
      '残缺',
      () => {
        g.URL = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() };
        return true;
      },
    ],
  ])('全局 URL %s时内置 transport 请求不会被重复追踪', async (_name, setURL) => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
    });
    setURL();

    g.tt.request({ url: 'https://api.example.com/v1/login', method: 'POST' });
    await flush(2000);

    const requestedUrls = requestMock.mock.calls.map(([options]) => options.url);
    expect(requestedUrls).toEqual([
      'https://api.example.com/v1/login',
      expect.stringMatching(/^https:\/\/o0\.ingest\.sentry\.io\/api\/0\/envelope\//),
    ]);
  });

  it('外层请求 wrapper 复制参数和请求头且缺少全局 URL 时不会递归上报', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
    });

    const sentryWrappedRequest = g.tt.request;
    g.tt.request = (options: Record<string, any>) =>
      sentryWrappedRequest({
        ...options,
        ...(options.header && { header: { ...options.header } }),
        ...(options.headers && { headers: { ...options.headers } }),
      });
    delete g.URL;

    g.tt.request({ url: 'https://api.example.com/v1/login', method: 'POST' });
    await flush(2000);

    const requestedUrls = requestMock.mock.calls.map(([options]) => options.url);
    expect(requestedUrls).toEqual([
      'https://api.example.com/v1/login',
      expect.stringMatching(/^https:\/\/o0\.ingest\.sentry\.io\/api\/0\/envelope\//),
    ]);
  });

  it.each([
    {
      label: '默认只抹掉敏感键值',
      dataCollection: undefined,
      expectedFullUrl: 'https://api.example.com/v1/login?token=[Filtered]&page=2',
      expectedQuery: 'token=[Filtered]&page=2',
    },
    {
      label: 'urlQueryParams=false 丢弃整个 query',
      dataCollection: { urlQueryParams: false },
      expectedFullUrl: 'https://api.example.com/v1/login',
      expectedQuery: undefined,
    },
    {
      label: 'deny 命中的键值也被抹掉',
      dataCollection: { urlQueryParams: { deny: ['page'] } },
      expectedFullUrl: 'https://api.example.com/v1/login?token=[Filtered]&page=[Filtered]',
      expectedQuery: 'token=[Filtered]&page=[Filtered]',
    },
  ])(
    'dataCollection 同时作用于 span 与面包屑：$label',
    async ({ dataCollection, expectedFullUrl, expectedQuery }) => {
      init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        platform: 'bytedance',
        tracesSampleRate: 1,
        dataCollection,
        enableOfflineCache: false,
        enableAutoSessionTracking: false,
        enableMinigameLifecycle: false,
        enableMinigameFrameRate: false,
        transport: createCapturingTransport(captured),
      } as any);

      g.tt.request({ url: 'https://api.example.com/v1/login?token=secret&page=2', method: 'POST' });
      await flush(2000);

      const span = collectSpans(captured).find(
        (item) => item.name === 'POST https://api.example.com/v1/login',
      );
      assertDefined(span, '未产出请求 span');
      expect(spanAttribute(span, 'url.full')).toBe(expectedFullUrl);

      // 面包屑要随事件带出，才能断言 SDK 记录的那份 URL
      captureException(new Error('breadcrumb probe'));
      await flush(2000);

      const crumbData = xhrBreadcrumbData(captured);
      // 面包屑 url 只到 path，query 单列并按同一开关过滤。
      expect(crumbData.url).toBe('https://api.example.com/v1/login');
      expect(crumbData['url.query']).toBe(expectedQuery);

      await getClient()?.close(0);
    },
  );

  it.each([
    {
      label: '默认两个方向都记录',
      httpBodies: undefined,
      wantsRequest: true,
      wantsResponse: true,
    },
    {
      label: 'httpBodies 为空时都不记录',
      httpBodies: [],
      wantsRequest: false,
      wantsResponse: false,
    },
    {
      label: '只放开响应方向',
      httpBodies: ['outgoingResponse'],
      wantsRequest: false,
      wantsResponse: true,
    },
    {
      label: '只放开请求方向',
      httpBodies: ['outgoingRequest'],
      wantsRequest: true,
      wantsResponse: false,
    },
  ])(
    'dataCollection.httpBodies 约束面包屑里的请求 / 响应体：$label',
    async ({ httpBodies, wantsRequest, wantsResponse }) => {
      init({
        dsn: 'https://test@o0.ingest.sentry.io/0',
        platform: 'bytedance',
        traceNetworkBody: true,
        dataCollection: httpBodies === undefined ? undefined : { httpBodies },
        enableOfflineCache: false,
        enableAutoSessionTracking: false,
        enableMinigameLifecycle: false,
        enableMinigameFrameRate: false,
        transport: createCapturingTransport(captured),
      } as any);

      g.tt.request({
        url: 'https://api.example.com/v1/profile',
        method: 'POST',
        data: { nickname: 'xiao' },
      });
      await flush(2000);
      captureException(new Error('body probe'));
      await flush(2000);

      const event = collectEnvelopePayloads<Event>(captured, ['event']).find((item) =>
        item.breadcrumbs?.some((breadcrumb) => breadcrumb.category === 'xhr'),
      );
      assertDefined(event, '事件里没有 xhr 面包屑');
      const crumbData = event.breadcrumbs?.find((breadcrumb) => breadcrumb.category === 'xhr')
        ?.data as Record<string, unknown>;

      expect('request_body' in crumbData).toBe(wantsRequest);
      expect('response_body' in crumbData).toBe(wantsResponse);
      expect(crumbData.status_code).toBe(201);
    },
  );

  it('请求体敏感键按片段脱敏，与 core 内置名单一致', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      traceNetworkBody: true,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({
      url: 'https://api.example.com/v1/pay',
      method: 'POST',
      data: {
        orderId: 'o-9',
        accessToken: 'at-1',
        xApiKey: 'k-1',
        sid: 's-1',
        nested: { refreshToken: 'rt-1', amount: 12 },
        contacts: [{ email: 'a@b.c' }, { authToken: 't-2' }],
      },
    });
    await flush(2000);
    captureException(new Error('body key probe'));
    await flush(2000);

    const crumbData = xhrBreadcrumbData(captured);
    expect(JSON.parse(String(crumbData.request_body))).toEqual({
      orderId: 'o-9',
      accessToken: '[Filtered]',
      xApiKey: '[Filtered]',
      sid: '[Filtered]',
      nested: { refreshToken: '[Filtered]', amount: 12 },
      contacts: [{ email: 'a@b.c' }, { authToken: '[Filtered]' }],
    });
  });

  it('sensitiveKeys 追加到 core 内置片段之上，不顶掉内置名单', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      traceNetworkBody: true,
      sensitiveKeys: ['memberNo'],
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({
      url: 'https://api.example.com/v1/member',
      method: 'POST',
      data: { memberNo: 'm-1', token: 't-1', name: 'xiao' },
    });
    await flush(2000);
    captureException(new Error('sensitiveKeys probe'));
    await flush(2000);

    const crumbData = xhrBreadcrumbData(captured);
    expect(JSON.parse(String(crumbData.request_body))).toEqual({
      memberNo: '[Filtered]',
      token: '[Filtered]',
      name: 'xiao',
    });
  });

  it('面包屑按 core 口径拆成 url 与 url.query', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/login?token=secret&page=2' });
    await flush(2000);
    captureException(new Error('breadcrumb url probe'));
    await flush(2000);

    const crumbData = xhrBreadcrumbData(captured);
    // url 只到 path（core 的 getSanitizedUrlString），query 单列且按 urlQueryParams 过滤。
    expect(crumbData.url).toBe('https://api.example.com/v1/login');
    expect(crumbData['url.query']).toBe('token=[Filtered]&page=2');

    // span 侧口径不变：url.full 仍带过滤后的完整 URL。
    const span = collectSpans(captured).find(
      (item) => item.name === 'GET https://api.example.com/v1/login',
    );
    assertDefined(span);
    expect(spanAttribute(span, 'url.full')).toBe(
      'https://api.example.com/v1/login?token=[Filtered]&page=2',
    );
  });

  it('请求体超过 maxRequestBodySize 时截断，体积按完整字节数记', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      traceNetworkBody: true,
      maxRequestBodySize: 'small',
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({
      url: 'https://api.example.com/v1/import',
      method: 'POST',
      // 1000 个 ASCII + 2 个中文字符（各 3 字节）= 1006 字节，边界要按字节而不是字符数裁。
      data: `${'a'.repeat(1000)}中文`,
    });
    await flush(2000);
    captureException(new Error('body size probe'));
    await flush(2000);

    const crumbData = xhrBreadcrumbData(captured);
    expect(crumbData.request_body_size).toBe(1006);
    const body = String(crumbData.request_body);
    expect(body.endsWith('...')).toBe(true);
    expect(utf8ByteLength(body)).toBe(1000);
  });

  it('未超过上限的请求体保持原样', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      traceNetworkBody: true,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/small', method: 'POST', data: { a: 1 } });
    await flush(2000);
    captureException(new Error('body untouched probe'));
    await flush(2000);

    const crumbData = xhrBreadcrumbData(captured);
    expect(crumbData.request_body).toBe('{"a":1}');
    expect(crumbData.request_body_size).toBe(7);
  });

  it('字符串目标按 core 11 语义大小写不敏感匹配', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      tracePropagationTargets: ['API.EXAMPLE.COM'],
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/users' });
    await flush(2000);

    const [options] = requestMock.mock.calls.map(([arg]) => arg);
    expect(options.header).toEqual(
      expect.objectContaining({ 'sentry-trace': expect.any(String) }),
    );
  });

  it('正则目标独立生效，且带 g 标志连续命中不丢注入', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      // 只给正则：字符串目标命中后匹配函数会提前返回，混在一起等于没测正则分支。
      // g 标志若残留 lastIndex，第二次同 URL 就不会再注入。
      tracePropagationTargets: [/\/v1\/users\b/g],
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/users' });
    g.tt.request({ url: 'https://api.example.com/v1/users' });
    // 不匹配的目标不应注入
    g.tt.request({ url: 'https://api.example.com/v2/orders' });
    await flush(2000);

    // 用锚定的 envelope 前缀排除 SDK 自身请求：子串匹配会被 https://ingest.sentry.io.evil.com/
    // 这类仿冒 host 绕过（CodeQL js/incomplete-url-substring-sanitization）。
    const envelopePrefix = 'https://o0.ingest.sentry.io/api/0/envelope/';
    const businessCalls = requestMock.mock.calls
      .map(([options]) => options)
      .filter((options) => !String(options.url).startsWith(envelopePrefix));
    expect(businessCalls).toHaveLength(3);
    expect(
      businessCalls.filter((options) => options.header && 'sentry-trace' in options.header),
    ).toHaveLength(2);
    expect(businessCalls[2]!.url).toBe('https://api.example.com/v2/orders');
    expect(businessCalls[2]!.header ?? {}).not.toHaveProperty('sentry-trace');
  });

  it('有 active span 时仍把请求记录为现有 transaction 的子 span', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    startSpan({ name: 'game.login', op: 'ui.action' }, () => {
      g.tt.request({ url: 'https://api.example.com/v1/login', method: 'POST' });
    });
    await flush(2000);

    const spans = collectSpans(captured);
    const root = spans.find((span) => span.name === 'game.login');
    const child = spans.find((span) => span.name === 'POST https://api.example.com/v1/login');
    assertDefined(root);
    assertDefined(child);
    expect(root.is_segment).toBe(true);
    expect(child.is_segment).toBe(false);
    expect(child.parent_span_id).toBe(root.span_id);
    expect(spanAttribute(child, 'sentry.op')).toBe('http.client');
    expect(spanAttribute(child, 'sentry.origin')).toBe('auto.http.miniapp');
    // 请求 span 归到业务 trace 里，不再另发独立 segment；stream 下也没有 transaction 事件。
    expect(spans.filter((span) => span.is_segment)).toHaveLength(1);
    expect(collectEnvelopePayloads(captured, ['transaction'])).toEqual([]);
  });

  it('采样率为 0 时请求正常执行但不发送 span', async () => {
    const beforeSendSpan = vi.fn((span: StreamedSpanJSON) => span);

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 0,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      beforeSendSpan,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/health' });
    await flush(2000);

    expect(requestMock).toHaveBeenCalledOnce();
    expect(collectEnvelopePayloads(captured, ['span', 'transaction'])).toEqual([]);
    expect(beforeSendSpan).not.toHaveBeenCalled();
  });

  it('关闭独立 HTTP span 后，无 active span 的请求不发送 span envelope', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableStandaloneHttpSpans: false,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/health' });
    await flush(2000);

    expect(requestMock).toHaveBeenCalledOnce();
    expect(collectEnvelopePayloads(captured, ['span', 'transaction'])).toEqual([]);
  });

  it('请求失败时把错误原因写入独立 span，并标记为失败', async () => {
    requestMock.mockImplementationOnce((options) => {
      const error = { errMsg: 'request:fail timeout' };
      options.fail?.(error);
      options.complete?.(error);
      return { abort: vi.fn() };
    });

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/timeout' });
    await flush(2000);

    const spans = collectSpans(captured);
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.is_segment).toBe(true);
    expect(spanAttribute(span, 'sentry.op')).toBe('http.client');
    // core 11 的 span 状态只剩 ok/error，失败原因由 error.message 属性承载。
    expect(span.status).toBe('error');
    expect(spanAttribute(span, 'error.message')).toBe('request:fail timeout');
  });

  it('HTTP 5xx 响应保留状态码，并把独立 span 标记为失败', async () => {
    requestMock.mockImplementationOnce((options) => {
      const response = { statusCode: 503, data: { ok: false }, header: {} };
      options.success?.(response);
      options.complete?.(response);
      return { abort: vi.fn() };
    });

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      platform: 'bytedance',
      tracesSampleRate: 1,
      enableOfflineCache: false,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
      transport: createCapturingTransport(captured),
    });

    g.tt.request({ url: 'https://api.example.com/v1/unavailable' });
    await flush(2000);

    const spans = collectSpans(captured);
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    // 状态码走属性，span.status 只表达成功/失败（core 11 的 span/v2 语义）。
    expect(spanAttribute(span, 'http.response.status_code')).toBe(503);
    expect(span.status).toBe('error');
  });
});
