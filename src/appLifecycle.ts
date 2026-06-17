/**
 * 全局 App() 生命周期的单一包装点。
 *
 * 小程序的 `App()` 是全局构造函数，只应被猴补一次。此前 SessionIntegration 与
 * PageBreadcrumbs 各自独立猴补 App，存在还原顺序脆弱、重复的全局检测等问题
 * （架构 review P2-c）。这里用引用计数做单次包装：
 *
 * - 首个订阅者触发对 `globalThis.App` 的包装；最后一个退订时还原。
 * - 还原仅在「全局 App 仍是我们的 wrapper」时进行，杜绝乱序 cleanup 丢层 / 覆盖他人后续包装。
 * - 每个生命周期事件（onLaunch/onShow/onHide/onError）在调用业务原回调**之前**广播给所有订阅者。
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

const subscribers = new Set<AppLifecycleHandlers>();
let originalApp: ((...args: any[]) => any) | null = null;
let patched = false;

function broadcast(method: keyof AppLifecycleHandlers, arg?: unknown): void {
  // 复制一份再迭代，避免订阅者在回调里增删集合导致迭代异常。
  for (const handlers of [...subscribers]) {
    const fn = handlers[method];
    if (typeof fn === 'function') {
      try {
        (fn as (a?: unknown) => void)(arg);
      } catch (_e) {
        // 单个订阅者异常不影响其他订阅者与业务回调。
      }
    }
  }
}

function patchApp(): void {
  const g = globalThis as any;
  if (patched || typeof g.App !== 'function') return;

  originalApp = g.App;
  const wrapper = function (this: any, appOptions: Record<string, any> = {}): any {
    if (appOptions && typeof appOptions === 'object') {
      for (const method of LIFECYCLE_METHODS) {
        const userHandler = appOptions[method];
        appOptions[method] = function (this: any, ...args: any[]): any {
          broadcast(method, args[0]);
          if (typeof userHandler === 'function') {
            return userHandler.apply(this, args);
          }
        };
      }
    }
    return (originalApp as (...a: any[]) => any).call(this, appOptions);
  };
  (wrapper as any).__sentryAppWrapper = true;
  g.App = wrapper;
  patched = true;
}

function unpatchAppIfIdle(): void {
  if (!patched || subscribers.size > 0) return;
  const g = globalThis as any;
  // 仅当全局 App 仍是我们的 wrapper 时还原，避免覆盖他人后续包装。
  if (g.App && g.App.__sentryAppWrapper && originalApp) {
    g.App = originalApp;
  }
  originalApp = null;
  patched = false;
}

/**
 * 订阅全局 App 生命周期。首次订阅会包装 `App()`；返回退订函数，
 * 退订到无订阅者时还原 `App()`。
 */
export function subscribeAppLifecycle(handlers: AppLifecycleHandlers): () => void {
  // 无全局 App()（如小游戏，或尚未注入）：订阅毫无意义——既不会有广播，又会把 handler
  // 永久滞留在模块级 subscribers 里（闭包持有集成实例 → 泄漏）。直接返回 no-op 退订。
  // 注：一旦已包装，globalThis.App 即我们的 wrapper（仍是 function），后续订阅照常生效。
  if (typeof (globalThis as any).App !== 'function') {
    return () => {};
  }

  subscribers.add(handlers);
  patchApp();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    subscribers.delete(handlers);
    unpatchAppIfIdle();
  };
}

/** 仅供测试：重置内部包装状态。 */
export function _resetAppLifecycle(): void {
  subscribers.clear();
  originalApp = null;
  patched = false;
}
