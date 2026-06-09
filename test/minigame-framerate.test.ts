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

jest.mock('@sentry/core', () => ({
  addBreadcrumb: mockAddBreadcrumb,
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
  });

  it('会话无帧时 onHide 不发汇总 transaction', () => {
    const integration = new MinigameFrameRateIntegration({ reportInterval: 1000 });
    integration.setupOnce();
    // 未跨窗口、无帧累积进会话
    hideCb!();
    expect(mockStartInactiveSpan).not.toHaveBeenCalled();
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
});
