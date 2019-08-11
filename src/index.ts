export {
  Breadcrumb,
  Request,
  SdkInfo,
  Event,
  Exception,
  Response,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
  Thread,
  User
} from "@sentry/types";

export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  Scope,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  Span,
  withScope
} from "@sentry/core";

export { SDK_NAME, SDK_VERSION } from "./version";
export {
  defaultIntegrations,
  forceLoad,
  init,
  lastEventId,
  onLoad,
  showReportDialog,
  flush,
  close,
  wrap
} from "./sdk";
export { BrowserOptions } from "./backend";
export { BrowserClient, ReportDialogOptions } from "./client";

import * as Integrations from "./integrations";
import * as Transports from "./transports";

export { Integrations, Transports };
