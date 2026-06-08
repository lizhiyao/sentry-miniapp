import { addBreadcrumb, setContext } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { sdk } from '../crossPlatform';

export interface FrameRateIntegrationOptions {
  /** FPS 低于该值时，周期上报标记为 warning。默认 30。 */
  fpsWarningThreshold?: number;
  /** 单帧间隔超过该毫秒数视为一次卡顿（jank）。默认 50（约 < 20fps 的瞬时帧）。 */
  longFrameThresholdMs?: number;
  /** 周期性上报 FPS 的间隔（毫秒）。默认 10000。 */
  reportInterval?: number;
}

/**
 * 取当前时间戳，优先平台 Performance.now()（单调时钟），回退 Date.now()。
 */
function now(): number {
  try {
    const perf = sdk().getPerformance?.();
    if (perf && typeof perf.now === 'function') {
      return perf.now();
    }
  } catch (_e) {
    // ignore
  }
  return Date.now();
}

/**
 * FrameRate Integration
 *
 * 通过自循环采样 requestAnimationFrame 估算帧率（FPS）并检测卡顿（jank），面向
 * 小游戏的渲染性能监控。每帧记录间隔：超过 longFrameThresholdMs 记一次 jank 面包屑；
 * 每 reportInterval 周期性上报窗口内 FPS / 最低瞬时 FPS / jank 次数到
 * `minigame.performance` 上下文。requestAnimationFrame 不可用时安全降级（不工作）。
 */
export class FrameRateIntegration implements Integration {
  public static id: string = 'FrameRate';
  public name: string = FrameRateIntegration.id;

  private _options: Required<FrameRateIntegrationOptions>;
  private _running: boolean = false;
  private _windowStart: number = 0;
  private _lastFrameTs: number = 0;
  private _frames: number = 0;
  private _jank: number = 0;
  private _maxDelta: number = 0;

  constructor(options: FrameRateIntegrationOptions = {}) {
    this._options = {
      fpsWarningThreshold: options.fpsWarningThreshold ?? 30,
      longFrameThresholdMs: options.longFrameThresholdMs ?? 50,
      reportInterval: options.reportInterval ?? 10000,
    };
  }

  public setupOnce(): void {
    const raf = (globalThis as any).requestAnimationFrame;
    if (typeof raf !== 'function') {
      console.warn('[sentry-miniapp] requestAnimationFrame 不可用，FrameRate 监控已跳过');
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
    this._frames += 1;
    if (delta > this._maxDelta) this._maxDelta = delta;

    if (delta > this._options.longFrameThresholdMs) {
      this._jank += 1;
      addBreadcrumb({
        category: 'ui.jank',
        message: `检测到卡顿帧: ${Math.round(delta)}ms`,
        level: 'warning',
        data: { frameDurationMs: Math.round(delta) },
      });
    }

    if (t - this._windowStart >= this._options.reportInterval) {
      this._report(t);
    }
  }

  private _report(t: number): void {
    const elapsed = t - this._windowStart;
    const fps = elapsed > 0 ? Math.round((this._frames / elapsed) * 1000) : 0;
    const minFps = this._maxDelta > 0 ? Math.round(1000 / this._maxDelta) : fps;
    const jankCount = this._jank;

    setContext('minigame.performance', {
      fps,
      minFps,
      jankCount,
      frames: this._frames,
    });
    addBreadcrumb({
      category: 'minigame.performance',
      message: `FPS: ${fps}（最低 ${minFps}，卡顿 ${jankCount} 次）`,
      level: fps < this._options.fpsWarningThreshold ? 'warning' : 'info',
      data: { fps, minFps, jankCount, frames: this._frames },
    });

    // 重置窗口
    this._windowStart = t;
    this._frames = 0;
    this._jank = 0;
    this._maxDelta = 0;
  }

  public cleanup(): void {
    this._running = false;
  }
}

/**
 * 函数式工厂，风格对齐 performanceIntegration。
 */
export const frameRateIntegration = (options?: FrameRateIntegrationOptions): IntegrationFn => {
  return () => new FrameRateIntegration(options);
};
