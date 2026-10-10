import {
  captureFeedback as captureFeedbackCore,
  getClient,
  getCurrentScope,
  getDefaultCurrentScope,
  getIntegrationsToSetup,
  initAndBind,
  stackParserFromStackParserOptions,
  withScope,
  eventFiltersIntegration,
  spanStreamingIntegration,
  uuid4,
} from '@sentry/core';
import type { Integration } from '@sentry/core';
import { miniappStackParser } from './stacktrace';
import { resolveScopeSession, setOwnedScopeSession } from './sessionCapture';
import { miniappLifecycleIntegration } from './integrations/lifecycle';
export { getDiagnostics } from './diagnostics';

import {
  MiniappClient,
  setConfiguredDefaultIntegrationsMode,
  markRuntimeConstruction,
  assertStreamTracingOptions,
} from './client';
import type { MiniappLowLevelClientOptions } from './client';
import { isTelemetryCritical, withTelemetryCritical, getClientLifetime } from './lifecycle';
import { isMiniappEnvironment, isMinigame, resolveMiniappPlatform } from './crossPlatform';
import {
  globalHandlersIntegration,
  tryCatchIntegration,
  linkedErrorsIntegration,
  dedupeIntegration,
  rewriteFramesIntegration,
  networkBreadcrumbsIntegration,
  pageBreadcrumbsIntegration,
  consoleBreadcrumbsIntegration,
  sessionIntegration,
  networkStatusIntegration,
  minigameIntegration,
  minigameFrameRateIntegration,
} from './integrations/index';
import { functionToStringIntegration } from '@sentry/core';
import type { MiniappOptions, SendFeedbackParams } from './types';

const initializationScopeRejected = Symbol('miniapp.initializationScopeRejected');

function warnUnsupportedInitScope(): void {
  try {
    const owner = getClient();
    if (owner instanceof MiniappClient) {
      getClientLifetime(owner)?.warnings.add('init_scope_unsupported');
    } else {
      console.warn('[sentry-miniapp] init requires the default scope, outside withScope/startSpan');
    }
  } catch (_error) {
    /* 诊断故障不阻断未绑定 client 的清理，也不改变初始化拒绝结果。 */
  }
}

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
    globalHandlersIntegration(),
    tryCatchIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    // 自定义 Client 不会自动装配 core 11 span streaming；Browser 的 span API / tracing 集成
    // 会按需安装。此处默认 HTTP producer 也依赖它，漏装则无父 HTTP segment 等 span 都不会发送。
    spanStreamingIntegration(),
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
  if (options.enableStandaloneHttpSpans !== undefined) {
    networkOptions['enableStandaloneHttpSpans'] = options.enableStandaloneHttpSpans;
  }
  if (options.maxRequestBodySize !== undefined) {
    networkOptions['maxRequestBodySize'] = options.maxRequestBodySize;
  }
  if (options.sensitiveKeys !== undefined) {
    networkOptions['sensitiveKeys'] = options.sensitiveKeys;
  }
  integrations.push(networkBreadcrumbsIntegration(networkOptions));

  if (options.enableAutoSessionTracking !== false) {
    integrations.push(sessionIntegration());
  }

  const enablePageLifecycleBreadcrumbs = options.enableNavigationBreadcrumbs !== false;
  const enableUserInteractionBreadcrumbs = options.enableUserInteractionBreadcrumbs !== false;
  if (enablePageLifecycleBreadcrumbs || enableUserInteractionBreadcrumbs) {
    integrations.push(
      pageBreadcrumbsIntegration({
        enableLifecycle: enablePageLifecycleBreadcrumbs,
        enableUserInteraction: enableUserInteractionBreadcrumbs,
        ...(options.sensitiveKeys !== undefined && { sensitiveKeys: options.sensitiveKeys }),
      }),
    );
  }

  if (options.enableNetworkStatusMonitoring !== false) {
    integrations.push(networkStatusIntegration());
  }

  if (options.enableConsoleBreadcrumbs) {
    integrations.push(consoleBreadcrumbsIntegration());
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

  // FPS 只按显式开关安装；生命周期的默认值才依赖小游戏检测。
  const minigame = options.enableMinigameLifecycle === undefined ? isMinigame() : false;
  if (
    options.enableMinigameLifecycle === true ||
    (minigame && options.enableMinigameLifecycle !== false)
  ) {
    integrations.push(minigameIntegration());
  }
  if (options.enableMinigameFrameRate === true) {
    integrations.push(minigameFrameRateIntegration(options.minigameFrameRateOptions));
  }

  integrations.push(miniappLifecycleIntegration());
  return integrations;
}

/**
 * Initialize the Sentry Miniapp SDK
 * @param options Configuration options for the SDK
 */
export function init(options: MiniappOptions = {}): MiniappClient | undefined {
  if (isTelemetryCritical()) {
    const owner = getClient();
    if (owner) getClientLifetime(owner)?.warnings.add('reentrant_init_unsupported');
    return undefined;
  }
  return withTelemetryCritical(() => initialize(options));
}

