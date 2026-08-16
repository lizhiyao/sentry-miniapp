import { addBreadcrumb, getClient, setContext } from '@sentry/core';
import type { Client, Integration } from '@sentry/core';

import { subscribeAppLifecycle } from '../appLifecycle';
import {
  addFunctionInstrumentationHandler,
  addSetupOnceFunctionInstrumentationHandler,
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
}

interface PageSubscriber {
  firstPageReady: boolean;
  launchTime: number;
  options: Required<PageBreadcrumbsOptions>;
}

const pageSubscribers = new Map<Client, PageSubscriber>();
let fallbackPageSubscriber: PageSubscriber | undefined;

function getActivePageSubscriber(): PageSubscriber | undefined {
  const activeClient = getClient();
  return (
    (activeClient ? pageSubscribers.get(activeClient) : undefined) ??
    (pageSubscribers.size === 0 ? fallbackPageSubscriber : undefined)
  );
}

function recordPageLifecycle(
  subscriber: PageSubscriber,
  method: (typeof PAGE_LIFECYCLE_METHODS)[number],
  page: any,
  args: any[],
): void {
  if (!subscriber.options.enableLifecycle) return;

  const route = page?.route || page?.__route__ || 'unknown';
  const breadcrumbData: Record<string, any> = { action: method, page: route };
  if (method === 'onLoad' && args[0] && typeof args[0] === 'object') {
    breadcrumbData['query'] = args[0];
  }
  if (method === 'onReady' && !subscriber.firstPageReady && subscriber.launchTime > 0) {
    subscriber.firstPageReady = true;
    const coldStartDuration = Date.now() - subscriber.launchTime;
    breadcrumbData['coldStartDuration'] = coldStartDuration;
    setContext('startup', { coldStartDuration, firstPage: route });
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
      if (event.target.dataset) breadcrumbData['dataset'] = event.target.dataset;
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
      const subscriber = getActivePageSubscriber();
      if (subscriber) recordPageLifecycle(subscriber, method, this, args);
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
      const subscriber = getActivePageSubscriber();
      if (subscriber) recordUserInteraction(subscriber, key, this, event);
      return original.apply(this, [event, ...rest]);
    };
    Object.defineProperty(wrapped, '__sentryPageCallbackWrapper', { value: true });
    options[key] = wrapped;
  }
}

function invokePage(original: Function, thisArg: unknown, args: unknown[]): unknown {
  instrumentPageOptions(args[0]);
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
  private readonly _setupOnceCleanupCallbacks = new Set<() => void>();
  private _setupOnceInitialized = false;

  constructor(options: PageBreadcrumbsOptions = {}) {
    this._options = {
      enableLifecycle: true,
      enableUserInteraction: true,
      ...options,
    };
  }

  public setupOnce(): void {
    if (this._setupOnceInitialized) return;
    this._setupOnceInitialized = true;
    const subscriber = this._createSubscriber();
    fallbackPageSubscriber = subscriber;

    const globalObject = globalThis as Record<PropertyKey, unknown>;
    if (typeof globalObject['Page'] === 'function') {
      ensureFunctionInstrumentation(globalObject, 'Page');
      Object.defineProperty(globalObject['Page'], '__sentryPageWrapper', {
        value: true,
        configurable: true,
      });
      this._setupOnceCleanupCallbacks.add(
        addSetupOnceFunctionInstrumentationHandler(globalObject, 'Page', invokePage),
      );
    }
    this._setupOnceCleanupCallbacks.add(this._subscribeApp(subscriber));
    this._setupOnceCleanupCallbacks.add(() => {
      if (fallbackPageSubscriber === subscriber) fallbackPageSubscriber = undefined;
    });
  }

  public setup(client: Client): void {
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
    this._clearSetupOnceHandlers();

    const cleanup = this._trackCleanup(cleanups);
    client.registerCleanup(cleanup);
  }

  public cleanup(): void {
    this._clearSetupOnceHandlers();
    for (const cleanup of [...this._cleanupCallbacks]) cleanup();
  }

  private _createSubscriber(): PageSubscriber {
    return { firstPageReady: false, launchTime: 0, options: this._options };
  }

  private _subscribeApp(subscriber: PageSubscriber): () => void {
    if (!subscriber.options.enableLifecycle) return () => {};
    return subscribeAppLifecycle({
      onLaunch: () => {
        if (getActivePageSubscriber() !== subscriber) return;
        subscriber.launchTime = Date.now();
        this._appBreadcrumb('onLaunch');
      },
      onShow: () => {
        if (getActivePageSubscriber() === subscriber) this._appBreadcrumb('onShow');
      },
      onHide: () => {
        if (getActivePageSubscriber() === subscriber) this._appBreadcrumb('onHide');
      },
    });
  }

  private _appBreadcrumb(method: string): void {
    addBreadcrumb({
      category: 'app.lifecycle',
      message: `App.${method}`,
      level: 'info',
      data: { action: method },
    });
  }

  private _clearSetupOnceHandlers(): void {
    for (const cleanup of this._setupOnceCleanupCallbacks) cleanup();
    this._setupOnceCleanupCallbacks.clear();
    this._setupOnceInitialized = false;
  }

  private _trackCleanup(cleanups: Array<() => void>): () => void {
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      for (const callback of cleanups.reverse()) callback();
      this._cleanupCallbacks.delete(cleanup);
    };
    this._cleanupCallbacks.add(cleanup);
    return cleanup;
  }
}

export const pageBreadcrumbsIntegration = (options?: PageBreadcrumbsOptions) =>
  new PageBreadcrumbs(options);
