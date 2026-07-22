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
 * 分级卡顿阈值（毫秒）。各档全 optional，可只启用其中一两档（如只给 major + severe）。
 * 单帧间隔超过最低启用档即记为一次卡顿，并按命中的**最高档**归类。
 *
 * 阈值应为亚秒级（建议 < 5000ms）：单帧间隔超过 5000ms 会被当作后台暂停 / 采样断点
 * 丢弃，不计入卡顿，故 ≥ 5000ms 的档实际不会触发（秒级停顿属于卡死，不是 jank）。
 *
 * 启用档的阈值须按 minor < major < severe **严格递增**；否则 jankLevel 名实不符
 * （如 { minor: 100, severe: 17 }），会 warn 并忽略分级、回退单档 longFrameThresholdMs。
 */
export interface MinigameJankLevels {
  /** 小卡阈值（ms）：单帧间隔超过它且未达 major，记为 minor。 */
  minor?: number;
  /** 大卡阈值（ms）。 */
  major?: number;
  /** 严重卡阈值（ms）。 */
  severe?: number;
}

/** 小游戏帧率/卡顿监控（MinigameFrameRateIntegration）的细调选项。 */
export interface MinigameFrameRateOptions {
  /** FPS 低于该值时，周期上报标记为 warning。默认 30。 */
  fpsWarningThreshold?: number;
  /** 单帧间隔超过该毫秒数视为一次卡顿（jank）。默认 50（约 < 20fps 的瞬时帧）。 */
  longFrameThresholdMs?: number;
  /** 周期性上报 FPS 的间隔（毫秒）。默认 10000。 */
  reportInterval?: number;
  /** 每个上报窗口内最多产出多少条 jank 面包屑（防刷屏）；超出仅计数不再打面包屑。默认 3。 */
  maxJankBreadcrumbsPerWindow?: number;
  /**
   * 分级卡顿阈值（ms）。提供后切换为分级统计：每帧按命中的最高档计入，
   * `minigame.jank` 面包屑带 `jankLevel`，summary 对启用的档增发
   * `jank_minor_count` / `jank_major_count` / `jank_severe_count`。
   * 不提供则沿用 `longFrameThresholdMs` 单档，行为与历史完全一致；
   * 同时提供 `longFrameThresholdMs` 与 `jankLevels` 时，`jankLevels` 优先（老参数忽略）。
   */
  jankLevels?: MinigameJankLevels;
}

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

  /** Performance tracing sample rate. API request timing is reported as http.client spans when sampled. */
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

  /**
   * Miniapp platform label stored on events. Runtime platform detection is automatic.
   * 取值与运行时 `AppName` 对齐（百度小程序的全局对象是 `swan`，故用 `swan` 表示，无独立 `baidu`）。
   */
  platform?: 'wechat' | 'alipay' | 'bytedance' | 'qq' | 'swan' | 'dingtalk' | 'kuaishou';

  /** Whether to enable system info collection */
  enableSystemInfo?: boolean;

  /** Whether to enable user interaction breadcrumbs */
  enableUserInteractionBreadcrumbs?: boolean;

  /** Whether to enable console breadcrumbs */
  enableConsoleBreadcrumbs?: boolean;

  /** Whether to enable page lifecycle breadcrumbs */
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

  /**
   * 是否启用隐私合规「同意门禁」（默认 false，保持现有行为）。
   * true 时：SDK 照常采集（监听 / 异常 / 面包屑 / performance），但在用户同意隐私协议前
   * **不发送任何网络请求**，事件先入本地缓冲；调用 `Sentry.setConsent(true)` 后补发并恢复上报。
   * 注意：开启即隐含使用本地缓冲（即便 enableOfflineCache 为 false 也会启用同意缓冲）。
   */
  requireConsent?: boolean;

  /**
   * 同意前缓存的最大事件数（默认 100）。区别于弱网重试的 offlineCacheLimit（默认 30）：
   * 同意等待期事件量级远大于断网几秒，故默认放宽。
   */
  consentCacheLimit?: number;

  /**
   * 同意前缓存的最大字节数（默认约 900KB）。受平台单 key Storage 上限约束
   * （微信等约 1MB），故实际封顶 ~900KB，超出按淘汰策略丢弃。
   */
  consentCacheMaxBytes?: number;

  /** 同意前缓存的过期时间（ms，默认 86400000 即 24 小时），超时事件丢弃。 */
  consentCacheMaxAge?: number;

  /**
   * 同意前缓存因超限 / 过期丢弃事件时的回调，便于接入方评估上限配置是否合理。
   * reason 为 'count'（条数）| 'bytes'（体积）| 'age'（过期）；dropped 为本次丢弃条数。
   */
  onConsentCacheDrop?: (info: { reason: 'count' | 'bytes' | 'age'; dropped: number }) => void;

  /** 是否启用分布式追踪头注入（默认 true）。只控制 sentry-trace/baggage，以及 propagateTraceparent 开启后的 traceparent 传播，不关闭本地 API 请求 span。 */
  enableTracePropagation?: boolean;

  /** 追踪目标 URL 白名单，仅匹配的请求才注入 sentry-trace/baggage，以及可选 traceparent 头。为空则对所有非 Sentry 请求注入；API 请求 span 仍按 tracing 采样记录 */
  tracePropagationTargets?: Array<string | RegExp>;

  /** 是否额外注入 W3C `traceparent` 头（默认 false）。用于和 OpenTelemetry / W3C Trace Context 兼容的后端链路串联。 */
  propagateTraceparent?: boolean;

  /** 是否启用自动 Session 管理（默认 true），为 Sentry Release Health 提供会话数据 */
  enableAutoSessionTracking?: boolean;

  /** 是否启用网络状态实时监控（默认 true） */
  enableNetworkStatusMonitoring?: boolean;

  /** 是否启用小游戏生命周期监控（冷启动首帧耗时、启动场景、onShow/onHide 面包屑）。小游戏环境下默认启用，普通小程序默认关闭 */
  enableMinigameLifecycle?: boolean;

  /**
   * 是否启用小游戏帧率/卡顿监控（采样全局 requestAnimationFrame 估算 FPS + jank）。
   * 仅适用于小游戏（有绑定渲染帧的全局 requestAnimationFrame）；小程序为双线程架构、
   * 逻辑层无全局 requestAnimationFrame，开启也会安全 no-op。小游戏环境下默认启用。
   */
  enableMinigameFrameRate?: boolean;

  /** 小游戏帧率/卡顿监控的细调选项（仅在 enableMinigameFrameRate 生效时使用） */
  minigameFrameRateOptions?: MinigameFrameRateOptions;

  /** Array of strings or regexes that match error URLs which should be exclusively sent to Sentry */
  allowUrls?: Array<string | RegExp>;

  /** Array of strings or regexes that match error URLs which should not be sent to Sentry */
  denyUrls?: Array<string | RegExp>;

  /** Array of strings or regexes; matching error messages/types are dropped before sending */
  ignoreErrors?: Array<string | RegExp>;

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
