import {
  Client,
  Scope,
  getIsolationScope,
  getCurrentScope,
  makeOfflineTransport,
} from '@sentry/core';
import type { BaseTransportOptions, Event, EventHint } from '@sentry/core';

import { appName, getSystemInfo } from './crossPlatform';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';
import { createMiniappTransport, createMiniappOfflineStore } from './transports';
import { SDK_NAME, SDK_VERSION } from './version';

/**
 * The Sentry Miniapp SDK Client.
 *
 * @see MiniappOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class MiniappClient extends Client<any> {
  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: MiniappOptions = {}) {
    super({
      ...options,
      transport:
        options.transport ||
        ((transportOptions: BaseTransportOptions) => {
          const baseTransport = createMiniappTransport({
            ...transportOptions,
            headers: {},
          });

          if (options.enableOfflineCache !== false) {
            return makeOfflineTransport(() => baseTransport)({
              ...transportOptions,
              createStore: (storeOptions: any) =>
                createMiniappOfflineStore({
                  ...storeOptions,
                  offlineCacheLimit: options.offlineCacheLimit,
                  offlineCacheMaxAge: options.offlineCacheMaxAge,
                }),
              flushAtStartup: true, // 启动时自动重试发送
            } as any);
          }

          return baseTransport;
        }),
    });
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: any): PromiseLike<Event> {
    const exceptionValue: Record<string, any> = {
      type: exception.name || 'Error',
      value: exception.message || String(exception),
    };

    // 使用 stackParser 解析堆栈信息
    if (exception.stack) {
      const stackParser = this.getOptions().stackParser;
      if (stackParser && typeof stackParser === 'function') {
        const frames = stackParser(exception.stack, 1);
        if (frames.length) {
          exceptionValue['stacktrace'] = { frames };
        }
      }
    }

    return Promise.resolve({
      exception: {
        values: [exceptionValue],
      },
      level: 'error',
    } as Event);
  }

  public eventFromMessage(message: string, level: any = 'info'): PromiseLike<Event> {
    return Promise.resolve({
      message: message,
      level,
    } as Event);
  }

  protected override _prepareEvent(
    event: Event,
    hint?: EventHint,
    scope?: Scope,
  ): PromiseLike<Event | null> {
    event.platform = event.platform || this.getOptions().platform || 'javascript';

    // Add SDK information
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/miniapp',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    // miniapp 标记是 SDK 自有的身份信息，始终写（无用户覆盖语义）。
    if (!event.contexts) {
      event.contexts = {};
    }
    event.contexts['miniapp'] = {
      platform: appName(),
      sdk_version: SDK_VERSION,
    };

    try {
      const currentScope = scope || getCurrentScope();
      const isolationScope = getIsolationScope();
      return Promise.resolve(
        super._prepareEvent(event, hint || {}, currentScope, isolationScope),
      ).then((prepared) => this._fillDefaultContexts(prepared));
    } catch (error) {
      // Fallback if scopes are not properly initialized
      if (this.getOptions().debug) {
        console.warn('[sentry-miniapp] _prepareEvent 兜底（scope 未就绪）:', error);
      }
      return Promise.resolve(this._fillDefaultContexts(event));
    }
  }

  /**
   * 用 SDK 采集的 device/os/app 填充事件上下文——**仅填充缺失的键**，不覆盖用户经
   * setContext / per-event hint / 其它集成（如 HttpContext 写的 app.name）已提供的值。
   *
   * 必须在 super._prepareEvent **之后**调用：core 以「event 优先」合并 scope contexts
   * （scopeData.js：`event.contexts = {...scope, ...event}`），若在 super 之前写，SDK 的
   * 自动值会盖掉用户的 setContext('device'/'os'/'app')。放到 super 之后按缺失填充即可两头兼顾。
   */
  private _fillDefaultContexts(event: Event | null): Event | null {
    if (!event || this.getOptions().enableSystemInfo === false) {
      return event;
    }
    const info = getSystemInfo();
    if (!event.contexts) {
      event.contexts = {};
    }
    const contexts = event.contexts;
    contexts.device = {
      brand: info?.brand || 'unknown',
      model: info?.model || 'unknown',
      screen_resolution: `${info?.screenWidth || 0}x${info?.screenHeight || 0}`,
      language: info?.language || 'unknown',
      version: info?.version || 'unknown',
      system: info?.system || 'unknown',
      platform: info?.platform || 'unknown',
      ...contexts.device,
    };
    contexts.os = {
      name: info?.system || 'unknown',
      version: info?.version || 'unknown',
      ...contexts.os,
    };
    contexts.app = {
      app_version: info?.SDKVersion || 'unknown',
      ...contexts.app,
    };
    return event;
  }

  /**
   * 关闭客户端，清理所有集成资源。
   *
   * 用公开的 `getOptions().integrations`（装配后的集成实例数组）遍历，而非基类内部的
   * `_integrations` 字段——后者是 protected、非公开契约，@sentry/core 升级若改名/改结构会
   * 静默失效。`cleanup()` 是本 SDK 集成的自定义方法（非 core Integration 接口的一部分），故做窄类型断言。
   */
  public override close(timeout?: number): PromiseLike<boolean> {
    const integrations = this.getOptions().integrations;
    if (Array.isArray(integrations)) {
      for (const integration of integrations) {
        const cleanup = (integration as unknown as { cleanup?: () => void }).cleanup;
        if (typeof cleanup === 'function') {
          try {
            cleanup.call(integration);
          } catch (e) {
            if (this.getOptions().debug) {
              console.warn(`[sentry-miniapp] 集成 ${integration.name} cleanup 失败:`, e);
            }
          }
        }
      }
    }
    return super.close(timeout);
  }

  /**
   * @deprecated Miniapp environment does not support Sentry's default HTML report dialog.
   * Please implement your own UI form to collect user feedback (name, email, comments)
   * and use `Sentry.captureFeedback()` to submit it to Sentry.
   */
  public showReportDialog(_options: ReportDialogOptions = {}): void {
    console.warn(
      '[sentry-miniapp] showReportDialog is deprecated and does nothing. ' +
        'Please build your own UI and use `Sentry.captureFeedback()` instead.',
    );
  }

  /**
   * Capture feedback using the new feedback API.
   * 使用新的反馈 API 捕获反馈
   *
   * @param params Feedback parameters
   * @returns Event ID
   */
  public captureFeedback(params: SendFeedbackParams): string {
    const feedbackEvent: Event = {
      contexts: {
        feedback: {
          contact_email: params.email,
          name: params.name,
          message: params.message,
          url: params.url,
          source: params.source,
          associated_event_id: params.associatedEventId,
        },
      },
      type: 'feedback',
      level: 'info',
      tags: params.tags || {},
    };

    const scope = getCurrentScope();
    return scope.captureEvent(feedbackEvent);
  }
}
