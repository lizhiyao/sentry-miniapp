import { captureException, captureMessage, getCurrentHub } from "@sentry/core";
import { Event, Integration, Severity } from "@sentry/types";
import {
  addExceptionTypeValue,
  isPrimitive,
  isString,
  keysToEventMessage,
  logger,
  normalize,
  normalizeToSize,
  truncate
} from "@sentry/utils";
import { configureScope } from '../index'
import { getSDK } from '../crossPlatform';
import { shouldIgnoreOnError } from "../helpers";
import { eventFromStacktrace } from "../parsers";
import {
  _installGlobalHandler,
  _installGlobalUnhandledRejectionHandler,
  _subscribe,
  StackTrace as TraceKitStackTrace
} from "../tracekit";

const sdk = getSDK();

/** JSDoc */
interface GlobalHandlersIntegrations {
  onerror: boolean;
  onunhandledrejection: boolean;
  onError?: boolean; // 监听小程序错误
  onPageNotFound?: boolean; // 监听页面不存在
  onMemoryWarning?: boolean; // 监听内存不足告警
}
interface StackInfo {
  route: string;
  options: any
}
/** Global handlers */
export class GlobalHandlers implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = GlobalHandlers.id;

  /**
   * @inheritDoc
   */
  public static id: string = "GlobalHandlers";

  /** JSDoc */
  private readonly _options: GlobalHandlersIntegrations;

  /** JSDoc */
  public constructor(options?: GlobalHandlersIntegrations) {
    console.log('GlobalHandlers')
    this._options = {
      onerror: true,
      onunhandledrejection: true,
      ...options
    };
    console.log(this._options)
  }
  /**
   * 在发请求前，加上一些额外数据
   * 比如，路由信息，路由参数
   */
  public getRouterConfig(): void {
    configureScope(scope => {
      const stackInfo:Array<StackInfo> = []
      if(getCurrentPages) {
        // wx.getCurrentPages，不清楚其他小程序是否也有这个api，麻烦志遥兄调研
        const pages = getCurrentPages()
        // app Lanuch
        if(!pages || !pages.length) {
          stackInfo.push({
            route: 'onLaunch',
            options: {}
          })
        } else {
          pages.forEach(page => {
            const { route, options } = page
            stackInfo.push({
              route,
              options
            })
          })
        }
      }
      scope.setExtra("ROUTE_INFO", stackInfo);
    });
  }
  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    Error.stackTraceLimit = 50;
    console.log('setUpOnce')
    console.log(this._options)
    console.log(sdk)
    console.log(sdk.onError)
    _subscribe((stack: TraceKitStackTrace, _: boolean, error: any) => {
      if (shouldIgnoreOnError()) {
        return;
      }
      const self = getCurrentHub().getIntegration(GlobalHandlers);
      if (self) {
        getCurrentHub().captureEvent(
          self._eventFromGlobalHandler(stack, error),
          {
            data: { stack },
            originalException: error
          }
        );
      }
    });

    if (this._options.onerror) {
      logger.log("Global Handler attached: onerror");
      _installGlobalHandler();
    }

    if (this._options.onunhandledrejection) {
      logger.log("Global Handler attached: onunhandledrejection");
      _installGlobalUnhandledRejectionHandler();
    }
    console.log('微信sdk')
    console.log(sdk.onError)
    if (sdk.onError) {
      logger.log("Global Handler attached: onError");
      sdk.onError((error: string) => {
        this.getRouterConfig()
        captureException(new Error(error));
      });
    }

    if (sdk.onPageNotFound) {
      logger.log("Global Handler attached: onPageNotFound");
      sdk.onPageNotFound((res: object) => {
        captureMessage(`页面无法找到: ${JSON.stringify(res)}`);
      });
    }

    if (sdk.onMemoryWarning) {
      logger.log("Global Handler attached: onMemoryWarning");
      sdk.onMemoryWarning(({ level }: { level: number }) => {
        let levelString = 'iOS 设备, 无 level 传入.';
        switch (level) {
          case 10:
            levelString = 'Android 设备, level = TRIM_MEMORY_RUNNING_LOW';
            break;
          case 15:
            levelString = 'Android 设备, level = TRIM_MEMORY_RUNNING_CRITICAL';
            break;
          default:
            levelString = '未知情况';
        }
        captureMessage(`内存不足告警: ${levelString}`);
      });
    }
  }

  /**
   * This function creates an Event from an TraceKitStackTrace.
   *
   * @param stacktrace TraceKitStackTrace to be converted to an Event.
   */
  private _eventFromGlobalHandler(
    stacktrace: TraceKitStackTrace,
    error: any
  ): Event {
    if (
      !isString(stacktrace.message) &&
      stacktrace.mechanism !== "onunhandledrejection"
    ) {
      // There are cases where stacktrace.message is an Event object
      // https://github.com/getsentry/sentry-javascript/issues/1949
      // In this specific case we try to extract stacktrace.message.error.message
      const message = (stacktrace.message as unknown) as any;
      stacktrace.message =
        message.error && isString(message.error.message)
          ? message.error.message
          : "No error message";
    }

    if (
      stacktrace.mechanism === "onunhandledrejection" &&
      stacktrace.incomplete
    ) {
      return this._eventFromIncompleteRejection(stacktrace, error);
    }

    const event = eventFromStacktrace(stacktrace);

    const data: { [key: string]: string } = {
      mode: stacktrace.mode
    };

    if (stacktrace.message) {
      data.message = stacktrace.message;
    }

    if (stacktrace.name) {
      data.name = stacktrace.name;
    }

    const client = getCurrentHub().getClient();
    const maxValueLength =
      (client && client.getOptions().maxValueLength) || 250;

    const fallbackValue = stacktrace.original
      ? truncate(JSON.stringify(normalize(stacktrace.original)), maxValueLength)
      : "";
    const fallbackType =
      stacktrace.mechanism === "onunhandledrejection"
        ? "UnhandledRejection"
        : "Error";

    // This makes sure we have type/value in every exception
    addExceptionTypeValue(event, fallbackValue, fallbackType, {
      data,
      handled: false,
      type: stacktrace.mechanism
    });

    return event;
  }

  /**
   * This function creates an Event from an TraceKitStackTrace that has part of it missing.
   *
   * @param stacktrace TraceKitStackTrace to be converted to an Event.
   */
  private _eventFromIncompleteRejection(
    stacktrace: TraceKitStackTrace,
    error: any
  ): Event {
    const event: Event = {
      level: Severity.Error
    };

    if (isPrimitive(error)) {
      event.exception = {
        values: [
          {
            type: "UnhandledRejection",
            value: `Non-Error promise rejection captured with value: ${error}`
          }
        ]
      };
    } else {
      event.exception = {
        values: [
          {
            type: "UnhandledRejection",
            value: `Non-Error promise rejection captured with keys: ${keysToEventMessage(
              Object.keys(error).sort()
            )}`
          }
        ]
      };
      event.extra = {
        __serialized__: normalizeToSize(error)
      };
    }

    if (event.exception.values && event.exception.values[0]) {
      event.exception.values[0].mechanism = {
        data: {
          incomplete: true,
          mode: stacktrace.mode,
          ...(stacktrace.message && { message: stacktrace.message }),
          ...(stacktrace.name && { name: stacktrace.name })
        },
        handled: false,
        type: stacktrace.mechanism
      };
    }

    return event;
  }
}
