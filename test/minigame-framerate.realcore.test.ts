import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as crossPlatform from '../src/crossPlatform';
import { init } from '../src/index';
import {
  getClient,
  getCurrentScope,
  getIsolationScope,
  captureException,
  flush,
  type Envelope,
  type Event,
} from '@sentry/core';
import type { MinigameFrameRateOptions } from '../src/types';
import {
  assertDefined,
  collectEnvelopePayloads,
  collectSpans,
  createCapturingTransport,
  spanAttribute,
} from './support/envelopes';

/**
 * 与 minigame-framerate.test.ts 不同：此文件**不 mock** `@sentry/core`，而是用真实
 * init → tracing → 自定义 transport，验证「会话汇总」确实产出合法 segment span，
 * 且分档指标真的挂在汇总 span 的属性上（堵住「全 mock 只验调用形状」的盲区）。
 */
describe('MinigameFrameRateIntegration（真 @sentry/core 集成）', () => {
  const g = global as any;
  let rafCallback: (() => void) | null;
  let clock: number;
  let savedRaf: any;
  const hideHandlers = new Set<() => void>();
  const hideCb = (): void => {
    for (const handler of [...hideHandlers]) handler();
  };
  let captured: Envelope[];

  function frame(t: number): void {
    clock = t;
    const cb = rafCallback;
    rafCallback = null;
    if (cb) cb();
  }

  function startFrameRate(options: MinigameFrameRateOptions) {
    return init({
      dsn: 'https://test@example.com/1',
      tracesSampleRate: 1,
      enableAutoSessionTracking: false,
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: true,
      minigameFrameRateOptions: options,
      transport: createCapturingTransport(captured),
    })!;
  }

  async function captureFrameRateEvent(): Promise<Event> {
    const client = getClient()!;
    client.captureMessage(`frame rate configuration probe ${clock}`);
    await client.flush();
    return collectEnvelopePayloads<Event>(captured, ['event']).at(-1)!;
  }

  beforeEach(() => {
    rafCallback = null;
    clock = 0;
    hideHandlers.clear();
    captured = [];
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();

    savedRaf = g.requestAnimationFrame;
    g.requestAnimationFrame = vi.fn((cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    // 平台 sdk：通过环境检测、捕获 onHide、提供默认集成所需的 wx.* API。
    g.wx = {
      request: vi.fn(),
      getSystemInfo: vi.fn(),
      getNetworkType: vi.fn(),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      onMemoryWarning: vi.fn(),
      onHide: vi.fn((cb: any) => {
        hideHandlers.add(cb);
      }),
      onShow: vi.fn(),
      offHide: vi.fn((cb: () => void) => hideHandlers.delete(cb)),
      offShow: vi.fn(),
    };

    vi.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
    vi.spyOn(crossPlatform, 'epochNow').mockReturnValue(1700000000000);
  });

  it.each([0, -1, NaN, Infinity])(
    '无效 fpsWarningThreshold=%s 回落 30，保留正常警告边界',
    async (value) => {
      startFrameRate({ fpsWarningThreshold: value, reportInterval: 80 });
      frame(40);
      frame(80); // 25 FPS 应 warning。
      frame(100);
      frame(120);
      frame(140);
      frame(160); // 50 FPS 应 info。
      const event = await captureFrameRateEvent();
      const reports = event.breadcrumbs?.filter(
        (breadcrumb) => breadcrumb.category === 'minigame.framerate',
      );
      expect(reports?.map((breadcrumb) => [breadcrumb.data?.fps, breadcrumb.level])).toEqual([
        [25, 'warning'],
        [50, 'info'],
      ]);
    },
  );

  it.each([0, -1, NaN, Infinity])(
    '无效 longFrameThresholdMs=%s 回落 50，汇总保留真实 jank',
    async (value) => {
      startFrameRate({ longFrameThresholdMs: value });
      frame(20);
      frame(100); // 20ms 正常，80ms 计一次 jank。
      hideCb();
      const event = await captureFrameRateEvent();
      const summary = collectSpans(captured).find(
        (span) => span.name === 'minigame.framerate.summary',
      );
      assertDefined(summary);
      expect(spanAttribute(summary, 'frames.total')).toBe(2);
      expect(spanAttribute(summary, 'jank.count')).toBe(1);
      expect(
        event.breadcrumbs?.filter((breadcrumb) => breadcrumb.category === 'minigame.jank'),
      ).toHaveLength(1);
    },
  );

  it.each([0, -1, NaN, Infinity])(
    '无效 reportInterval=%s 回落 10000，不逐帧报告或重置节流',
    async (value) => {
      startFrameRate({ reportInterval: value, maxJankBreadcrumbsPerWindow: 0 });
      frame(100);
      frame(200);
      const early = await captureFrameRateEvent();
      expect(early.contexts?.['minigame.framerate']).toBeUndefined();
      expect(
        early.breadcrumbs?.some((breadcrumb) => breadcrumb.category === 'minigame.framerate'),
      ).toBeFalsy();
      frame(5000);
      frame(10000);
      const reported = await captureFrameRateEvent();
      expect(reported.contexts?.['minigame.framerate']?.frames).toBe(4);
      expect(
        reported.breadcrumbs?.filter((breadcrumb) => breadcrumb.category === 'minigame.framerate'),
      ).toHaveLength(1);
      expect(
        reported.breadcrumbs?.some((breadcrumb) => breadcrumb.category === 'minigame.jank'),
      ).toBeFalsy();
      hideCb();
      const summary = collectSpans(captured).find(
        (span) => span.name === 'minigame.framerate.summary',
      );
      assertDefined(summary);
      expect(spanAttribute(summary, 'jank.count')).toBe(4); // 0 只关闭面包屑，不关闭统计。
    },
  );

  it('FPS、单帧阈值和窗口允许有限正小数，精确保留报告边界', async () => {
    startFrameRate({
      fpsWarningThreshold: 30.5,
      longFrameThresholdMs: 50.5,
      reportInterval: 100.5,
    });
    frame(50);
    frame(100);
    expect((await captureFrameRateEvent()).contexts?.['minigame.framerate']).toBeUndefined();
    frame(100.5);
    const event = await captureFrameRateEvent();
    expect(event.contexts?.['minigame.framerate']?.frames).toBe(3);
    expect(event.breadcrumbs).toContainEqual(
      expect.objectContaining({ category: 'minigame.framerate', level: 'warning' }),
    );
    frame(151.25); // 50.75ms 超过 50.5，之前两帧 50ms 不计 jank。
    hideCb();
    const summary = collectSpans(captured).find(
      (span) => span.name === 'minigame.framerate.summary',
    );
    assertDefined(summary);
    expect(spanAttribute(summary, 'jank.count')).toBe(1);
  });

  it('jankLevels 保留有限正小数及严格超过阈值的最高档分类', async () => {
    startFrameRate({ jankLevels: { minor: 16.5, major: 33.5, severe: 100.5 } });
    frame(16.5); // 等于阈值，不计入。
    frame(33.25); // 16.75 → minor。
    frame(67); // 33.75 → major。
    frame(167.75); // 100.75 → severe。
    hideCb();
    const event = await captureFrameRateEvent();
    expect(
      event.breadcrumbs
        ?.filter((breadcrumb) => breadcrumb.category === 'minigame.jank')
        .map((breadcrumb) => breadcrumb.data?.jankLevel),
    ).toEqual(['minor', 'major', 'severe']);
    const summary = collectSpans(captured).find(
      (span) => span.name === 'minigame.framerate.summary',
    );
    assertDefined(summary);
    expect(spanAttribute(summary, 'jank.count')).toBe(3);
    for (const name of ['minor', 'major', 'severe'])
      expect(spanAttribute(summary, `jank.${name}`)).toBe(1);
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    g.requestAnimationFrame = savedRaf;
    vi.restoreAllMocks();
    delete g.wx;
  });

  it('onHide 返回前同步发出帧率汇总 segment span（含分档属性）', () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      tracesSampleRate: 1.0,
      enableMinigameFrameRate: true,
      minigameFrameRateOptions: {
        reportInterval: 10000,
        jankLevels: { minor: 17, major: 33, severe: 100 },
      },
      transport: createCapturingTransport(captured),
    } as any);

    // setup(client) 已在 init 内执行：rAF loop 与 onHide 都应已注册。
    expect(rafCallback).not.toBeNull();
    expect(hideHandlers.size).toBeGreaterThan(0);

    frame(20); // delta 20 → minor（17<20≤33）
    frame(85); // delta 65 → major（33<65≤100）
    frame(285); // delta 200 → severe（>100）

    hideCb(); // 退后台后 JS 线程可能立即冻结，transport 必须已收到汇总 span。

    // stream 生命周期靠 core flush 时同步 drain 的 span buffer 发出，断言不能等 tick。
    const summary = collectSpans(captured).find(
      (span) => span.name === 'minigame.framerate.summary',
    );
    assertDefined(summary);
    expect(summary.is_segment).toBe(true);
    expect(spanAttribute(summary, 'sentry.op')).toBe('ui.framerate');
    expect(spanAttribute(summary, 'jank.count')).toBe(3); // 总数
    expect(spanAttribute(summary, 'jank.minor')).toBe(1);
    expect(spanAttribute(summary, 'jank.major')).toBe(1);
    expect(spanAttribute(summary, 'jank.severe')).toBe(1);
    expect(spanAttribute(summary, 'fps.avg')).toEqual(expect.any(Number));
    expect(spanAttribute(summary, 'frames.total')).toEqual(expect.any(Number));
  });

  it('client.close() 执行集成通过 setup(client) 注册的 cleanup', async () => {
    const cleanupSpy = vi.fn();
    const probe = {
      name: 'CleanupProbe',
      setupOnce() {},
      setup(client: { registerCleanup: (callback: () => void) => void }) {
        client.registerCleanup(cleanupSpy);
      },
    };
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      integrations: [probe],
      transport: createCapturingTransport(captured),
    } as any);

    expect(client).toBeDefined();
    await client!.close(0);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('ignoreErrors 经 EventFilters 生效：匹配错误被丢弃、其余保留', async () => {
    const captured: Envelope[] = [];
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      ignoreErrors: ['DropThisError'],
      transport: createCapturingTransport(captured),
    } as any);

    captureException(new Error('DropThisError boom'));
    captureException(new Error('KeepThisError ok'));
    await flush(2000);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const values = collectEnvelopePayloads<Event>(captured, ['event'])
      .map((event) => event.exception?.values?.[0]?.value)
      .filter((value): value is string => typeof value === 'string');
    expect(values.some((v) => v.includes('KeepThisError'))).toBe(true);
    expect(values.some((v) => v.includes('DropThisError'))).toBe(false);
  });
});
