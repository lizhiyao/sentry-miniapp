/**
 * 全局 App() 生命周期的单一包装点。
 *
 * 小程序的 `App()` 是全局构造函数，只应被猴补一次。此前 SessionIntegration 与
 * PageBreadcrumbs 各自独立猴补 App，存在还原顺序脆弱、重复的全局检测等问题
 * （架构 review P2-c）。这里用引用计数做单次包装：
 *
 * - 首个订阅者触发对 `globalThis.App` 的包装；最后一个退订时还原。
 * - 还原仅在「全局 App 仍是我们的 wrapper」时进行，杜绝乱序 cleanup 丢层 / 覆盖他人后续包装。
 * - 每个生命周期事件（onLaunch/onShow/onHide/onError）分别在调用业务原回调前和 finally 中广播，收尾不会吞业务异常。
 * - wrapper 无条件注入四个生命周期回调，确保即使业务未定义某回调，订阅者也能收到广播
 *   （Session 依赖此点保证会话生命周期完整）。
 */

export interface AppLifecycleHandlers {
  onLaunch?: (options?: unknown) => void;
  onShow?: (options?: unknown) => void;
  onHide?: () => void;
  onError?: (error?: unknown) => void;
}

const LIFECYCLE_METHODS: Array<keyof AppLifecycleHandlers> = [
  'onLaunch',
  'onShow',
  'onHide',
  'onError',
];

type LifecyclePhase = 'before' | 'after' | 'flush';
interface Subscription {
  handlers: AppLifecycleHandlers;
  phase: LifecyclePhase;
}
interface AppPatch {
  original: (...args: any[]) => any;
  wrapper: (...args: any[]) => any;
  active: boolean;
}
const subscribers = new Set<Subscription>();
let patch: AppPatch | undefined;

function broadcast(
  eventSubscribers: Subscription[],
  phase: LifecyclePhase,
  method: keyof AppLifecycleHandlers,
  arg?: unknown,
): void {
  for (const subscription of eventSubscribers) {
    if (subscription.phase !== phase || !subscribers.has(subscription)) continue;
    const fn = subscription.handlers[method];
    if (typeof fn === 'function') {
      try {
        (fn as (a?: unknown) => void)(arg);
      } catch (_e) {
        // 单个订阅者异常不影响其他订阅者与业务回调。
      }
    }
  }
}

function patchApp(): boolean {
  if (patch) return true;
  const g = globalThis as any;
  let currentOriginalApp: (...args: any[]) => any;
  try {
    currentOriginalApp = g.App;
    if (typeof currentOriginalApp !== 'function') return false;
  } catch (_error) {
    return false;
  }

  const wrapper = function (this: any, appOptions: Record<string, any> = {}): any {
    if (registration.active && appOptions && typeof appOptions === 'object') {
      for (const method of LIFECYCLE_METHODS) {
        try {
          const userHandler = appOptions[method];
          appOptions[method] = function (this: any, ...args: any[]): any {
            // 两阶段使用同一快照，业务回调中新装的 client 不接收旧事件的 after。
            const eventSubscribers = [...subscribers];
            broadcast(eventSubscribers, 'before', method, args[0]);
            try {
              if (typeof userHandler === 'function') {
                return userHandler.apply(this, args);
              }
            } finally {
              broadcast(eventSubscribers, 'after', method, args[0]);
              broadcast(eventSubscribers, 'flush', method, args[0]);
            }
          };
        } catch (_error) {
          /* 冻结定义或 getter 失败不能阻断业务 App 注册。 */
        }
      }
    }
    return currentOriginalApp.call(this, appOptions);
  };
  const registration: AppPatch = { original: currentOriginalApp, wrapper, active: true };
  try {
    g.App = wrapper;
    if (g.App !== wrapper) {
      registration.active = false;
      return false;
    }
  } catch (_error) {
    registration.active = false;
    return false;
  }
  patch = registration;
  return true;
}

/** 仅表示 SDK 能否包装后续 App 注册，不宣称已注册的业务 App 被补包。 */
export function isAppLifecycleAvailable(): boolean {
  return !!patch?.active;
}

function unpatchAppIfIdle(): void {
  if (!patch || subscribers.size > 0) return;
  const g = globalThis as any;
  // 仅当全局 App 仍是我们的 wrapper 时还原，避免覆盖他人后续包装。
  const registration = patch;
  registration.active = false;
  patch = undefined;
  try {
    if (g.App === registration.wrapper) g.App = registration.original;
  } catch (_error) {
    /* 不可写入口保留透明的失效 wrapper；模块状态仍释放。 */
  }
}

/**
 * 订阅全局 App 生命周期；after 在业务同步 handler 的 finally 内运行。首次订阅会包装 `App()`；返回退订函数，
 * 退订到无订阅者时还原 `App()`。
 */
export function subscribeAppLifecycle(
  handlers: AppLifecycleHandlers,
  phase: LifecyclePhase = 'before',
): () => void {
  // 无全局 App()（如小游戏，或尚未注入）：订阅毫无意义——既不会有广播，又会把 handler
  // 永久滞留在模块级 subscribers 里（闭包持有集成实例 → 泄漏）。直接返回 no-op 退订。
  // 注：一旦已包装，globalThis.App 即我们的 wrapper（仍是 function），后续订阅照常生效。
  const subscription = { handlers, phase };
  subscribers.add(subscription);
  if (!patchApp()) {
    subscribers.delete(subscription);
    return () => {};
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    subscribers.delete(subscription);
    unpatchAppIfIdle();
  };
}

/** 仅供测试：重置内部包装状态。 */
export function _resetAppLifecycle(): void {
  subscribers.clear();
  if (patch) patch.active = false;
  patch = undefined;
}
