import { addBreadcrumb } from '@sentry/core';
import { addEventProcessor } from '@sentry/core';
import { BaseClient } from '@sentry/core';
import { BaseTransportOptions } from '@sentry/types';
import { Breadcrumb } from '@sentry/types';
import { BreadcrumbHint } from '@sentry/types';
import { captureEvent } from '@sentry/core';
import { captureException } from '@sentry/core';
import { captureMessage } from '@sentry/core';
import { ClientOptions } from '@sentry/types';
import { DsnLike } from '@sentry/core';
import { DynamicSamplingContext } from '@sentry/types';
import { Event as Event_2 } from '@sentry/types';
import { Event as Event_3 } from '@sentry/core';
import { EventHint } from '@sentry/types';
import { EventHint as EventHint_2 } from '@sentry/core';
import { Exception } from '@sentry/types';
import { getCurrentHub } from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import { Hub } from '@sentry/core';
import { Integration } from '@sentry/types';
import { Integration as Integration_2 } from '@sentry/core';
import { Measurements } from '@sentry/types';
import { MeasurementUnit } from '@sentry/types';
import { ParameterizedString } from '@sentry/core';
import { Primitive } from '@sentry/types';
import { Request as Request_2 } from '@sentry/types';
import { Scope } from '@sentry/core';
import { SdkInfo } from '@sentry/types';
import { setContext } from '@sentry/core';
import { setExtra } from '@sentry/core';
import { setExtras } from '@sentry/core';
import { setTag } from '@sentry/core';
import { setTags } from '@sentry/core';
import { setUser } from '@sentry/core';
import { SeverityLevel } from '@sentry/types';
import { SeverityLevel as SeverityLevel_2 } from '@sentry/core';
import { Span as Span_2 } from '@sentry/types';
import { SpanAttributes } from '@sentry/types';
import { SpanAttributeValue } from '@sentry/types';
import { SpanOrigin } from '@sentry/types';
import { SpanStatus } from '@sentry/types';
import { SpanTimeInput } from '@sentry/types';
import { StackFrame } from '@sentry/types';
import { Stacktrace } from '@sentry/types';
import { Thread } from '@sentry/types';
import { TraceFlag } from '@sentry/types';
import { Transport } from '@sentry/types';
import { User } from '@sentry/types';
import { withScope } from '@sentry/core';

export { addBreadcrumb }

export { addEventProcessor }

declare type BeforeFinishCallback = (transactionSpan: IdleTransaction, endTimestamp: number) => void;

export { Breadcrumb }

export { BreadcrumbHint }

export { captureEvent }

export { captureException }

export { captureMessage }

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
declare function close_2(timeout?: number): PromiseLike<boolean>;
export { close_2 as close }

/**
 * Lightweight replacement for the removed `configureScope` helper.
 * Invokes the provided callback with the current scope.
 */
export declare function configureScope(callback: (scope: Scope) => void): void;

declare type CustomSamplingContext = Record<string, unknown>;

export declare const defaultIntegrations: (Integration_2 | GlobalHandlers | TryCatch | LinkedErrors | System | Router | IgnoreMpcrawlerErrors | MiniAppTracing)[];

export { Event_2 as Event }

export { EventHint }

export { Exception }

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 * 在发送所有当前事件时会变为 resolved 状态的 promise。如果提供了一个超时时间并且队列需要更长时间来消耗，则 promise 将返回 false。
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export declare function flush(timeout?: number): PromiseLike<boolean>;

export { getCurrentHub }

export { getCurrentScope }

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

/** JSDoc */
declare interface GlobalHandlersIntegrations {
    onerror: boolean;
    onunhandledrejection: boolean;
    onpagenotfound: boolean;
    onmemorywarning: boolean;
}

export { Hub }

/**
 * An IdleTransaction is a transaction that automatically finishes. It does this by tracking child spans as activities.
 * You can have multiple IdleTransactions active, but if the `onScope` option is specified, the idle transaction will
 * put itself on the scope on creation.
 */
