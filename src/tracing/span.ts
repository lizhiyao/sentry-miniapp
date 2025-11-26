/* eslint-disable max-lines */
import {
  Primitive,
  Span as SpanInterface,
  SpanAttributeValue,
  SpanAttributes,
  SpanContext,
  SpanTimeInput,
  SpanOrigin,
  TraceFlag,
  Instrumenter,
  Transaction,
} from '@sentry/types';
import { dropUndefinedKeys, timestampWithMs, uuid4 } from '@sentry/utils';
import { msToSec } from './utils';

/**
 * Keeps track of finished spans for a given transaction
 * @internal
 * @hideconstructor
 * @hidden
 */
export class SpanRecorder {
  public spans: Span[] = [];

  private readonly _maxlen: number;

  public constructor(maxlen: number = 1000) {
    this._maxlen = maxlen;
  }

  /**
   * This is just so that we don't run out of memory while recording a lot
   * of spans. At some point we just stop and flush out the start of the
   * trace tree (i.e.the first n spans with the smallest
   * start_timestamp).
   */
  public add(span: Span): void {
    if (this.spans.length > this._maxlen) {
      span.spanRecorder = undefined;
    } else {
      this.spans.push(span);
    }
  }
}

/**
 * Span contains all data about a span
 */
export class Span implements SpanInterface {
  /**
   * Human-readable identifier for the span. Mirrors description for backwards compatibility.
   */
  public name: string = '';

  /**
   * @inheritDoc
   */
  public traceId: string = uuid4();

  /**
   * @inheritDoc
   */
  public spanId: string = uuid4().substring(16);

  /**
   * @inheritDoc
   */
  public parentSpanId?: string;

  /**
   * Internal keeper of the status
   */
  public status?: SpanStatusType | string;

  /**
   * @inheritDoc
   */
  public sampled?: boolean;

  /**
   * Timestamp in seconds when the span was created.
   */
  public startTimestamp: number = timestampWithMs();

  /**
   * Timestamp in seconds when the span ended.
   */
  public endTimestamp?: number;

  /**
   * @inheritDoc
   */
  public op?: string;

  /**
   * @inheritDoc
   */
  public description?: string;

  /**
   * @inheritDoc
   */
  public tags: { [key: string]: Primitive } = {};

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public data: { [key: string]: any } = {};

  /**
   * Attributes for the span (new Sentry/OpenTelemetry style).
   */
  public attributes: SpanAttributes = {};

  /**
   * List of spans that were finalized
   */
  public spanRecorder?: SpanRecorder;

  /**
   * @inheritDoc
   */
  public transaction?: Transaction;

  /**
   * Instrumenter that created the span.
   */
  public instrumenter: Instrumenter = 'sentry';

  /**
   * Origin of the span.
   */
  public origin?: SpanOrigin;

  /**
   * You should never call the constructor manually, always use `Sentry.startTransaction()`
   * or call `startChild()` on an existing span.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(spanContext?: SpanContext) {
    if (!spanContext) {
      return this;
    }
    this.traceId = spanContext.traceId ?? this.traceId;
    this.spanId = spanContext.spanId ?? this.spanId;
    this.parentSpanId = spanContext.parentSpanId ?? this.parentSpanId;
    // We want to include booleans as well here
    if ('sampled' in spanContext) {
      this.sampled = spanContext.sampled;
    }
    this.op = spanContext.op ?? this.op;
    this.description = spanContext.description ?? spanContext.name ?? this.description;
    this.name = spanContext.name ?? spanContext.description ?? this.name;
    this.data = spanContext.data ? { ...spanContext.data } : this.data;
    this.tags = spanContext.tags ? { ...spanContext.tags } : this.tags;
    this.attributes = spanContext.attributes ? { ...spanContext.attributes } : this.attributes;
    this.status = spanContext.status ?? this.status;
    this.startTimestamp = spanContext.startTimestamp ?? this.startTimestamp;
    this.endTimestamp = spanContext.endTimestamp ?? this.endTimestamp;
    this.instrumenter = (spanContext as any).instrumenter ?? this.instrumenter;
    this.origin = (spanContext as any).origin ?? this.origin;
  }

  /**
   * @inheritDoc
   * @deprecated
   */
  public child(
    spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'spanId' | 'sampled' | 'traceId' | 'parentSpanId'>>,
  ): Span {
    return this.startChild(spanContext);
  }

  /**
   * @inheritDoc
   */
  public startChild(spanContext?: SpanContext): Span {
    const childSpan = new Span({
      ...spanContext,
      parentSpanId: this.spanId,
      sampled: this.sampled,
      attributes: spanContext?.attributes ?? {},
      instrumenter: this.instrumenter,
      traceId: this.traceId,
    });

    childSpan.spanRecorder = this.spanRecorder;
    if (childSpan.spanRecorder) {
      childSpan.spanRecorder.add(childSpan);
    }

    childSpan.transaction = this.transaction;

    return childSpan;
  }

  /**
   * @inheritDoc
   */
  public setTag(key: string, value: Primitive): this {
    this.tags = { ...this.tags, [key]: value };
    return this;
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public setData(key: string, value: any): this {
    this.data = { ...this.data, [key]: value };
    return this;
  }

  /**
   * @inheritDoc
   */
  public setAttribute(key: string, value: SpanAttributeValue | undefined): void {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.attributes[key];
    } else {
      this.attributes[key] = value;
    }
  }

  /**
   * @inheritDoc
   */
  public setAttributes(attributes: SpanAttributes): void {
    Object.keys(attributes).forEach(attributeKey => this.setAttribute(attributeKey, attributes[attributeKey]));
  }

