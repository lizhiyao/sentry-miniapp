import { addBreadcrumb, flush, setContext, startInactiveSpan, setMeasurement } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { sdk, now, epochNow } from '../crossPlatform';
import type { MinigameFrameRateOptions, MinigameJankLevels } from '../types';

type FrameRateWindowStats = {
  fps: number;
  minFps: number;
  worstFrameMs: number;
  jankCount: number;
  frames: number;
};

/** 分级卡顿档名（严重程度升序：minor < major < severe）。 */
type JankTierName = 'minor' | 'major' | 'severe';
interface JankTier {
  name: JankTierName;
  threshold: number;
}
const JANK_TIER_NAMES: JankTierName[] = ['minor', 'major', 'severe'];

/**
 * 收集有效分级档（有限正数）并校验「阈值随严重度严格递增」（minor < major < severe）。
 *
 * JANK_TIER_NAMES 本身即严重度升序，按此顺序收集；校验必须在排序前做——否则按数值
 * 排序会抹掉非单调的证据。若阈值未随严重度递增（含相等），说明 jank_level 名实不符
 * （如 { minor: 100, severe: 17 } 会把重卡标成 minor），此时 warn 并回退单档
 * longFrameThresholdMs。返回空数组表示未启用分级。
 */
function normalizeJankTiers(levels?: MinigameJankLevels): JankTier[] {
  if (!levels) return [];
  const tiers: JankTier[] = [];
  for (const name of JANK_TIER_NAMES) {
    const threshold = levels[name];
    if (typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0) {
      tiers.push({ name, threshold });
    }
  }
  if (tiers.length === 0) return [];
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1];
    const cur = tiers[i];
    if (prev && cur && cur.threshold <= prev.threshold) {
      console.warn(
        '[sentry-miniapp] jankLevels 阈值须按 minor < major < severe 严格递增，' +
          '当前配置不满足，已忽略分级并回退到单档 longFrameThresholdMs。',
      );
      return [];
    }
  }
  return tiers;
}

/** 把一帧耗时归入命中的最高档（tiers 升序）；无命中返回 null。 */
function classifyJank(tiers: JankTier[], frameDelta: number): JankTierName | null {
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i];
    if (tier && frameDelta > tier.threshold) return tier.name;
  }
  return null;
}

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
 * 可选 `jankLevels` 把卡顿按 minor/major/severe 三档分级：每帧按命中的最高档归类，
 * 面包屑带 `jank_level`，summary 对启用的档增发 `jank_{minor,major,severe}_count`
 * （`jank_count` 仍为总数）。不配置时沿用单档 longFrameThresholdMs，行为不变。
 *
 * 仅适用于小游戏：小游戏有绑定真实渲染帧的全局 requestAnimationFrame；小程序为
 * 双线程架构、逻辑层无全局 requestAnimationFrame，缺失时安全降级（不工作）。
 */
export class MinigameFrameRateIntegration implements Integration {
  public static id: string = 'MinigameFrameRate';
  public name: string = MinigameFrameRateIntegration.id;

  private _options: Required<Omit<MinigameFrameRateOptions, 'jankLevels'>>;
  // 分级卡顿模型（构造时规范化）：_tiers 升序，空表示未启用分级。
  private _tiered: boolean;
  private _tiers: JankTier[];
  private _jankEntryThreshold: number;
  private _running: boolean = false;
  private _windowElapsed: number = 0;
  private _lastFrameTs: number = 0;
  private _frameCount: number = 0;
  private _jankCount: number = 0;
  private _jankBreadcrumbs: number = 0;
  private _jankByTier: Record<JankTierName, number> = { minor: 0, major: 0, severe: 0 };
  private _maxFrameDelta: number = 0;

  // 会话级累积（用于退后台 onHide 时发一个汇总 transaction）
  // _sessionEpochStart 用 epochNow()（墙钟）作 span 绝对时间锚点；时长用有效帧 delta 累积。
  private static readonly _MAX_FPS_SAMPLES = 2000;
  private static readonly _MAX_REASONABLE_FRAME_DELTA_MS = 5000;
  private static readonly _HIDE_FLUSH_TIMEOUT_MS = 2000;
  private _sessionEpochStart: number = 0;
  private _sessionElapsed: number = 0;
  private _sessionFrames: number = 0;
  private _sessionJank: number = 0;
  private _sessionJankByTier: Record<JankTierName, number> = { minor: 0, major: 0, severe: 0 };
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

