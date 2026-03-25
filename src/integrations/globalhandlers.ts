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

  private _onErrorHandlerInstalled: boolean = false;
  private _onUnhandledRejectionHandlerInstalled: boolean = false;
  private _onPageNotFoundHandlerInstalled: boolean = false;
  private _onMemoryWarningHandlerInstalled: boolean = false;

  private _errorHandler: ((err: string | Error) => void) | null = null;
  private _rejectionHandler:
    | ((res: { reason: string | Error; promise: Promise<any> }) => void)
    | null = null;
  private _pageNotFoundHandler:
    | ((res: { path: string; query: Record<string, any>; isEntryPage: boolean }) => void)
    | null = null;
  private _memoryWarningHandler: ((res: { level: number }) => void) | null = null;

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
      this._errorHandler = (err: string | Error) => {
        const error = typeof err === 'string' ? new Error(err) : err;
        captureException(error, {
          mechanism: {
            type: 'onerror',
            handled: false,
          },
        });
      };
      sdk().onError?.(this._errorHandler);
    }

    this._onErrorHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnUnhandledRejectionHandler(): void {
    if (this._onUnhandledRejectionHandlerInstalled) {
      return;
    }

    if (sdk().onUnhandledRejection) {
      this._rejectionHandler = ({
        reason,
        promise,
      }: {
        reason: string | Error;
        promise: Promise<any>;
      }) => {
        const error = typeof reason === 'string' ? new Error(reason) : reason;
        captureException(error, {
          mechanism: {
            type: 'onunhandledrejection',
            handled: false,
          },
          data: {
            promise,
          },
        });
      };
      sdk().onUnhandledRejection?.(this._rejectionHandler);
    }

    this._onUnhandledRejectionHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnPageNotFoundHandler(): void {
    if (this._onPageNotFoundHandlerInstalled) {
      return;
    }

    if (sdk().onPageNotFound) {
      this._pageNotFoundHandler = (res: {
        path: string;
        query: Record<string, any>;
        isEntryPage: boolean;
      }) => {
        const scope = getCurrentScope();
        const url = res.path.split('?')[0];

        scope.setTag('pagenotfound', url);
        scope.setContext('page_not_found', {
          path: res.path,
          query: res.query,
          isEntryPage: res.isEntryPage,
        });

        captureException(new Error(`页面无法找到: ${url}`), {
          mechanism: {
            type: 'onpagenotfound',
            handled: true,
          },
        });
      };
      sdk().onPageNotFound?.(this._pageNotFoundHandler);
    }

    this._onPageNotFoundHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnMemoryWarningHandler(): void {
    if (this._onMemoryWarningHandlerInstalled) {
      return;
    }

    if (sdk().onMemoryWarning) {
      this._memoryWarningHandler = ({ level = -1 }: { level: number }) => {
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

        captureException(new Error('内存不足告警'), {
          mechanism: {
            type: 'onmemorywarning',
            handled: true,
          },
        });
      };
      sdk().onMemoryWarning?.(this._memoryWarningHandler);
    }

    this._onMemoryWarningHandlerInstalled = true;
  }

  /**
   * 清理资源，注销全局事件处理器
   */
  public cleanup(): void {
    try {
      const currentSdk = sdk() as any;
      if (this._errorHandler && currentSdk.offError) {
        currentSdk.offError(this._errorHandler);
      }
      if (this._rejectionHandler && currentSdk.offUnhandledRejection) {
        currentSdk.offUnhandledRejection(this._rejectionHandler);
      }
      if (this._pageNotFoundHandler && currentSdk.offPageNotFound) {
        currentSdk.offPageNotFound(this._pageNotFoundHandler);
      }
      if (this._memoryWarningHandler && currentSdk.offMemoryWarning) {
        currentSdk.offMemoryWarning(this._memoryWarningHandler);
      }
    } catch (_e) {
      // 部分平台可能不支持 off* 方法
    }

    this._errorHandler = null;
    this._rejectionHandler = null;
    this._pageNotFoundHandler = null;
    this._memoryWarningHandler = null;
    this._onErrorHandlerInstalled = false;
    this._onUnhandledRejectionHandlerInstalled = false;
    this._onPageNotFoundHandlerInstalled = false;
    this._onMemoryWarningHandlerInstalled = false;
  }
}

/**
 * Global handlers integration
 */
export const globalHandlersIntegration: IntegrationFn = (
  options?: Partial<GlobalHandlersIntegrations>,
) => {
  return new GlobalHandlers(options);
};
