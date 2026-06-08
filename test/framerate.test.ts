import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

const mockAddBreadcrumb = jest.fn();
const mockSetContext = jest.fn();

jest.mock('@sentry/core', () => ({
  addBreadcrumb: mockAddBreadcrumb,
  setContext: mockSetContext,
}));

import * as crossPlatform from '../src/crossPlatform';
import { FrameRateIntegration } from '../src/integrations/framerate';

describe('FrameRateIntegration', () => {
  const g = global as any;
  let rafCallback: (() => void) | null;
  let clock: number;
  let savedRaf: any;

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

    savedRaf = g.requestAnimationFrame;
    g.requestAnimationFrame = jest.fn((cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    jest.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: jest.fn(),
      getPerformance: () => ({ now: () => clock }),
    } as any);
  });

  afterEach(() => {
    g.requestAnimationFrame = savedRaf;
    jest.restoreAllMocks();
  });

  it('长帧触发 jank 面包屑，周期到达时上报 minigame.performance', () => {
    const integration = new FrameRateIntegration({
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
      (c: any) => c[0] && c[0].category === 'ui.jank',
    );
    expect(jankCrumbs.length).toBe(2);

    expect(mockSetContext).toHaveBeenCalledWith(
      'minigame.performance',
      expect.objectContaining({ jankCount: 2, frames: 4 }),
    );
    // fps 远低于阈值 → 上报面包屑应为 warning
    const perfCrumb = mockAddBreadcrumb.mock.calls.find(
      (c: any) => c[0] && c[0].category === 'minigame.performance',
    );
    expect((perfCrumb?.[0] as any)?.level).toBe('warning');
  });

  it('cleanup 后停止采样循环', () => {
    const integration = new FrameRateIntegration({ reportInterval: 1000 });
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
    const integration = new FrameRateIntegration();
    expect(() => integration.setupOnce()).not.toThrow();
  });
});
