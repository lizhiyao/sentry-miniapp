import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as crossPlatform from '../src/crossPlatform';
import { init } from '../src/index';
import { getClient, captureException, flush, type Envelope, type Event } from '@sentry/core';
import {
  assertDefined,
  collectEnvelopePayloads,
  collectSpans,
  createCapturingTransport,
  spanAttribute,
} from './support/envelopes';

/**
 * 与 minigame-framerate.test.ts 不同：此文件**不 mock** `@sentry/core`，而是用真实
 * init → tracing → 自定义 transport，验证「会话汇总」确实产出一条合法 transaction，
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

  beforeEach(() => {
    rafCallback = null;
    clock = 0;
    hideHandlers.clear();
    captured = [];

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

    // setupOnce 已在 init 内执行：rAF loop 与 onHide 都应已注册。
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
