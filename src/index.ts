// Sentry Miniapp SDK for WeChat Mini Program
// Based on @sentry/core 9.38.0
// Development Mode: Auto-rebuild enabled

// Install polyfills for miniapp environment
import { ensurePolyfills } from './polyfills';
ensurePolyfills();

// Export types from @sentry/core (v9 moved types from @sentry/types to @sentry/core)
export type {
  Breadcrumb,
  BreadcrumbHint,
  Event,
  EventHint,
  Exception,
  SdkInfo,
  Session,
  SeverityLevel,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Integration,
  Options,
  Client,
  Scope,
  Transport,
  BaseTransportOptions,
} from '@sentry/core';

// Export core functions from @sentry/core
export {
  addEventProcessor,
  captureException,
  captureEvent,
  captureMessage,
  getCurrentScope,
  getIsolationScope,
  withScope,
  startSpan,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  addBreadcrumb,
  flush,
  close,
  lastEventId,
} from '@sentry/core';

// Export SDK specific exports
export { SDK_NAME, SDK_VERSION } from './version';
export { init, showReportDialog, wrap, captureFeedback } from './sdk';
export type { MiniappOptions, SendFeedbackParams } from './types';
export { MiniappClient } from './client';
export * as Integrations from './integrations/index';
export * as Transports from './transports/index';

// Export default integrations
export { defaultIntegrations, getDefaultIntegrations } from './sdk';