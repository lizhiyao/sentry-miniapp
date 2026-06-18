import {
  getCurrentScope,
  initAndBind,
  setContext,
  withScope,
  eventFiltersIntegration,
} from '@sentry/core';
import type { Integration } from '@sentry/core';
import { miniappStackParser } from './stacktrace';

import { MiniappClient } from './client';
import { appName, isMiniappEnvironment, isMinigame } from './crossPlatform';
import {
  GlobalHandlers,
  TryCatch,
  LinkedErrors,
  HttpContext,
  Dedupe,
  performanceIntegration,
  RewriteFrames,
  NetworkBreadcrumbs,
  PageBreadcrumbs,
  ConsoleBreadcrumbs,
  SessionIntegration,
  NetworkStatusIntegration,
  MinigameIntegration,
  MinigameFrameRateIntegration,
} from './integrations/index';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';

/**
 * 构造一组**全新**的默认集成实例。
 *
 * 必须每次 init 现造新实例：集成的 setupOnce/cleanup 会把补丁状态留在实例上，跨多次 init 或
 * 多 client 复用同一批单例会让状态互踩（close 后再 init、或并存两个 client 时尤甚）。这与
 * client.close() 清 core 的 setupOnce 门禁（按 name）互补——name 门禁放行后，全新实例才能干净
 * 地重新 setupOnce。
 */
export function getDefaultIntegrations(): Integration[] {
  return [
    // Core integrations
    new HttpContext(),
    new Dedupe(),
    new GlobalHandlers(),
    new TryCatch(),
    new LinkedErrors(),
    // Performance monitoring
    performanceIntegration({
      enableNavigation: true,
      enableRender: true,
      enableResource: true,
      enableUserTiming: true,
      sampleRate: 1.0,
      reportInterval: 30000,
    }),
  ];
}

/**
 * @deprecated 直接复用本数组的实例，会在多次 init / 多 client 间共享 setupOnce 状态、互相踩补丁。
 * 请改用 {@link getDefaultIntegrations}（每次返回全新实例）。导出仅为向后兼容保留。
 */
export const defaultIntegrations: Integration[] = getDefaultIntegrations();

/**
 * Initialize the Sentry Miniapp SDK
 * @param options Configuration options for the SDK
 */
