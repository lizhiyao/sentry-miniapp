// Sentry Miniapp SDK for WeChat Mini Program
// Based on @sentry/core
// Development Mode: Auto-rebuild enabled

// 必须作为首个静态依赖求值，确保其余 SDK 模块加载前已补齐小程序运行时能力。
import './polyfills-bootstrap';

// Export types from @sentry/core (types moved from @sentry/types to @sentry/core)
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
  Transport,
  BaseTransportOptions,
  DataCollection,
  SerializedStreamedSpan,
  SpanJSON,
  StreamedSpanJSON,
  Span,
  StartSpanOptions,
  Log,
  LogSeverityLevel,
  Metric,
  MetricOptions,
} from '@sentry/core';

// Export core functions from @sentry/core
export {
  Scope,
  addEventProcessor,
  addIntegration,
  captureException,
  captureEvent,
  captureMessage,
  getClient,
  getCurrentScope,
  getIsolationScope,
  withScope,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  continueTrace,
  startNewTrace,
  getTraceData,
  metrics,
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
  isEnabled,
  // 用户可显式装配 core 原生 SpanStreaming；只提供 stream 回调契约。
  setAttribute,
  setAttributes,
  getGlobalScope,
  spanStreamingIntegration,
  logger,
  // Session management APIs
  startSession,
  endSession,
  captureSession,
} from '@sentry/core';

// Export SDK specific exports
export { SDK_NAME, SDK_VERSION } from './version';
export { init, wrap, captureFeedback, setConsent, getConsent, getDiagnostics } from './sdk';
export type {
  MiniappOptions,
  MiniappDiagnostics,
  MiniappDiagnosticsDsn,
  MiniappDiagnosticsOptions,
  MiniappDiagnosticsTransport,
  MiniappDiagnosticsWarning,
  SendFeedbackParams,
  MinigameFrameRateOptions,
  MinigameJankLevels,
  MiniappPlatform,
} from './types';
export { MiniappClient } from './client';
export type { MiniappLowLevelClientOptions } from './client';
export * as Integrations from './integrations/index';
export * as Transports from './transports/index';

// Named factories 与 Integrations namespace 重导出相同函数。
export {
  globalHandlersIntegration,
  tryCatchIntegration,
  linkedErrorsIntegration,
  httpContextIntegration,
  dedupeIntegration,
  rewriteFramesIntegration,
  networkBreadcrumbsIntegration,
  pageBreadcrumbsIntegration,
  consoleBreadcrumbsIntegration,
  sessionIntegration,
  networkStatusIntegration,
  minigameIntegration,
  minigameFrameRateIntegration,
  type NetworkBreadcrumbsOptions,
} from './integrations/index';

// Performance API exports
export {
  getPerformanceManager,
  type PerformanceEntry,
  type NavigationPerformanceEntry,
  type RenderPerformanceEntry,
  type ResourcePerformanceEntry,
  type UserTimingPerformanceEntry,
  type PerformanceManager,
  type PerformanceObserver,
} from './crossPlatform';
export {
  performanceIntegration,
  type PerformanceIntegrationOptions,
} from './integrations/performance';

// Export Session utility functions from @sentry/core
export { makeSession, closeSession, updateSession } from '@sentry/core';

// Export default integrations
export { getDefaultIntegrations } from './sdk';

// Export stack trace parser for advanced customization
export { miniappStackParser } from './stacktrace';