function initialize(options: MiniappOptions): MiniappClient | undefined {
  // core 的 fallback stack 会在临时 withScope / 异步 span 完成时弹出当前层。
  // 只在公开的持久默认 scope 上绑定 runtime，避免新 client 随旧操作 scope 一同丢失。
  const bindingScope = getCurrentScope();
  if (bindingScope !== getDefaultCurrentScope()) {
    warnUnsupportedInitScope();
    return undefined;
  }
  assertStreamTracingOptions(options);
  if (!isMiniappEnvironment()) {
    console.warn('[sentry-miniapp] Not running in a supported miniapp environment');
    return undefined;
  }

  let configuredDefaultIntegrations: false | Integration[];
  if (options.defaultIntegrations == null) {
    configuredDefaultIntegrations = getDefaultIntegrations(options);
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
  const integrations = getIntegrationsToSetup(integrationOptions);

  const miniappPlatform = resolveMiniappPlatform(options);
  const opts = {
    ...options,
    miniappPlatform,
    defaultIntegrations: [],
    integrations,
    stackParser: stackParserFromStackParserOptions(options.stackParser ?? miniappStackParser),
    transport: options.transport,
  };
  // 配置 callback/getter 也可能启动未完成的 Core scope；此时不应用 initialScope 或退休旧 runtime。
  if (getCurrentScope() !== bindingScope) {
    warnUnsupportedInitScope();
    return undefined;
  }
  // Core 先应用 initialScope，再构造，最后绑定并安装集成。只在公开构造器边界重查身份；
  // setup 阶段已经根绑定的新 client 不因集成自己的异步 scope 被误拒绝。
  class ScopeBoundClient extends MiniappClient {
    public constructor(options: MiniappLowLevelClientOptions) {
      if (getCurrentScope() !== bindingScope) {
        warnUnsupportedInitScope();
        throw initializationScopeRejected;
      }
      super(options);
      if (getCurrentScope() !== bindingScope) {
        warnUnsupportedInitScope();
        this.dispose();
        throw initializationScopeRejected;
      }
    }
  }
  // initAndBind 的类型要求构造参数已是完整 ClientOptions，而 MiniappClient 刻意接收
  // init 专用的宽选项，已通过内部标记允许默认 transport；低层公开构造必须显式提供 transport。
  const previous = bindingScope.getClient();
  if (previous instanceof MiniappClient) void previous.retireRuntime().catch(() => {});
  markRuntimeConstruction(opts);
  try {
    initAndBind(ScopeBoundClient as any, opts as any);
  } catch (error) {
    const failed = bindingScope.getClient();
    try {
      if (failed instanceof MiniappClient && failed !== previous) failed.dispose();
    } finally {
      // 失败终态不复活已退休 A，也不覆盖第三方后来设置的绑定。
      if (
        bindingScope.getClient() === failed &&
        (failed === previous || failed instanceof MiniappClient)
      ) {
        bindingScope.setClient(undefined);
      }
    }
    if (error === initializationScopeRejected) return undefined;
    throw error;
  }
  const client = getCurrentScope().getClient() as MiniappClient | undefined;
  if (client) {
    setConfiguredDefaultIntegrationsMode(client, options.defaultIntegrations);
  }
  return client;
}

/**
 * Wrap a function to capture exceptions
 */
export function wrap<T extends (...args: any[]) => any>(fn: T): T {
  return function (this: any, ...args: Parameters<T>) {
    const captured = getCurrentScope().clone();
    setOwnedScopeSession(captured, resolveScopeSession(captured), 'capture');
    try {
      // 业务执行不持有 SDK fork；原 Promise 身份和业务 init 的绑定均保留。
      return fn.apply(this, args);
    } catch (error) {
      try {
        withScope(captured, () => {
          withTelemetryCritical(() => {
            captured.captureException(error, {
              mechanism: {
                type: 'instrument',
                handled: false,
                data: { function: 'wrap' },
              },
            });
          });
        });
      } catch (_captureError) {
        /* 遥测失败不能替换业务异常。 */
      }
      throw error;
    }
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
  const client = getClient();
  if (client instanceof MiniappClient) client.setConsent(granted);
}

/** 读取当前同意状态；没有当前 MiniappClient 时没有已配置门禁。 */
export function getConsent(): boolean {
  const client = getClient();
  return client instanceof MiniappClient ? client.getConsent() : true;
}

/**
 * Capture feedback using the new feedback API.
 * 使用新的反馈 API 捕获反馈
 *
 * @param params Feedback parameters
 * @returns Event ID
 */
export function captureFeedback(params: SendFeedbackParams): string {
  const client = getClient();
  if (client && getClientLifetime(client)?.acceptsTelemetry() === false) return uuid4();
  return captureFeedbackCore(params);
}
