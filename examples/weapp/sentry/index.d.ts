import { Options, Transport, EventHint, Event, Severity, DsnLike, Integration, Span as Span$1, Primitive, Transaction as Transaction$1, SpanContext, TransactionMetadata, TransactionContext, Measurements, EventProcessor, TransportOptions, Response } from '@sentry/types';
export { Breadcrumb, BreadcrumbHint, Event, EventHint, EventStatus, Exception, Integration, Request, Response, SdkInfo, Severity, StackFrame, Stacktrace, Thread, User } from '@sentry/types';
import { BaseBackend, BaseClient, Scope, Hub, Integrations } from '@sentry/core';
export { Hub, Scope, addBreadcrumb, addGlobalEventProcessor, captureEvent, captureException, captureMessage, configureScope, getCurrentHub, getHubFromCarrier, setContext, setExtra, setExtras, setTag, setTags, setUser, startTransaction, withScope } from '@sentry/core';
import { PromiseBuffer } from '@sentry/utils';

declare const SDK_NAME = "sentry.javascript.miniapp";
declare const SDK_VERSION: string;

/**
 * Configuration options for the Sentry Miniapp SDK.
 * Sentry Miniapp SDK 的配置选项。
 * @see MiniappClient for more information.
 */
interface MiniappOptions extends Options {
    /**
     * A pattern for error URLs which should not be sent to Sentry.
     * To whitelist certain errors instead, use {@link Options.whitelistUrls}.
     * By default, all errors will be sent.
     */
    blacklistUrls?: Array<string | RegExp>;
    /**
     * A pattern for error URLs which should exclusively be sent to Sentry.
     * This is the opposite of {@link Options.blacklistUrls}.
     * By default, all errors will be sent.
     */
    whitelistUrls?: Array<string | RegExp>;
}
/**
 * The Sentry Browser SDK Backend.
 * @hidden
 */
declare class MiniappBackend extends BaseBackend<MiniappOptions> {
    /**
     * @inheritDoc
     */
    protected _setupTransport(): Transport;
    /**
     * @inheritDoc
     */
    eventFromException(exception: any, hint?: EventHint): PromiseLike<Event>;
    /**
     * @inheritDoc
     */
    eventFromMessage(message: string, level?: Severity, hint?: EventHint): PromiseLike<Event>;
}

/**
 * All properties the report dialog supports
 */
