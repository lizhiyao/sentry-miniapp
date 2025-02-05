import { getCurrentHub } from "@sentry/core";
import { Integration } from "@sentry/types";
import { logger } from "@sentry/utils";

import { sdk } from "../crossPlatform";

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
  public static id: string = "GlobalHandlers";
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
  public constructor(options?: GlobalHandlersIntegrations) {
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
      logger.log("Global Handler attached: onError");
      this._installGlobalOnErrorHandler();
    }

    if (this._options.onunhandledrejection) {
      logger.log("Global Handler attached: onunhandledrejection");
      this._installGlobalOnUnhandledRejectionHandler();
    }

    if (this._options.onpagenotfound) {
      logger.log("Global Handler attached: onPageNotFound");
      this._installGlobalOnPageNotFoundHandler();
    }

    if (this._options.onmemorywarning) {
      logger.log("Global Handler attached: onMemoryWarning");
      this._installGlobalOnMemoryWarningHandler();
    }
  }

  /** JSDoc */
  private _installGlobalOnErrorHandler(): void {
    if (this._onErrorHandlerInstalled) {
      return;
    }

    if (!!sdk.onError) {
      const currentHub = getCurrentHub();

      // https://developers.weixin.qq.com/miniprogram/dev/api/base/app/app-event/wx.onError.html
      sdk.onError((err: string | object) => {
        // console.info("sentry-miniapp", error);
        const error = typeof err === 'string' ? new Error(err) : err
        currentHub.captureException(error);
      });
    }

    this._onErrorHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnUnhandledRejectionHandler(): void {
    if (this._onUnhandledRejectionHandlerInstalled) {
      return;
    }

    if (!!sdk.onUnhandledRejection) {
      const currentHub = getCurrentHub();
      /** JSDoc */
      interface OnUnhandledRejectionRes {
        reason: string | object;
        promise: Promise<any>;
      }

      // https://developers.weixin.qq.com/miniprogram/dev/api/base/app/app-event/wx.onUnhandledRejection.html
      sdk.onUnhandledRejection(
        ({ reason, promise }: OnUnhandledRejectionRes) => {
          // console.log(reason, typeof reason, promise)
          // 为什么官方文档上说 reason 是 string 类型，但是实际返回的确实 object 类型
          const error = typeof reason === 'string' ? new Error(reason) : reason
          currentHub.captureException(error, {
            data: promise,
          });
        }
      );
    }

    this._onUnhandledRejectionHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnPageNotFoundHandler(): void {
    if (this._onPageNotFoundHandlerInstalled) {
      return;
    }

    if (!!sdk.onPageNotFound) {
      const currentHub = getCurrentHub();

      sdk.onPageNotFound((res: { path: string }) => {
        const url = res.path.split("?")[0];

        currentHub.setTag("pagenotfound", url);
        currentHub.setExtra("message", JSON.stringify(res));
        currentHub.captureMessage(`页面无法找到: ${url}`);
      });
    }

    this._onPageNotFoundHandlerInstalled = true;
  }

  /** JSDoc */
  private _installGlobalOnMemoryWarningHandler(): void {
    if (this._onMemoryWarningHandlerInstalled) {
      return;
    }

    if (!!sdk.onMemoryWarning) {
      const currentHub = getCurrentHub();

      sdk.onMemoryWarning(({ level = -1 }: { level: number }) => {
        let levelMessage = "没有获取到告警级别信息";

        switch (level) {
          case 5:
            levelMessage = "TRIM_MEMORY_RUNNING_MODERATE";
            break;
          case 10:
            levelMessage = "TRIM_MEMORY_RUNNING_LOW";
            break;
          case 15:
            levelMessage = "TRIM_MEMORY_RUNNING_CRITICAL";
            break;
          default:
            return;
        }

        currentHub.setTag("memory-warning", String(level));
        currentHub.setExtra("message", levelMessage);
        currentHub.captureMessage(`内存不足告警`);
      });
    }

    this._onMemoryWarningHandlerInstalled = true;
  }
}
