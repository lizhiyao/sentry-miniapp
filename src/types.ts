import type {
  ClientOptions,
  BaseTransportOptions,
  Event,
  EventHint,
  Integration,
  Transport,
  Breadcrumb,
} from '@sentry/core';

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

  /**
   * 动态采样函数，根据上下文决定每个 trace 的采样率。
   * 优先级高于 tracesSampleRate，设置后 tracesSampleRate 将被忽略。
   *
   * @param samplingContext - 采样上下文信息
   * @returns 0~1 之间的数字（采样概率），或 true（100% 采样）/ false（丢弃）
   *
   * @example
   * ```typescript
   * Sentry.init({
   *   tracesSampler: ({ name, inheritOrSampleWith }) => {
   *     if (name.includes('pages/index')) return 1;    // 首页 100% 采样
   *     if (name.includes('pages/about')) return 0.1;  // 关于页 10% 采样
   *     return inheritOrSampleWith(0.5);                // 其他默认 50%
   *   },
   * });
   * ```
   */
  tracesSampler?: (samplingContext: {
    /** span 名称 */
    name: string;
    /** span 初始属性 */
    attributes?: Record<string, unknown>;
    /** 父级 span 是否被采样 */
    parentSampled?: boolean;
    /** 来自上游 trace 的采样率 */
    parentSampleRate?: number;
    /** 继承父级采样决策或使用回退采样率 */
    inheritOrSampleWith: (fallbackSampleRate: number) => number;
  }) => number | boolean;

  /** Transport function */
  transport?: (transportOptions: BaseTransportOptions) => Transport;

  /** Before send hook */
  beforeSend?: (event: Event, hint?: EventHint) => Event | null | PromiseLike<Event | null>;

  /** Before breadcrumb hook */
  beforeBreadcrumb?: (breadcrumb: Breadcrumb, hint?: Record<string, unknown>) => Breadcrumb | null;

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

  /** Whether to enable automatic source map path rewrite */
  enableSourceMap?: boolean;

  /** Whether to capture and record request and response body in network breadcrumbs */
  traceNetworkBody?: boolean;

  /** Whether to enable offline cache to retry sending events later */
  enableOfflineCache?: boolean;

  /** Maximum number of events to store in offline cache (default: 30) */
  offlineCacheLimit?: number;

  /** 离线缓存过期时间（ms），超过此时间的缓存事件将被丢弃（默认 86400000 即 24 小时） */
  offlineCacheMaxAge?: number;

  /** 是否启用分布式追踪头注入（默认 true） */
  enableTracePropagation?: boolean;

  /** 追踪目标 URL 白名单，仅匹配的请求才注入 sentry-trace/baggage 头。为空则对所有非 Sentry 请求注入 */
  tracePropagationTargets?: Array<string | RegExp>;

  /** 是否启用自动 Session 管理（默认 true），为 Sentry Release Health 提供会话数据 */
  enableAutoSessionTracking?: boolean;

  /** 是否启用网络状态实时监控（默认 true） */
  enableNetworkStatusMonitoring?: boolean;

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
