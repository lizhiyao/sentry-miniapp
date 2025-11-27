import type {
  DynamicSamplingContext,
  MeasurementUnit,
  Measurements,
  Primitive,
  SpanAttributes,
  SpanOrigin,
  WorkerLocation,
} from '@sentry/types';

/** Lightweight span status type used throughout the custom tracing layer. */
export type SpanStatusType =
  | 'ok'
  | 'deadline_exceeded'
  | 'unauthenticated'
  | 'permission_denied'
  | 'not_found'
  | 'resource_exhausted'
  | 'invalid_argument'
  | 'unimplemented'
  | 'unavailable'
  | 'internal_error'
  | 'unknown_error'
  | 'cancelled'
  | 'already_exists'
  | 'failed_precondition'
  | 'aborted'
  | 'out_of_range'
  | 'data_loss';

/** Minimal span context used by the legacy miniapp tracing implementation. */
export interface SpanContext {
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
  tags?: { [key: string]: Primitive };
  traceId?: string;
  attributes?: SpanAttributes;
  instrumenter?: 'sentry' | 'otel';
  origin?: SpanOrigin;
}

/** Transaction specific metadata. */
export interface TransactionMetadata {
  source?: string;
  spanMetadata?: Record<string, any>;
  dynamicSamplingContext?: DynamicSamplingContext;
  [key: string]: unknown;
}

/** Context used when creating a transaction/span. */
export interface TransactionContext extends SpanContext {
  name?: string;
  parentSampled?: boolean;
  trimEnd?: boolean;
  metadata?: TransactionMetadata;
}

export interface SamplingContext {
  parentSampled?: boolean;
  transactionContext: TransactionContext & { name: string };
  name: string;
  attributes?: SpanAttributes;
  location?: WorkerLocation;
  // Allow any request shape to keep compatibility with updated core typings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizedRequest?: any;
  [key: string]: unknown;
}

export type CustomSamplingContext = Record<string, unknown>;

export type MeasurementsMap = Measurements;
export type MeasurementUnitType = MeasurementUnit;
