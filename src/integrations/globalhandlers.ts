import { captureException, getClient, withScope } from '@sentry/core';
import type { Client, Integration, IntegrationFn } from '@sentry/core';

import { sdk } from '../crossPlatform';
import { shouldIgnoreOnError } from '../helpers';

function errorFromPlatformValue(value: string | Error): Error {
  if (typeof value !== 'string') {
    return value;
  }

  const error = new Error(value);
  // 小程序 / 小游戏 onError 只给字符串时，堆栈也包含在该字符串中。覆盖本地构造
  // Error 产生的无关 stack，让 MiniappClient 使用用户配置的 stackParser 解析宿主帧。
  error.stack = value;
  return error;
}

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
  private _client: Client | undefined;

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
    this._setup();
  }

  /** 按 core 官方生命周期在每个 client 上安装，并由 client 统一回收。 */
  public setup(client: Client): void {
    this._client = client;
    this._setup();
    client.registerCleanup(() => this.cleanup());
  }

  private _setup(): void {
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
        if (this._client && getClient() !== this._client) return;
        if (shouldIgnoreOnError(err)) {
          return;
        }

        const error = errorFromPlatformValue(err);
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
        if (this._client && getClient() !== this._client) return;
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
        if (this._client && getClient() !== this._client) return;
        const url = res.path.split('?')[0];

        withScope((scope) => {
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
        if (this._client && getClient() !== this._client) return;
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

        withScope((scope) => {
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
