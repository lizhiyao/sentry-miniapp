import {
  captureFeedback as captureFeedbackCore,
  getClient,
  getCurrentScope,
  getIntegrationsToSetup,
  initAndBind,
  setContext,
  stackParserFromStackParserOptions,
  withScope,
  eventFiltersIntegration,
} from '@sentry/core';
import type { Integration } from '@sentry/core';
import { miniappStackParser } from './stacktrace';
import { setConsentGranted, isConsentGranted } from './consent';
export { getDiagnostics } from './diagnostics';

import { MiniappClient, setConfiguredDefaultIntegrationsMode } from './client';
import { appName, isMiniappEnvironment, isMinigame } from './crossPlatform';
import { ignoreNextOnErrorCall } from './helpers';
import {
  GlobalHandlers,
  TryCatch,
  linkedErrorsIntegration,
  HttpContext,
  dedupeIntegration,
  performanceIntegration,
  rewriteFramesIntegration,
  NetworkBreadcrumbs,
  PageBreadcrumbs,
  ConsoleBreadcrumbs,
  SessionIntegration,
  NetworkStatusIntegration,
  MinigameIntegration,
  MinigameFrameRateIntegration,
} from './integrations/index';
import { functionToStringIntegration } from '@sentry/core';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';

/**
 * 构造一组**全新**的默认集成实例。
 *
 * 必须每次 init 现造新实例：有全局副作用的集成会在实例上保存补丁与订阅状态。
 * core 的 `setupOnce` 只负责进程级初始化；每个 client 的安装与回收由 `setup(client)` /
 * `client.registerCleanup()` 配对，不再修改 core 内部的全局门禁。
 */
