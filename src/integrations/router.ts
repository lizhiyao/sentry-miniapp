import { addBreadcrumb, getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';

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
    const global = globalThis as any;
    
    // Instrument wx.navigateTo
    if (global.wx && global.wx.navigateTo) {
      const originalNavigateTo = global.wx.navigateTo;
      global.wx.navigateTo = (options: any) => {
        this._recordNavigation('navigateTo', options.url, this._getCurrentRoute());
        return originalNavigateTo.call(global.wx, options);
      };
    }

    // Instrument wx.redirectTo
    if (global.wx && global.wx.redirectTo) {
      const originalRedirectTo = global.wx.redirectTo;
      global.wx.redirectTo = (options: any) => {
        this._recordNavigation('redirectTo', options.url, this._getCurrentRoute());
        return originalRedirectTo.call(global.wx, options);
      };
    }

    // Instrument wx.switchTab
    if (global.wx && global.wx.switchTab) {
      const originalSwitchTab = global.wx.switchTab;
      global.wx.switchTab = (options: any) => {
        this._recordNavigation('switchTab', options.url, this._getCurrentRoute());
        return originalSwitchTab.call(global.wx, options);
      };
    }

    // Instrument wx.navigateBack
    if (global.wx && global.wx.navigateBack) {
      const originalNavigateBack = global.wx.navigateBack;
      global.wx.navigateBack = (options: any = {}) => {
        this._recordNavigation('navigateBack', 'back', this._getCurrentRoute(), options.delta);
        return originalNavigateBack.call(global.wx, options);
      };
    }

    // Instrument wx.reLaunch
    if (global.wx && global.wx.reLaunch) {
      const originalReLaunch = global.wx.reLaunch;
      global.wx.reLaunch = (options: any) => {
        this._recordNavigation('reLaunch', options.url, this._getCurrentRoute());
        return originalReLaunch.call(global.wx, options);
      };
    }
  }

  /**
   * Start monitoring route changes
   */
  private _startRouteMonitoring(): void {
    // Monitor route changes by checking current pages periodically
    setInterval(() => {
      const currentRoute = this._getCurrentRoute();
      if (currentRoute && currentRoute !== this._lastRoute) {
        this._recordRouteChange(this._lastRoute, currentRoute);
        this._lastRoute = currentRoute;
      }
    }, 1000);
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
    } catch (e) {
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