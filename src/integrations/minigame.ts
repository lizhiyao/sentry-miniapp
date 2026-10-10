import { automaticSpanAttributes } from '../spanDimensions';
import { setClientContext } from '../clientState';
import { addBreadcrumb, startInactiveSpan } from '@sentry/core';
import type { Client, Integration, IntegrationFn } from '@sentry/core';
import { sdk, now, epochNow } from '../crossPlatform';
import { getClientLifetime } from '../lifecycle';
import { OwnerToken } from '../owner';
import { subscribeMiniappLifecycle } from '../appLifecycle';
import { collectKeyValueData, collectUrlName } from '../dataCollection';
import type { MiniappOptions } from '../types';

/**
 * Minigame Integration
 *
 * 面向「小游戏」运行时（微信小游戏 / 抖音小游戏等，无 App()/Page() 与页面路由）的
 * 生命周期与 SDK 安装至首帧观测，补充没有页面与路由的小游戏观测能力。能力：
 * - 读取 getLaunchOptionsSync() 记录启动场景（scene / path / query）上下文与面包屑；
 * - 测量「SDK 初始化 → 首帧」耗时（首个 requestAnimationFrame 回调，近似首帧渲染）；
 * - 监听 onShow / onHide 记录前后台切换面包屑（携带场景值）。
 */
export class MinigameIntegration implements Integration {
  public static id: string = 'Minigame';
  public name: string = MinigameIntegration.id;

  // _initTs 用时长时钟（now()）测量耗时；_initEpoch 用 epochNow() 表达 span 的绝对起点。
  // 两者目前同为墙钟毫秒，但保留语义区分：前者只做差值，后者用于 Sentry 时间戳。
  private _initTs = 0;
  private _initEpoch = 0;
  private _coldStartReported: boolean = false;
  private _client: Client | undefined;
  private _owner: OwnerToken | undefined;
  private _sdk: ReturnType<typeof sdk> | undefined;
  private _frameId: unknown;
  private _cancelFrame: Function | undefined;
  private readonly _clients = new WeakSet<Client>();
  private readonly _cleanups = new Set<() => void>();
  // 累积的 minigame 上下文。setContext 为「覆盖」语义，故内部维护完整对象，
  // 每次补充字段后整体写回，避免后续字段冲掉启动场景。
  private _minigameContext: {
    runtime: string;
    scene?: unknown;
    path?: unknown;
    query?: unknown;
    initToFirstFrameMs?: number;
  } = { runtime: 'minigame' };