export function getDefaultIntegrations(options: MiniappOptions = {}): Integration[] {
  const integrations: Integration[] = [
    // Core integrations
    functionToStringIntegration(),
    new HttpContext(),
    new GlobalHandlers(),
    new TryCatch(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
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

  if (options.enableSourceMap !== false) {
    integrations.push(rewriteFramesIntegration());
  }

  const networkOptions: Record<string, any> = { traceNetworkBody: options.traceNetworkBody };
  if (options.enableTracePropagation !== undefined) {
    networkOptions['enableTracePropagation'] = options.enableTracePropagation;
  }
  if (options.tracePropagationTargets !== undefined) {
    networkOptions['tracePropagationTargets'] = options.tracePropagationTargets;
  }
  if (options.propagateTraceparent !== undefined) {
    networkOptions['propagateTraceparent'] = options.propagateTraceparent;
  }
  integrations.push(new NetworkBreadcrumbs(networkOptions));

  if (options.enableAutoSessionTracking !== false) {
    integrations.push(new SessionIntegration());
  }

  const enablePageLifecycleBreadcrumbs = options.enableNavigationBreadcrumbs !== false;
  const enableUserInteractionBreadcrumbs = options.enableUserInteractionBreadcrumbs !== false;
  if (enablePageLifecycleBreadcrumbs || enableUserInteractionBreadcrumbs) {
    integrations.push(
      new PageBreadcrumbs({
        enableLifecycle: enablePageLifecycleBreadcrumbs,
        enableUserInteraction: enableUserInteractionBreadcrumbs,
      }),
    );
  }

  if (options.enableNetworkStatusMonitoring !== false) {
    integrations.push(new NetworkStatusIntegration());
  }

  if (options.enableConsoleBreadcrumbs) {
    integrations.push(new ConsoleBreadcrumbs());
  }

  const filterOptions: {
    allowUrls?: Array<string | RegExp>;
    denyUrls?: Array<string | RegExp>;
    ignoreErrors?: Array<string | RegExp>;
  } = {};
  if (options.allowUrls) filterOptions.allowUrls = options.allowUrls;
  if (options.denyUrls) filterOptions.denyUrls = options.denyUrls;
  if (options.ignoreErrors) filterOptions.ignoreErrors = options.ignoreErrors;
  integrations.push(eventFiltersIntegration(filterOptions));

  // 两个小游戏开关都显式配置后，无需读取运行时环境。这也让下面的兼容快照可以在模块导入时
  // 保持纯构造，不会提前填充平台检测缓存。
  const minigame =
    options.enableMinigameLifecycle === undefined || options.enableMinigameFrameRate === undefined
      ? isMinigame()
      : false;
  if (
    options.enableMinigameLifecycle === true ||
    (minigame && options.enableMinigameLifecycle !== false)
  ) {
    integrations.push(new MinigameIntegration());
  }
  if (
    options.enableMinigameFrameRate === true ||
    (minigame && options.enableMinigameFrameRate !== false)
  ) {
    integrations.push(new MinigameFrameRateIntegration(options.minigameFrameRateOptions));
  }

  return integrations;
}

/**
 * @deprecated 直接复用本数组的实例，会在多次 init / 多 client 间共享 setupOnce 状态、互相踩补丁。
 * 请改用 {@link getDefaultIntegrations}（每次返回全新实例）。导出仅为向后兼容保留。
 * 静态快照不包含依赖运行时检测的小游戏默认集成，以免模块导入阶段提前缓存平台状态。
 */
export const defaultIntegrations: Integration[] = getDefaultIntegrations({
  enableMinigameLifecycle: false,
  enableMinigameFrameRate: false,
});

function removeGeneratedEventFiltersWhenInboundFiltersIsConfigured(
  integrations: Integration[],
  generatedEventFilters: Integration | undefined,
): Integration[] {
  if (
    !generatedEventFilters ||
    !integrations.some((integration) => integration.name === 'InboundFilters')
  ) {
    return integrations;
  }

  return integrations.filter((integration) => integration !== generatedEventFilters);
}

/**
 * Initialize the Sentry Miniapp SDK
 * @param options Configuration options for the SDK
 */
export function init(options: MiniappOptions = {}): MiniappClient | undefined {
  if (!isMiniappEnvironment()) {
    console.warn('[sentry-miniapp] Not running in a supported miniapp environment');
    return undefined;
  }

  let configuredDefaultIntegrations: false | Integration[];
  let generatedEventFilters: Integration | undefined;
  if (options.defaultIntegrations == null) {
    configuredDefaultIntegrations = getDefaultIntegrations(options);
    generatedEventFilters = configuredDefaultIntegrations.find(
      (integration) => integration.name === 'EventFilters',
    );
  } else {
    configuredDefaultIntegrations = options.defaultIntegrations;
  }
  const integrationOptions: {
    defaultIntegrations: false | Integration[];
    integrations?: Integration[] | ((integrations: Integration[]) => Integration[]);
  } = { defaultIntegrations: configuredDefaultIntegrations };
  if (options.integrations !== undefined) {
    integrationOptions.integrations = options.integrations;
  }
  const integrations = removeGeneratedEventFiltersWhenInboundFiltersIsConfigured(
    getIntegrationsToSetup(integrationOptions),
    generatedEventFilters,
  );

  const opts = {
    ...options,
    defaultIntegrations: [],
    integrations,
    stackParser: stackParserFromStackParserOptions(options.stackParser ?? miniappStackParser),
    transport: options.transport,
  };
  const miniappPlatform = options.platform || appName();

  // 平台标记。device / os / app context 由 MiniappClient._prepareEvent 在每个事件上统一写入
  // （唯一权威），此处不再重复设置，避免字段不一致与覆盖歧义（见架构 review P2-b）。
  setContext('miniapp', {
    platform: miniappPlatform,
    environment: 'miniapp',
  });

  // initAndBind 的类型要求构造参数已是完整 ClientOptions，而 MiniappClient 刻意接收
  // 更宽的公开 MiniappOptions，并在构造期间补齐 transport / stackParser，因此这里仅作边界适配。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initAndBind(MiniappClient as any, opts as any);
  const client = getCurrentScope().getClient() as MiniappClient | undefined;
  if (client) {
    setConfiguredDefaultIntegrationsMode(client, options.defaultIntegrations);
  }
  return client;
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
        ignoreNextOnErrorCall();
        getCurrentScope().captureException(error);
        throw error;
      }
    });
  } as T;
}

/**
 * 设置用户对隐私协议的同意状态（配合 `init({ requireConsent: true })` 使用）。
 *
 * - `setConsent(true)`：补发「同意前」缓冲的事件，并恢复正常上报。
 * - `setConsent(false)`：重新闸断网络上报，后续事件继续进入本地缓冲。
 *
 * 未开启 `requireConsent` 时调用本函数无门禁副作用（门禁本就放行）。
 */
export function setConsent(granted: boolean): void {
  setConsentGranted(granted);
  if (granted) {
    // 不传 timeout → 触发 core offline transport 立即排空缓冲队列（见 makeOfflineTransport.flush，
    // 内部 retryDelay 复位 + flushIn(MIN_DELAY)）。fire-and-forget：排空走定时器，无需 await。
    getClient()?.getTransport()?.flush?.();
  }
}

/** 读取当前同意状态（未开启 requireConsent 时恒为 true）。 */
export function getConsent(): boolean {
  return isConsentGranted();
}

/**
 * Capture feedback using the new feedback API.
 * 使用新的反馈 API 捕获反馈
 *
 * @param params Feedback parameters
 * @returns Event ID
 */
export function captureFeedback(params: SendFeedbackParams): string {
  return captureFeedbackCore(params);
}
