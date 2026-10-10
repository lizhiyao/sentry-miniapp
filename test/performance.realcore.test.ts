import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureMessage,
  getCurrentScope,
  spanStreamingIntegration,
  startInactiveSpan,
  withActiveSpan,
  type Envelope,
  type Event,
  type Integration,
  type StreamedSpanJSON,
} from '@sentry/core';
import { init, getDiagnostics } from '../src/index';
import { MiniappClient } from '../src/client';
import { getClientEnvironment } from '../src/clientState';
import { resetPlatformCache } from '../src/crossPlatform';
import { PerformanceIntegration, performanceIntegration } from '../src/integrations/performance';
import {
  collectEnvelopePayloads,
  collectSpans,
  collectSpanItems,
  createCapturingTransport,
  spanAttribute,
} from './support/envelopes';

const EPOCH = 1700000000000;
describe('Performance 的真实 core operation 与时间契约', () => {
  const clients: MiniappClient[] = [];
  let envelopes: Envelope[];
  let callback: (entries: unknown) => void;
  let manager: any;
  let observer: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    resetPlatformCache();
    getCurrentScope().setClient(undefined);
    getCurrentScope().clearBreadcrumbs();
    envelopes = [];
    observer = { observe: vi.fn(), disconnect: vi.fn() };
    manager = {
      timeOrigin: EPOCH - 10000,
      createObserver: vi.fn((cb: typeof callback) => {
        callback = cb;
        return observer;
      }),
    };
    vi.stubGlobal('wx', { getPerformance: () => manager });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });
  function start(
    extra: Record<string, unknown> = {},
    integration: Integration = performanceIntegration({ enableUserTiming: true }),
  ) {
    const client = init({
      dsn: 'https://key@example.com/1',
      tracesSampleRate: 1,
      enableSystemInfo: false,
      defaultIntegrations: [spanStreamingIntegration(), integration],
      transport: createCapturingTransport(envelopes),
      ...extra,
    })!;
    clients.push(client);
    return client;
  }
  async function drain(client: MiniappClient) {
    const flushing = client.flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(await flushing).toBe(true);
  }
  const navigation = (startTime = 250) => ({
    name: 'pages/home',
    entryType: 'navigation',
    startTime,
    duration: 120,
  });

  it('默认不安装 Performance/FPS，不启动 observer/rAF/周期 timer', () => {
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    const client = start({ defaultIntegrations: undefined, enableMinigameLifecycle: false });
    expect(client.getIntegrationByName('PerformanceAPI')).toBeUndefined();
    expect(client.getIntegrationByName('MinigameFrameRate')).toBeUndefined();
    expect(manager.createObserver).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('每个 operation 只产生一个 span，无 delivery 父 span、周期汇总或阈值 breadcrumb', async () => {
    const client = start();
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    callback([
      navigation(),
      { name: 'paint', entryType: 'render', startTime: 500, duration: 2000 },
    ]);
    await drain(client);
    const spans = collectSpans(envelopes);
    expect(spans).toHaveLength(2);
    expect(spans.map((span) => span.name)).toEqual(['Navigation: pages/home', 'Render: paint']);
    expect(spans.every((span) => span.is_segment && !span.parent_span_id)).toBe(true);
    expect(spans[0]!.start_timestamp).toBe((EPOCH - 9750) / 1000);
    expect(spans[0]!.end_timestamp).toBe((EPOCH - 9630) / 1000);
    expect(spanAttribute(spans[0]!, 'performance.api.available')).toBe(true);
    expect(spanAttribute(spans[0]!, 'performance.entry_count')).toBeUndefined();
    expect(collectEnvelopePayloads(envelopes, ['transaction'])).toEqual([]);
    expect(getClientEnvironment(client).contexts.performance_summary).toBeUndefined();
    expect(getCurrentScope().getScopeData().breadcrumbs).toEqual([]);
    await vi.advanceTimersByTimeAsync(500); // core 的 segment-end 延迟 flush
    expect(vi.getTimerCount()).toBe(0);
  });

  it('迟到条目不使用当前页面、网络和活跃 span 冒充关联', async () => {
    const client = start();
    vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/wrong-current' }]);
    getClientEnvironment(client).contexts.network = { type: 'wrong-current-network' };
    const parent = startInactiveSpan({ name: 'unrelated.delivery', parentSpan: null });
    withActiveSpan(parent, () => callback([navigation()]));
    await drain(client);
    const span = collectSpans(envelopes)[0]!;
    expect(span.name).toBe('Navigation: pages/home');
    expect(span.parent_span_id).toBeUndefined();
    expect(spanAttribute(span, 'route')).toBeUndefined();
    expect(spanAttribute(span, 'network.type')).toBeUndefined();
  });

  it('缺 timeOrigin 的相对时间条目省略并诊断，epoch 条目仍可发送', async () => {
    delete manager.timeOrigin;
    const client = start();
    callback([navigation(), navigation(EPOCH - 500)]);
    await drain(client);
    expect(collectSpans(envelopes)).toHaveLength(1);
    expect(collectSpans(envelopes)[0]!.start_timestamp).toBe((EPOCH - 500) / 1000);
    expect(getDiagnostics().warnings.map((w) => w.code)).toContain(
      'performance_time_origin_missing',
    );
    expect(getClientEnvironment(client).contexts.performance_support?.time_origin_available).toBe(
      false,
    );
  });

  it.each([NaN, Infinity, -1, 50, '1700000000000'])(
    '无效 timeOrigin %s 不回退墙钟',
    async (origin) => {
      manager.timeOrigin = origin;
      const client = start();
      callback([navigation()]);
      await drain(client);
      expect(collectSpans(envelopes)).toEqual([]);
      expect(getDiagnostics().warnings.map((w) => w.code)).toContain(
        'performance_time_origin_missing',
      );
    },
  );

  it('多批相对条目使用同一可信原点，不受 delivery 延迟和之后 origin 变化影响', async () => {
    const client = start();
    callback([navigation()]);
    vi.setSystemTime(EPOCH + 100000);
    manager.timeOrigin = EPOCH + 99999;
    callback([navigation(350)]);
    await drain(client);
    const spans = collectSpans(envelopes);
    expect(spans.map((span) => span.start_timestamp)).toEqual([
      (EPOCH - 9750) / 1000,
      (EPOCH - 9650) / 1000,
    ]);
  });

  it.each([
    { startTime: NaN, duration: 1 },
    { startTime: -1, duration: 1 },
    { startTime: 1, duration: NaN },
    { startTime: 1, duration: -1 },
    { startTime: EPOCH - 31 * 86400000, duration: 1 },
    { startTime: EPOCH + 60001, duration: 1 },
    { startTime: Number.MAX_VALUE, duration: Number.MAX_VALUE },
  ])('非法或不可信时间隔离：%j', async (times) => {
    const client = start();
    callback([{ ...navigation(), ...times }, navigation()]);
    await drain(client);
    expect(collectSpans(envelopes)).toHaveLength(1);
  });

  it('mark 在随后真实事件 envelope 中保留，detail 原对象不读取也不复制', async () => {
    const client = start();
    const detail = vi.fn(() => {
      throw new Error('must not collect detail');
    });
    callback([
      Object.defineProperty(
        { name: 'ready?phase=1#paint', entryType: 'mark', startTime: 250, duration: 0 },
        'detail',
        { get: detail },
      ),
      Object.defineProperty(
        { name: 'business?phase=1#paint', entryType: 'measure', startTime: 250, duration: 0 },
        'detail',
        { get: detail },
      ),
    ]);
    captureMessage('mark probe');
    await drain(client);
    const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(events[0]!.breadcrumbs).toContainEqual(
      expect.objectContaining({
        category: 'performance.mark',
        message: '性能标记: ready?phase=1#paint',
        timestamp: (EPOCH - 9750) / 1000,
      }),
    );
    expect(collectSpans(envelopes).map((span) => span.name)).toEqual([
      'Measure: business?phase=1#paint',
    ]);
    expect(detail).not.toHaveBeenCalled();
    expect(JSON.stringify(envelopes)).not.toContain('measure.detail');
  });

  it('navigation/resource 清理 URL；不为缺失的可选字段伪造 0', async () => {
    const client = start();
    const name =
      'https://canary-user:canary-password@example.com/path?token=canary-token#canary-fragment';
    const names = [
      name,
      'data:image/png?access_token=canary-token;base64,canary-payload',
      'data:image/png#canary-fragment;base64,canary-payload',
    ];
    callback([
      navigation(),
      ...names.map((name) => ({ entryType: 'resource', name, startTime: 250, duration: 20 })),
    ]);
    await drain(client);
    const resource = collectSpans(envelopes)[1]!;
    expect(resource.name).toBe('Resource: https://[filtered]:[filtered]@example.com/path');
    expect(spanAttribute(resource, 'resource.transfer_size')).toBeUndefined();
    expect(spanAttribute(resource, 'resource.type')).toBeUndefined();
    expect(
      collectSpans(envelopes)
        .slice(2)
        .map((span) => span.name),
    ).toEqual(['Resource: data:image/png', 'Resource: data:image/png']);
    expect(JSON.stringify(envelopes)).not.toContain('canary');
  });

  it('可信资源、导航和渲染字段保留零值与毫秒语义，非法字段省略', async () => {
    const client = start();
    callback([
      { ...navigation(), appLaunchTime: 0, pageReadyTime: 1, firstRenderTime: NaN },
      {
        entryType: 'render',
        name: 'paint',
        startTime: 250,
        duration: 20,
        renderStart: 0,
        renderEnd: 20,
        scriptStart: -1,
        scriptEnd: Infinity,
      },
      {
        entryType: 'resource',
        name: 'bundle.js',
        startTime: 250,
        duration: 20,
        initiatorType: 'script',
        fetchStart: 0,
        responseEnd: 20,
        transferSize: 0,
        encodedBodySize: 10,
        decodedBodySize: -1,
      },
    ]);
    await drain(client);
    const [navigationSpan, render, resource] = collectSpans(envelopes);
    expect(spanAttribute(navigationSpan!, 'navigation.app_launch_time')).toBe(0);
    expect(spanAttribute(navigationSpan!, 'navigation.first_render_time')).toBeUndefined();
    expect(spanAttribute(render!, 'render.start')).toBe(0);
    expect(spanAttribute(render!, 'render.script_start')).toBeUndefined();
    expect(spanAttribute(resource!, 'resource.network_time')).toBe(20);
    expect(spanAttribute(resource!, 'resource.transfer_size')).toBe(0);
    expect(spanAttribute(resource!, 'resource.decoded_size')).toBeUndefined();
  });

  it.each([0, 1])(
    'span 采样使用 tracesSampleRate=%s，不受 error sampleRate=0 影响',
    async (rate) => {
      const client = start({ tracesSampleRate: rate, sampleRate: 0 });
      callback([navigation()]);
      captureMessage('not sampled error');
      await drain(client);
      expect(collectSpans(envelopes)).toHaveLength(rate);
      expect(collectEnvelopePayloads(envelopes, ['event'])).toEqual([]);
    },
  );

  it('创建前属性供 sampler/ignoreSpans 使用，beforeSendSpan 可改名', async () => {
    const sampler = vi.fn(() => 1);
    const beforeSendSpan = vi.fn((span: StreamedSpanJSON) => ({
      ...span,
      name: `edited ${span.name}`,
    }));
    const client = start({
      tracesSampler: sampler,
      beforeSendSpan,
      ignoreSpans: [{ name: /Resource:/ }],
    });
    callback([
      navigation(),
      { name: 'bundle.js', entryType: 'resource', startTime: 250, duration: 1 },
    ]);
    await drain(client);
    expect(sampler.mock.calls[0]).toEqual([
      expect.objectContaining({
        name: 'Navigation: pages/home',
        attributes: expect.objectContaining({
          'navigation.name': 'pages/home',
          'navigation.duration': 120,
        }),
      }),
    ]);
    expect(collectSpans(envelopes).map((span) => span.name)).toEqual([
      'edited Navigation: pages/home',
    ]);
    expect(beforeSendSpan).toHaveBeenCalledOnce();
  });

  it('保留 core 批处理：未结束 root 的 children 由 5 秒 timer 同批发出，flush 后不重复', async () => {
    const client = start();
    const root = startInactiveSpan({ name: 'live.root', parentSpan: null });
    withActiveSpan(root, () => {
      startInactiveSpan({ name: 'child.1' }).end();
      startInactiveSpan({ name: 'child.2' }).end();
    });
    expect(envelopes).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(collectSpanItems(envelopes)).toHaveLength(1);
    expect(collectSpans(envelopes).map((span) => span.name)).toEqual(['child.1', 'child.2']);
    root.end();
    await drain(client);
    await vi.advanceTimersByTimeAsync(5000);
    expect(collectSpans(envelopes).map((span) => span.name)).toEqual([
      'child.1',
      'child.2',
      'live.root',
    ]);
  });
  it.each([null, {}, { now: () => 1 }])('缺 observer 的宿主安全跳过：%j', (hostManager) => {
    manager = hostManager;
    const client = start();
    expect(getClientEnvironment(client).tags['performance.api.available']).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('全部类型关闭时不注册 observer；User Timing 在无 DOM 宿主也由实际 observe 能力决定', async () => {
    start(
      {},
      performanceIntegration({
        enableNavigation: false,
        enableRender: false,
        enableResource: false,
      }),
    );
    expect(manager.createObserver).not.toHaveBeenCalled();
    const client = start(
      {},
      performanceIntegration({
        enableNavigation: false,
        enableRender: false,
        enableResource: false,
        enableUserTiming: true,
      }),
    );
    expect(observer.observe).toHaveBeenCalledWith({ entryTypes: ['measure', 'mark'] });
    callback([navigation(), { name: 'business', entryType: 'measure', startTime: 0, duration: 0 }]);
    await drain(client);
    expect(collectSpans(envelopes).map((span) => span.name)).toEqual(['Measure: business']);
  });

  it('旧宿主拒绝 User Timing 时回退其余实际条目类型；关闭时解除 observer', () => {
    observer.observe.mockImplementationOnce(() => {
      throw new Error('no user timing');
    });
    const client = start();
    expect(observer.observe.mock.calls).toEqual([
      [{ entryTypes: ['navigation', 'render', 'resource', 'measure', 'mark'] }],
      [{ entryTypes: ['navigation', 'render', 'resource'] }],
    ]);
    client.dispose();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('仅 User Timing 注册失败立即解除；宿主和告警输出故障不阻断初始化', async () => {
    observer.observe.mockImplementation(() => {
      throw new Error('unsupported');
    });
    const client = start(
      {},
      performanceIntegration({
        enableNavigation: false,
        enableRender: false,
        enableResource: false,
        enableUserTiming: true,
      }),
    );
    expect(observer.disconnect).toHaveBeenCalledOnce();
    client.dispose();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    manager.createObserver.mockImplementation(() => {
      throw new Error('host failed');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('console unavailable');
    });
    const survivors = [start()];
    Object.defineProperty(manager, 'timeOrigin', {
      configurable: true,
      get: () => {
        throw new Error('origin failed');
      },
    });
    survivors.push(start());
    const originalConsole = console;
    vi.stubGlobal('console', undefined);
    survivors.push(start());
    vi.stubGlobal('console', originalConsole);
    warn.mockRestore();
    const survivor = survivors.at(-1)!;
    survivor.captureMessage('independent collection survives');
    await drain(survivor);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0]?.message).toBe(
      'independent collection survives',
    );
  });

  it('坏列表/单条 getter 不阻断后续可信条目；未知/已禁用条目忽略', async () => {
    const client = start({}, performanceIntegration({ enableUserTiming: false }));
    for (const value of [
      null,
      1,
      'invalid',
      { getEntries: () => 1 },
      {
        getEntries: () => {
          throw new Error('failed');
        },
      },
    ])
      expect(() => callback(value)).not.toThrow();
    callback({
      getEntries: () => [
        navigation(),
        { entryType: 'unknown' },
        { name: 'ignored', entryType: 'mark', startTime: 0, duration: 0 },
      ],
    });
    callback(Object.assign(navigation(300), { name: 1 }));
    callback([
      Object.defineProperty({}, 'entryType', {
        get: () => {
          throw new Error('bad');
        },
      }),
      navigation(350),
    ]);
    callback(navigation(400));
    await drain(client);
    expect(collectSpans(envelopes)).toHaveLength(3);
  });

  it('timeOrigin getter 重入退休后不继续 observer 注册，采集字段 getter 重入也不创建 span', () => {
    Object.defineProperty(manager, 'timeOrigin', {
      configurable: true,
      get: () => {
        getCurrentScope().getClient()!.dispose();
        return EPOCH;
      },
    });
    start();
    expect(manager.createObserver).not.toHaveBeenCalled();
    Object.defineProperty(manager, 'timeOrigin', { value: EPOCH - 10000, configurable: true });
    const client = start();
    callback(
      Object.defineProperty(navigation(), 'duration', {
        get: () => {
          client.dispose();
          return 1;
        },
      }),
    );
    expect(envelopes).toEqual([]);
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('配置对象 cleanup 幂等；旧 observer 不能再读条目或产生 span', () => {
    const integration = new PerformanceIntegration();
    const client = start({}, integration);
    integration.cleanup();
    integration.cleanup();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    const read = vi.fn();
    callback(new Proxy({}, { get: read }));
    expect(read).not.toHaveBeenCalled();
    expect(client.getOptions().enabled).not.toBe(false);
    expect(envelopes).toEqual([]);
  });

  it('startTime getter 退休后不读 duration/name；beforeBreadcrumb 可丢弃 mark', () => {
    const client = start({ beforeBreadcrumb: () => null });
    callback([{ name: 'drop mark', entryType: 'mark', startTime: 0, duration: 0 }]);
    expect(getCurrentScope().getScopeData().breadcrumbs).toEqual([]);
    const read = vi.fn();
    callback({
      entryType: 'navigation',
      get startTime() {
        client.dispose();
        return 1;
      },
      get duration() {
        read();
        return 1;
      },
      get name() {
        read();
        return 'must not read';
      },
    });
    expect(read).not.toHaveBeenCalled();
    expect(envelopes).toEqual([]);
  });
  it.each(['entryType', 'name', 'appLaunchTime', 'initiatorType', 'fetchStart', 'responseEnd'])(
    '条目 %s getter 触发退休后停止后续读取',
    (key) => {
      const client = start();
      const entry =
        key === 'entryType' || key === 'name' || key === 'appLaunchTime'
          ? navigation()
          : { name: 'resource', entryType: 'resource', startTime: 1, duration: 1 };
      Object.defineProperty(entry, key, {
        get() {
          client.dispose();
          return key === 'entryType' ? 'navigation' : key === 'name' ? 'name' : 1;
        },
      });
      expect(() => callback(entry)).not.toThrow();
      expect(envelopes).toEqual([]);
      expect(observer.disconnect).toHaveBeenCalledOnce();
    },
  );

  it('创建属性读取用户 scope 值时退休，不创建新的 span', () => {
    const client = start();
    getCurrentScope().setAttribute('navigation.duration', {
      get value() {
        client.dispose();
        return 1;
      },
    });
    // owner scope 在 setup 捕获，显式更新在安装集成前设置的属性才能属于这个 owner。
    const integration = performanceIntegration();
    integration.setup!(client);
    callback(navigation());
    expect(envelopes).toEqual([]);
    getCurrentScope().setAttribute('navigation.duration', undefined);
  });
  it('duration 与列表 reader 只读取一次，条目时间与采样属性使用同一快照', async () => {
    const client = start();
    const duration = vi.fn().mockReturnValueOnce(20).mockReturnValue(999999);
    const entry = Object.defineProperty(navigation(), 'duration', { get: duration });
    const reader = vi.fn(() => [entry]);
    const lookup = vi.fn(() => reader);
    callback(Object.defineProperty({}, 'getEntries', { get: lookup }));
    await drain(client);
    expect(duration).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenCalledOnce();
    const span = collectSpans(envelopes)[0]!;
    expect(spanAttribute(span, 'navigation.duration')).toBe(20);
    expect(span.end_timestamp).toBe((EPOCH - 9730) / 1000);
  });

  it('列表 reader getter 退休后不调用已取得的函数', () => {
    const client = start();
    const reader = vi.fn(() => [navigation()]);
    callback({
      get getEntries() {
        client.dispose();
        return reader;
      },
    });
    expect(reader).not.toHaveBeenCalled();
    expect(envelopes).toEqual([]);
  });
});
