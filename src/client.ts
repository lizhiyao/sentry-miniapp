import {
  Client,
  Scope,
  getIsolationScope,
  getCurrentScope,
} from '@sentry/core';
import type {
  Event,
  EventHint,
} from '@sentry/core';

import { sdk, appName, getSystemInfo } from './crossPlatform';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';
import { createMiniappTransport } from './transports';
import { SDK_NAME, SDK_VERSION } from './version';

/**
 * The Sentry Miniapp SDK Client.
 *
 * @see MiniappOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class MiniappClient extends Client<any> {
  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: MiniappOptions = {}) {
    super({
      ...options,
      transport: options.transport || ((transportOptions: any) => {
        return createMiniappTransport({
          ...transportOptions,
          headers: {},
        });
      }),
    });
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: any): PromiseLike<Event> {
    return Promise.resolve({
      exception: {
        values: [{
          type: exception.name || 'Error',
          value: exception.message || String(exception),
        }]
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

    // Add miniapp context
    if (!event.contexts) {
      event.contexts = {};
    }

    // Add miniapp platform info
    event.contexts['miniapp'] = {
      platform: appName(),
      sdk_version: SDK_VERSION,
    };

    // Add system info if available
    const systemInfo = getSystemInfo();
    if (systemInfo) {
      event.contexts.device = {
        brand: systemInfo.brand || 'unknown',
        model: systemInfo.model || 'unknown',
        screen_resolution: `${systemInfo.screenWidth || 0}x${systemInfo.screenHeight || 0}`,
        language: systemInfo.language || 'unknown',
        version: systemInfo.version || 'unknown',
        system: systemInfo.system || 'unknown',
        platform: systemInfo.platform || 'unknown',
      };

      event.contexts.os = {
        name: systemInfo.system || 'unknown',
        version: systemInfo.version || 'unknown',
      };

      event.contexts.app = {
        app_version: systemInfo.SDKVersion || 'unknown',
      };
    } else {
      // Provide fallback values when system info is not available
      event.contexts.device = {
        brand: 'unknown',
        model: 'unknown',
        screen_resolution: '0x0',
        language: 'unknown',
        version: 'unknown',
        system: 'unknown',
        platform: 'unknown',
      };

      event.contexts.os = {
        name: 'unknown',
        version: 'unknown',
      };

      event.contexts.app = {
        app_version: 'unknown',
      };
    }

    try {
      const currentScope = scope || getCurrentScope();
      const isolationScope = getIsolationScope();
      return super._prepareEvent(event, hint || {}, currentScope, isolationScope);
    } catch (error) {
      // Fallback if scopes are not properly initialized
      return Promise.resolve(event);
    }
  }

  /**
   * Show a report dialog to the user to send feedback to a specific event.
   * 向用户显示报告对话框以将反馈发送到特定事件。
   * 注意：小程序环境使用模态对话框模拟此功能
   *
   * @param options Set individual options for the dialog
   */
  public showReportDialog(options: ReportDialogOptions = {}): void {
    const showModal = sdk().showModal;
    if (showModal) {
      showModal({
        title: options.title || '错误反馈',
        content: options.subtitle || '应用遇到了一个错误，是否要发送错误报告？',
        confirmText: '发送',
        cancelText: '取消',
        success: (res: any) => {
          if (res.confirm && options.onLoad) {
            options.onLoad();
          }
        }
      });
    } else {
      console.warn('sentry-miniapp: showModal is not available in current miniapp platform', options);
    }
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