    // 分级卡顿：收集有效档（有限正数）。至少一档有效则启用分级，入档阈值取最低档；
    // 否则沿用单档 longFrameThresholdMs（jankLevels 优先于 longFrameThresholdMs）。
    this._tiers = normalizeJankTiers(options.jankLevels);
    const lowestTier = this._tiers[0];
    this._tiered = lowestTier !== undefined;
    this._jankEntryThreshold = lowestTier
      ? lowestTier.threshold
      : this._options.longFrameThresholdMs;
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
    this._lastFrameTs = startTs;
    this._sessionEpochStart = epochNow();

    const loop = (): void => {
      if (!this._running) return;
      const t = now();
      this._onFrame(t - this._lastFrameTs);
      this._lastFrameTs = t;
      raf(loop);
    };
    raf(loop);

    // 退后台 / 回前台：onHide 发会话汇总 transaction，onShow 开启新会话。
    const miniappSdk = sdk();
    if (miniappSdk && typeof miniappSdk.onHide === 'function') {
      this._hideHandler = () => {
        if (this._flushSummary()) {
          this._flushPendingEvents();
        }
      };
      miniappSdk.onHide(this._hideHandler);
    }
    if (miniappSdk && typeof miniappSdk.onShow === 'function') {
      this._showHandler = () => this._restartOnResume();
      miniappSdk.onShow(this._showHandler);
    }
  }

  private _onFrame(delta: number): void {
    const frameDelta = this._sanitizeFrameDelta(delta);
    if (frameDelta === null) {
      if (
        !Number.isFinite(delta) ||
        delta > MinigameFrameRateIntegration._MAX_REASONABLE_FRAME_DELTA_MS
      ) {
        // 超大 delta 通常来自后台暂停 / 调试器停顿，作为采样断点处理，避免污染 FPS 与 duration。
        this._rollupWindow();
      }
      return;
    }

    this._frameCount += 1;
    this._windowElapsed += frameDelta;

    if (frameDelta > this._maxFrameDelta) {
      this._maxFrameDelta = frameDelta;
    }

    if (frameDelta > this._jankEntryThreshold) {
      this._jankCount += 1;
      // 分级模式：按命中的最高档归类，并累计该档窗口计数（入档阈值=最低档，必可归类）。
      const jankLevel = this._tiered ? classifyJank(this._tiers, frameDelta) : null;
      if (jankLevel) this._jankByTier[jankLevel] += 1;
      // 面包屑按窗口限频，避免持续掉帧刷屏；超出阈值仅计数（jankCount 仍如实统计）。
      if (this._jankBreadcrumbs < this._options.maxJankBreadcrumbsPerWindow) {
        this._jankBreadcrumbs += 1;
        addBreadcrumb({
          category: 'minigame.jank',
          message: `检测到卡顿帧: ${Math.round(frameDelta)}ms`,
          level: 'warning',
          data: jankLevel
            ? { frameDurationMs: Math.round(frameDelta), jank_level: jankLevel }
            : { frameDurationMs: Math.round(frameDelta) },
        });
      }
    }

    if (this._windowElapsed >= this._options.reportInterval) {
      this._report();
    }
  }

  private _sanitizeFrameDelta(delta: number): number | null {
    if (!Number.isFinite(delta) || delta <= 0) return null;
    if (delta > MinigameFrameRateIntegration._MAX_REASONABLE_FRAME_DELTA_MS) return null;
    return delta;
  }

  private _report(): void {
    const stats = this._rollupWindow();
    if (!stats) return;

    setContext('minigame.framerate', {
      fps: stats.fps,
      minFps: stats.minFps,
      worstFrameMs: stats.worstFrameMs,
      jankCount: stats.jankCount,
      frames: stats.frames,
    });
    addBreadcrumb({
      category: 'minigame.framerate',
      message: `FPS: ${stats.fps}（最低 ${stats.minFps}，卡顿 ${stats.jankCount} 次）`,
      level: stats.fps < this._options.fpsWarningThreshold ? 'warning' : 'info',
      data: stats,
    });
  }

  private _rollupWindow(): FrameRateWindowStats | null {
    const elapsed = this._windowElapsed;
    if (this._frameCount === 0 || elapsed <= 0) {
      this._resetWindow();
      return null;
    }

    const fps = Math.round((this._frameCount / elapsed) * 1000);
    const minFps = this._maxFrameDelta > 0 ? Math.round(1000 / this._maxFrameDelta) : fps;
    const stats: FrameRateWindowStats = {
      fps,
      minFps,
      worstFrameMs: Math.round(this._maxFrameDelta),
      jankCount: this._jankCount,
      frames: this._frameCount,
    };

    // 并入会话累积（用于 onHide 汇总 transaction）。
    this._fpsSamples.push(fps);
    if (this._fpsSamples.length > MinigameFrameRateIntegration._MAX_FPS_SAMPLES) {
      this._fpsSamples.shift();
    }
    this._sessionElapsed += elapsed;
    this._sessionFrames += this._frameCount;
    this._sessionJank += this._jankCount;
    this._sessionJankByTier.minor += this._jankByTier.minor;
    this._sessionJankByTier.major += this._jankByTier.major;
    this._sessionJankByTier.severe += this._jankByTier.severe;
    if (this._maxFrameDelta > this._sessionWorstFrame) {
      this._sessionWorstFrame = this._maxFrameDelta;
    }

    this._resetWindow();

    return stats;
  }

  private _resetWindow(): void {
    this._windowElapsed = 0;
    this._frameCount = 0;
    this._jankCount = 0;
    this._jankBreadcrumbs = 0;
    this._maxFrameDelta = 0;
    this._jankByTier = { minor: 0, major: 0, severe: 0 };
  }

  /** 重置会话累积（回前台开启新会话）。 */
  private _resetSession(): void {
    this._sessionEpochStart = epochNow();
    this._sessionElapsed = 0;
    this._sessionFrames = 0;
    this._sessionJank = 0;
    this._sessionJankByTier = { minor: 0, major: 0, severe: 0 };
    this._sessionWorstFrame = 0;
    this._fpsSamples = [];
  }

  /**
   * 回前台（onShow）：开启新会话，并把帧循环 / 窗口基线对齐到当前时刻。
   * 退后台时 RAF 暂停，回前台后第一帧的 delta 会等于整段后台时长——若不重置基线，
   * 会被误判为一帧巨型卡顿，拉爆 worstFrame、把 minFps 打到 ~0、jank +1，污染新会话汇总。
   */
  private _restartOnResume(): void {
    this._resetSession();
    const t = now();
    this._lastFrameTs = t;
    this._resetWindow();
  }

  /**
   * 发一个会话汇总 transaction（独立于 error 上报，进 Performance 页）。
   * 仅在 tracing 启用时真正上报；会话无帧则跳过。发完重置会话累积。
   */
  private _flushSummary(): boolean {
    this._rollupWindow();
    if (this._sessionFrames === 0) return false;

    const elapsed = this._sessionElapsed;
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
    // 分级模式：对启用的档增发计数（jank_count 仍为总数；未启用的档不发）。
    if (this._tiered) {
      const tierAttrs: Record<string, number> = {};
      for (const tier of this._tiers) {
        const tierCount = this._sessionJankByTier[tier.name];
        tierAttrs[`jank.${tier.name}`] = tierCount;
        setMeasurement(`jank_${tier.name}_count`, tierCount, 'none', span);
      }
      span.setAttributes(tierAttrs);
    }
    span.end((this._sessionEpochStart + Math.max(0, elapsed)) / 1000);

    this._resetSession();
    return true;
  }

  private _flushPendingEvents(): void {
    void Promise.resolve(flush(MinigameFrameRateIntegration._HIDE_FLUSH_TIMEOUT_MS)).catch(() => {
      // ignore
    });
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