  /**
   * @inheritDoc
   */
  public setStatus(value: SpanStatusType): this {
    this.status = value;
    return this;
  }

  /**
   * @inheritDoc
   */
  public setHttpStatus(httpStatus: number): this {
    this.setTag('http.status_code', String(httpStatus));
    const spanStatus = spanStatusfromHttpCode(httpStatus);
    if (spanStatus !== 'unknown_error') {
      this.setStatus(spanStatus);
    }
    return this;
  }

  /**
   * @inheritDoc
   */
  public isSuccess(): boolean {
    return this.status === 'ok';
  }

  /**
   * @inheritDoc
   */
  public setName(name: string): void {
    this.name = name;
    this.description = name;
  }

  /**
   * @inheritDoc
   */
  public updateName(name: string): this {
    this.setName(name);
    return this;
  }

  /**
   * @inheritDoc
   */
  public end(endTimestamp?: SpanTimeInput): void {
    this.finish(spanTimeInputToSeconds(endTimestamp));
  }

  /**
   * @inheritDoc
   */
  public finish(endTimestamp?: number): void {
    this.endTimestamp = typeof endTimestamp === 'number' ? endTimestamp : timestampWithMs();
  }

  /**
   * @inheritDoc
   */
  public toTraceparent(): string {
    let sampledString = '';
    if (this.sampled !== undefined) {
      sampledString = this.sampled ? '-1' : '-0';
    }
    return `${this.traceId}-${this.spanId}${sampledString}`;
  }

  /**
   * @inheritDoc
   */
  public toContext(): SpanContext {
    return dropUndefinedKeys({
      data: this.data,
      description: this.description,
      attributes: this.attributes,
      name: this.name,
      endTimestamp: this.endTimestamp,
      op: this.op,
      parentSpanId: this.parentSpanId,
      sampled: this.sampled,
      spanId: this.spanId,
      startTimestamp: this.startTimestamp,
      status: this.status,
      tags: this.tags,
      traceId: this.traceId,
    });
  }

  /**
   * @inheritDoc
   */
  public updateWithContext(spanContext: SpanContext): this {
    this.data = spanContext.data ?? {};
    this.description = spanContext.description ?? spanContext.name;
    this.name = spanContext.name ?? spanContext.description ?? this.name;
    this.endTimestamp = spanContext.endTimestamp;
    this.op = spanContext.op;
    this.parentSpanId = spanContext.parentSpanId;
    this.sampled = spanContext.sampled;
    this.spanId = spanContext.spanId ?? this.spanId;
    this.startTimestamp = spanContext.startTimestamp ?? this.startTimestamp;
    this.status = spanContext.status;
    this.tags = spanContext.tags ?? {};
    this.attributes = spanContext.attributes ?? this.attributes;
    this.traceId = spanContext.traceId ?? this.traceId;

    return this;
  }

  /**
   * @inheritDoc
   */
  public getTraceContext(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    span_id: string;
    status?: string;
    tags?: { [key: string]: Primitive };
    trace_id: string;
  } {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : undefined,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      status: this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
      trace_id: this.traceId,
    });
  }

  /**
   * @inheritDoc
   */
  public toJSON(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: { [key: string]: any };
    description?: string;
    op?: string;
    parent_span_id?: string;
    span_id: string;
    start_timestamp: number;
    status?: string;
    tags?: { [key: string]: Primitive };
    attributes?: SpanAttributes;
    timestamp?: number;
    trace_id: string;
  } {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : undefined,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      start_timestamp: this.startTimestamp,
      status: this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : undefined,
      attributes: Object.keys(this.attributes).length > 0 ? this.attributes : undefined,
      timestamp: this.endTimestamp,
      trace_id: this.traceId,
    });
  }

  /**
   * Return OTEL-like span context data.
   */
  public spanContext(): { traceId: string; spanId: string; isRemote?: boolean; traceFlags: TraceFlag } {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      traceFlags: this.sampled ? 1 : 0,
    };
  }

  /**
   * Whether span is recording (sampled and not finished).
   */
  public isRecording(): boolean {
    return this.sampled !== false && this.endTimestamp === undefined;
  }
}

function spanTimeInputToSeconds(input?: SpanTimeInput): number | undefined {
  if (input === undefined) {
    return timestampWithMs();
  }

  if (Array.isArray(input) && input.length === 2) {
    const [seconds, nanoseconds] = input;
    return seconds + nanoseconds / 1e9;
  }

  if (input instanceof Date) {
    return input.getTime() / 1000;
  }

  if (typeof input === 'number') {
    // If value looks like ms since epoch, convert to seconds.
    return input > 1e12 ? msToSec(input) : input;
  }

  return timestampWithMs();
}

export type SpanStatusType =
  /** The operation completed successfully. */
  | 'ok'
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

/**
 * Converts a HTTP status code into a {@link SpanStatusType}.
 *
 * @param httpStatus The HTTP response status code.
 * @returns The span status or unknown_error.
 */
export function spanStatusfromHttpCode(httpStatus: number): SpanStatusType {
  if (httpStatus < 400 && httpStatus >= 100) {
    return 'ok';
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    switch (httpStatus) {
      case 401:
        return 'unauthenticated';
      case 403:
        return 'permission_denied';
      case 404:
        return 'not_found';
      case 409:
        return 'already_exists';
      case 413:
        return 'failed_precondition';
      case 429:
        return 'resource_exhausted';
      default:
        return 'invalid_argument';
    }
  }

  if (httpStatus >= 500 && httpStatus < 600) {
    switch (httpStatus) {
      case 501:
        return 'unimplemented';
      case 503:
        return 'unavailable';
      case 504:
        return 'deadline_exceeded';
      default:
        return 'internal_error';
    }
  }

  return 'unknown_error';
}
