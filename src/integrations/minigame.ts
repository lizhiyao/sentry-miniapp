import { addBreadcrumb, setContext } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { sdk } from '../crossPlatform';

/**
 * 取当前时间戳，优先使用平台 Performance.now()（单调时钟），回退 Date.now()。
 */
function now(): number {
  try {
    const perf = sdk().getPerformance?.();
    if (perf && typeof perf.now === 'function') {
      return perf.now();
    }
  } catch (_e) {
    // ignore，回退 Date.now
  }
  return Date.now();
}

/**
 * Minigame Integration
 *
 * 面向「小游戏」运行时（微信小游戏 / 抖音小游戏等，无 App()/Page() 与页面路由）的
 * 生命周期与冷启动监控，弥补小程序专用的 PageBreadcrumbs / SessionIntegration 在
 * 小游戏中无法工作的空缺。能力：
 * - 读取 getLaunchOptionsSync() 记录启动场景（scene / path / query）上下文与面包屑；
 * - 测量「冷启动 → 首帧」耗时（首个 requestAnimationFrame 回调）；
 * - 监听 onShow / onHide 记录前后台切换面包屑（携带场景值）。
 */
export class MinigameIntegration implements Integration {
  public static id: string = 'Minigame';
  public name: string = MinigameIntegration.id;

  private _initTs: number = now();
  private _showHandler: ((res: any) => void) | null = null;
  private _hideHandler: (() => void) | null = null;
  private _coldStartReported: boolean = false;

  public setupOnce(): void {
    const miniappSdk = sdk();
    if (!miniappSdk) return;

    // 启动场景上下文 + 面包屑
    if (typeof miniappSdk.getLaunchOptionsSync === 'function') {
      try {
        const launch = miniappSdk.getLaunchOptionsSync() || {};
        setContext('minigame', {
          runtime: 'minigame',
          scene: launch.scene,
          path: launch.path,
          query: launch.query,
        });
        addBreadcrumb({
          category: 'minigame.launch',
          message: '小游戏冷启动',
          level: 'info',
          data: { scene: launch.scene, path: launch.path },
        });
      } catch (_e) {
        // ignore
      }
    }

    this._measureColdStart();

    // 前台 / 后台切换
    if (typeof miniappSdk.onShow === 'function') {
      this._showHandler = (res: any) => {
        addBreadcrumb({
          category: 'minigame.lifecycle',
          message: '小游戏 onShow（进入前台）',
          level: 'info',
          data: { scene: res && res.scene },
        });
      };
      miniappSdk.onShow(this._showHandler);
    }
    if (typeof miniappSdk.onHide === 'function') {
      this._hideHandler = () => {
        addBreadcrumb({
          category: 'minigame.lifecycle',
          message: '小游戏 onHide（退到后台）',
          level: 'info',
        });
      };
      miniappSdk.onHide(this._hideHandler);
    }
  }

  /**
   * 用首个 requestAnimationFrame 回调近似「首帧渲染完成」，计算冷启动耗时。
   */
  private _measureColdStart(): void {
    const raf = (globalThis as any).requestAnimationFrame;
    if (typeof raf !== 'function') return;

    raf(() => {
      if (this._coldStartReported) return;
      this._coldStartReported = true;
      const coldStartMs = Math.round(now() - this._initTs);
      setContext('minigame', { runtime: 'minigame', coldStartMs });
      addBreadcrumb({
        category: 'minigame.performance',
        message: `冷启动首帧耗时: ${coldStartMs}ms`,
        level: 'info',
        data: { coldStartMs },
      });
    });
  }

  public cleanup(): void {
    const miniappSdk = sdk();
    if (!miniappSdk) return;
    try {
      if (this._showHandler && typeof miniappSdk.offShow === 'function') {
        miniappSdk.offShow(this._showHandler);
      }
      if (this._hideHandler && typeof miniappSdk.offHide === 'function') {
        miniappSdk.offHide(this._hideHandler);
      }
    } catch (_e) {
      // ignore
    }
    this._showHandler = null;
    this._hideHandler = null;
  }
}

/**
 * 函数式工厂，风格对齐 performanceIntegration。
 */
export const minigameIntegration: IntegrationFn = () => new MinigameIntegration();
