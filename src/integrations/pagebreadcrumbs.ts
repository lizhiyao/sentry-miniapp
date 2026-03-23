import { addBreadcrumb } from '@sentry/core';
import type { Integration } from '@sentry/core';

/**
 * 页面生命周期和用户交互事件的面包屑方法名
 */
const PAGE_LIFECYCLE_METHODS = ['onLoad', 'onShow', 'onHide', 'onUnload', 'onReady'];
const APP_LIFECYCLE_METHODS = ['onLaunch', 'onShow', 'onHide'];

/**
 * 判断方法名是否为用户交互事件处理函数
 * 排除生命周期方法和以 _ 开头的私有方法
 */
function isUserInteractionHandler(name: string): boolean {
  if (PAGE_LIFECYCLE_METHODS.includes(name)) return false;
  if (name.startsWith('_')) return false;

  // 常见的事件处理方法命名模式
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

/**
 * Page/App 面包屑集成配置
 */
export interface PageBreadcrumbsOptions {
  /** 是否追踪页面生命周期（默认 true） */
  enableLifecycle?: boolean;
  /** 是否追踪用户交互事件（默认 true） */
  enableUserInteraction?: boolean;
}

/**
 * Page 面包屑集成
 *
 * 通过包装小程序的 Page() 和 App() 全局构造函数，自动记录：
 * - 页面生命周期事件（onLoad/onShow/onHide/onUnload/onReady）
 * - App 生命周期事件（onLaunch/onShow/onHide）
 * - 用户交互事件（onTap/handleClick/bindChange 等）
 */
export class PageBreadcrumbs implements Integration {
  public static id: string = 'PageBreadcrumbs';
  public name: string = PageBreadcrumbs.id;

  private _options: Required<PageBreadcrumbsOptions>;

  constructor(options: PageBreadcrumbsOptions = {}) {
    this._options = {
      enableLifecycle: true,
      enableUserInteraction: true,
      ...options,
    };
  }

  public setupOnce(): void {
    this._wrapPage();
    this._wrapApp();
  }

  /**
   * 包装全局 Page() 构造函数
   */
  private _wrapPage(): void {
    const global = globalThis as any;
    if (typeof global.Page !== 'function') return;

    const originalPage = global.Page;
    const options = this._options;

    global.Page = function (pageOptions: any) {
      if (pageOptions && typeof pageOptions === 'object') {
        // 包装生命周期方法
        if (options.enableLifecycle) {
          for (const method of PAGE_LIFECYCLE_METHODS) {
            if (typeof pageOptions[method] === 'function') {
              const original = pageOptions[method];
              pageOptions[method] = function (this: any, ...args: any[]) {
                const route = this?.route || this?.__route__ || 'unknown';
                addBreadcrumb({
                  category: 'page.lifecycle',
                  message: `${method}: ${route}`,
                  level: 'info',
                  data: {
                    action: method,
                    page: route,
                  },
                });
                return original.apply(this, args);
              };
            }
          }
        }

        // 包装用户交互事件处理方法
        if (options.enableUserInteraction) {
          for (const key of Object.keys(pageOptions)) {
            if (typeof pageOptions[key] === 'function' && isUserInteractionHandler(key)) {
              const original = pageOptions[key];
              pageOptions[key] = function (this: any, event: any, ...rest: any[]) {
                const route = this?.route || this?.__route__ || 'unknown';
                const breadcrumbData: Record<string, any> = {
                  handler: key,
                  page: route,
                };

                // 提取事件目标信息
                if (event && typeof event === 'object') {
                  if (event.target) {
                    if (event.target.id) breadcrumbData['targetId'] = event.target.id;
                    if (event.target.dataset) breadcrumbData['dataset'] = event.target.dataset;
                  }
                  if (event.type) breadcrumbData['eventType'] = event.type;
                }

                addBreadcrumb({
                  category: 'user.interaction',
                  message: `${key} on ${route}`,
                  level: 'info',
                  data: breadcrumbData,
                });
                return original.apply(this, [event, ...rest]);
              };
            }
          }
        }
      }

      return originalPage(pageOptions);
    };
  }

  /**
   * 包装全局 App() 构造函数
   */
  private _wrapApp(): void {
    const global = globalThis as any;
    if (typeof global.App !== 'function') return;

    const originalApp = global.App;
    const options = this._options;

    global.App = function (appOptions: any) {
      if (appOptions && typeof appOptions === 'object' && options.enableLifecycle) {
        for (const method of APP_LIFECYCLE_METHODS) {
          if (typeof appOptions[method] === 'function') {
            const original = appOptions[method];
            appOptions[method] = function (this: any, ...args: any[]) {
              addBreadcrumb({
                category: 'app.lifecycle',
                message: `App.${method}`,
                level: 'info',
                data: {
                  action: method,
                },
              });
              return original.apply(this, args);
            };
          }
        }
      }

      return originalApp(appOptions);
    };
  }
}

/**
 * Page 面包屑集成工厂函数
 */
export const pageBreadcrumbsIntegration = (options?: PageBreadcrumbsOptions) => {
  return new PageBreadcrumbs(options);
};
