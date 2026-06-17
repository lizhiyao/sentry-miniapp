import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

const mockAddBreadcrumb = jest.fn();
const mockSetContext = jest.fn();
const mockSpanEnd = jest.fn((..._args: any[]) => {});
const mockSpanSetAttributes = jest.fn((..._args: any[]) => {});
const mockStartInactiveSpan = jest.fn((..._args: any[]) => ({
  setAttributes: mockSpanSetAttributes,
  end: mockSpanEnd,
}));
const mockSetMeasurement = jest.fn((..._args: any[]) => {});
const mockFlush = jest.fn((_timeout?: number) => Promise.resolve(true));

jest.mock('@sentry/core', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  flush: mockFlush,
  setContext: mockSetContext,
  startInactiveSpan: mockStartInactiveSpan,
  setMeasurement: mockSetMeasurement,
}));

import * as crossPlatform from '../src/crossPlatform';
import { MinigameFrameRateIntegration } from '../src/integrations/minigame-framerate';

describe('MinigameFrameRateIntegration', () => {
  const g = global as any;
  let rafCallback: (() => void) | null;
  let clock: number;
  let savedRaf: any;
  let hideCb: (() => void) | null;
  let showCb: (() => void) | null;

  function frame(t: number): void {
    clock = t;
    // loop 会在执行时重新注册下一帧，rafCallback 会被刷新
    const cb = rafCallback;
    rafCallback = null;
    cb!();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    rafCallback = null;
    clock = 0;
    hideCb = null;
    showCb = null;

    savedRaf = g.requestAnimationFrame;
    g.requestAnimationFrame = jest.fn((cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    jest.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
    jest.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: jest.fn(),
      onHide: jest.fn((cb: any) => {
        hideCb = cb;
      }),
      onShow: jest.fn((cb: any) => {
        showCb = cb;
      }),
      offHide: jest.fn(),
      offShow: jest.fn(),
    } as any);
  });

  afterEach(() => {
    g.requestAnimationFrame = savedRaf;
    jest.restoreAllMocks();
  });

  it('长帧触发 jank 面包屑，周期到达时上报 framerate', () => {
    const integration = new MinigameFrameRateIntegration({
      longFrameThresholdMs: 50,
      reportInterval: 1000,
      fpsWarningThreshold: 30,
    });
    integration.setupOnce(); // windowStart=0, lastFrame=0

    frame(20); // delta 20，正常
    frame(40); // delta 20，正常
    frame(900); // delta 860 → jank #1
    frame(1010); // delta 110 → jank #2；t-windowStart=1010>=1000 → 上报

    const jankCrumbs = mockAddBreadcrumb.mock.calls.filter(
      (c: any) => c[0] && c[0].category === 'minigame.jank',
    );
    expect(jankCrumbs.length).toBe(2);

    expect(mockSetContext).toHaveBeenCalledWith(
      'minigame.framerate',
      expect.objectContaining({ jankCount: 2, frames: 4 }),
    );
    // fps 远低于阈值 → 上报面包屑应为 warning
    const perfCrumb = mockAddBreadcrumb.mock.calls.find(
      (c: any) => c[0] && c[0].category === 'minigame.framerate',
    );
    expect((perfCrumb?.[0] as any)?.level).toBe('warning');
  });

  it('jank 面包屑按窗口限频，但 jankCount 如实统计', () => {
    const integration = new MinigameFrameRateIntegration({
      longFrameThresholdMs: 50,
      reportInterval: 1000,
      maxJankBreadcrumbsPerWindow: 2,
    });
    integration.setupOnce();

    frame(100); // delta 100 → jank #1（面包屑 1）
    frame(200); // delta 100 → jank #2（面包屑 2）
    frame(300); // delta 100 → jank #3（超限，仅计数）
    frame(1100); // delta 800 → jank #4（超限）；窗口到达 → 上报

    const jankCrumbs = mockAddBreadcrumb.mock.calls.filter(
      (c: any) => c[0] && c[0].category === 'minigame.jank',
    );
    expect(jankCrumbs.length).toBe(2); // 限频到 2 条

    expect(mockSetContext).toHaveBeenCalledWith(
      'minigame.framerate',
      expect.objectContaining({ jankCount: 4 }), // 实际 jank 全部计入
    );
  });

  it('onHide 发会话汇总 transaction（measurements），且不每窗口发事件', () => {
    const integration = new MinigameFrameRateIntegration({ reportInterval: 1000 });
    integration.setupOnce();

    frame(20);
    frame(40);
    frame(1010); // 跨窗口 → _report 累积进会话

    // 窗口上报阶段不应产生任何 transaction
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();

    // 退后台 → 发一个汇总 transaction
    expect(hideCb).not.toBeNull();
    hideCb!();

    expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
    expect(mockStartInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'minigame.framerate.summary',
        op: 'ui.framerate',
        forceTransaction: true,
        startTime: 1640995200000 / 1000, // epoch 锚点（Date.now mock），而非单调时钟的 0
      }),
    );
    // 防回归：绝对时间是真实 epoch，不会落到 1970
    const startTimeArg = (mockStartInactiveSpan.mock.calls[0]![0] as any).startTime;
    expect(startTimeArg).toBeGreaterThan(1e9);
    const measured = mockSetMeasurement.mock.calls.map((c: any) => c[0]);
    expect(measured).toEqual(expect.arrayContaining(['fps_avg', 'fps_p95', 'fps_min', 'jank_count']));
    expect(mockSpanEnd).toHaveBeenCalled();
    expect(mockFlush).toHaveBeenCalledWith(2000);
  });

  it('onHide 会先并入未满窗口，再发会话汇总 transaction', () => {
    const integration = new MinigameFrameRateIntegration({ reportInterval: 1000 });
    integration.setupOnce();

    // 约 60fps 的短会话，尚未跨过 reportInterval。
    for (let t = 16; t <= 496; t += 16) {
      frame(t);
    }
    clock = 500;
    hideCb!();

    expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
    expect(mockSpanSetAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'frames.total': 31,
        'fps.avg': 63,
      }),
    );
    expect(mockSetMeasurement).toHaveBeenCalledWith('fps_avg', 63, 'none', expect.anything());
    expect(mockFlush).toHaveBeenCalledWith(2000);
  });

  it('会话无帧时 onHide 不发汇总 transaction', () => {
    const integration = new MinigameFrameRateIntegration({ reportInterval: 1000 });
    integration.setupOnce();
    // 未跨窗口、无帧累积进会话
    hideCb!();
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('onShow 重置会话累积（重置后无帧则 onHide 不发汇总）', () => {
    const integration = new MinigameFrameRateIntegration({ reportInterval: 1000 });
    integration.setupOnce();
    frame(20);
    frame(1010); // 累积进会话
    showCb!(); // 回前台 → 重置会话
    hideCb!(); // 重置后无新帧
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
  });

  it('回前台不把退后台间隔计为卡顿帧（恢复间隔不污染新会话）', () => {
    const integration = new MinigameFrameRateIntegration({
      longFrameThresholdMs: 50,
      reportInterval: 1000,
    });
    integration.setupOnce(); // lastFrame=0
    frame(20); // 退后台前最后一帧
    hideCb!(); // 退后台（RAF 在真机会暂停）

    jest.clearAllMocks();
    // 后台经过很久（10 分钟）后回前台
    clock = 600000;
    showCb!(); // onShow：基线对齐到 600000，排除后台间隔
    frame(600016); // 回前台第一帧：delta 应为 16ms，而非 599996ms

    const jankCrumbs = mockAddBreadcrumb.mock.calls.filter(
      (c: any) => c[0] && c[0].category === 'minigame.jank',
    );
    expect(jankCrumbs.length).toBe(0); // 后台间隔不得被误判为卡顿
  });

  it('异常超大 frame delta 视为采样断点，不污染 FPS 与 summary duration', () => {
    const integration = new MinigameFrameRateIntegration({
      longFrameThresholdMs: 50,
      reportInterval: 1000,
    });
    integration.setupOnce();

    frame(16);
    frame(32);
    frame(120000); // 超过 sanity 上限：应并入断点前窗口并重置，不按一帧 119968ms 统计
    frame(120016);
    clock = 120032;
    hideCb!();

    const jankCrumbs = mockAddBreadcrumb.mock.calls.filter(
      (c: any) => c[0] && c[0].category === 'minigame.jank',
    );
    expect(jankCrumbs.length).toBe(0);
    expect(mockSpanSetAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'frames.total': 3,
        'fps.avg': 63,
        'frame.worst_ms': 16,
      }),
    );
    expect(mockSpanEnd).toHaveBeenCalledWith((1640995200000 + 48) / 1000);
  });

  it('cleanup 后停止采样循环', () => {
    const integration = new MinigameFrameRateIntegration({ reportInterval: 1000 });
    integration.setupOnce();
    integration.cleanup();

    const rafCalls = (g.requestAnimationFrame as jest.Mock).mock.calls.length;
    // 调用已捕获的 loop：因 _running=false，应立即返回且不再注册新帧
    clock = 10;
    rafCallback && rafCallback();
    expect((g.requestAnimationFrame as jest.Mock).mock.calls.length).toBe(rafCalls);
  });

  it('无 requestAnimationFrame 时安全降级（不报错、不注册）', () => {
    delete g.requestAnimationFrame;
    const integration = new MinigameFrameRateIntegration();
    expect(() => integration.setupOnce()).not.toThrow();
  });

  // ---- 分级卡顿（jankLevels）----

  /** 把 setMeasurement 调用收敛成 { 名称: 值 } 便于断言。 */
  function measurements(): Record<string, number> {
    return Object.fromEntries(
      (mockSetMeasurement.mock.calls as any[]).map((c) => [c[0], c[1]]),
    );
  }
  /** 取所有 minigame.jank 面包屑的 jankLevel（保持触发顺序）。 */
  function jankLevels(): Array<string | undefined> {
    return mockAddBreadcrumb.mock.calls
      .filter((c: any) => c[0] && c[0].category === 'minigame.jank')
      .map((c: any) => c[0].data?.jankLevel);
  }

  it('jankLevels 按命中最高档归类：面包屑带 jankLevel，summary 增发三档计数', () => {
    const integration = new MinigameFrameRateIntegration({
      reportInterval: 10000,
      jankLevels: { minor: 17, major: 33, severe: 100 },
    });
    integration.setupOnce(); // lastFrame=0

    frame(10); // delta 10 → 正常（≤17）
    frame(35); // delta 25 → minor（17<25≤33）
    frame(85); // delta 50 → major（33<50≤100）
    frame(285); // delta 200 → severe（>100）

    expect(jankLevels()).toEqual(['minor', 'major', 'severe']);

    hideCb!(); // 退后台 → 发会话汇总
    const m = measurements();
    expect(m['jank_count']).toBe(3); // 总数不变
    expect(m['jank_minor_count']).toBe(1);
    expect(m['jank_major_count']).toBe(1);
    expect(m['jank_severe_count']).toBe(1);
    // span attribute 也带分档
    expect(mockSpanSetAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'jank.minor': 1 }),
    );
  });

  it('jankLevels 可只启用部分档：入档阈值取最低启用档，未启用档不发 measurement', () => {
    const integration = new MinigameFrameRateIntegration({
      reportInterval: 10000,
      jankLevels: { major: 33, severe: 100 }, // 不启用 minor，入档阈值=33
    });
    integration.setupOnce();

    frame(10); // delta 10 → 正常
    frame(40); // delta 30 → ≤33，不计 jank（minor 未启用）
    frame(90); // delta 50 → major
    frame(290); // delta 200 → severe

    expect(jankLevels()).toEqual(['major', 'severe']);

    hideCb!();
    const m = measurements();
    expect(m['jank_count']).toBe(2);
    expect(m['jank_major_count']).toBe(1);
    expect(m['jank_severe_count']).toBe(1);
    // 未启用的 minor 不应出现
    expect(mockSetMeasurement.mock.calls.map((c: any) => c[0])).not.toContain('jank_minor_count');
  });

  it('jankLevels 优先于 longFrameThresholdMs（老参数被忽略）', () => {
    const integration = new MinigameFrameRateIntegration({
      reportInterval: 10000,
      longFrameThresholdMs: 999, // 若生效则 30ms 帧不会被记为 jank
      jankLevels: { minor: 20 }, // 入档阈值应取 20
    });
    integration.setupOnce();

    frame(10); // delta 10 → 正常
    frame(40); // delta 30 → >20 → minor（证明 longFrameThresholdMs=999 被忽略）

    expect(jankLevels()).toEqual(['minor']);
    hideCb!();
    const m = measurements();
    expect(m['jank_count']).toBe(1);
    expect(m['jank_minor_count']).toBe(1);
  });

  it('jankLevels 为空对象时安全回退到单档 longFrameThresholdMs（无分级输出）', () => {
    const integration = new MinigameFrameRateIntegration({
      reportInterval: 10000,
      longFrameThresholdMs: 50,
      jankLevels: {}, // 无有效档 → 回退单档
    });
    integration.setupOnce();

    frame(10); // delta 10 → 正常
    frame(40); // delta 30 → ≤50 正常
    frame(140); // delta 100 → >50 → jank（无 level）

    const crumb = mockAddBreadcrumb.mock.calls.find(
      (c: any) => c[0] && c[0].category === 'minigame.jank',
    );
    expect((crumb?.[0] as any)?.data).not.toHaveProperty('jankLevel');

    hideCb!();
    const names = mockSetMeasurement.mock.calls.map((c: any) => c[0]);
    expect(names).toContain('jank_count');
    expect(names).not.toContain('jank_minor_count');
    expect(names).not.toContain('jank_major_count');
    expect(names).not.toContain('jank_severe_count');
  });

  it('jankLevels 非单调（名实不符）时 warn 并回退单档', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const integration = new MinigameFrameRateIntegration({
      reportInterval: 10000,
      longFrameThresholdMs: 50,
      jankLevels: { minor: 100, severe: 17 }, // 非单调：minor 阈值 > severe，名实反了
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('jankLevels'));

    integration.setupOnce();
    frame(10); // delta 10 → 正常
    frame(40); // delta 30 → ≤50（已回退单档阈值），不计 jank
    frame(140); // delta 100 → >50 → jank（单档行为，无 level）

    const crumb = mockAddBreadcrumb.mock.calls.find(
      (c: any) => c[0] && c[0].category === 'minigame.jank',
    );
    expect((crumb?.[0] as any)?.data).not.toHaveProperty('jankLevel');

    hideCb!();
    const names = mockSetMeasurement.mock.calls.map((c: any) => c[0]);
    expect(names).toContain('jank_count');
    expect(names.some((n: string) => /^jank_(minor|major|severe)_count$/.test(n))).toBe(false);
  });

  it('jankLevels 阈值相等（非严格递增）时 warn 并回退单档', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const integration = new MinigameFrameRateIntegration({
      reportInterval: 10000,
      jankLevels: { minor: 33, major: 33 }, // 相等 → 非严格递增
    });
    expect(warnSpy).toHaveBeenCalled();

    integration.setupOnce();
    frame(20); // delta 20 → 默认单档阈值 50 以下，不计 jank
    frame(120); // delta 100 → >50 → jank（无 level）

    hideCb!();
    const names = mockSetMeasurement.mock.calls.map((c: any) => c[0]);
    expect(names).not.toContain('jank_minor_count');
    expect(names).not.toContain('jank_major_count');
  });

  it('jankLevels 跨多窗口分档累积进会话汇总', () => {
    const integration = new MinigameFrameRateIntegration({
      reportInterval: 100, // 小窗口，迫使 _report 多次触发，验证跨窗口累积
      jankLevels: { minor: 17, major: 33, severe: 100 },
    });
    integration.setupOnce();

    frame(20); // delta 20 → minor（窗口1）
    frame(140); // delta 120 → severe（窗口1）；windowElapsed 140≥100 → _report 滚入会话
    frame(160); // delta 20 → minor（窗口2）
    frame(280); // delta 120 → severe（窗口2）；→ _report 再次滚入会话

    hideCb!(); // 末窗口为空，仅汇总已滚入会话的两窗口
    const m = measurements();
    expect(m['jank_count']).toBe(4); // 两窗口合计：2 minor + 2 severe
    expect(m['jank_minor_count']).toBe(2);
    expect(m['jank_severe_count']).toBe(2);
    expect(m['jank_major_count']).toBe(0); // 启用但本会话无命中 → 发 0
  });

  it('不传 jankLevels 时 summary 只有 jank_count，无任何分档 measurement（不回归）', () => {
    const integration = new MinigameFrameRateIntegration({ reportInterval: 10000 });
    integration.setupOnce();

    frame(20);
    frame(120); // delta 100 → 默认阈值 50 → jank（无 level）

    expect(jankLevels()).toEqual([undefined]); // 面包屑不带 jankLevel

    hideCb!();
    const names = mockSetMeasurement.mock.calls.map((c: any) => c[0]);
    expect(names).toContain('jank_count');
    expect(names.some((n: string) => /^jank_(minor|major|severe)_count$/.test(n))).toBe(false);
  });
});
