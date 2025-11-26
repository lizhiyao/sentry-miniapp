export type {
  Breadcrumb,
  BreadcrumbHint,
  Request,
  SdkInfo,
  Event,
  EventHint,
  EventStatus,
  Exception,
  Response,
  StackFrame,
  Stacktrace,
  Thread,
  User,
  Integration,
} from "@sentry/types";

export { Severity } from "@sentry/types";


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
export type { MiniappOptions } from "./backend";
export { MiniappClient, type ReportDialogOptions } from "./client";

import * as Integrations from "./integrations/index";
import * as Transports from "./transports/index";

export { Integrations, Transports };
