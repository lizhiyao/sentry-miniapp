import { captureException, getClient, withScope } from '@sentry/core';
import type { Client, Event, Integration, IntegrationFn } from '@sentry/core';

import { sdk } from '../crossPlatform';
import { getErrorDetails } from '../helpers';

interface RecentInstrumentEvent {
  capturedAt: number;
  type: string;
  value: string;
}

const ON_ERROR_DEDUPLICATION_WINDOW_MS = 1000;
const MAX_RECENT_INSTRUMENT_EVENTS = 20;

interface PlatformErrorPayload {
  message?: unknown;
  name?: unknown;
  stack?: unknown;
}

type PlatformErrorValue = string | Error | PlatformErrorPayload;

function errorFromPlatformValue(value: PlatformErrorValue): Error {
  if (value instanceof Error) {
    return value;
  }

  const details = getErrorDetails(value);
  const error = new Error(details?.message || 'Unknown platform error');
  if (details?.type) {
    error.name = details.type;
  }
  // 小程序 / 小游戏 onError 可能直接给字符串，也可能给
  // { message: "MiniProgramError\n...\nat ...", stack: "" }。覆盖本地构造 Error
  // 产生的无关 stack，让 MiniappClient 使用用户配置的 stackParser 解析宿主帧。
  if (details) {
    error.stack = details.stack || details.message;
  }
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

  private _errorHandler: ((err: PlatformErrorValue) => void) | null = null;
  private _rejectionHandler:
    | ((res: { reason: string | Error; promise: Promise<any> }) => void)
    | null = null;
  private _pageNotFoundHandler:
    | ((res: { path: string; query: Record<string, any>; isEntryPage: boolean }) => void)
    | null = null;
  private _memoryWarningHandler: ((res: { level: number }) => void) | null = null;
  private _client: Client | undefined;
  private readonly _recentInstrumentEvents: RecentInstrumentEvent[] = [];

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

  /**
   * TryCatch 捕获并重新抛出的异常，可能在微信小游戏真机上延迟进入 onError。
   * 在 Core 完成事件构建后比较最终异常类型和消息，避免依赖宿主原始 Error 的不稳定形态。
   */
  public processEvent(event: Event): Event | null {
    if (!this._options.onerror || event.type) {
      return event;
    }

    const exception = event.exception?.values?.find(
      (value) => value.mechanism?.type === 'instrument' || value.mechanism?.type === 'onerror',
    );
    if (!exception?.type || !exception.value) {
      return event;
    }

    const now = Date.now();
    this._removeExpiredInstrumentEvents(now);

    if (exception.mechanism?.type === 'instrument') {
      this._recentInstrumentEvents.push({
        capturedAt: now,
        type: exception.type,
        value: exception.value,
      });
      if (this._recentInstrumentEvents.length > MAX_RECENT_INSTRUMENT_EVENTS) {
        this._recentInstrumentEvents.splice(
          0,
          this._recentInstrumentEvents.length - MAX_RECENT_INSTRUMENT_EVENTS,
        );
      }
      return event;
    }

    const matchIndex = this._recentInstrumentEvents.findIndex(
      (candidate) => candidate.type === exception.type && candidate.value === exception.value,
    );
    if (matchIndex === -1) {
      return event;
    }

    this._recentInstrumentEvents.splice(matchIndex, 1);
    return null;
  }

  private _removeExpiredInstrumentEvents(now: number): void {
    for (let index = this._recentInstrumentEvents.length - 1; index >= 0; index -= 1) {
      if (
        now - this._recentInstrumentEvents[index]!.capturedAt >
        ON_ERROR_DEDUPLICATION_WINDOW_MS
      ) {
        this._recentInstrumentEvents.splice(index, 1);
      }
    }
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
      this._errorHandler = (err: PlatformErrorValue) => {
        if (this._client && getClient() !== this._client) return;

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
    this._recentInstrumentEvents.length = 0;
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
