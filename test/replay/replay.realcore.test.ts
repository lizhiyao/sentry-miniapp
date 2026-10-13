import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBreadcrumb,
  getCurrentScope,
  getIsolationScope,
  type Envelope,
  type Event,
  type ReplayEvent,
} from '@sentry/core';
import { init, MiniappClient, utf8ByteLength } from '../../src/index';
import { getWechatPageReplay, wechatPageReplayIntegration } from '../../src/replay';
import type { WechatPageReplayOptions } from '../../src/replay';
import { frameEvents, projectFrame } from '../../src/replay/frame';
import { resetPlatformCache } from '../../src/crossPlatform';
import { _resetAppLifecycle } from '../../src/appLifecycle';
import { collectEnvelopePayloads, createCapturingTransport } from '../support/envelopes';

describe('微信回放真实 Core / 生命周期', () => {
  it('编译捕获方法复用共享包装，组件真实 tap 去重，错误／冻结定义安全降级', async () => {
    const registered: Record<string, any>[] = [];
    const nativePage = vi.fn((definition: Record<string, any>) => {
      registered.push(definition);
      return 'page';
    });
    const nativeComponent = vi.fn((definition: Record<string, any>) => {
      registered.push(definition);
      return 'component';
    });
    vi.stubGlobal('Page', nativePage);
    vi.stubGlobal('Component', nativeComponent);
    const { client, replay } = make();
    const definition = {},
      component: Record<string, any> = {};
    expect((globalThis as any).Page(definition)).toBe('page');
    expect((globalThis as any).Component(component)).toBe('component');
    (globalThis as any).Page(undefined);
    (globalThis as any).Component({ methods: 'unavailable' });
    (globalThis as any).Page(Object.freeze({}));
    (globalThis as any).Page({ __sentryReplayTap: () => 'business' });
    const pageHandler = registered[0]!['__sentryReplayTap'];
    const componentHandler = component['methods']['__sentryReplayTap'];
    expect(pageHandler.__sentryPageCallbackWrapper).toBe(true);
    (result as any)[1][0].dataset.sentryReplayRoot = true;
    await replay.capture();
    addBreadcrumb({ category: 'user.interaction', data: { eventType: 'tap', x: 30, y: 50 } });
    const tap = { timeStamp: 100, detail: { x: 30, y: 50 } };
    pageHandler(tap);
    componentHandler(tap);
    pageHandler({ touches: [{ pageX: 30, pageY: 50 }] });
    pageHandler({ detail: { x: 'bad', y: 50 } });
    pageHandler({
      get detail() {
        throw new Error('unreadable');
      },
    });
    await replay.flush();
    expect(
      recordings()[0].events.filter((event: { type: number }) => event.type === 3),
    ).toHaveLength(2);
    client.getOptions().enableUserInteractionBreadcrumbs = false;
    pageHandler({ detail: { x: 10, y: 20 } });
    expect(await replay.flush()).toBe(false);
    client.dispose();
    pageHandler(tap);
    expect((globalThis as any).Page).toBe(nativePage);
    expect((globalThis as any).Component).toBe(nativeComponent);
  });
  it('默认只在错误前缓冲，采样成功才排放；滚动窗口、时长与空页面关联有界', async () => {
    const { client, replay } = make({
      sessionSampleRate: 0,
      bufferDurationMs: 1000,
      maxDurationMs: 10000,
    });
    await replay.capture();
    expect(await replay.flush()).toBe(false);
    expect(envelopes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(replay.getDiagnostics().bufferedBytes).toBeGreaterThan(0);
    client.captureException(new Error('trigger buffer'));
    await vi.advanceTimersByTimeAsync(5);
    expect(collectEnvelopePayloads<ReplayEvent>(envelopes, ['replay_event'])[0]).toMatchObject({
      replay_type: 'buffer',
      replay_start_timestamp: Date.now() / 1000 - 0.005,
    });
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0].tags?.replayId).toBe(
      replay.getReplayId(),
    );
    (result as any)[1] = [];
    await replay.capture();
    client.captureException(new Error('uncovered'));
    await vi.advanceTimersByTimeAsync(5);
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).at(-1)?.tags?.replayId,
    ).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10000);
    expect(replay.getDiagnostics().reason).toBe('duration_limit');
    hide();
    show();
    expect(replay.getDiagnostics().state).toBe('recording');
  });
  it('关闭两种采样不查询，显式 start 可启动；未抽中错误不关联也不发送', async () => {
    const { client, replay } = make({ sessionSampleRate: 0, errorSampleRate: 0 });
    expect(replay.getDiagnostics().reason).toBe('sampled_out');
    expect(await replay.capture()).toBe(false);
    expect(queryCalls).toBe(0);
    expect(replay.start()).toBe(true);
    await replay.capture();
    expect(await replay.flush()).toBe(true);
    client.dispose();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const next = make({ sessionSampleRate: 0, errorSampleRate: 0.1 });
    await next.replay.capture();
    next.client.captureException(new Error('unsampled'));
    await vi.advanceTimersByTimeAsync(5);
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).at(-1)?.tags?.replayId,
    ).toBeUndefined();
    expect(await next.replay.flush()).toBe(false);
    expect(next.replay.start()).toBe(true);
    expect(await next.replay.flush()).toBe(true);
  });
  const clients: MiniappClient[] = [];
  let envelopes: Envelope[], result: unknown, queued: ((result: unknown) => void)[];
  let page: { route: string; renderer?: string }, host: Record<string, unknown>;
  let deferred: boolean, queryCalls: number, fields: object[];
  let show: () => void, hide: () => void;
  function make(options: WechatPageReplayOptions = {}, extra = {}) {
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      defaultIntegrations: false,
      enableOfflineCache: false,
      transport: createCapturingTransport(envelopes),
      integrations: [wechatPageReplayIntegration({ sessionSampleRate: 1, ...options })],
      ...extra,
    })!;
    clients.push(client);
    return { client, replay: getWechatPageReplay()! };
  }
  function recordings() {
    return collectEnvelopePayloads<string>(envelopes, ['replay_recording']).map((payload) => {
      const newline = payload.indexOf('\n');
      return {
        header: JSON.parse(payload.slice(0, newline)),
        events: JSON.parse(payload.slice(newline + 1)),
      };
    });
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T00:00:00Z'));
    envelopes = [];
    queued = [];
    fields = [];
    deferred = false;
    queryCalls = 0;
    page = { route: 'pages/replay/index' };
    result = [
      { width: 375, height: 700, scrollTop: 0 },
      [
        {
          left: 20,
          top: 40,
          width: 200,
          height: 48,
          backgroundColor: '#fff',
          dataset: { sentryReplayType: 'text', sentryReplayText: '手机号 13800000000' },
        },
      ],
    ];
    host = {
      request: vi.fn(),
      onAppShow: (callback: () => void) => {
        show = callback;
      },
      onAppHide: (callback: () => void) => {
        hide = callback;
      },
      offAppShow: vi.fn(),
      offAppHide: vi.fn(),
      createSelectorQuery: () => {
        queryCalls++;
        const query = {
          in: (scope: object) => {
            expect(scope).toBe(page);
            return query;
          },
          selectViewport: () => ({
            fields: (value: object) => {
              fields.push(value);
              return query;
            },
          }),
          selectAll: (selector: string) => {
            expect(selector).toBe('.sentry-replay, .sentry-replay-root >>> .sentry-replay');
            return {
              fields: (value: object) => {
                fields.push(value);
                return query;
              },
            };
          },
          exec: (callback: (results: unknown) => void) => {
            if (deferred) queued.push(callback);
            else callback(result);
          },
        };
        return query;
      },
    };
    vi.stubGlobal('wx', host);
    vi.stubGlobal('App', undefined);
    vi.stubGlobal('getApp', undefined);
    vi.stubGlobal('getCurrentPages', () => [page]);
    resetPlatformCache();
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    _resetAppLifecycle();
    getCurrentScope().setClient(undefined);
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });
  it('公开查询、遮蔽、标准分段和错误关联使用同一 client', async () => {
    const { client, replay } = make(
      {},
      { release: 'replay-test', environment: 'test', dataCollection: { userInfo: false } },
    );
    expect(replay.getDiagnostics().state).toBe('recording');
    expect(await replay.capture()).toBe(true);
    client.emit('preprocessEvent', { message: 'no hint' }, undefined);
    client.emit('postprocessEvent', { message: 'no hint' }, undefined);
    expect(fields[0]).toEqual({ size: true, scrollOffset: true });
    expect(fields[1]).toMatchObject({ dataset: true, rect: true, size: true });
    expect(await replay.flush()).toBe(true);
    const id = replay.getReplayId();
    expect(collectEnvelopePayloads<ReplayEvent>(envelopes, ['replay_event'])[0]).toMatchObject({
      event_id: id,
      replay_id: id,
      segment_id: 0,
      type: 'replay_event',
      replay_type: 'session',
      release: 'replay-test',
      environment: 'test',
      urls: ['https://miniapp.invalid/pages/replay/index'],
      sdk: { settings: { infer_ip: 'never' } },
    });
    expect(envelopes[0][0]).toMatchObject({
      event_id: id,
      sent_at: '2026-10-13T00:00:00.000Z',
      sdk: { name: 'sentry.javascript.miniapp', version: client.getSdkMetadata()?.sdk?.version },
    });
    const item = envelopes[0][1].find(([header]) => header.type === 'replay_recording')!;
    expect(item[0].length).toBe(utf8ByteLength(item[1] as string));
    expect(recordings()[0].header).toEqual({ segment_id: 0 });
    expect(recordings()[0].events.map((event: { type: number }) => event.type)).toEqual([4, 2]);
    expect(JSON.stringify(envelopes)).not.toContain('13800000000');
    client.captureException(new Error('associated'));
    await vi.advanceTimersByTimeAsync(5);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0].tags?.replayId).toBe(id);
    const segments = collectEnvelopePayloads<ReplayEvent>(envelopes, ['replay_event']);
    expect(segments[1].segment_id).toBe(1);
    expect(segments[1].error_ids).toHaveLength(1);
    expect(await replay.flush()).toBe(false);
  });
  it('仅记录已覆盖页面点击，坏 breadcrumb 不阻断错误，保留已有 replayId', async () => {
    const { client, replay } = make();
    (result as Record<string, unknown>[])[0]!['scrollTop'] = 100;
    await replay.capture();
    addBreadcrumb({
      category: 'user.interaction',
      data: { eventType: 'tap', touchX: 30, touchY: 150 },
    });
    addBreadcrumb({ category: 'user.interaction', data: { eventType: 'tap', x: 30, y: 150 } });
    addBreadcrumb({ category: 'user.interaction', data: { eventType: 'input', value: 'secret' } });
    addBreadcrumb({ category: 'user.interaction', data: { eventType: 'tap', x: NaN, y: 50 } });
    const data = {
      get eventType() {
        throw new Error('unreadable');
      },
    };
    expect(() =>
      client.emit('beforeAddBreadcrumb', { category: 'user.interaction', data }, undefined),
    ).not.toThrow();
    await replay.flush();
    expect(recordings()[0].events.map((event: { type: number }) => event.type)).toEqual([
      4, 2, 3, 3,
    ]);
    expect(recordings()[0].events.slice(-2)).toMatchObject([
      { data: { id: 10, x: 30, y: 50 } },
      { data: { id: 10, x: 30, y: 50 } },
    ]);
    client.captureEvent({ message: 'existing', tags: { replayId: 'other-replay' } });
    page = { route: 'pages/other/index' };
    client.captureException(new Error('not recorded'));
    await Promise.resolve();
    const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(events[0].tags?.replayId).toBe('other-replay');
    expect(events[1].tags?.replayId).toBeUndefined();
  });
  it('同意前不查询，重复同意不重置，撤回清空并拒绝迟到回调', async () => {
    const { client, replay } = make({}, { requireConsent: true });
    expect(await replay.capture()).toBe(false);
    expect(queryCalls).toBe(0);
    client.setConsent(true);
    const id = replay.getReplayId();
    client.setConsent(true);
    expect(replay.getReplayId()).toBe(id);
    deferred = true;
    const pending = replay.capture();
    client.setConsent(false);
    queued[0](result);
    expect(await pending).toBe(false);
    expect(replay.getDiagnostics()).toMatchObject({
      state: 'stopped',
      bufferedBytes: 0,
      replayId: undefined,
    });
    expect(envelopes).toEqual([]);
    client.setConsent(true);
    deferred = false;
    expect(await replay.capture()).toBe(true);
    expect(replay.getReplayId()).not.toBe(id);
  });
  it.each(['dispose', 'reinit', 'replaceIntegration'] as const)(
    '%s 后旧控制器与旧查询永久失效',
    async (action) => {
      const { client, replay } = make();
      deferred = true;
      const pending = replay.capture();
      if (action === 'dispose') client.dispose();
      else if (action === 'reinit') make();
      else wechatPageReplayIntegration().setup!(client);
      queued[0](result);
      expect(await pending).toBe(false);
      expect(replay.start()).toBe(false);
      expect(await replay.flush()).toBe(false);
      expect(replay.getDiagnostics().bufferedBytes).toBe(0);
      expect(envelopes).toEqual([]);
    },
  );
  it('前后台切换排放并取消查询，手动停止不被 onShow 复活', async () => {
    const { replay } = make();
    await replay.capture();
    deferred = true;
    const pending = replay.capture();
    hide();
    queued[0](result);
    expect(await pending).toBe(false);
    expect(replay.getDiagnostics().state).toBe('waiting');
    expect(recordings()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    show();
    expect(replay.getDiagnostics().state).toBe('recording');
    replay.stop();
    hide();
    show();
    expect(vi.getTimerCount()).toBe(0);
    expect(replay.getDiagnostics().state).not.toBe('recording');
    expect(replay.start()).toBe(true);
  });
  it('超时释放旧回调，在时长预算内恢复采集，停止后不再重试', async () => {
    const { replay } = make();
    deferred = true;
    const pending = replay.capture();
    expect(await replay.capture()).toBe(false);
    await vi.advanceTimersByTimeAsync(2100);
    expect(await pending).toBe(false);
    expect(replay.getDiagnostics()).toMatchObject({ state: 'recording', reason: 'query_timeout' });
    expect(queryCalls).toBeLessThanOrEqual(2);
    queued[0](result);
    expect(replay.getDiagnostics().nodes).toBe(0);
    deferred = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(replay.getDiagnostics()).toMatchObject({
      state: 'recording',
      nodes: 1,
      reason: undefined,
    });
    replay.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('页面切换丢弃旧结果，节点消失产生空快照，按时发送且时长有界', async () => {
    const { replay } = make({ flushIntervalMs: 1000, maxDurationMs: 2000 });
    deferred = true;
    const pending = replay.capture();
    page = { route: 'pages/next/index' };
    queued[0](result);
    expect(await pending).toBe(false);
    deferred = false;
    await replay.capture();
    result = [{ width: 375, height: 700 }, []];
    await replay.capture();
    await vi.advanceTimersByTimeAsync(1000);
    expect(recordings()).toHaveLength(1);
    expect(recordings()[0].events).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1100);
    expect(replay.getDiagnostics()).toMatchObject({ state: 'stopped', reason: 'duration_limit' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('close 同步提交尾段后停止所有自动生产者', async () => {
    const { client, replay } = make();
    await replay.capture();
    const closing = client.close(500);
    await vi.advanceTimersByTimeAsync(20);
    expect(await closing).toBe(true);
    expect(recordings()).toHaveLength(1);
    expect(replay.start()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    'alipay',
    'bytedance',
    'dingtalk',
    'qq',
    'swan',
    'kuaishou',
    'wechat-minigame',
  ] as const)('%s 降级不调用微信查询', async (platform) => {
    if (platform === 'wechat-minigame') vi.stubGlobal('GameGlobal', {});
    else {
      vi.stubGlobal('wx', undefined);
      const names = {
        alipay: 'my',
        bytedance: 'tt',
        dingtalk: 'dd',
        qq: 'qq',
        swan: 'swan',
        kuaishou: 'ks',
      };
      vi.stubGlobal(names[platform], { request: vi.fn(), httpRequest: vi.fn() });
    }
    resetPlatformCache();
    const { replay } = make();
    expect(replay).toBeDefined();
    expect(await replay.capture()).toBe(false);
    expect(replay.getDiagnostics().state).toBe('unsupported');
    expect(queryCalls).toBe(0);
  });
  it.each([
    'no-page',
    'skyline',
    'missing-api',
    'query-throws',
    'bad-frame',
    'no-markers',
    'page-throws',
  ] as const)('公开能力异常降级：%s', async (mode) => {
    const { replay } = make();
    if (mode === 'no-page') vi.stubGlobal('getCurrentPages', () => []);
    if (mode === 'page-throws')
      vi.stubGlobal('getCurrentPages', () => {
        throw new Error('blocked');
      });
    if (mode === 'skyline') page.renderer = 'skyline';
    if (mode === 'missing-api') delete host.createSelectorQuery;
    if (mode === 'query-throws')
      host.createSelectorQuery = () => {
        throw new Error('host query failure');
      };
    if (mode === 'bad-frame') result = [];
    if (mode === 'no-markers') result = [{ width: 375, height: 700 }, []];
    expect(await replay.capture()).toBe(false);
    expect(replay.getDiagnostics().reason).toBeDefined();
    expect(envelopes).toEqual([]);
  });
  it('不可读平台 API 在启动和采集阶段均安全失败', async () => {
    Object.defineProperty(host, 'createSelectorQuery', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    const { replay } = make();
    expect(replay.getDiagnostics()).toMatchObject({
      state: 'unsupported',
      reason: 'unreadable_host',
    });
    Object.defineProperty(host, 'createSelectorQuery', {
      configurable: true,
      value: () => {
        throw new Error('failure');
      },
    });
    expect(replay.start()).toBe(true);
    expect(await replay.capture()).toBe(false);
    replay.stop();
    delete host.createSelectorQuery;
    expect(replay.start()).toBe(false);
  });
  it('布局投影期间关闭 client 的 getter 不得提交快照', async () => {
    const { client, replay } = make();
    result = [
      {
        get width() {
          client.dispose();
          return 375;
        },
        height: 700,
      },
      [],
    ];
    expect(await replay.capture()).toBe(false);
    expect(replay.getDiagnostics().bufferedBytes).toBe(0);
  });
  it('节点数据不可读不阻断下一次查询，空交互数据安全跳过', async () => {
    const { client, replay } = make();
    Object.defineProperty(page, 'route', {
      configurable: true,
      get() {
        throw new Error('route blocked');
      },
    });
    expect(await replay.capture()).toBe(false);
    Object.defineProperty(page, 'route', { configurable: true, value: 'pages/replay/index' });
    expect(await replay.capture()).toBe(true);
    client.emit('beforeAddBreadcrumb', { category: 'user.interaction' }, undefined);
    client.emit(
      'beforeAddBreadcrumb',
      { category: 'user.interaction', data: { eventType: 'tap' } },
      undefined,
    );
    expect(await replay.flush()).toBe(true);
    expect(recordings()[0].events).toHaveLength(2);
  });
  it('多次变化分段不超限，大帧拒收后小帧仍能继续', async () => {
    const { replay } = make({ maxSegmentBytes: 8192, maxNodes: 200 });
    const nodes = Array.from({ length: 8 }, (_, index) => ({
      left: index,
      top: index,
      width: 200,
      height: 48,
      color: '#222',
      dataset: { sentryReplayText: 'a'.repeat(256) },
    }));
    result = [{ width: 375, height: 700 }, nodes];
    expect(await replay.capture()).toBe(true);
    for (let index = 1; index < 8; index++) {
      nodes[0].left = index * 2;
      expect(await replay.capture()).toBe(true);
      expect(replay.getDiagnostics().bufferedBytes).toBeLessThan(8192);
    }
    expect(recordings().length).toBeGreaterThan(0);
    const recorded = collectEnvelopePayloads<string>(envelopes, ['replay_recording']);
    for (const payload of recorded) expect(utf8ByteLength(payload)).toBeLessThanOrEqual(8192);
    result = [{ width: 375, height: 700 }, Array.from({ length: 30 }, () => nodes[0])];
    expect(await replay.capture()).toBe(false);
    expect(replay.getDiagnostics().reason).toBe('frame_too_large');
    result = [{ width: 375, height: 700 }, [nodes[0]]];
    expect(await replay.capture()).toBe(true);
  });
  it('未接收错误不进入 error_ids；transport 失败与关闭重入不阻断业务', async () => {
    const send = vi.fn((envelope: Envelope) => {
      envelopes.push(envelope);
      return Promise.resolve({ statusCode: 500 });
    });
    const { client, replay } = make(
      {},
      {
        tunnel: 'https://tunnel.invalid/envelope',
        transport: () => ({
          send,
          flush: () => Promise.resolve(true),
        }),
      },
    );
    await replay.capture();
    expect(await replay.flush()).toBe(false);
    expect(envelopes[0][0].dsn).toBe('https://test@o0.ingest.sentry.io/0');
    expect(
      collectEnvelopePayloads<ReplayEvent>(envelopes, ['replay_event'])[0].sdk?.settings,
    ).toMatchObject({ infer_ip: 'auto' });
    client.captureException(new Error('not accepted'));
    await vi.advanceTimersByTimeAsync(5);
    expect(recordings()).toHaveLength(1);
    client.emit('afterSendEvent', { event_id: 'unrelated' }, { statusCode: 200 });
    send.mockImplementation(() => {
      throw new Error('transport synchronous failure');
    });
    result = [
      { width: 375, height: 700 },
      [{ left: 0, top: 0, width: 10, height: 10, dataset: {} }],
    ];
    expect(await replay.capture()).toBe(true);
    expect(await replay.flush()).toBe(false);
    expect(() => client.captureException(new Error('still usable'))).not.toThrow();
  });
  it('低层 client 和停用 client 不获得自动录制权限，当前无集成时无控制器', () => {
    expect(getWechatPageReplay()).toBeUndefined();
    const client = new MiniappClient({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      transport: createCapturingTransport(envelopes),
    });
    clients.push(client);
    wechatPageReplayIntegration().setup!(client);
    const stop = vi.fn();
    client.registerAutomaticProducer({
      onShow: vi.fn(),
      onHide: vi.fn(),
      onConsentChange: vi.fn(),
      flush: vi.fn(),
      stop,
    });
    expect(stop).toHaveBeenCalledOnce();
    const { client: disabled } = make({}, { enabled: false });
    expect(getWechatPageReplay()).toBeUndefined();
    expect(disabled.isActiveRuntime()).toBe(false);
  });
  it('公开发送边界异常安全失败，随后仍可录制；节点无变化不重复排放', async () => {
    const { client, replay } = make();
    await replay.capture();
    const metadata = vi.spyOn(client, 'getSdkMetadata').mockImplementationOnce(() => {
      throw new Error('unreadable metadata');
    });
    expect(await replay.flush()).toBe(false);
    expect(replay.getDiagnostics().reason).toBe('send_failed');
    metadata.mockRestore();
    const send = vi
      .spyOn(client, 'sendEnvelope')
      .mockRejectedValueOnce(new Error('custom client rejected'));
    expect(await replay.flush()).toBe(false);
    result = [
      { width: 375, height: 700 },
      [{ left: 20, top: 20, width: 10, height: 10, dataset: {} }],
    ];
    await replay.capture();
    send.mockImplementationOnce(() => {
      throw new Error('hook exception');
    });
    expect(await replay.flush()).toBe(false);
    send.mockRestore();
    result = [
      { width: 375, height: 700 },
      [{ left: 30, top: 20, width: 10, height: 10, dataset: {} }],
    ];
    await replay.capture();
    expect(await replay.flush()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(recordings()).toHaveLength(1);
  });
  it('宿主在注册监听时同步关闭 client，半安装资源也立即释放', () => {
    host.onAppShow = (callback: () => void) => {
      (getCurrentScope().getClient() as MiniappClient).dispose();
      callback();
    };
    const { client } = make();
    expect(client.isActiveRuntime()).toBe(false);
    expect(getWechatPageReplay()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('重复启动与新快照到时排放保持同一录制身份', async () => {
    const { replay } = make({ intervalMs: 10000, flushIntervalMs: 1000 });
    const id = replay.getReplayId();
    expect(replay.start()).toBe(true);
    expect(replay.getReplayId()).toBe(id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await replay.capture()).toBe(true);
    expect(recordings()).toHaveLength(1);
  });
  it('满段后的点击不能越过字节预算；容量排放中的关闭取消下一帧', async () => {
    const nodes = Array.from({ length: 20 }, (_, index) => ({
      left: index,
      top: index,
      width: 200,
      height: 48,
      dataset: { sentryReplayText: 'a'.repeat(256) },
    }));
    result = [{ width: 375, height: 700 }, nodes];
    const frame = projectFrame(result, 'pages/replay/index', 200)!;
    const capacity = utf8ByteLength(JSON.stringify(frameEvents(frame, Date.now()))) + 140;
    const { client, replay } = make({ maxSegmentBytes: capacity });
    expect(await replay.capture()).toBe(true);
    expect(await replay.flush()).toBe(true);
    addBreadcrumb({ category: 'user.interaction', data: { eventType: 'tap', x: 30, y: 50 } });
    expect(replay.getDiagnostics().reason).toBe('segment_full');
    expect(replay.getDiagnostics().bufferedBytes).toBeLessThan(capacity);
    nodes[0].left += 10;
    expect(await replay.capture()).toBe(true);
    client.on('beforeEnvelope', () => client.dispose());
    nodes[0].left += 10;
    expect(await replay.capture()).toBe(false);
    expect(replay.getDiagnostics().bufferedBytes).toBe(0);
  });
  it('缺少 DSN 的 client 不会发送录制', async () => {
    const { replay } = make({}, { dsn: undefined });
    expect(replay).toBeUndefined();
    expect(envelopes).toEqual([]);
  });

  it('异步 processor 跨过前后台切换时，错误仍关联捕获时的录制', async () => {
    const { client, replay } = make();
    await replay.capture();
    const capturedId = replay.getReplayId();
    let complete!: (event: Event) => void;
    client.addEventProcessor(
      (event) =>
        new Promise<Event>((resolve) => {
          complete = () => resolve(event);
        }),
    );
    client.captureException(new Error('captured before hide'));
    hide();
    show();
    await replay.capture();
    expect(replay.getReplayId()).not.toBe(capturedId);
    complete({});
    await vi.advanceTimersByTimeAsync(5);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0].tags?.replayId).toBe(capturedId);
    expect(collectEnvelopePayloads<ReplayEvent>(envelopes, ['replay_event'])[0].error_ids).toEqual(
      [],
    );
  });
});
