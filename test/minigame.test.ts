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
import { MinigameIntegration } from '../src/integrations/minigame';

describe('MinigameIntegration', () => {
  const g = global as any;
  let rafCallback: (() => void) | null;
  let clock: number;
  let showCb: ((res: any) => void) | null;
  let hideCb: (() => void) | null;
  let savedRaf: any;

  beforeEach(() => {
    jest.clearAllMocks();
    rafCallback = null;
    showCb = null;
    hideCb = null;
    clock = 1000;

    savedRaf = g.requestAnimationFrame;
    g.requestAnimationFrame = jest.fn((cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    jest.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
    jest.spyOn(crossPlatform, 'sdk').mockReturnValue({
      request: jest.fn(),
      getLaunchOptionsSync: () => ({ scene: 1001, path: 'game.js', query: { a: '1' } }),
      onShow: jest.fn((cb: any) => {
        showCb = cb;
      }),
      onHide: jest.fn((cb: any) => {
        hideCb = cb;
      }),
      offShow: jest.fn(),
      offHide: jest.fn(),
    } as any);
  });

  afterEach(() => {
    g.requestAnimationFrame = savedRaf;
    jest.restoreAllMocks();
  });

  it('记录启动场景上下文与冷启动面包屑', () => {
    new MinigameIntegration().setupOnce();

    expect(mockSetContext).toHaveBeenCalledWith(
      'minigame',
      expect.objectContaining({ runtime: 'minigame', scene: 1001, path: 'game.js' }),
    );
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'minigame.launch' }),
    );
  });

  it('用首帧 requestAnimationFrame 计算冷启动耗时', () => {
    const integration = new MinigameIntegration(); // 构造时 now()=1000
    integration.setupOnce();
    expect(rafCallback).not.toBeNull();

    clock = 1150; // 首帧
    rafCallback!();

    expect(mockSetContext).toHaveBeenCalledWith(
      'minigame',
      expect.objectContaining({ coldStartMs: 150 }),
    );
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'minigame.performance', data: { coldStartMs: 150 } }),
    );
  });

  it('启动阶段系统时钟回拨时，冷启动耗时夹为 0（不报负数）', () => {
    const integration = new MinigameIntegration(); // 构造时 now()=1000
    integration.setupOnce();

    clock = 950; // 首帧前系统时钟回拨 → firstFrameTs < initTs
    rafCallback!();

    expect(mockSetContext).toHaveBeenCalledWith(
      'minigame',
      expect.objectContaining({ coldStartMs: 0 }),
    );
  });

  it('冷启动上报不覆盖启动场景上下文（setContext 合并）', () => {
    const integration = new MinigameIntegration();
    integration.setupOnce();
    clock = 1150;
    rafCallback!();

    // 首帧后的 minigame 上下文应同时保留 scene 与 coldStartMs
    expect(mockSetContext).toHaveBeenLastCalledWith(
      'minigame',
      expect.objectContaining({ scene: 1001, path: 'game.js', coldStartMs: 150 }),
    );
  });

  it('首帧发独立冷启动 transaction（epoch 锚点 + cold_start measurement）', () => {
    // Date.now 被 test/setup 固定为 1640995200000（2022-01-01）；now() 被 spy 为 clock。
    const EPOCH = 1640995200000;
    const integration = new MinigameIntegration(); // 构造 now()=1000、Date.now()=EPOCH
    integration.setupOnce();
    clock = 1150; // 首帧（单调 delta = 150ms）
    rafCallback!();

    expect(mockStartInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'minigame.coldstart',
        op: 'app.start',
        forceTransaction: true,
        startTime: EPOCH / 1000, // 用 epoch 锚点，而非单调时钟
      }),
    );
    // 防回归：span 绝对时间必须是真实 epoch（≫ 1），不能是单调时钟的小数值（会落到 1970）
    const startTimeArg = (mockStartInactiveSpan.mock.calls[0]![0] as any).startTime;
    expect(startTimeArg).toBeGreaterThan(1e9);

    expect(mockSetMeasurement).toHaveBeenCalledWith('cold_start', 150, 'millisecond', expect.anything());
    expect(mockSpanEnd).toHaveBeenCalledWith((EPOCH + 150) / 1000); // 时长 = 单调测得的 150ms
  });

  it('首帧只上报一次冷启动', () => {
    const integration = new MinigameIntegration();
    integration.setupOnce();
    clock = 1100;
    rafCallback!();
    const calls = mockAddBreadcrumb.mock.calls.filter(
      (c: any) => c[0] && c[0].category === 'minigame.performance',
    ).length;
    rafCallback!(); // 再次触发不应重复
    const calls2 = mockAddBreadcrumb.mock.calls.filter(
      (c: any) => c[0] && c[0].category === 'minigame.performance',
    ).length;
    expect(calls).toBe(1);
    expect(calls2).toBe(1);
  });

  it('onShow / onHide 产生生命周期面包屑', () => {
    new MinigameIntegration().setupOnce();
    expect(showCb).not.toBeNull();
    expect(hideCb).not.toBeNull();

    showCb!({ scene: 1007 });
    hideCb!();

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'minigame.lifecycle', data: { scene: 1007 } }),
    );
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'minigame.lifecycle',
        message: expect.stringContaining('onHide'),
      }),
    );
  });

  it('cleanup 调用 offShow / offHide', () => {
    const integration = new MinigameIntegration();
    integration.setupOnce();
    integration.cleanup();
    const miniappSdk = crossPlatform.sdk();
    expect(miniappSdk.offShow).toHaveBeenCalled();
    expect(miniappSdk.offHide).toHaveBeenCalled();
  });

  it('无 requestAnimationFrame 时不报错', () => {
    delete g.requestAnimationFrame;
    expect(() => new MinigameIntegration().setupOnce()).not.toThrow();
  });
});