export function init(options: MiniappOptions = {}): MiniappClient | undefined {
  if (!isMiniappEnvironment()) {
    console.warn('[sentry-miniapp] Not running in a supported miniapp environment');
    return undefined;
  }

  const integrations = [...(options.integrations || getDefaultIntegrations())];

  const opts = {
    ...options,
    integrations,
    stackParser: miniappStackParser,
    transport: options.transport,
  };

  if (opts.enableSourceMap !== false) {
    opts.integrations.push(new RewriteFrames());
  }

  const networkOptions: Record<string, any> = { traceNetworkBody: opts.traceNetworkBody };
  if (opts.enableTracePropagation !== undefined) {
    networkOptions['enableTracePropagation'] = opts.enableTracePropagation;
  }
  if (opts.tracePropagationTargets !== undefined) {
    networkOptions['tracePropagationTargets'] = opts.tracePropagationTargets;
  }
  opts.integrations.push(new NetworkBreadcrumbs(networkOptions));

  // 自动 Session 管理（默认启用）
  if (opts.enableAutoSessionTracking !== false) {
    opts.integrations.push(new SessionIntegration());
  }

  // 页面生命周期和用户交互面包屑（默认启用，可分别关闭）
  const enablePageLifecycleBreadcrumbs = opts.enableNavigationBreadcrumbs !== false;
  const enableUserInteractionBreadcrumbs = opts.enableUserInteractionBreadcrumbs !== false;
  if (enablePageLifecycleBreadcrumbs || enableUserInteractionBreadcrumbs) {
    opts.integrations.push(
      new PageBreadcrumbs({
        enableLifecycle: enablePageLifecycleBreadcrumbs,
        enableUserInteraction: enableUserInteractionBreadcrumbs,
      }),
    );
  }

  // 网络状态实时监控（默认启用）
  if (opts.enableNetworkStatusMonitoring !== false) {
    opts.integrations.push(new NetworkStatusIntegration());
  }

  // Console 面包屑（默认禁用，需手动开启）
  if (opts.enableConsoleBreadcrumbs) {
    opts.integrations.push(new ConsoleBreadcrumbs());
  }

  // 小游戏专属能力：纯增量，仅在检测到小游戏（或显式开启）时追加。
  // 小游戏无 App()/Page()，PageBreadcrumbs / SessionIntegration 已安全 no-op，这里不删除它们。
  // 若用户已通过 integrations 自行传入同名集成，则不再自动追加，避免默认实例覆盖用户配置。
  const minigame = isMinigame();
  const hasIntegration = (id: string): boolean =>
    opts.integrations.some((integration) => integration && integration.name === id);

  // 入站过滤：让 allowUrls / denyUrls / ignoreErrors 真正生效（此前是声明了却无人消费的死选项）。
  // 仅在用户未自行传入同名集成时追加；按 exactOptionalPropertyTypes 只填已定义的键。
  if (!hasIntegration('EventFilters') && !hasIntegration('InboundFilters')) {
    const filterOptions: {
      allowUrls?: Array<string | RegExp>;
      denyUrls?: Array<string | RegExp>;
      ignoreErrors?: Array<string | RegExp>;
    } = {};
    if (opts.allowUrls) filterOptions.allowUrls = opts.allowUrls;
    if (opts.denyUrls) filterOptions.denyUrls = opts.denyUrls;
    if (opts.ignoreErrors) filterOptions.ignoreErrors = opts.ignoreErrors;
    opts.integrations.push(eventFiltersIntegration(filterOptions));
  }

  if (
    !hasIntegration(MinigameIntegration.id) &&
    (opts.enableMinigameLifecycle === true || (minigame && opts.enableMinigameLifecycle !== false))
  ) {
    opts.integrations.push(new MinigameIntegration());
  }
  if (
    !hasIntegration(MinigameFrameRateIntegration.id) &&
    (opts.enableMinigameFrameRate === true || (minigame && opts.enableMinigameFrameRate !== false))
  ) {
    // 细调通过 minigameFrameRateOptions 传入（见 MiniappOptions）。
    opts.integrations.push(new MinigameFrameRateIntegration(opts.minigameFrameRateOptions));
  }

  // 平台标记。device / os / app context 由 MiniappClient._prepareEvent 在每个事件上统一写入
  // （唯一权威），此处不再重复设置，避免字段不一致与覆盖歧义（见架构 review P2-b）。
  setContext('miniapp', {
    platform: appName(),
    environment: 'miniapp',
  });

  // @sentry/core 未公开导出 ClientClass 类型，且 MiniappClient 用 Client<any>（见 client.ts），
  // 故此处保留 as any。opts 在运行时即合法 ClientOptions（含 stackParser/transport/integrations）。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initAndBind(MiniappClient as any, opts as any);
  return getCurrentScope().getClient() as MiniappClient;
}

/**
 * @deprecated Miniapp environment does not support Sentry's default HTML report dialog.
 * Please implement your own UI form to collect user feedback (name, email, comments)
 * and use `Sentry.captureFeedback()` to submit it to Sentry.
 *
 * 小程序环境不支持 Sentry 官方的 HTML 反馈弹窗。
 * 请自行实现 UI 表单收集用户反馈，并调用 `Sentry.captureFeedback()` 进行上报。
 */
export function showReportDialog(_options: ReportDialogOptions = {}): void {
  console.warn(
    '[sentry-miniapp] showReportDialog is deprecated and does nothing. ' +
      'Please build your own UI and use `Sentry.captureFeedback()` instead.',
  );
}

/**
 * Wrap a function to capture exceptions
 */
export function wrap<T extends (...args: any[]) => any>(fn: T): T {
  return function (this: any, ...args: Parameters<T>) {
    return withScope(() => {
      try {
        return fn.apply(this, args);
      } catch (error) {
        getCurrentScope().captureException(error);
        throw error;
      }
    });
  } as T;
}

/**
 * Capture feedback using the new feedback API.
 * 使用新的反馈 API 捕获反馈
 *
 * @param params Feedback parameters
 * @returns Event ID
 */
export function captureFeedback(params: SendFeedbackParams): string {
  const client = getCurrentScope().getClient() as MiniappClient | undefined;
  if (client) {
    return client.captureFeedback(params);
  } else {
    console.warn('[sentry-miniapp] No client available for captureFeedback');
    return '';
  }
}