declare class IdleTransaction extends Transaction {
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
    constructor(transactionContext: TransactionContext, 
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
export declare function init(options?: Partial<MiniappOptions>): void;

export { Integration }

declare namespace Integrations {
    export {
        GlobalHandlers,
        TryCatch,
        LinkedErrors,
        System,
        Router,
        IgnoreMpcrawlerErrors
    }
}
export { Integrations }

/**
 * This is the getter for lastEventId. 获取 lastEventId。
 *
 * @returns The last event id of a captured event.
 */
export declare function lastEventId(): string | undefined;

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

declare function makeMiniappTransport(options: BaseTransportOptions): Transport;

/**
 * The Sentry Miniapp SDK Client.
 *
 * @see MiniappOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export declare class MiniappClient extends BaseClient<MiniappOptions> {
    /**
     * Creates a new Miniapp SDK instance.
     *
     * @param options Configuration options for this SDK.
     */
    constructor(options?: Partial<MiniappOptions>);
    /**
     * @inheritDoc
     */
    protected _prepareEvent(event: Event_3, hint: EventHint_2, scope?: Scope, isolationScope?: Scope): PromiseLike<Event_3 | null>;
    /**
     * Show a report dialog to the user to send feedback to a specific event.
     * 向用户显示报告对话框以将反馈发送到特定事件。---> 小程序上暂时用不到&不考虑。
     *
     * @param options Set individual options for the dialog
     */
    showReportDialog(options?: ReportDialogOptions): void;
    /**
     * @inheritDoc
     */
    eventFromException(exception: unknown, hint?: EventHint_2): PromiseLike<Event_3>;
    /**
     * @inheritDoc
     */
    eventFromMessage(message: ParameterizedString, level?: SeverityLevel_2, hint?: EventHint_2): PromiseLike<Event_3>;
}

/**
 * Configuration options for the Sentry Miniapp SDK.
 */
export declare interface MiniappOptions extends ClientOptions {
    defaultIntegrations?: Integration[];
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
    private readonly _configuredIdleTimeout;
    constructor(_options?: Partial<MiniAppTracingOptions>);
    setupOnce(): void;
    /** Create routing idle transaction. */
    private _createRouteTransaction;
}

declare interface MiniAppTracingOptions extends RequestInstrumentationOptions {
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

/**
 * All properties the report dialog supports
 */
export declare interface ReportDialogOptions {
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

export { Request_2 as Request }

declare interface RequestInstrumentationOptions {
    traceRequest: boolean;
    shouldCreateSpanForRequest?(url: string): boolean;
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

/** JSDoc */
declare interface RouterIntegrations {
    enable?: boolean;
}

export { Scope }

export declare const SDK_NAME = "sentry.javascript.miniapp";

export declare const SDK_VERSION: string;

export { SdkInfo }

export { setContext }

export { setExtra }

export { setExtras }

export { setTag }

export { setTags }

export { setUser }

export { SeverityLevel }

/**
 * Present the user with a report dialog.
 * 向用户显示报告对话框。小程序上暂时不考虑实现该功能。
 *
 * @param options Everything is optional, we try to fetch all info need from the global scope.
 */
export declare function showReportDialog(options?: ReportDialogOptions): void;

/**
 * Span contains all data about a span
 */
declare class Span implements Span_2 {
    /**
     * Human-readable identifier for the span. Mirrors description for backwards compatibility.
     */
    name: string;
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
    status?: SpanStatusType | string | number;
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
     * Attributes for the span (new Sentry/OpenTelemetry style).
     */
    attributes: SpanAttributes;
    /**
     * List of spans that were finalized
     */
    spanRecorder?: SpanRecorder;
    /**
     * @inheritDoc
     */
    transaction?: Transaction;
    /**
     * Instrumenter that created the span.
     */
    instrumenter: 'sentry' | 'otel';
    /**
     * Origin of the span.
     */
    origin?: SpanOrigin;
    /* Excluded from this release type: __constructor */
    /**
     * @inheritDoc
     * @deprecated
     */
    child(spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>): Span;
    /**
     * @inheritDoc
     */
    startChild(spanContext?: SpanContext): Span;
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
    setAttribute(key: string, value: SpanAttributeValue | undefined): this;
    /**
     * @inheritDoc
     */
    setAttributes(attributes: SpanAttributes): this;
    /**
     * @inheritDoc
     */
    setStatus(value: SpanStatus | SpanStatusType): this;
    /**
     * @inheritDoc
     */
    setHttpStatus(httpStatus: number): this;
    /**
     * @inheritDoc
     */
    addEvent(_name: string, _attributesOrStartTime?: SpanAttributes | SpanTimeInput, _startTime?: SpanTimeInput): this;
    /**
     * @inheritDoc
     */
    addLink(_link: unknown): this;
    /**
     * @inheritDoc
     */
    addLinks(_links: unknown): this;
    /**
     * @inheritDoc
     */
    recordException(_exception: unknown): void;
    /**
     * @inheritDoc
     */
    isSuccess(): boolean;
    /**
     * @inheritDoc
     */
    setName(name: string): void;
    /**
     * @inheritDoc
     */
    updateName(name: string): this;
    /**
     * @inheritDoc
     */
    end(endTimestamp?: SpanTimeInput): void;
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
        attributes?: SpanAttributes;
        timestamp?: number;
        trace_id: string;
    };
    /**
     * Return OTEL-like span context data.
     */
    spanContext(): {
        traceId: string;
        spanId: string;
        isRemote?: boolean;
        traceFlags: TraceFlag;
    };
    /**
     * Whether span is recording (sampled and not finished).
     */
    isRecording(): boolean;
}

/** Minimal span context used by the legacy miniapp tracing implementation. */
declare interface SpanContext {
    data?: Record<string, any>;
    description?: string;
    name?: string;
    op?: string;
    parentSpanId?: string;
    sampled?: boolean;
    spanId?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    status?: SpanStatusType | string | number;
    tags?: {
        [key: string]: Primitive;
    };
    traceId?: string;
    attributes?: SpanAttributes;
    instrumenter?: 'sentry' | 'otel';
    origin?: SpanOrigin;
}

/* Excluded from this release type: SpanRecorder */

/** Lightweight span status type used throughout the custom tracing layer. */
declare type SpanStatusType = 'ok' | 'deadline_exceeded' | 'unauthenticated' | 'permission_denied' | 'not_found' | 'resource_exhausted' | 'invalid_argument' | 'unimplemented' | 'unavailable' | 'internal_error' | 'unknown_error' | 'cancelled' | 'already_exists' | 'failed_precondition' | 'aborted' | 'out_of_range' | 'data_loss';

export { StackFrame }

export { Stacktrace }

/**
 * Creates a new transaction and adds a sampling decision if it doesn't yet have one.
 */
export declare function startTransaction(transactionContext: TransactionContext, customSamplingContext?: CustomSamplingContext): Transaction;

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

export { Thread }

/** JSDoc */
declare class Transaction extends Span {
    name: string;
    metadata: TransactionMetadata;
    private _measurements;
    private _contexts;
    private _trimEnd?;
    /* Excluded from this release type: __constructor */
    /**
     * JSDoc
     */
    setName(name: string): void;
    /**
     * Attach additional context to the transaction.
     * @deprecated Prefer attributes or scope data.
     */
    setContext(key: string, context: object): void;
    /**
     * Record a single measurement.
     * @deprecated Prefer top-level `setMeasurement`.
     */
    setMeasurement(name: string, value: number, unit?: MeasurementUnit): void;
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
     * Return dynamic sampling context for this transaction.
     */
    getDynamicSamplingContext(): Partial<DynamicSamplingContext>;
    /**
     * Placeholder profile id (not used in miniapp tracing).
     */
    getProfileId(): string | undefined;
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

/** Context used when creating a transaction/span. */
declare interface TransactionContext extends SpanContext {
    name?: string;
    parentSampled?: boolean;
    trimEnd?: boolean;
    metadata?: TransactionMetadata;
}

/** Transaction specific metadata. */
declare interface TransactionMetadata {
    source?: string;
    spanMetadata?: Record<string, any>;
    dynamicSamplingContext?: DynamicSamplingContext;
    [key: string]: unknown;
}

declare namespace Transports {
    export {
        makeMiniappTransport
    }
}
export { Transports }

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

export { User }

export { withScope }

/**
 * Wrap code within a try/catch block so the SDK is able to capture errors.
 * 在 try / catch 块中包装代码，以便 SDK 能够捕获错误。
 * 实际上是 ./helpers 文件中 warp 方法的进一步封装。
 *
 * @param fn A function to wrap.
 *
 * @returns The result of wrapped function call.
 */
export declare function wrap(fn: Function): any;

export { }
