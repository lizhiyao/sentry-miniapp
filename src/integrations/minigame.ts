import { addBreadcrumb, setContext } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { sdk } from '../crossPlatform';
import { now } from '../timing';

/**
 * Minigame Integration
 *
 * 面向「小游戏」运行时（微信小游戏 / 抖音小游戏等，无 App()/Page() 与页面路由）的
 * 生命周期与冷启动监控，弥补小程序专用的 PageBreadcrumbs / SessionIntegration 在
 * 小游戏中无法工作的空缺。能力：
 * - 读取 getLaunchOptionsSync() 记录启动场景（scene / path / query）上下文与面包屑；
 * - 测量「SDK 初始化 → 首帧」耗时（首个 requestAnimationFrame 回调，近似首帧渲染）；
 * - 监听 onShow / onHide 记录前后台切换面包屑（携带场景值）。
 */
export class MinigameIntegration implements Integration {
  public static id: string = 'Minigame';
  public name: string = MinigameIntegration.id;

  private _initTs: number = now();
  private _showHandler: ((res: any) => void) | null = null;
  private _hideHandler: (() => void) | null = null;
  private _coldStartReported: boolean = false;
  // 累积的 minigame 上下文。setContext 为「覆盖」语义，故内部维护完整对象，
  // 每次补充字段后整体写回，避免后续字段冲掉启动场景。
  private _ctx: {
    runtime: string;
    scene?: unknown;
    path?: unknown;
    query?: unknown;
    coldStartMs?: number;
  } = { runtime: 'minigame' };

  public setupOnce(): void {
    const miniappSdk = sdk();
    if (!miniappSdk) return;

    // 启动场景上下文 + 面包屑
    if (typeof miniappSdk.getLaunchOptionsSync === 'function') {
      try {
        const launch = miniappSdk.getLaunchOptionsSync() || {};
        this._ctx.scene = launch.scene;
        this._ctx.path = launch.path;
        this._ctx.query = launch.query;
        setContext('minigame', { ...this._ctx });
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
   * 用首个 requestAnimationFrame 回调近似「首帧渲染完成」，计算 SDK 初始化 → 首帧的耗时。
   */
  private _measureColdStart(): void {
    const raf = (globalThis as any).requestAnimationFrame;
    if (typeof raf !== 'function') return;

    raf(() => {
      if (this._coldStartReported) return;
      this._coldStartReported = true;
      const coldStartMs = Math.round(now() - this._initTs);
      this._ctx.coldStartMs = coldStartMs;
      setContext('minigame', { ...this._ctx });
      addBreadcrumb({
        category: 'minigame.performance',
        message: `SDK 初始化到首帧耗时: ${coldStartMs}ms`,
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
