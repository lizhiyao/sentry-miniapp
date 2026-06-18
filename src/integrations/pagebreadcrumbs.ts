import { addBreadcrumb, setContext } from '@sentry/core';
import type { Integration } from '@sentry/core';
import { subscribeAppLifecycle } from '../appLifecycle';

/**
 * 页面生命周期和用户交互事件的面包屑方法名
 */
const PAGE_LIFECYCLE_METHODS = ['onLoad', 'onShow', 'onHide', 'onUnload', 'onReady'];

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
  private _originalPage: ((...args: any[]) => any) | null = null;
  private _unsubscribeApp: (() => void) | null = null;
  private _launchTime: number = 0;
  private _firstPageReady: boolean = false;

  constructor(options: PageBreadcrumbsOptions = {}) {
    this._options = {
      enableLifecycle: true,
      enableUserInteraction: true,
      ...options,
    };
  }

  public setupOnce(): void {
    this._wrapPage();
    this._subscribeApp();
  }

  /**
   * 包装全局 Page() 构造函数
   */
  private _wrapPage(): void {
    const global = globalThis as any;
    if (typeof global.Page !== 'function') return;
    // 幂等守卫：已是本集成的包装则跳过，避免二次 setupOnce 套娃
    //（会让 _originalPage 指向上一层包装，cleanup 还原成包装而非真身）。
    if (global.Page.__sentryPageWrapper) return;

    this._originalPage = global.Page;
    const originalPage = global.Page;
    const options = this._options;
    const getFirstPageReady = () => this._firstPageReady;
    const setFirstPageReady = (v: boolean) => {
      this._firstPageReady = v;
    };
    const getLaunchTime = () => this._launchTime;

    const wrappedPage = function (pageOptions: any) {
      if (pageOptions && typeof pageOptions === 'object') {
        // 包装生命周期方法
        if (options.enableLifecycle) {
          for (const method of PAGE_LIFECYCLE_METHODS) {
            if (typeof pageOptions[method] === 'function') {
              const original = pageOptions[method];
              pageOptions[method] = function (this: any, ...args: any[]) {
                const route = this?.route || this?.__route__ || 'unknown';
                const breadcrumbData: Record<string, any> = {
                  action: method,
                  page: route,
                };

                // 记录 onLoad 的 query 参数
                if (method === 'onLoad' && args[0] && typeof args[0] === 'object') {
                  breadcrumbData['query'] = args[0];
                }

                // 记录冷启动耗时（首次 onReady）
                if (method === 'onReady' && !getFirstPageReady() && getLaunchTime() > 0) {
                  setFirstPageReady(true);
                  const coldStartDuration = Date.now() - getLaunchTime();
                  breadcrumbData['coldStartDuration'] = coldStartDuration;
                  setContext('startup', {
                    coldStartDuration,
                    firstPage: route,
                  });
                }

                addBreadcrumb({
                  category: 'page.lifecycle',
                  message: `${method}: ${route}`,
                  level: 'info',
                  data: breadcrumbData,
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

                // 提取事件目标和交互详情
                if (event && typeof event === 'object') {
                  if (event.target) {
                    if (event.target.id) breadcrumbData['targetId'] = event.target.id;
                    if (event.target.dataset) breadcrumbData['dataset'] = event.target.dataset;
                  }
                  if (event.type) breadcrumbData['eventType'] = event.type;
                  // 提取触摸坐标
                  if (event.detail) {
                    if (typeof event.detail.x === 'number') breadcrumbData['x'] = event.detail.x;
                    if (typeof event.detail.y === 'number') breadcrumbData['y'] = event.detail.y;
                  }
                  // 提取触摸点信息
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
                return original.apply(this, [event, ...rest]);
              };
            }
          }
        }
      }

      return originalPage(pageOptions);
    };
    (wrappedPage as any).__sentryPageWrapper = true;
    global.Page = wrappedPage;
  }

  /**
   * 订阅全局 App 生命周期（经共享 appLifecycle，不再自行猴补 App）。
   * 记录 onLaunch 时间用于冷启动耗时计算，并对各生命周期打 app.lifecycle 面包屑。
   */
  private _subscribeApp(): void {
    if (!this._options.enableLifecycle) return;

    this._unsubscribeApp = subscribeAppLifecycle({
      onLaunch: () => {
        this._launchTime = Date.now();
        this._appBreadcrumb('onLaunch');
      },
      onShow: () => this._appBreadcrumb('onShow'),
      onHide: () => this._appBreadcrumb('onHide'),
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

  /**
   * 清理资源：恢复原始 Page() 构造函数，并退订 App 生命周期。
   */
  public cleanup(): void {
    const global = globalThis as any;
    if (this._originalPage) {
      // 安全还原：仅当当前 Page 仍是本集成的包装时才还原，避免把他人后续包装的 Page 一并清掉。
      if (global.Page && global.Page.__sentryPageWrapper) {
        global.Page = this._originalPage;
      }
      this._originalPage = null;
    }
    if (this._unsubscribeApp) {
      this._unsubscribeApp();
      this._unsubscribeApp = null;
    }
  }
}

/**
 * Page 面包屑集成工厂函数
 */
export const pageBreadcrumbsIntegration = (options?: PageBreadcrumbsOptions) => {
  return new PageBreadcrumbs(options);
};
