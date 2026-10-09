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

import { getClient } from '@sentry/core';
import type { Client } from '@sentry/core';
import { isMinigame, sdk } from './crossPlatform';
import { getClientLifetime } from './lifecycle';
import type { ClientLifetime } from './lifecycle';

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
  currentSubscribers = subscribers,
): void {
  for (const subscription of eventSubscribers) {
    if (subscription.phase !== phase || !currentSubscribers.has(subscription)) continue;
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

interface NativeChannel {
  owner: Client | undefined;
  lifetime: ClientLifetime | undefined;
  subscribers: Set<Subscription>;
  releases: Array<() => void>;
  active: boolean;
  registeredShow: boolean;
  registeredHide: boolean;
  lastEvent?: 'onShow' | 'onHide';
  detachStop?: (() => void) | undefined;
  stop: () => void;
}
const nativeChannels = new WeakMap<Client, NativeChannel>();
const activeNativeChannels = new Set<NativeChannel>();

function channelActive(channel: NativeChannel): boolean {
  const owner = channel.owner;
  return (
    channel.active &&
    !!owner &&
    getClient() === owner &&
    owner.getOptions().enabled !== false &&
    (!channel.lifetime || channel.lifetime.canCollectAutomatic())
  );
}

function installNativeChannel(channel: NativeChannel): void {
  const host = sdk();
  const game = isMinigame();
  const listener = (key: keyof typeof host): Function | undefined => {
    try {
      const api = host[key];
      return typeof api === 'function' ? api : undefined;
    } catch (_error) {
      return undefined;
    }
  };
  for (const [method, onKey, offKey] of [
    ['onShow', game ? 'onShow' : 'onAppShow', game ? 'offShow' : 'offAppShow'],
    ['onHide', game ? 'onHide' : 'onAppHide', game ? 'offHide' : 'offAppHide'],
  ] as const) {
    if (!channelActive(channel)) break;
    const on = listener(onKey);
    const off = listener(offKey);
    if (!on || !channelActive(channel)) continue;
    const handler = (options?: unknown): void => {
      if (!channelActive(channel)) return;
      channel.lastEvent = method;
      // Session 收尾与最终 flush 的顺序不取决于集成安装顺序。
      const snapshot = [...channel.subscribers];
      for (const phase of ['before', 'after', 'flush'] as const) {
        broadcast(snapshot, phase, method, options, channel.subscribers);
      }
    };
    const release = (): void => {
      try {
        off?.call(host, handler);
      } catch (_error) {
        /* 一个 off 失败不阻断另一项；失效 handler 不再持有 owner。 */
      }
    };
    channel.releases.push(release);
    try {
      on.call(host, handler);
      if (method === 'onShow') channel.registeredShow = true;
      else channel.registeredHide = true;
    } catch (_error) {
      /* 部分注册后抛错也保留 release，生命周期能力仍按注册失败降级。 */
    } finally {
      // 宿主可能在 on 调用中退休 client，却在 off 之后才保存 handler。
      if (!channel.active) release();
    }
  }
}

interface MiniappLifecycleSubscription {
  stop: () => void;
  mode: 'app' | 'native' | 'none';
  available: boolean;
  complete: boolean;
  initialForeground: boolean;
  lateInit: boolean;
}

/** App 前后阶段优先；不可包装的宿主复用每个活动 owner 的原生生命周期通道。 */
export function subscribeMiniappLifecycle(
  client: Client,
  handlers: AppLifecycleHandlers,
  phase: LifecyclePhase = 'before',
): MiniappLifecycleSubscription {
  const lifetime = getClientLifetime(client);
  const unavailable: MiniappLifecycleSubscription = {
    stop: () => {},
    mode: 'none',
    available: false,
    complete: false,
    initialForeground: false,
    lateInit: false,
  };
  if (lifetime && !lifetime.canCollectAutomatic()) return unavailable;
  let hasApp = false;
  let lateInit = false;
  try {
    hasApp = typeof (globalThis as { App?: unknown }).App === 'function';
  } catch (_error) {
    /* 不可读 App 入口按宿主原生能力降级。 */
  }
  if (hasApp && !isMinigame()) {
    try {
      const getApp = (globalThis as { getApp?: () => unknown }).getApp;
      lateInit = !!getApp?.();
    } catch (_error) {
      /* App 注册前 getApp 抛错仍可包装后续 App 注册。 */
    }
    if (!lateInit) {
      const stop = subscribeAppLifecycle(handlers, phase);
      if (isAppLifecycleAvailable()) {
        return {
          stop,
          mode: 'app',
          available: true,
          complete: true,
          initialForeground: false,
          lateInit,
        };
      }
    }
  }
  let channel = nativeChannels.get(client);
  const subscription = { handlers, phase };
  if (channel) {
    channel.subscribers.add(subscription);
  } else {
    const created: NativeChannel = {
      owner: client,
      lifetime,
      subscribers: new Set([subscription]),
      releases: [],
      active: true,
      registeredShow: false,
      registeredHide: false,
      stop: () => {
        if (!created.active) return;
        created.active = false;
        const owner = created.owner;
        created.owner = undefined;
        created.lifetime = undefined;
        created.subscribers.clear();
        if (owner) nativeChannels.delete(owner);
        activeNativeChannels.delete(created);
        created.detachStop?.();
        created.detachStop = undefined;
        for (const release of created.releases.splice(0)) release();
      },
    };
    channel = created;
    nativeChannels.set(client, created);
    activeNativeChannels.add(created);
    created.detachStop = lifetime?.registerStop(created.stop);
    client.registerCleanup(created.stop);
    if (created.active) installNativeChannel(created);
  }
  const subscribedChannel = channel;
  return {
    stop: () => {
      subscribedChannel.subscribers.delete(subscription);
      if (subscribedChannel.subscribers.size === 0) subscribedChannel.stop();
    },
    mode: 'native',
    available: channel.active && (channel.registeredShow || channel.registeredHide),
    complete: channel.active && channel.registeredShow && channel.registeredHide,
    get initialForeground() {
      return subscribedChannel.lastEvent !== 'onHide';
    },
    lateInit,
  };
}

/** 仅供测试：重置内部包装状态。 */
export function _resetAppLifecycle(): void {
  for (const channel of [...activeNativeChannels]) channel.stop();
  subscribers.clear();
  if (patch) patch.active = false;
  patch = undefined;
}
