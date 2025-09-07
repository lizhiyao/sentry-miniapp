import type { ClientOptions, BaseTransportOptions, Integration } from '@sentry/core';

/**
 * Configuration options for the Sentry Miniapp SDK.
 */
export interface MiniappOptions {
  /** Sentry DSN */
  dsn?: string;
  
  /** Environment */
  environment?: string;
  
  /** Debug mode */
  debug?: boolean;
  
  /** Sample rate */
  sampleRate?: number;
  
  /** Release version */
  release?: string;
  
  /** Maximum number of breadcrumbs */
  maxBreadcrumbs?: number;
  
  /** Traces sample rate */
  tracesSampleRate?: number;
  
  /** Transport function */
  transport?: any;
  
  /** Before send hook */
  beforeSend?: any;
  
  /** Before breadcrumb hook */
  beforeBreadcrumb?: any;
  
  /** Miniapp platform type */
  platform?: 'wechat' | 'alipay' | 'bytedance' | 'qq' | 'baidu' | 'dingtalk';
  
  /** Whether to enable system info collection */
  enableSystemInfo?: boolean;
  
  /** Whether to enable user interaction breadcrumbs */
  enableUserInteractionBreadcrumbs?: boolean;
  
  /** Whether to enable console breadcrumbs */
  enableConsoleBreadcrumbs?: boolean;
  
  /** Whether to enable navigation breadcrumbs */
  enableNavigationBreadcrumbs?: boolean;
  
  /** Array of strings or regexes that match error URLs which should be exclusively sent to Sentry */
  allowUrls?: Array<string | RegExp>;
  
  /** Array of strings or regexes that match error URLs which should not be sent to Sentry */
  denyUrls?: Array<string | RegExp>;
  
  /** Integrations */
  integrations?: Integration[];
  
  /** Default integrations */
  defaultIntegrations?: Integration[];
}

/**
 * Client options for the Miniapp SDK.
 */
export interface MiniappClientOptions extends ClientOptions<BaseTransportOptions> {
  options?: MiniappOptions;
}

/**
 * All properties the report dialog supports
 */
export interface ReportDialogOptions {
  [key: string]: any;
  eventId?: string;
  dsn?: string;
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
 * Parameters for sending user feedback
 */
export interface SendFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  url?: string;
  source?: string;
  associatedEventId?: string;
  /**
   * Set an object that will be merged sent as tags data with the event.
   */
  tags?: {
    [key: string]: string | number | boolean;
  };
}