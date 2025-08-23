import { captureException, getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';

import { sdk } from '../crossPlatform';

/** JSDoc */
interface GlobalHandlersIntegrations {
  onerror: boolean;
  onunhandledrejection: boolean;
  onpagenotfound: boolean;
  onmemorywarning: boolean;
}

/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'GlobalHandlers';

  /**
   * @inheritDoc
   */
  public name: string = GlobalHandlers.id;

  /** JSDoc */
  private readonly _options: GlobalHandlersIntegrations;

  /** JSDoc */
  private _onErrorHandlerInstalled: boolean = false;

  /** JSDoc */
  private _onUnhandledRejectionHandlerInstalled: boolean = false;

  /** JSDoc */
  private _onPageNotFoundHandlerInstalled: boolean = false;

  /** JSDoc */
  private _onMemoryWarningHandlerInstalled: boolean = false;

  /** JSDoc */
  public constructor(options?: Partial<GlobalHandlersIntegrations>) {
    this._options = {
      onerror: true,
      onunhandledrejection: true,
      onpagenotfound: true,
      onmemorywarning: true,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    Error.stackTraceLimit = 50;

    if (this._options.onerror) {
      this._installGlobalOnErrorHandler();
    }

    if (this._options.onunhandledrejection) {
      this._installGlobalOnUnhandledRejectionHandler();
    }

    if (this._options.onpagenotfound) {
      this._installGlobalOnPageNotFoundHandler();
    }

    if (this._options.onmemorywarning) {
      this._installGlobalOnMemoryWarningHandler();
    }
  }

  /** JSDoc */
  private _installGlobalOnErrorHandler(): void {
    if (this._onErrorHandlerInstalled) {
      return;
    }

    if (sdk().onError) {
      // https://developers.weixin.qq.com/miniprogram/dev/api/base/app/app-event/wx.onError.html
      sdk().onError?.((err: string | Error) => {
        const error = typeof err === 'string' ? new Error(err) : err;
        captureException(error, {
          mechanism: {
            type: 'onerror',
            handled: false,
          },
        });
      });
    }

    this._onErrorHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnUnhandledRejectionHandler(): void {
    if (this._onUnhandledRejectionHandlerInstalled) {
      return;
    }

    if (sdk().onUnhandledRejection) {
      /** JSDoc */
      interface OnUnhandledRejectionRes {
        reason: string | Error;
        promise: Promise<any>;
      }

      // https://developers.weixin.qq.com/miniprogram/dev/api/base/app/app-event/wx.onUnhandledRejection.html
      sdk().onUnhandledRejection?.(({ reason, promise }: OnUnhandledRejectionRes) => {
        const error = typeof reason === 'string' ? new Error(reason) : reason;
        (captureException as any)(error, {
          mechanism: {
            type: 'onunhandledrejection',
            handled: false,
          },
          extra: {
            promise,
          },
        });
      });
    }

    this._onUnhandledRejectionHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnPageNotFoundHandler(): void {
    if (this._onPageNotFoundHandlerInstalled) {
      return;
    }

    if (sdk().onPageNotFound) {
      sdk().onPageNotFound?.((res: { path: string; query: Record<string, any>; isEntryPage: boolean }) => {
        const scope = getCurrentScope();
        const url = res.path.split('?')[0];

        scope.setTag('pagenotfound', url);
        scope.setContext('page_not_found', {
          path: res.path,
          query: res.query,
          isEntryPage: res.isEntryPage,
        });
        
        (captureException as any)(new Error(`页面无法找到: ${url}`), {
          level: 'warning',
          mechanism: {
            type: 'onpagenotfound',
            handled: true,
          },
        });
      });
    }

    this._onPageNotFoundHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnMemoryWarningHandler(): void {
    if (this._onMemoryWarningHandlerInstalled) {
      return;
    }

    if (sdk().onMemoryWarning) {
      sdk().onMemoryWarning?.(({ level = -1 }: { level: number }) => {
        let levelMessage = '没有获取到告警级别信息';

        switch (level) {
          case 5:
            levelMessage = 'TRIM_MEMORY_RUNNING_MODERATE';
            break;
          case 10:
            levelMessage = 'TRIM_MEMORY_RUNNING_LOW';
            break;
          case 15:
            levelMessage = 'TRIM_MEMORY_RUNNING_CRITICAL';
            break;
          default:
            return;
        }

        const scope = getCurrentScope();
        scope.setTag('memory-warning', String(level));
        scope.setContext('memory_warning', {
          level,
          message: levelMessage,
        });
        
        (captureException as any)(new Error('内存不足告警'), {
          level: 'warning',
          mechanism: {
            type: 'onmemorywarning',
            handled: true,
          },
        });
      });
    }

    this._onMemoryWarningHandlerInstalled = true;
  }
}

/**
 * Global handlers integration
 */
export const globalHandlersIntegration: IntegrationFn = (options?: Partial<GlobalHandlersIntegrations>) => {
  return new GlobalHandlers(options);
};