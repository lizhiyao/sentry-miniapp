import { captureException, getClient, withScope } from '@sentry/core';
import type { Client, Event, EventHint, Integration, IntegrationFn, Exception } from '@sentry/core';

import { sdk } from '../crossPlatform';
import { getClientLifetime, withTelemetryCritical } from '../lifecycle';
import { getErrorDetails } from '../helpers';
import { miniappStackParser } from '../stacktrace';
import { collectKeyValueData, collectUrlName } from '../dataCollection';
import type { MiniappOptions } from '../types';

interface RecentInstrumentEvent {
  capturedAt: number;
  type: string;
  value: string;
  stack: string;
}

/** 只匹配完整、有位置证据的有限 stack；没有来源时宁可保留宿主真实报告。 */
function stackSignature(exception: Exception): string | undefined {
  const frames = exception.stacktrace?.frames;
  if (!frames?.length || frames.length > 50) return undefined;
  if (
    frames.some(
      (frame) =>
        !frame.filename ||
        frame.filename === '<anonymous>' ||
        typeof frame.lineno !== 'number' ||
        !Number.isSafeInteger(frame.lineno) ||
        frame.lineno <= 0 ||
        (frame.colno !== undefined && (!Number.isSafeInteger(frame.colno) || frame.colno < 0)),
    )
  )
    return undefined;
  return JSON.stringify(frames.map((frame) => [frame.filename, frame.lineno, frame.colno ?? null]));
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
    const stack = details.stack || details.message;
    // core 的 exceptionFromError 固定跳过首行。宿主可能直接从 frame 开始，补标准 header。
    const firstLine = stack.split('\n', 1)[0] ?? '';
    error.stack = miniappStackParser(firstLine, 0).length
      ? `${error.name}: ${error.message}\n${stack}`
      : stack;
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

  private _errorHandler: ((err: PlatformErrorValue) => void) | null = null;
  private _rejectionHandler:
    ((res: { reason: string | Error; promise: Promise<any> }) => void) | null = null;
  private _pageNotFoundHandler:
    ((res: { path: string; query: Record<string, any>; isEntryPage: boolean }) => void) | null =
    null;
  private _memoryWarningHandler: ((res: { level: number }) => void) | null = null;
  private _client: Client | undefined;
  private _sdk: ReturnType<typeof sdk> | undefined;
  private readonly _controllers = new WeakMap<Client, GlobalHandlers>();
  private readonly _cleanups = new Set<() => void>();
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
  public setupOnce(): void {}

  /** 同一 integration 对象复用时，各 client 的宿主资源与去重窗口仍独立。 */
  public setup(client: Client): void {
    if (this._controllers.has(client)) return;
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    const controller = new GlobalHandlers(this._options);
    controller._client = client;
    this._controllers.set(client, controller);
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      controller.cleanup();
      this._controllers.delete(client);
      this._cleanups.delete(cleanup);
    };
    this._cleanups.add(cleanup);
    const detach = lifetime?.registerStop(cleanup);
    // 在注册宿主资源前登记清理，部分注册成功后失败也不会泄漏归属。
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
    controller._sdk = sdk();
    controller._setup();
  }

  private _isActiveClient(): boolean {
    const client = this._client;
    if (!client || getClient() !== client || client.getOptions().enabled === false) return false;
    const lifetime = getClientLifetime(client);
    return !lifetime || lifetime.canCollectAutomatic();
  }

  private _guard<T extends unknown[]>(handler: (...args: T) => void): (...args: T) => void {
    return (...args) => {
      if (!this._isActiveClient()) return;
      withTelemetryCritical(() => {
        try {
          handler(...args);
        } catch (_error) {
          /* 宿主数据或遥测故障不向宿主抛出。 */
        }
      });
    };
  }

  private _listen(onName: string, offName: string, handler: Function): void {
    const source = this._sdk;
    const on = source?.[onName as keyof typeof source];
    const off = source?.[offName as keyof typeof source];
    if (typeof on !== 'function' || !this._isActiveClient()) return;
    try {
      on.call(source, handler);
    } finally {
      // 宿主可能在注册中退休 client，且在 cleanup 返回后才保存 handler。
      if (!this._isActiveClient() && typeof off === 'function') off.call(source, handler);
    }
  }

  /**
   * TryCatch 捕获并重新抛出的异常，可能在微信小游戏真机上延迟进入 onError。
   * 在 Core 构建后比较类型、消息和完整位置 stack；同一 Error 身份仍交给 core 判断。
   */
  public processEvent(event: Event, _hint?: EventHint, client?: Client): Event | null {
    if (client) {
      const controller = this._controllers.get(client);
      return controller ? controller.processEvent(event) : event;
    }
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
    const stack = stackSignature(exception);
    if (!stack) return event;

    if (exception.mechanism?.type === 'instrument') {
      this._recentInstrumentEvents.push({
        capturedAt: now,
        type: exception.type,
        value: exception.value,
        stack,
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
      (candidate) =>
        candidate.type === exception.type &&
        candidate.value === exception.value &&
        candidate.stack === stack,
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
        now < this._recentInstrumentEvents[index]!.capturedAt ||
        now - this._recentInstrumentEvents[index]!.capturedAt > ON_ERROR_DEDUPLICATION_WINDOW_MS
      ) {
        this._recentInstrumentEvents.splice(index, 1);
      }
    }
  }

  private _setup(): void {
    Error.stackTraceLimit = 50;

    const installers: Array<[boolean, () => void]> = [
      [this._options.onerror, () => this._installGlobalOnErrorHandler()],
      [this._options.onunhandledrejection, () => this._installGlobalOnUnhandledRejectionHandler()],
      [this._options.onpagenotfound, () => this._installGlobalOnPageNotFoundHandler()],
      [this._options.onmemorywarning, () => this._installGlobalOnMemoryWarningHandler()],
    ];
    for (const [enabled, install] of installers) {
      if (!this._isActiveClient()) break;
      if (!enabled) continue;
      try {
        install();
      } catch (_error) {
        /* 一个宿主能力失败不阻断其余监听。 */
      }
    }
  }

  /** JSDoc */
  private _installGlobalOnErrorHandler(): void {
    if (this._isActiveClient()) {
      this._errorHandler = this._guard((err: PlatformErrorValue) => {
        const error = errorFromPlatformValue(err);
        captureException(error, {
          mechanism: {
            type: 'onerror',
            handled: false,
          },
        });
      });
      this._listen('onError', 'offError', this._errorHandler);
    }
  }

  /** JSDoc */
  private _installGlobalOnUnhandledRejectionHandler(): void {
    if (this._isActiveClient()) {
      this._rejectionHandler = this._guard(
        ({ reason, promise }: { reason: string | Error; promise: Promise<any> }) => {
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
        },
      );
      this._listen('onUnhandledRejection', 'offUnhandledRejection', this._rejectionHandler);
    }
  }

  /** JSDoc */
  private _installGlobalOnPageNotFoundHandler(): void {
    if (this._isActiveClient()) {
      this._pageNotFoundHandler = this._guard(
        (res: { path: string; query: Record<string, any>; isEntryPage: boolean }) => {
          const url = collectUrlName(res.path);
          const query = collectKeyValueData(
            res.query,
            this._client,
            (this._client?.getOptions?.() as MiniappOptions | undefined)?.sensitiveKeys,
          );

          withScope((scope) => {
            scope.setTag('pagenotfound', url);
            scope.setContext('page_not_found', {
              path: url,
              ...(query && { query }),
              isEntryPage: res.isEntryPage,
            });

            captureException(new Error(`页面无法找到: ${url}`), {
              mechanism: {
                type: 'onpagenotfound',
                handled: true,
              },
            });
          });
        },
      );
      this._listen('onPageNotFound', 'offPageNotFound', this._pageNotFoundHandler);
    }
  }

  /** JSDoc */
  private _installGlobalOnMemoryWarningHandler(): void {
    if (this._isActiveClient()) {
      this._memoryWarningHandler = this._guard(({ level = -1 }: { level: number }) => {
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
      });
      this._listen('onMemoryWarning', 'offMemoryWarning', this._memoryWarningHandler);
    }
  }

  /**
   * 清理资源，注销全局事件处理器
   */
  public cleanup(): void {
    for (const cleanup of [...this._cleanups]) cleanup();
    // 先失效，off API 同步触发的回调也不能继续采集。
    this._client = undefined;
    const source = this._sdk;
    this._sdk = undefined;
    const listeners: Array<[string, Function | null]> = [
      ['offError', this._errorHandler],
      ['offUnhandledRejection', this._rejectionHandler],
      ['offPageNotFound', this._pageNotFoundHandler],
      ['offMemoryWarning', this._memoryWarningHandler],
    ];
    for (const [name, handler] of listeners) {
      if (!handler) continue;
      try {
        const remove = source?.[name as keyof typeof source];
        if (typeof remove === 'function') remove.call(source, handler);
      } catch (_error) {
        /* 每项 off 独立容错；无 off 仍已失效。 */
      }
    }

    this._errorHandler = null;
    this._rejectionHandler = null;
    this._pageNotFoundHandler = null;
    this._memoryWarningHandler = null;
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
