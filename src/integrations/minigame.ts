import { automaticSpanAttributes } from '../spanDimensions';
import { setClientContext } from '../clientState';
import { addBreadcrumb, startInactiveSpan, setMeasurement } from '@sentry/core';
import type { Client, Integration, IntegrationFn } from '@sentry/core';
import { sdk, now, epochNow } from '../crossPlatform';
import { getClientLifetime } from '../lifecycle';
import { OwnerToken, registerOwnerListener } from '../owner';
import { collectKeyValueData, collectUrlName } from '../dataCollection';
import type { MiniappOptions } from '../types';

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

  // _initTs 用时长时钟（now()）测量耗时；_initEpoch 用 epochNow() 表达 span 的绝对起点。
  // 两者目前同为墙钟毫秒，但保留语义区分：前者只做差值，后者用于 Sentry 时间戳。
  private _initTs = 0;
  private _initEpoch = 0;
  private _showHandler: ((res: any) => void) | null = null;
  private _hideHandler: (() => void) | null = null;
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
    coldStartMs?: number;
  } = { runtime: 'minigame' };

  public setupOnce(): void {
    // 启动参数必须在 client 配置可用后采集。
  }

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
    controller._owner = new OwnerToken(client);
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
          message: '小游戏冷启动',
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
    if (!this._owner?.isActive()) return;

    // 注册失败逐项隔离，缺 off 的平台仍由 token 失效保证不采集。
    try {
      if (this._owner?.isActive()) {
        this._showHandler = (res: any) =>
          this._observe(() => {
            addBreadcrumb({
              category: 'minigame.lifecycle',
              message: '小游戏 onShow（进入前台）',
              level: 'info',
              data: { scene: res && res.scene },
            });
          });
        registerOwnerListener(this._owner, miniappSdk, 'onShow', 'offShow', this._showHandler);
      }
    } catch (_error) {
      /* 单项能力不可用不阻断 hide。 */
    }
    if (!this._owner?.isActive()) return;
    try {
      if (this._owner?.isActive()) {
        this._hideHandler = () =>
          this._observe(() => {
            addBreadcrumb({
              category: 'minigame.lifecycle',
              message: '小游戏 onHide（退到后台）',
              level: 'info',
            });
          });
        registerOwnerListener(this._owner, miniappSdk, 'onHide', 'offHide', this._hideHandler);
      }
    } catch (_error) {
      /* 注册后抛错的句柄仍由 cleanup 处理。 */
    }
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
      const cancel = (globalThis as any).cancelAnimationFrame;
      if (typeof cancel === 'function') this._cancelFrame = cancel;
    } catch (_error) {
      return;
    }
    const cancel = this._cancelFrame;
    const id = raf.call(globalThis, () =>
      this._observe(() => {
        this._frameId = undefined;
        if (this._coldStartReported) return;
        this._coldStartReported = true;
        const firstFrameTs = now();
        // 夹下限 0：时长时钟用 Date.now()（见 crossPlatform.now），万一启动头几百 ms 内系统时钟
        // 向后跳（NTP 校正 / 用户改表），不至于报出负数冷启动。
        const coldStartMs = Math.max(0, Math.round(firstFrameTs - this._initTs));
        this._minigameContext.coldStartMs = coldStartMs;
        setClientContext(this._client, 'minigame', { ...this._minigameContext });
        addBreadcrumb({
          category: 'minigame.performance',
          message: `SDK 初始化到首帧耗时: ${coldStartMs}ms`,
          level: 'info',
          data: { coldStartMs },
        });

        // 独立性能事件：「SDK 初始化 → 首帧」自成一条 segment span 发出，进 Performance 页。
        // 仅在 tracing 启用（tracesSampleRate/tracesSampler）时真正上报；否则为非记录 span、不发送。
        // span 时间戳使用 epoch 锚点；duration 用 now() 测得的 coldStartMs 叠加上去，
        // 保证绝对时间与时长语义各自清晰。
        if (!owner.isActive()) return;
        const span = startInactiveSpan({
          name: 'minigame.coldstart',
          op: 'app.start',
          // core 11 废弃 forceTransaction；断掉父 span 后这条 root span 自成一个 segment。
          parentSpan: null,
          startTime: this._initEpoch / 1000,
          attributes: automaticSpanAttributes(
            this._client,
            {
              'minigame.scene': this._minigameContext.scene as any,
              'minigame.path': this._minigameContext.path as any,
              'minigame.cold_start_ms': coldStartMs,
            },
            false,
          ),
        });

        // 同上：属性供 stream 生命周期取数，measurement 只在 static 生命周期产出。
        if (!owner.isActive()) return;
        setMeasurement('cold_start', coldStartMs, 'millisecond', span);
        span.end((this._initEpoch + coldStartMs) / 1000);
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
    const source = this._sdk;
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
    for (const [name, handler] of [
      ['offShow', this._showHandler],
      ['offHide', this._hideHandler],
    ] as const) {
      if (!handler) continue;
      try {
        const remove = source?.[name];
        if (typeof remove === 'function') remove.call(source, handler);
      } catch (_error) {
        /* 每个 off 独立容错。 */
      }
    }
    this._showHandler = null;
    this._hideHandler = null;
  }
}

/** 函数式工厂，风格对齐 performanceIntegration。 */
export const minigameIntegration: IntegrationFn = () => new MinigameIntegration();
