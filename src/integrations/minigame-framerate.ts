import { addBreadcrumb, setContext, startInactiveSpan, setMeasurement } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { sdk, now } from '../crossPlatform';
import type { MinigameFrameRateOptions } from '../types';

/** 取已排序样本的 P95（样本为空时回退到 fallback）。 */
function percentile95(samples: number[], fallback: number): number {
  if (samples.length === 0) return fallback;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(0.95 * (sorted.length - 1))] ?? fallback;
}

/**
 * Minigame FrameRate Integration
 *
 * 面向「小游戏」的帧率（FPS）/ 卡顿（jank）监控。通过自循环采样全局
 * requestAnimationFrame 估算帧率：单帧间隔超过 longFrameThresholdMs 记一次 jank
 * （面包屑按窗口限频，避免持续掉帧刷屏）；每 reportInterval 周期性上报窗口内
 * FPS / 最低瞬时 FPS / 最差帧耗时 / jank 次数到 `minigame.framerate` 上下文。
 *
 * 此外，会话维度累积帧率/卡顿，在退后台（onHide）或集成关闭时发一个汇总
 * transaction（`minigame.framerate.summary`，含 fps_avg / fps_p95 / fps_min /
 * jank_count measurements），独立于 error 事件、进 Sentry Performance 页，由
 * tracesSampleRate 控制——不每窗口发事件，配额友好。
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

  // 会话级累积（用于退后台 onHide 时发一个汇总 transaction）
  // _sessionStart 单调时钟（测时长）；_sessionEpochStart 用 Date.now() 作 span 绝对时间锚点。
  private static readonly _MAX_FPS_SAMPLES = 2000;
  private _sessionStart: number = 0;
  private _sessionEpochStart: number = 0;
  private _sessionFrames: number = 0;
  private _sessionJank: number = 0;
  private _sessionWorstFrame: number = 0;
  private _fpsSamples: number[] = [];
  private _showHandler: ((res: any) => void) | null = null;
  private _hideHandler: (() => void) | null = null;

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
    this._sessionStart = startTs;
    this._sessionEpochStart = Date.now();

    const loop = (): void => {
      if (!this._running) return;
      const t = now();
      this._onFrame(t - this._lastFrameTs, t);
      this._lastFrameTs = t;
      raf(loop);
    };
    raf(loop);

    // 退后台 / 回前台：onHide 发会话汇总 transaction，onShow 开启新会话。
    const miniappSdk = sdk();
    if (miniappSdk && typeof miniappSdk.onHide === 'function') {
      this._hideHandler = () => this._flushSummary();
      miniappSdk.onHide(this._hideHandler);
    }
    if (miniappSdk && typeof miniappSdk.onShow === 'function') {
      this._showHandler = () => this._resetSession();
      miniappSdk.onShow(this._showHandler);
    }
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

    // 并入会话累积（用于 onHide 汇总 transaction）
    this._fpsSamples.push(fps);
    if (this._fpsSamples.length > MinigameFrameRateIntegration._MAX_FPS_SAMPLES) {
      this._fpsSamples.shift();
    }
    this._sessionFrames += this._frameCount;
    this._sessionJank += jankCount;
    if (this._maxFrameDelta > this._sessionWorstFrame) {
      this._sessionWorstFrame = this._maxFrameDelta;
    }

    // 重置窗口
    this._windowStart = t;
    this._frameCount = 0;
    this._jankCount = 0;
    this._jankBreadcrumbs = 0;
    this._maxFrameDelta = 0;
  }

  /** 重置会话累积（回前台开启新会话）。 */
  private _resetSession(): void {
    this._sessionStart = now();
    this._sessionEpochStart = Date.now();
    this._sessionFrames = 0;
    this._sessionJank = 0;
    this._sessionWorstFrame = 0;
    this._fpsSamples = [];
  }

  /**
   * 发一个会话汇总 transaction（独立于 error 上报，进 Performance 页）。
   * 仅在 tracing 启用时真正上报；会话无帧则跳过。发完重置会话累积。
   */
  private _flushSummary(): void {
    if (this._sessionFrames === 0) return;

    const end = now();
    const elapsed = end - this._sessionStart;
    const avgFps = elapsed > 0 ? Math.round((this._sessionFrames / elapsed) * 1000) : 0;
    const minFps =
      this._sessionWorstFrame > 0 ? Math.round(1000 / this._sessionWorstFrame) : avgFps;
    const p95Fps = percentile95(this._fpsSamples, avgFps);
    const worstFrameMs = Math.round(this._sessionWorstFrame);
    const jankCount = this._sessionJank;
    const frames = this._sessionFrames;

    // span 绝对时间用 epoch 锚点 + 单调测得的 elapsed 作时长，避免单调时钟落到 1970。
    const span = startInactiveSpan({
      name: 'minigame.framerate.summary',
      op: 'ui.framerate',
      forceTransaction: true,
      startTime: this._sessionEpochStart / 1000,
    });
    span.setAttributes({
      'fps.avg': avgFps,
      'fps.p95': p95Fps,
      'fps.min': minFps,
      'frames.total': frames,
      'jank.count': jankCount,
      'frame.worst_ms': worstFrameMs,
    });
    setMeasurement('fps_avg', avgFps, 'none', span);
    setMeasurement('fps_p95', p95Fps, 'none', span);
    setMeasurement('fps_min', minFps, 'none', span);
    setMeasurement('jank_count', jankCount, 'none', span);
    span.end((this._sessionEpochStart + Math.max(0, elapsed)) / 1000);

    this._resetSession();
  }

  public cleanup(): void {
    this._running = false;
    // 会话结束兜底：再发一次汇总
    this._flushSummary();
    const miniappSdk = sdk();
    if (miniappSdk) {
      try {
        if (this._hideHandler && typeof miniappSdk.offHide === 'function') {
          miniappSdk.offHide(this._hideHandler);
        }
        if (this._showHandler && typeof miniappSdk.offShow === 'function') {
          miniappSdk.offShow(this._showHandler);
        }
      } catch (_e) {
        // ignore
      }
    }
    this._hideHandler = null;
    this._showHandler = null;
  }
}

/**
 * 函数式工厂，风格对齐 performanceIntegration。
 */
export const minigameFrameRateIntegration = (options?: MinigameFrameRateOptions): IntegrationFn => {
  return () => new MinigameFrameRateIntegration(options);
};
