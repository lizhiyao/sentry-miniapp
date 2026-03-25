import { addBreadcrumb, getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { sdk } from '../crossPlatform';

/** Router integration for miniapp navigation */
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

  private _monitorTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._instrumentNavigation();
    this._startRouteMonitoring();
  }

  /**
   * Instrument navigation functions
   */
  private _instrumentNavigation(): void {
    let currentSdk: any;
    try {
      currentSdk = sdk();
    } catch (_e) {
      return; // No SDK available
    }

    const methods = ['navigateTo', 'redirectTo', 'switchTab', 'reLaunch'] as const;
    for (const method of methods) {
      if (currentSdk[method]) {
        const original = currentSdk[method];
        currentSdk[method] = (options: any) => {
          this._recordNavigation(method, options.url, this._getCurrentRoute());
          return original.call(currentSdk, options);
        };
      }
    }

    if (currentSdk.navigateBack) {
      const originalNavigateBack = currentSdk.navigateBack;
      currentSdk.navigateBack = (options: any = {}) => {
        this._recordNavigation('navigateBack', 'back', this._getCurrentRoute(), options.delta);
        return originalNavigateBack.call(currentSdk, options);
      };
    }
  }

  /**
   * Start monitoring route changes
   */
  private _startRouteMonitoring(): void {
    // Monitor route changes by checking current pages periodically
    this._monitorTimer = setInterval(() => {
      const currentRoute = this._getCurrentRoute();
      if (currentRoute && currentRoute !== this._lastRoute) {
        this._recordRouteChange(this._lastRoute, currentRoute);
        this._lastRoute = currentRoute;
      }
    }, 1000);
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    if (this._monitorTimer) {
      clearInterval(this._monitorTimer);
      this._monitorTimer = null;
    }
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

/**
 * Router integration
 */
export const routerIntegration: IntegrationFn = () => {
  return new Router();
};
