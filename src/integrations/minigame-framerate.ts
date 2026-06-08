import { addBreadcrumb, setContext } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { now } from '../crossPlatform';

export interface MinigameFrameRateOptions {
  /** FPS 低于该值时，周期上报标记为 warning。默认 30。 */
  fpsWarningThreshold?: number;
  /** 单帧间隔超过该毫秒数视为一次卡顿（jank）。默认 50（约 < 20fps 的瞬时帧）。 */
  longFrameThresholdMs?: number;
  /** 周期性上报 FPS 的间隔（毫秒）。默认 10000。 */
  reportInterval?: number;
  /** 每个上报窗口内最多产出多少条 jank 面包屑（防刷屏）；超出仅计数不再打面包屑。默认 3。 */
  maxJankBreadcrumbsPerWindow?: number;
}

/**
 * Minigame FrameRate Integration
 *
 * 面向「小游戏」的帧率（FPS）/ 卡顿（jank）监控。通过自循环采样全局
 * requestAnimationFrame 估算帧率：单帧间隔超过 longFrameThresholdMs 记一次 jank
 * （面包屑按窗口限频，避免持续掉帧刷屏）；每 reportInterval 周期性上报窗口内
 * FPS / 最低瞬时 FPS / 最差帧耗时 / jank 次数到 `minigame.framerate` 上下文。
 *
 * 仅适用于小游戏：小游戏有绑定真实渲染帧的全局 requestAnimationFrame；小程序为
 * 双线程架构、逻辑层无全局 requestAnimationFrame，缺失时安全降级（不工作）。
 */
export class MinigameFrameRateIntegration implements Integration {
  public static id: string = 'MinigameFrameRate';
  public name: string = MinigameFrameRateIntegration.id;

  private _options: Required<MinigameFrameRateOptions>;
  private _running: boolean = false;
  private _windowStart: number = 0;
  private _lastFrameTs: number = 0;
  private _frameCount: number = 0;
  private _jankCount: number = 0;
  private _jankBreadcrumbs: number = 0;
  private _maxFrameDelta: number = 0;

  constructor(options: MinigameFrameRateOptions = {}) {
    this._options = {
      fpsWarningThreshold: options.fpsWarningThreshold ?? 30,
      longFrameThresholdMs: options.longFrameThresholdMs ?? 50,
      reportInterval: options.reportInterval ?? 10000,
      maxJankBreadcrumbsPerWindow: options.maxJankBreadcrumbsPerWindow ?? 3,
    };
  }

  public setupOnce(): void {
    const raf = (globalThis as any).requestAnimationFrame;
    if (typeof raf !== 'function') {
      console.warn(
        '[sentry-miniapp] requestAnimationFrame 不可用，小游戏帧率监控已跳过（小程序逻辑层不支持）',
      );
      return;
    }

    this._running = true;
    const startTs = now();
    this._windowStart = startTs;
    this._lastFrameTs = startTs;

    const loop = (): void => {
      if (!this._running) return;
      const t = now();
      this._onFrame(t - this._lastFrameTs, t);
      this._lastFrameTs = t;
      raf(loop);
    };
    raf(loop);
  }

  private _onFrame(delta: number, t: number): void {
    this._frameCount += 1;
    if (delta > this._maxFrameDelta) this._maxFrameDelta = delta;

    if (delta > this._options.longFrameThresholdMs) {
      this._jankCount += 1;
      // 面包屑按窗口限频，避免持续掉帧刷屏；超出阈值仅计数（jankCount 仍如实统计）。
      if (this._jankBreadcrumbs < this._options.maxJankBreadcrumbsPerWindow) {
        this._jankBreadcrumbs += 1;
        addBreadcrumb({
          category: 'minigame.jank',
          message: `检测到卡顿帧: ${Math.round(delta)}ms`,
          level: 'warning',
          data: { frameDurationMs: Math.round(delta) },
        });
      }
    }

    if (t - this._windowStart >= this._options.reportInterval) {
      this._report(t);
    }
  }

  private _report(t: number): void {
    const elapsed = t - this._windowStart;
    const fps = elapsed > 0 ? Math.round((this._frameCount / elapsed) * 1000) : 0;
    const minFps = this._maxFrameDelta > 0 ? Math.round(1000 / this._maxFrameDelta) : fps;
    const worstFrameMs = Math.round(this._maxFrameDelta);
    const jankCount = this._jankCount;

    setContext('minigame.framerate', {
      fps,
      minFps,
      worstFrameMs,
      jankCount,
      frames: this._frameCount,
    });
    addBreadcrumb({
      category: 'minigame.framerate',
      message: `FPS: ${fps}（最低 ${minFps}，卡顿 ${jankCount} 次）`,
      level: fps < this._options.fpsWarningThreshold ? 'warning' : 'info',
      data: { fps, minFps, worstFrameMs, jankCount, frames: this._frameCount },
    });

    // 重置窗口
    this._windowStart = t;
    this._frameCount = 0;
    this._jankCount = 0;
    this._jankBreadcrumbs = 0;
    this._maxFrameDelta = 0;
  }

  public cleanup(): void {
    this._running = false;
  }
}

/**
 * 函数式工厂，风格对齐 performanceIntegration。
 */
export const minigameFrameRateIntegration = (options?: MinigameFrameRateOptions): IntegrationFn => {
  return () => new MinigameFrameRateIntegration(options);
};
