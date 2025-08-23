import { addBreadcrumb } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';

import { sdk } from '../crossPlatform';

/** JSDoc */
interface BreadcrumbsOptions {
  console: boolean;
  navigation: boolean;
  request: boolean;
  userInteraction: boolean;
}

/**
 * Default Breadcrumbs instrumentations
 * TODO: Deprecated - with v6, this will be renamed to `Instrument`
 */
export class Breadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Breadcrumbs';

  /**
   * @inheritDoc
   */
  public name: string = Breadcrumbs.id;

  /** JSDoc */
  private readonly _options: BreadcrumbsOptions;

  /**
   * @inheritDoc
   */
  public constructor(options?: Partial<BreadcrumbsOptions>) {
    this._options = {
      console: true,
      navigation: true,
      request: true,
      userInteraction: true,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    if (this._options.console) {
      this._instrumentConsole();
    }
    if (this._options.navigation) {
      this._instrumentNavigation();
    }
    if (this._options.request) {
      this._instrumentRequest();
    }
    if (this._options.userInteraction) {
      this._instrumentUserInteraction();
    }
  }

  /** JSDoc */
  private _instrumentConsole(): void {
    const global = globalThis as any;
    if (!global.console) {
      return;
    }

    ['debug', 'info', 'warn', 'error', 'log', 'assert'].forEach((level: string) => {
      if (!(level in global.console)) {
        return;
      }

      const originalConsoleMethod = global.console[level];
      global.console[level] = function (...args: any[]): void {
        // 先调用原始方法，避免在Sentry初始化过程中出现问题
        originalConsoleMethod.apply(global.console, args);
        
        // 延迟添加面包屑，确保Sentry已经完全初始化
        setTimeout(() => {
          try {
            const message = args && args.length > 0 ? args.map(arg => 
              typeof arg === 'string' ? arg : 
              typeof arg === 'object' ? JSON.stringify(arg) : 
              String(arg)
            ).join(' ') : `[${level}]`;
            
            addBreadcrumb(
              {
                category: 'console',
                data: {
                  arguments: args,
                  logger: 'console',
                },
                level: level === 'warn' ? 'warning' : level === 'error' ? 'error' : 'info',
                message,
                timestamp: Date.now() / 1000,
              },
              {
                input: args,
                level,
              },
            );
          } catch (e) {
            // 忽略面包屑添加过程中的错误，避免影响应用正常运行
          }
        }, 0);
      };
    });
  }

  /** JSDoc */
  private _instrumentNavigation(): void {
    // 小程序页面导航事件
    const global = globalThis as any;
    
    // 监听页面显示事件
    if (global.getCurrentPages) {
      const originalGetCurrentPages = global.getCurrentPages;
      let lastPagePath = '';
      
      // 定期检查页面变化
      setInterval(() => {
        try {
          const pages = originalGetCurrentPages();
          if (pages && pages.length > 0) {
            const currentPage = pages[pages.length - 1];
            const currentPath = currentPage.route || currentPage.__route__ || '';
            
            if (currentPath && currentPath !== lastPagePath) {
              addBreadcrumb({
                category: 'navigation',
                data: {
                  from: lastPagePath,
                  to: currentPath,
                },
                message: `Navigation to ${currentPath}`,
                type: 'navigation',
              });
              lastPagePath = currentPath;
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }, 1000);
    }
  }

  /** JSDoc */
  private _instrumentRequest(): void {
    if (!sdk().request) {
      return;
    }
    const originalRequest = sdk().request;
    sdk().request = function (options: any): any {
      const startTime = Date.now();
      
      addBreadcrumb({
        category: 'http',
        data: {
          method: options.method || 'GET',
          url: options.url,
          data: options.data,
        },
        message: `${options.method || 'GET'} ${options.url}`,
        type: 'http',
      });

      const originalSuccess = options.success;
      const originalFail = options.fail;
      const originalComplete = options.complete;

      options.success = function (res: any): void {
        const duration = Date.now() - startTime;
        addBreadcrumb({
          category: 'http',
          data: {
            method: options.method || 'GET',
            url: options.url,
            status_code: res.statusCode,
            duration,
          },
          message: `${options.method || 'GET'} ${options.url} [${res.statusCode}]`,
          type: 'http',
          level: res.statusCode >= 400 ? 'error' : 'info',
        });
        
        if (originalSuccess) {
          originalSuccess.call(this, res);
        }
      };

      options.fail = function (err: any): void {
        const duration = Date.now() - startTime;
        addBreadcrumb({
          category: 'http',
          data: {
            method: options.method || 'GET',
            url: options.url,
            error: err.errMsg || err.message,
            duration,
          },
          message: `${options.method || 'GET'} ${options.url} failed`,
          type: 'http',
          level: 'error',
        });
        
        if (originalFail) {
          originalFail.call(this, err);
        }
      };

      options.complete = function (res: any): void {
        if (originalComplete) {
          originalComplete.call(this, res);
        }
      };

      return originalRequest.call(this, options);
    };
  }

  /** JSDoc */
  private _instrumentUserInteraction(): void {
    // 在小程序环境中，用户交互主要通过页面事件处理
    // 这里可以扩展监听特定的用户交互事件
    const global = globalThis as any;
    
    // 监听触摸事件（如果可用）
    if (global.wx && global.wx.onTouchStart) {
      global.wx.onTouchStart(() => {
        addBreadcrumb({
          category: 'ui',
          message: 'Touch interaction',
          type: 'user',
        });
      });
    }
  }
}

/**
 * Breadcrumbs integration
 */
export const breadcrumbsIntegration: IntegrationFn = (options?: Partial<BreadcrumbsOptions>) => {
  return new Breadcrumbs(options);
};