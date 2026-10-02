import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flush,
  getClient,
  installedIntegrations,
  startInactiveSpan,
  type Envelope,
  type StreamedSpanJSON,
} from '@sentry/core';
import { init } from '../src/index';
import {
  assertDefined,
  collectEnvelopePayloads,
  collectSpans,
  createCapturingTransport,
  spanAttribute,
} from './support/envelopes';

/**
 * 用真实 @sentry/core 验证默认性能集成的完整链路，避免工厂多返回一层函数时
 * 单测只检查类方法、却没有发现 core 根本未安装集成的盲区。
 */
describe('PerformanceIntegration（真 @sentry/core 集成）', () => {
  const g = global as any;
  let observerCallback: ((entries: any[]) => void) | undefined;
  let captured: Envelope[];

  beforeEach(() => {
    observerCallback = undefined;
    captured = [];
    // 复位进程级 setupOnce 去重表，让每条用例都按「首次安装」跑一遍集成装配。
    installedIntegrations.length = 0;

    g.wx = {
      request: vi.fn(),
      getSystemInfo: vi.fn(),
      getSystemInfoSync: vi.fn(() => ({ platform: 'ios' })),
      getPerformance: vi.fn(() => ({
        getEntries: vi.fn(() => []),
        getEntriesByType: vi.fn(() => []),
        getEntriesByName: vi.fn(() => []),
        mark: vi.fn(),
        measure: vi.fn(),
        clearMarks: vi.fn(),
        clearMeasures: vi.fn(),
        createObserver: vi.fn((callback: (entries: any[]) => void) => {
          observerCallback = callback;
          return {
            observe: vi.fn(),
            disconnect: vi.fn(),
          };
        }),
      })),
      onError: vi.fn(),
      onUnhandledRejection: vi.fn(),
      onMemoryWarning: vi.fn(),
    };
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    delete g.wx;
  });

  it('小游戏宿主仅提供 performance.now 时默认集成静默 no-op', async () => {
    g.wx.getPerformance = vi.fn(() => ({ now: vi.fn(() => 1) }));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      tracesSampleRate: 1,
      transport: createCapturingTransport(captured),
    } as any);

    const performance = client?.getIntegrationByName?.('PerformanceAPI') as any;
    expect(performance).toBeDefined();
    expect(performance._observers).toEqual([]);
    expect(performance._reportTimer).toBeNull();
    expect(
      consoleSpy.mock.calls.some((call) =>
        String(call[0]).includes('Failed to setup performance observers'),
      ),
    ).toBe(false);

    // 反向对照：维度只在装配成功时登记到本 client，所以这里拿到的 span 不该带 performance.*，
    // 也就证明下一条用例里的断言不是「属性反正都在」。
    startInactiveSpan({ name: 'degraded.host', parentSpan: null }).end();
    await flush(2000);
    const degraded = collectSpans(captured).find((span) => span.name === 'degraded.host');
    assertDefined(degraded, '未产出对照 span');
    expect(spanAttribute(degraded, 'performance.api.available')).toBeUndefined();

    consoleSpy.mockRestore();
  });

  it('默认集成接收微信性能条目后发出 navigation segment span', async () => {
    const beforeSendSpan = vi.fn((span: StreamedSpanJSON) => span);

    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      tracesSampleRate: 1,
      beforeSendSpan,
      transport: createCapturingTransport(captured),
    } as any);

    expect(client?.getIntegrationByName?.('PerformanceAPI')).toBeDefined();
    expect(observerCallback).toBeDefined();

    observerCallback!([
      {
        name: 'appLaunch',
        entryType: 'navigation',
        // 微信 PerformanceEntry 通常是相对运行时起点，不是 epoch 毫秒。
        startTime: 250,
        duration: 120,
      },
    ]);
    await flush(2000);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const spans = collectSpans(captured);
    const segments = spans.filter((span) => span.is_segment);
    expect(segments).toHaveLength(1);
    const root = segments[0]!;
    expect(root.name).toBe('Navigation: appLaunch');
    expect(spanAttribute(root, 'sentry.op')).toBe('navigation');
    expect(spanAttribute(root, 'performance.entry_count')).toBe(1);
    // 首次安装就要带上本集成登记的维度：它们走 setup(client) 绑定，不能等下一次 init 才生效。
    expect(spanAttribute(root, 'performance.api.available')).toBe(true);
    expect(spanAttribute(root, 'performance.integration')).toBe('enabled');
    expect(root.start_timestamp).toBeGreaterThan(1_000_000_000);
    expect(root.end_timestamp).toBeGreaterThanOrEqual(root.start_timestamp);

    // 换成 stream 后链路结构不丢：每个性能条目仍是挂在同一条 trace 上的子 span。
    const children = spans.filter((span) => !span.is_segment);
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((span) => span.parent_span_id === root.span_id)).toBe(true);
    expect(children.some((span) => spanAttribute(span, 'sentry.op') === 'navigation')).toBe(true);
    expect(beforeSendSpan).toHaveBeenCalled();
    // stream 生命周期不再产出 transaction 事件（beforeSendTransaction / ignoreTransactions 失效）。
    expect(collectEnvelopePayloads(captured, ['transaction'])).toEqual([]);
  });
});
