export {
  type Breadcrumb,
  type BreadcrumbHint,
  type Request,
  type SdkInfo,
  type Event,
  type EventHint,
  type EventStatus,
  type Exception,
  type Response,
  Severity,
  type StackFrame,
  type Stacktrace,
  type Thread,
  type User,
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
  startTransaction,
  withScope,
} from "@sentry/core";

export { SDK_NAME, SDK_VERSION } from "./version";
export {
  defaultIntegrations,
  init,
  lastEventId,
  showReportDialog,
  flush,
  close,
  wrap
} from "./sdk";
export { type MiniappOptions } from "./backend";
export { MiniappClient, type ReportDialogOptions } from "./client";

import * as Integrations from "./integrations/index";
import * as Transports from "./transports/index";

export { Integrations, Transports };
