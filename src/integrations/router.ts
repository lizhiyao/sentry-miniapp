import { addBreadcrumb, getClient, getCurrentScope } from '@sentry/core';
import type { Client, Integration } from '@sentry/core';
import { sdk } from '../crossPlatform';
import {
  addFunctionInstrumentationHandler,
  ensureFunctionInstrumentation,
} from '../instrumentation';

/**
 * Router integration for miniapp navigation.
 *
 * @deprecated 默认不启用，导航面包屑已由 `PageBreadcrumbs`（基于 Page 生命周期）覆盖。
 * 保留导出仅为向后兼容，将在 2.0 移除。请勿在新代码中使用。
 */
export class Router implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Router';

  /**
   * @inheritDoc
   */
  public name: string = Router.id;

  /**
   * @inheritDoc
   */
  private _lastRoute: string = '';

  private readonly _cleanupCallbacks = new Set<() => void>();

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._ensureNavigationInstrumentation();
  }

  public setup(client: Client): void {
    const cleanups = [
      ...this._registerNavigationHandlers(client),
      this._startRouteMonitoring(client),
    ];
    const cleanup = this._trackCleanup(cleanups);
    client.registerCleanup(cleanup);
  }

  /**
   * Instrument navigation functions
   */
  private _ensureNavigationInstrumentation(): void {
    let currentSdk: any;
    try {
      currentSdk = sdk();
    } catch (_e) {
      return;
    }

    for (const method of ['navigateTo', 'redirectTo', 'switchTab', 'reLaunch', 'navigateBack']) {
      if (typeof currentSdk[method] === 'function') {
        ensureFunctionInstrumentation(currentSdk, method);
      }
    }
  }

  private _registerNavigationHandlers(client: Client): Array<() => void> {
    let currentSdk: any;
    try {
      currentSdk = sdk();
    } catch (_e) {
      return []; // No SDK available
    }

    const cleanups: Array<() => void> = [];
    const methods = ['navigateTo', 'redirectTo', 'switchTab', 'reLaunch'] as const;
    for (const method of methods) {
      if (typeof currentSdk[method] !== 'function') continue;
      const handler = (original: Function, thisArg: unknown, args: unknown[]): unknown => {
        const options = (args[0] || {}) as any;
        this._recordNavigation(method, options.url, this._getCurrentRoute());
        return original.apply(thisArg, args);
      };
      cleanups.push(addFunctionInstrumentationHandler(currentSdk, method, client, handler));
    }

    if (typeof currentSdk.navigateBack === 'function') {
      const handler = (original: Function, thisArg: unknown, args: unknown[]): unknown => {
        const options = (args[0] || {}) as any;
        this._recordNavigation('navigateBack', 'back', this._getCurrentRoute(), options.delta);
        return original.apply(thisArg, args.length > 0 ? args : [{}]);
      };
      cleanups.push(addFunctionInstrumentationHandler(currentSdk, 'navigateBack', client, handler));
    }
    return cleanups;
  }

  /**
   * Start monitoring route changes
   */
  private _startRouteMonitoring(client?: Client): () => void {
    // Monitor route changes by checking current pages periodically
    const monitorTimer = setInterval(() => {
      if (client && getClient() !== client) return;
      const currentRoute = this._getCurrentRoute();
      if (currentRoute && currentRoute !== this._lastRoute) {
        this._recordRouteChange(this._lastRoute, currentRoute);
        this._lastRoute = currentRoute;
      }
    }, 1000);
    return () => clearInterval(monitorTimer);
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    for (const cleanup of [...this._cleanupCallbacks]) cleanup();
    this._lastRoute = '';
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

  /**
   * Get current route
   */
  private _getCurrentRoute(): string {
    try {
      const global = globalThis as any;
      if (global.getCurrentPages) {
        const pages = global.getCurrentPages();
        if (pages && pages.length > 0) {
          const currentPage = pages[pages.length - 1];
          return currentPage.route || currentPage.__route__ || '';
        }
      }
    } catch (_e) {
      // Ignore errors
    }
    return '';
  }

  /**
   * Record navigation action
   */
  private _recordNavigation(action: string, to: string, from: string, delta?: number): void {
    const scope = getCurrentScope();

    // Add breadcrumb
    addBreadcrumb({
      category: 'navigation',
      data: {
        action,
        from,
        to,
        delta,
      },
      message: `Navigation ${action}: ${from} -> ${to}`,
      type: 'navigation',
    });

    // Set current route tag
    scope.setTag('route', to === 'back' ? from : to);

    // Set navigation context
    scope.setContext('navigation', {
      action,
      from,
      to,
      delta,
      timestamp: Date.now(),
    });
  }

  /**
   * Record route change
   */
  private _recordRouteChange(from: string, to: string): void {
    const scope = getCurrentScope();

    // Add breadcrumb
    addBreadcrumb({
      category: 'navigation',
      data: {
        from,
        to,
      },
      message: `Route changed: ${from} -> ${to}`,
      type: 'navigation',
    });

    // Update route tag
    scope.setTag('route', to);

    // Update route context
    scope.setContext('route', {
      current: to,
      previous: from,
      timestamp: Date.now(),
    });
  }
}
