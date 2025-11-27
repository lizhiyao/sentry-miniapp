import {
  applySdkMetadata,
  BaseClient,
  Scope,
  type DsnLike,
  type Event,
  type EventHint,
  type ParameterizedString,
  type SeverityLevel,
  type StackParser,
} from '@sentry/core';

import { MiniappOptions } from './backend';
import { SDK_NAME, SDK_VERSION } from "./version";
import { eventFromString, eventFromUnknownInput } from './eventbuilder';
import { makeMiniappTransport } from './transports';

const noopStackParser: StackParser = () => [];

/**
 * All properties the report dialog supports
 */
export interface ReportDialogOptions {
  [key: string]: any;
  eventId?: string;
  dsn?: DsnLike;
  user?: {
    email?: string;
    name?: string;
  };
  lang?: string;
  title?: string;
  subtitle?: string;
  subtitle2?: string;
  labelName?: string;
  labelEmail?: string;
  labelComments?: string;
  labelClose?: string;
  labelSubmit?: string;
  errorGeneric?: string;
  errorFormEntry?: string;
  successMessage?: string;
  /** Callback after reportDialog showed up */
  onLoad?(): void;
}

/**
 * The Sentry Miniapp SDK Client.
 *
 * @see MiniappOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class MiniappClient extends BaseClient<MiniappOptions> {
  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: Partial<MiniappOptions> = {}) {
    const transport = options.transport || makeMiniappTransport;
    const stackParser = options.stackParser || noopStackParser;
    const integrations = options.integrations || options.defaultIntegrations || [];

    const opts: MiniappOptions = {
      ...options,
      transport,
      stackParser,
      integrations,
      dsn: options.dsn,
      // ensure defaults for required fields
      tracesSampleRate: options.tracesSampleRate,
    };

    applySdkMetadata(opts, 'miniapp', ['miniapp']);

    super(opts);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, hint: EventHint, scope?: Scope, isolationScope?: Scope): PromiseLike<Event | null> {
    event.platform = event.platform || "javascript";
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: "npm:@sentry/miniapp",
          version: SDK_VERSION
        }
      ],
      version: SDK_VERSION
    };

    return super._prepareEvent(event, hint, scope, isolationScope);
  }

  /**
   * Show a report dialog to the user to send feedback to a specific event.
   * 向用户显示报告对话框以将反馈发送到特定事件。---> 小程序上暂时用不到&不考虑。
   *
   * @param options Set individual options for the dialog
   */
  public showReportDialog(options: ReportDialogOptions = {}): void {
    // doesn't work without a document (React Native)
    console.log('sentry-miniapp 暂未实现该方法', options);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    const syntheticException = hint && hint.syntheticException ? hint.syntheticException : undefined;
    const event = eventFromUnknownInput(exception, syntheticException, {
      attachStacktrace: this._options.attachStacktrace,
    });
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return Promise.resolve(event);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  public eventFromMessage(
    message: ParameterizedString,
    level: SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    const syntheticException = hint && hint.syntheticException ? hint.syntheticException : undefined;
    const event = eventFromString(String(message), syntheticException, {
      attachStacktrace: this._options.attachStacktrace,
    });
    event.level = level;
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return Promise.resolve(event);
  }
}