  public setup(client: Client): void {
    if (this._clients.has(client)) return;
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    const controller = new MinigameIntegration();
    controller._client = client;
    this._clients.add(client);
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      controller.cleanup();
      this._clients.delete(client);
      this._cleanups.delete(cleanup);
    };
    this._cleanups.add(cleanup);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
    controller._owner = new OwnerToken(client, 'current');
    controller._sdk = sdk();
    controller._owner.run(() => controller._setup());
  }

  private _setup(): void {
    this._initTs = now();
    this._initEpoch = epochNow();
    this._coldStartReported = false;

    const miniappSdk = this._sdk;
    if (!miniappSdk) return;

    // 启动场景上下文 + 面包屑
    try {
      if (typeof miniappSdk.getLaunchOptionsSync === 'function') {
        const launch = miniappSdk.getLaunchOptionsSync() || {};
        this._minigameContext.scene = launch.scene;
        this._minigameContext.path =
          typeof launch.path === 'string' ? collectUrlName(launch.path) : undefined;
        this._minigameContext.query = collectKeyValueData(
          launch.query || {},
          this._client,
          (this._client?.getOptions?.() as MiniappOptions | undefined)?.sensitiveKeys,
        );
        setClientContext(this._client, 'minigame', { ...this._minigameContext });
        addBreadcrumb({
          category: 'minigame.launch',
          message: '小游戏启动参数',
          level: 'info',
          data: { scene: launch.scene, path: this._minigameContext.path },
        });
      }
    } catch (_error) {
      /* 不可读启动能力或数据仅省略该采集。 */
    }

    if (!this._owner?.isActive()) return;
    try {
      this._measureColdStart();
    } catch (_error) {
      /* rAF 注册失败不阻断生命周期监听。 */
    }
    const owner = this._owner;
    const client = this._client;
    if (!owner?.isActive() || !client) return;
    const lifecycle = subscribeMiniappLifecycle(client, {
      onShow: (res) =>
        this._observe(() => {
          addBreadcrumb({
            category: 'minigame.lifecycle',
            message: '小游戏 onShow（进入前台）',
            level: 'info',
            data: { scene: (res as { scene?: unknown } | undefined)?.scene },
          });
        }),
      onHide: () =>
        this._observe(() => {
          addBreadcrumb({
            category: 'minigame.lifecycle',
            message: '小游戏 onHide（退到后台）',
            level: 'info',
          });
        }),
    });
    owner.onRelease(lifecycle.stop);
  }

  private _observe(callback: () => void): void {
    try {
      this._owner?.run(callback);
    } catch (_error) {
      /* SDK 回调故障不传播到宿主。 */
    }
  }

  /**
   * 用首个 requestAnimationFrame 回调近似「首帧渲染完成」，计算 SDK 初始化 → 首帧的耗时。
   */
  private _measureColdStart(): void {
    const owner = this._owner;
    if (!owner?.isActive()) return;
    let raf: Function;
    try {
      const request = (globalThis as any).requestAnimationFrame;
      if (typeof request !== 'function') return;
      raf = request;
    } catch (_error) {
      return;
    }
    if (!owner.isActive()) return;
    try {
      const cancel = (globalThis as any).cancelAnimationFrame;
      if (owner.isActive() && typeof cancel === 'function') this._cancelFrame = cancel;
    } catch (_error) {
      /* 可选取消能力不可读时，迟到帧仍由 owner 门禁拒绝。 */
    }
    if (!owner.isActive()) return;
    const cancel = this._cancelFrame;
    const id = raf.call(globalThis, () =>
      this._observe(() => {
        this._frameId = undefined;
        if (this._coldStartReported) return;
        this._coldStartReported = true;
        const firstFrameTs = now();
        const elapsed = firstFrameTs - this._initTs;
        if (!Number.isFinite(elapsed) || elapsed < 0) {
          if (this._owner?.isActive())
            getClientLifetime(this._client!)?.warnings.add('performance_clock_invalid');
          return;
        }
        const initToFirstFrameMs = Math.round(elapsed);
        this._minigameContext.initToFirstFrameMs = initToFirstFrameMs;
        setClientContext(this._client, 'minigame', { ...this._minigameContext });
        addBreadcrumb({
          category: 'minigame.performance',
          message: `SDK 初始化到首帧耗时: ${initToFirstFrameMs}ms`,
          level: 'info',
          data: { initToFirstFrameMs },
        });

        // 独立性能事件：「SDK 初始化 → 首帧」自成一条 segment span 发出，进 Performance 页。
        // 仅在 tracing 启用（tracesSampleRate/tracesSampler）时真正上报；否则为非记录 span、不发送。
        // span 时间戳使用 epoch 锚点；duration 用 now() 测得的 initToFirstFrameMs 叠加上去，
        // 保证绝对时间与时长语义各自清晰。
        if (!owner.isActive()) return;
        const span = startInactiveSpan({
          name: 'minigame.init_to_first_frame',
          op: 'ui.first_frame',
          // core 11 废弃 forceTransaction；断掉父 span 后这条 root span 自成一个 segment。
          parentSpan: null,
          startTime: this._initEpoch / 1000,
          attributes: automaticSpanAttributes(
            this._client,
            {
              'minigame.scene': this._minigameContext.scene as any,
              'minigame.path': this._minigameContext.path as any,
              'minigame.init_to_first_frame_ms': initToFirstFrameMs,
            },
            false,
          ),
        });

        if (!owner.isActive()) return;
        span.end((this._initEpoch + initToFirstFrameMs) / 1000);
      }),
    );
    if (!owner.isActive()) {
      try {
        cancel?.call(globalThis, id);
      } catch (_error) {
        /* 返回任务前退休也要 best-effort 取消。 */
      }
    } else if (!this._coldStartReported) this._frameId = id;
  }

  public cleanup(): void {
    for (const cleanup of [...this._cleanups]) cleanup();
    const owner = this._owner;
    this._owner = undefined;
    this._client = undefined;
    owner?.release();
    this._sdk = undefined;
    const frame = this._frameId;
    this._frameId = undefined;
    const cancel = this._cancelFrame;
    this._cancelFrame = undefined;
    try {
      if (frame !== undefined) cancel?.call(globalThis, frame);
    } catch (_error) {
      /* 取消失败仍已失效。 */
    }
  }
}

/** 函数式工厂，风格对齐 performanceIntegration。 */
export const minigameIntegration: IntegrationFn = () => new MinigameIntegration();
