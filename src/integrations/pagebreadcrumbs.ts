import { getClientLifetime, withTelemetryCritical } from '../lifecycle';
import { getClientEnvironment, setClientContext } from '../clientState';
import { addBreadcrumb, getClient } from '@sentry/core';
import type { Client, Integration } from '@sentry/core';

import { subscribeAppLifecycle } from '../appLifecycle';
import { collectKeyValueData, sanitizeCollectedData, sensitiveDenyTerms } from '../dataCollection';
import {
  addFunctionInstrumentationHandler,
  ensureFunctionInstrumentation,
} from '../instrumentation';

const PAGE_LIFECYCLE_METHODS = ['onLoad', 'onShow', 'onHide', 'onUnload', 'onReady'] as const;

function isUserInteractionHandler(name: string): boolean {
  if ((PAGE_LIFECYCLE_METHODS as readonly string[]).includes(name)) return false;
  if (name.startsWith('_')) return false;

  return (
    /^(on|handle|bind)[A-Z]/.test(name) ||
    /[Tt]ap$/.test(name) ||
    /[Cc]lick$/.test(name) ||
    /[Cc]hange$/.test(name) ||
    /[Ss]ubmit$/.test(name) ||
    /[Ss]croll$/.test(name) ||
    /[Ii]nput$/.test(name)
  );
}

export interface PageBreadcrumbsOptions {
  /** 是否追踪页面生命周期（默认 true） */
  enableLifecycle?: boolean;
  /** 是否追踪用户交互事件（默认 true） */
  enableUserInteraction?: boolean;
  /** 在 core 内置敏感片段之上追加的键名片段，作用于页面入参与交互 dataset */
  sensitiveKeys?: string[];
}

interface PageSubscriber {
  firstPageReady: boolean;
  launchTime: number;
  options: Required<PageBreadcrumbsOptions>;
}

const pageSubscribers = new Map<Client, PageSubscriber>();

function getActivePageEntry(): { client: Client; subscriber: PageSubscriber } | undefined {
  const activeClient = getClient();
  const lifetime = activeClient && getClientLifetime(activeClient);
  const subscriber =
    activeClient && (!lifetime || lifetime.canCollectAutomatic())
      ? pageSubscribers.get(activeClient)
      : undefined;
  return subscriber && activeClient ? { client: activeClient, subscriber } : undefined;
}

function recordPageLifecycle(
  client: Client,
  subscriber: PageSubscriber,
  method: (typeof PAGE_LIFECYCLE_METHODS)[number],
  page: any,
  args: any[],
): void {
  if (!subscriber.options.enableLifecycle) return;

  const route = page?.route || page?.__route__ || 'unknown';
  if ((method === 'onLoad' || method === 'onShow') && route !== 'unknown')
    getClientEnvironment(client).route = route;
  const breadcrumbData: Record<string, any> = { action: method, page: route };
  if (method === 'onLoad' && args[0] && typeof args[0] === 'object') {
    // 页面入参就是 URL query，按 dataCollection.urlQueryParams 脱敏后再记；false 时整块不采。
    const query = collectKeyValueData(
      args[0] as Record<string, unknown>,
      client,
      subscriber.options.sensitiveKeys,
    );
    if (query) breadcrumbData['query'] = query;
  }
  if (method === 'onReady' && !subscriber.firstPageReady && subscriber.launchTime > 0) {
    subscriber.firstPageReady = true;
    const coldStartDuration = Date.now() - subscriber.launchTime;
    breadcrumbData['coldStartDuration'] = coldStartDuration;
    setClientContext(client, 'startup', { coldStartDuration, firstPage: route });
  }

  addBreadcrumb({
    category: 'page.lifecycle',
    message: `${method}: ${route}`,
    level: 'info',
    data: breadcrumbData,
  });
}

function recordUserInteraction(
  subscriber: PageSubscriber,
  key: string,
  page: any,
  event: any,
): void {
  if (!subscriber.options.enableUserInteraction) return;

  const route = page?.route || page?.__route__ || 'unknown';
  const breadcrumbData: Record<string, any> = { handler: key, page: route };
  if (event && typeof event === 'object') {
    if (event.target) {
      if (event.target.id) breadcrumbData['targetId'] = event.target.id;
      // dataset 由业务写在模板里，可能带 token／单号；按 core 的敏感片段口径脱敏。
      if (event.target.dataset) {
        breadcrumbData['dataset'] = sanitizeCollectedData(
          event.target.dataset,
          true,
          sensitiveDenyTerms(subscriber.options.sensitiveKeys),
        );
      }
    }
    if (event.type) breadcrumbData['eventType'] = event.type;
    if (event.detail) {
      if (typeof event.detail.x === 'number') breadcrumbData['x'] = event.detail.x;
      if (typeof event.detail.y === 'number') breadcrumbData['y'] = event.detail.y;
    }
    if (event.touches && event.touches.length > 0) {
      const touch = event.touches[0];
      if (touch) {
        breadcrumbData['touchX'] = touch.pageX;
        breadcrumbData['touchY'] = touch.pageY;
      }
    }
  }

  addBreadcrumb({
    category: 'user.interaction',
    message: `${key} on ${route}`,
    level: 'info',
    data: breadcrumbData,
  });
}