interface ReportDialogOptions {
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
declare class MiniappClient extends BaseClient<MiniappBackend, MiniappOptions> {
    /**
     * Creates a new Miniapp SDK instance.
     *
     * @param options Configuration options for this SDK.
     */
    constructor(options?: MiniappOptions);
    /**
     * @inheritDoc
     */
    protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null>;
    /**
     * Show a report dialog to the user to send feedback to a specific event.
     * 向用户显示报告对话框以将反馈发送到特定事件。---> 小程序上暂时用不到&不考虑。
     *
     * @param options Set individual options for the dialog
     */
    showReportDialog(options?: ReportDialogOptions): void;
}

/** JSDoc */
interface GlobalHandlersIntegrations {
    onerror: boolean;
    onunhandledrejection: boolean;
    onpagenotfound: boolean;
    onmemorywarning: boolean;
}
/** Global handlers */
declare class GlobalHandlers implements Integration {
    /**
     * @inheritDoc
     */
    static id: string;
    /**
     * @inheritDoc
     */
    name: string;
    /** JSDoc */
    private readonly _options;
    /** JSDoc */
    private _onErrorHandlerInstalled;
    /** JSDoc */
    private _onUnhandledRejectionHandlerInstalled;
    /** JSDoc */
    private _onPageNotFoundHandlerInstalled;
    /** JSDoc */
    private _onMemoryWarningHandlerInstalled;
    /** JSDoc */
    constructor(options?: GlobalHandlersIntegrations);
    /**
     * @inheritDoc
     */
    setupOnce(): void;
    /** JSDoc */
    private _installGlobalOnErrorHandler;
    /** JSDoc */
    private _installGlobalOnUnhandledRejectionHandler;
    /** JSDoc */
    private _installGlobalOnPageNotFoundHandler;
    /** JSDoc */
    private _installGlobalOnMemoryWarningHandler;
}

/** Wrap timer functions and event targets to catch errors and provide better meta data */
declare class TryCatch implements Integration {
    /** JSDoc */
    private _ignoreOnError;
    /**
    * @inheritDoc
    */
    static id: string;
    /**
     * @inheritDoc
     */
    name: string;
    /** JSDoc */
    private _wrapTimeFunction;
    /** JSDoc */
    private _wrapRAF;
    /** JSDoc */
    private _wrapEventTarget;
    /**
     * Wrap timer functions and event targets to catch errors
     * and provide better metadata.
     */
    setupOnce(): void;
}

/** Adds SDK info to an event. */
declare class LinkedErrors implements Integration {
    /**
     * @inheritDoc
     */
    static id: string;
    /**
     * @inheritDoc
     */
    readonly name: string;
    /**
     * @inheritDoc
     */
    private readonly _key;
    /**
     * @inheritDoc
     */
    private readonly _limit;
    /**
     * @inheritDoc
     */
    constructor(options?: {
        key?: string;
        limit?: number;
    });
    /**
     * @inheritDoc
     */
    setupOnce(): void;
    /**
     * @inheritDoc
     */
    private _handler;
    /**
     * @inheritDoc
     */
    private _walkErrorTree;
}

/** UserAgent */
declare class System implements Integration {
    /**
     * @inheritDoc
     */
    static id: string;
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    setupOnce(): void;
}

/** JSDoc */
interface RouterIntegrations {
    enable?: boolean;
}
/** UserAgent */
declare class Router implements Integration {
    /**
     * @inheritDoc
     */
    static id: string;
    /**
     * @inheritDoc
     */
    name: string;
    /** JSDoc */
    private readonly _options;
    /**
     * @inheritDoc
     */
    constructor(options?: RouterIntegrations);
    /**
     * @inheritDoc
     */
    setupOnce(): void;
}

/**
 * IgnoreMpcrawlerErrors
 *
 * https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/sitemap.html
 */
declare class IgnoreMpcrawlerErrors implements Integration {
    /**
     * @inheritDoc
     */
    static id: string;
    /**
     * @inheritDoc
     */
    name: string;
    /**
     * @inheritDoc
     */
    setupOnce(): void;
}

type index$1_GlobalHandlers = GlobalHandlers;
declare const index$1_GlobalHandlers: typeof GlobalHandlers;
type index$1_IgnoreMpcrawlerErrors = IgnoreMpcrawlerErrors;
declare const index$1_IgnoreMpcrawlerErrors: typeof IgnoreMpcrawlerErrors;
type index$1_LinkedErrors = LinkedErrors;
declare const index$1_LinkedErrors: typeof LinkedErrors;
type index$1_Router = Router;
declare const index$1_Router: typeof Router;
type index$1_System = System;
declare const index$1_System: typeof System;
type index$1_TryCatch = TryCatch;
declare const index$1_TryCatch: typeof TryCatch;
declare namespace index$1 {
  export { index$1_GlobalHandlers as GlobalHandlers, index$1_IgnoreMpcrawlerErrors as IgnoreMpcrawlerErrors, index$1_LinkedErrors as LinkedErrors, index$1_Router as Router, index$1_System as System, index$1_TryCatch as TryCatch };
}

interface RequestInstrumentationOptions {
    traceRequest: boolean;
    shouldCreateSpanForRequest?(url: string): boolean;
}

/**
 * Keeps track of finished spans for a given transaction
 * @internal
 * @hideconstructor
 * @hidden
 */
declare class SpanRecorder {
    spans: Span[];
    private readonly _maxlen;
    constructor(maxlen?: number);
    /**
     * This is just so that we don't run out of memory while recording a lot
     * of spans. At some point we just stop and flush out the start of the
     * trace tree (i.e.the first n spans with the smallest
     * start_timestamp).
     */
    add(span: Span): void;
}
/**
 * Span contains all data about a span
 */
declare class Span implements Span$1 {
    /**
     * @inheritDoc
     */
    traceId: string;
    /**
     * @inheritDoc
     */
    spanId: string;
    /**
     * @inheritDoc
     */
    parentSpanId?: string;
    /**
     * Internal keeper of the status
     */
    status?: SpanStatusType | string;
    /**
     * @inheritDoc
     */
    sampled?: boolean;
    /**
     * Timestamp in seconds when the span was created.
     */
    startTimestamp: number;
    /**
     * Timestamp in seconds when the span ended.
     */
    endTimestamp?: number;
    /**
     * @inheritDoc
     */
    op?: string;
    /**
     * @inheritDoc
     */
    description?: string;
    /**
     * @inheritDoc
     */
    tags: {
        [key: string]: Primitive;
    };
    /**
     * @inheritDoc
     */
    data: {
        [key: string]: any;
    };
    /**
     * List of spans that were finalized
     */
    spanRecorder?: SpanRecorder;
    /**
     * @inheritDoc
     */
    transaction?: Transaction$1;
    /**
     * You should never call the constructor manually, always use `Sentry.startTransaction()`
     * or call `startChild()` on an existing span.
     * @internal
     * @hideconstructor
     * @hidden
     */
    constructor(spanContext?: SpanContext);
    /**
     * @inheritDoc
     * @deprecated
     */
    child(spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>): Span;
    /**
     * @inheritDoc
     */
    startChild(spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>): Span;
    /**
     * @inheritDoc
     */
    setTag(key: string, value: Primitive): this;
    /**
     * @inheritDoc
     */
    setData(key: string, value: any): this;
    /**
     * @inheritDoc
     */
    setStatus(value: SpanStatusType): this;
    /**
     * @inheritDoc
     */
    setHttpStatus(httpStatus: number): this;
    /**
     * @inheritDoc
     */
    isSuccess(): boolean;
    /**
     * @inheritDoc
     */
    finish(endTimestamp?: number): void;
    /**
     * @inheritDoc
     */
    toTraceparent(): string;
    /**
     * @inheritDoc
     */
    toContext(): SpanContext;
    /**
     * @inheritDoc
     */
    updateWithContext(spanContext: SpanContext): this;
    /**
     * @inheritDoc
     */
    getTraceContext(): {
        data?: {
            [key: string]: any;
        };
        description?: string;
        op?: string;
        parent_span_id?: string;
        span_id: string;
        status?: string;
        tags?: {
            [key: string]: Primitive;
        };
        trace_id: string;
    };
    /**
     * @inheritDoc
     */
    toJSON(): {
        data?: {
            [key: string]: any;
        };
        description?: string;
        op?: string;
        parent_span_id?: string;
        span_id: string;
        start_timestamp: number;
        status?: string;
        tags?: {
            [key: string]: Primitive;
        };
        timestamp?: number;
        trace_id: string;
    };
}
type SpanStatusType = 
/** The operation completed successfully. */
'ok'
/** Deadline expired before operation could complete. */
 | 'deadline_exceeded'
/** 401 Unauthorized (actually does mean unauthenticated according to RFC 7235) */
 | 'unauthenticated'
/** 403 Forbidden */
 | 'permission_denied'
/** 404 Not Found. Some requested entity (file or directory) was not found. */
 | 'not_found'
/** 429 Too Many Requests */
 | 'resource_exhausted'
/** Client specified an invalid argument. 4xx. */
 | 'invalid_argument'
/** 501 Not Implemented */
 | 'unimplemented'
/** 503 Service Unavailable */
 | 'unavailable'
/** Other/generic 5xx. */
 | 'internal_error'
/** Unknown. Any non-standard HTTP status code. */
 | 'unknown_error'
/** The operation was cancelled (typically by the user). */
 | 'cancelled'
/** Already exists (409) */
 | 'already_exists'
/** Operation was rejected because the system is not in a state required for the operation's */
 | 'failed_precondition'
/** The operation was aborted, typically due to a concurrency issue. */
 | 'aborted'
/** Operation was attempted past the valid range. */
 | 'out_of_range'
/** Unrecoverable data loss or corruption */
 | 'data_loss';

/** JSDoc */
declare class Transaction extends Span implements Transaction$1 {
    name: string;
    metadata: TransactionMetadata;
    private _measurements;
    /**
     * The reference to the current hub.
     */
    private readonly _hub;
    private _trimEnd?;
    /**
     * This constructor should never be called manually. Those instrumenting tracing should use
     * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
     * @internal
     * @hideconstructor
     * @hidden
     */
    constructor(transactionContext: TransactionContext, hub?: Hub);
    /**
     * JSDoc
     */
    setName(name: string): void;
    /**
     * Attaches SpanRecorder to the span itself
     * @param maxlen maximum number of spans that can be recorded
     */
    initSpanRecorder(maxlen?: number): void;
    /**
     * Set observed measurements for this transaction.
     * @hidden
     */
    setMeasurements(measurements: Measurements): void;
    /**
     * Set metadata for this transaction.
     * @hidden
     */
    setMetadata(newMetadata: TransactionMetadata): void;
    /**
     * @inheritDoc
     */
    finish(endTimestamp?: number): string | undefined;
    /**
     * @inheritDoc
     */
    toContext(): TransactionContext;
    /**
     * @inheritDoc
     */
    updateWithContext(transactionContext: TransactionContext): this;
}

type BeforeFinishCallback = (transactionSpan: IdleTransaction, endTimestamp: number) => void;
/**
 * An IdleTransaction is a transaction that automatically finishes. It does this by tracking child spans as activities.
 * You can have multiple IdleTransactions active, but if the `onScope` option is specified, the idle transaction will
 * put itself on the scope on creation.
 */
declare class IdleTransaction extends Transaction {
    private readonly _idleHub?;
    /**
     * The time to wait in ms until the idle transaction will be finished.
     * @default 1000
     */
    private readonly _idleTimeout;
    private readonly _onScope;
    activities: Record<string, boolean>;
    private _prevHeartbeatString;
    private _heartbeatCounter;
    private _finished;
    private readonly _beforeFinishCallbacks;
    /**
     * If a transaction is created and no activities are added, we want to make sure that
     * it times out properly. This is cleared and not used when activities are added.
     */
    private _initTimeout;
    constructor(transactionContext: TransactionContext, _idleHub?: Hub | undefined, 
    /**
     * The time to wait in ms until the idle transaction will be finished.
     * @default 1000
     */
    _idleTimeout?: number, _onScope?: boolean);
    /** {@inheritDoc} */
    finish(endTimestamp?: number): string | undefined;
    /**
     * Register a callback function that gets excecuted before the transaction finishes.
     * Useful for cleanup or if you want to add any additional spans based on current context.
     *
     * This is exposed because users have no other way of running something before an idle transaction
     * finishes.
     */
    registerBeforeFinishCallback(callback: BeforeFinishCallback): void;
    /**
     * @inheritDoc
     */
    initSpanRecorder(maxlen?: number): void;
    /**
     * Start tracking a specific activity.
     * @param spanId The span id that represents the activity
     */
    private _pushActivity;
    /**
     * Remove an activity from usage
     * @param spanId The span id that represents the activity
     */
    private _popActivity;
    /**
     * Checks when entries of this.activities are not changing for 3 beats.
     * If this occurs we finish the transaction.
     */
    private _beat;
    /**
     * Pings the heartbeat
     */
    private _pingHeartbeat;
}

interface MiniAppTracingOptions extends RequestInstrumentationOptions {
    idleTimeout: number;
    startTransactionOnLocationChange: boolean;
    startTransactionOnPageLoad: boolean;
    maxTransactionDuration: number;
    _metricOptions?: Partial<{
        _reportAllChanges: boolean;
    }>;
    beforeNavigate?(context: TransactionContext): TransactionContext | undefined;
    routingInstrumentation<T extends IdleTransaction>(customStartTransaction: (context: TransactionContext) => T | undefined, startTransactionOnPageLoad?: boolean, startTransactionOnLocationChange?: boolean): void;
}
declare class MiniAppTracing implements Integration {
    /**
     * @inheritDoc
     */
    static id: string;
    /**
     * @inheritDoc
     */
    name: string;
    options: MiniAppTracingOptions;
    private readonly _metrics;
    private _getCurrentHub?;
    private readonly _configuredIdleTimeout;
    constructor(_options?: Partial<MiniAppTracingOptions>);
    setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void;
    /** Create routing idle transaction. */
    private _createRouteTransaction;
}

declare const defaultIntegrations: (GlobalHandlers | TryCatch | LinkedErrors | System | Router | IgnoreMpcrawlerErrors | MiniAppTracing | Integrations.InboundFilters | Integrations.FunctionToString)[];
/**
 * The Sentry Miniapp SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible when
 * launching the app. To set context information or send manual events, use
 * the provided methods.
 *
 * @example
 * ```
 * import { init } from '@sentry/miniapp';
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 * import { configureScope } from '@sentry/miniapp';
 *
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTag({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 * ```
 *
 * @example
 * ```
 * import { addBreadcrumb } from '@sentry/miniapp';
 *
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 * import * as Sentry from '@sentry/miniapp';
 *
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * ```
 *
 * @see {@link MiniappOptions} for documentation on configuration options.
 */
declare function init(options?: MiniappOptions): void;
/**
 * Present the user with a report dialog.
 * 向用户显示报告对话框。小程序上暂时不考虑实现该功能。
 *
 * @param options Everything is optional, we try to fetch all info need from the global scope.
 */
declare function showReportDialog(options?: ReportDialogOptions): void;
/**
 * This is the getter for lastEventId. 获取 lastEventId。
 *
 * @returns The last event id of a captured event.
 */
declare function lastEventId(): string | undefined;
/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 * 在发送所有当前事件时会变为 resolved 状态的 promise。如果提供了一个超时时间并且队列需要更长时间来消耗，则 promise 将返回 false。
 *
 * @param timeout Maximum time in ms the client should wait.
 */
declare function flush(timeout?: number): PromiseLike<boolean>;
/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
declare function close(timeout?: number): PromiseLike<boolean>;
/**
 * Wrap code within a try/catch block so the SDK is able to capture errors.
 * 在 try / catch 块中包装代码，以便 SDK 能够捕获错误。
 * 实际上是 ./helpers 文件中 warp 方法的进一步封装。
 *
 * @param fn A function to wrap.
 *
 * @returns The result of wrapped function call.
 */
declare function wrap(fn: Function): any;

/** Base Transport class implementation */
declare abstract class BaseTransport implements Transport {
    options: TransportOptions;
    /**
     * @inheritDoc
     */
    url: string;
    /** A simple buffer holding all requests. */
    protected readonly _buffer: PromiseBuffer<Response>;
    constructor(options: TransportOptions);
    /**
     * @inheritDoc
     */
    sendEvent(_: Event): PromiseLike<Response>;
    /**
     * @inheritDoc
     */
    close(timeout?: number): PromiseLike<boolean>;
}

/** `XHR` based transport */
declare class XHRTransport extends BaseTransport {
    /**
     * @inheritDoc
     */
    sendEvent(event: Event): PromiseLike<Response>;
}

type index_BaseTransport = BaseTransport;
declare const index_BaseTransport: typeof BaseTransport;
type index_XHRTransport = XHRTransport;
declare const index_XHRTransport: typeof XHRTransport;
declare namespace index {
  export { index_BaseTransport as BaseTransport, index_XHRTransport as XHRTransport };
}

export { index$1 as Integrations, MiniappClient, type MiniappOptions, type ReportDialogOptions, SDK_NAME, SDK_VERSION, index as Transports, close, defaultIntegrations, flush, init, lastEventId, showReportDialog, wrap };