/** Page 定义只注入中立 wrapper，回调执行时再按当前 client 选择配置。 */
function instrumentPageOptions(pageOptions: unknown): void {
  if (!pageOptions || typeof pageOptions !== 'object') return;
  const options = pageOptions as Record<string, any>;

  for (const method of PAGE_LIFECYCLE_METHODS) {
    const original = options[method];
    if (typeof original !== 'function' || original.__sentryPageCallbackWrapper) continue;
    const wrapped = function (this: any, ...args: any[]): any {
      const active = getActivePageEntry();
      if (active) {
        try {
          withTelemetryCritical(() =>
            recordPageLifecycle(active.client, active.subscriber, method, this, args),
          );
        } catch (_error) {
          /* 保留原业务回调。 */
        }
      }
      return original.apply(this, args);
    };
    Object.defineProperty(wrapped, '__sentryPageCallbackWrapper', { value: true });
    options[method] = wrapped;
  }

  for (const key of Object.keys(options)) {
    const original = options[key];
    if (
      typeof original !== 'function' ||
      original.__sentryPageCallbackWrapper ||
      !isUserInteractionHandler(key)
    ) {
      continue;
    }
    const wrapped = function (this: any, event: any, ...rest: any[]): any {
      const active = getActivePageEntry();
      if (active) {
        try {
          withTelemetryCritical(() => recordUserInteraction(active.subscriber, key, this, event));
        } catch (_error) {
          /* 保留原业务回调。 */
        }
      }
      return original.apply(this, [event, ...rest]);
    };
    Object.defineProperty(wrapped, '__sentryPageCallbackWrapper', { value: true });
    options[key] = wrapped;
  }
}

function invokePage(original: Function, thisArg: unknown, args: unknown[]): unknown {
  try {
    withTelemetryCritical(() => instrumentPageOptions(args[0]));
  } catch (_error) {
    /* 冻结或不可读定义不阻断宿主 Page 注册。 */
  }
  return original.apply(thisArg, args);
}

/**
 * 页面与 App 生命周期面包屑。全局 Page 由共享 instrumentation 统一拥有；每个 client
 * 只注册 subscriber，乱序 close 不会拆掉当前 client 的包装或复活旧配置。
 */
export class PageBreadcrumbs implements Integration {
  public static id: string = 'PageBreadcrumbs';
  public name: string = PageBreadcrumbs.id;

  private readonly _options: Required<PageBreadcrumbsOptions>;
  private readonly _cleanupCallbacks = new Set<() => void>();

  constructor(options: PageBreadcrumbsOptions = {}) {
    this._options = {
      enableLifecycle: true,
      enableUserInteraction: true,
      sensitiveKeys: [],
      ...options,
    };
  }

  public setupOnce(): void {
    const globalObject = globalThis as Record<PropertyKey, unknown>;
    if (typeof globalObject['Page'] === 'function') {
      ensureFunctionInstrumentation(globalObject, 'Page');
    }
  }

  public setup(client: Client): void {
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    const subscriber = this._createSubscriber();
    pageSubscribers.set(client, subscriber);
    const globalObject = globalThis as Record<PropertyKey, unknown>;
    const cleanups: Array<() => void> = [
      () => {
        if (pageSubscribers.get(client) === subscriber) pageSubscribers.delete(client);
      },
      this._subscribeApp(subscriber),
    ];
    if (typeof globalObject['Page'] === 'function') {
      cleanups.push(addFunctionInstrumentationHandler(globalObject, 'Page', client, invokePage));
    }
    const cleanup = this._trackCleanup(cleanups);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
  }

  public cleanup(): void {
    for (const cleanup of [...this._cleanupCallbacks]) cleanup();
  }

  private _createSubscriber(): PageSubscriber {
    return { firstPageReady: false, launchTime: 0, options: this._options };
  }

  private _subscribeApp(subscriber: PageSubscriber): () => void {
    if (!subscriber.options.enableLifecycle) return () => {};
    const activeSubscriber = (): PageSubscriber | undefined => getActivePageEntry()?.subscriber;
    return subscribeAppLifecycle({
      onLaunch: () => {
        if (activeSubscriber() !== subscriber) return;
        subscriber.launchTime = Date.now();
        this._appBreadcrumb('onLaunch');
      },
      onShow: () => {
        if (activeSubscriber() === subscriber) this._appBreadcrumb('onShow');
      },
      onHide: () => {
        if (activeSubscriber() === subscriber) this._appBreadcrumb('onHide');
      },
    });
  }

  private _appBreadcrumb(method: string): void {
    withTelemetryCritical(() =>
      addBreadcrumb({
        category: 'app.lifecycle',
        message: `App.${method}`,
        level: 'info',
        data: { action: method },
      }),
    );
  }

  private _trackCleanup(cleanups: Array<() => void>): () => void {
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      for (const callback of cleanups.splice(0).reverse()) {
        try {
          callback();
        } catch (_error) {
          /* 继续解除其余订阅。 */
        }
      }
      this._cleanupCallbacks.delete(cleanup);
    };
    this._cleanupCallbacks.add(cleanup);
    return cleanup;
  }
}

export const pageBreadcrumbsIntegration = (options?: PageBreadcrumbsOptions) =>
  new PageBreadcrumbs(options);
