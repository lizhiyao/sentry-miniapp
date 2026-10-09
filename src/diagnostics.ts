import { getClient, isEnabled, makeDsn } from '@sentry/core';
import { appName, isMiniappEnvironment, isMinigame } from './crossPlatform';
import { getConfiguredDefaultIntegrationsMode, MiniappClient, usesCustomTransport } from './client';
import { miniappStackParser } from './stacktrace';
import { normalizeMaxConcurrentRequests, normalizeRequestTimeout } from './transports/xhr';
import type {
  MiniappDiagnostics,
  MiniappDiagnosticsOptions,
  MiniappDiagnosticsTransport,
  MiniappDiagnosticsWarning,
  MiniappOptions,
} from './types';
import { SDK_NAME, SDK_VERSION } from './version';
import { getClientLifetime, type LifecycleWarningCode } from './lifecycle';

const lifecycleMessages: Record<LifecycleWarningCode, string> = {
  performance_clock_invalid:
    '首帧观测发生时钟回拨或非法时间差，已省略对应 interval，未补造 0 时长。',
  performance_time_origin_missing:
    'Performance 条目为相对时间，但宿主未提供可信 timeOrigin；已省略对应 span，不使用 SDK 初始化墙钟推算。',
  low_level_consent_blocking:
    '低层 client 未授权，发送入口已拒绝；它没有 SDK 持久缓存，需使用 init 或自行管理合法缓存。',
  binary_request_unsupported:
    '当前 transport 未确认支持二进制请求体，附件 envelope 已拒绝且不会进入离线重试；验证宿主后可显式配置 binaryRequestBody。',
  late_init:
    'App 已注册，SDK 使用宿主原生 lifecycle（如有）；监听顺序不受 SDK 控制，业务 onHide 末尾应显式 flush。',
  lifecycle_unavailable:
    '未安装或缺少可用 lifecycle 监听，业务须在 hide/show 边界显式管理 flush 与离线重放。',
  reentrant_init_unsupported:
    '同步遥测 hook 中的 init 已拒绝；请在 hook 返回后的独立控制流切换 client。',
  init_scope_unsupported:
    '临时 scope 内的 init 已拒绝且保留原 client；请退出 withScope，或等待活动异步 span 完成后再初始化。',
  invalid_close_timeout: '非法 close timeout 已回落为 2000ms 收尾预算。',
};

/** 读取当前 SDK 运行时诊断信息。不会发送事件，也不会触发缓存 flush。 */
export function getDiagnostics(): MiniappDiagnostics {
  const client = getClient();
  const isMiniappClient = client instanceof MiniappClient;
  const options = isMiniappClient ? (client.getOptions() as MiniappOptions) : null;
  const customTransport = isMiniappClient ? usesCustomTransport(client) : false;
  const storeDiagnostics = isMiniappClient ? client.getOfflineStoreDiagnostics() : null;
  const transport = options ? buildTransportDiagnostics(options, customTransport) : null;
  if (transport) {
    transport.offlineStore = storeDiagnostics;
    transport.offlineCache = storeDiagnostics !== null;
  }
  const diagnosticsOptions =
    options && isMiniappClient
      ? buildOptionsDiagnostics(
          options,
          customTransport,
          getConfiguredDefaultIntegrationsMode(client),
          client.getConsent(),
          storeDiagnostics !== null,
        )
      : null;
  const diagnostics: MiniappDiagnostics = {
    sdk: {
      name: SDK_NAME,
      version: SDK_VERSION,
    },
    platform: {
      name: appName() as MiniappDiagnostics['platform']['name'],
      isMiniappEnvironment: isMiniappEnvironment(),
      isMinigame: isMinigame(),
    },
    client: {
      initialized: !!client,
      miniappClient: isMiniappClient,
      enabled: isEnabled(),
    },
    options: diagnosticsOptions,
    transport,
    integrations: Array.isArray(options?.integrations)
      ? options.integrations.map((integration) => integration.name)
      : [],
    warnings: [],
    timestamp: Date.now(),
  };

  diagnostics.warnings = buildWarnings(diagnostics);
  if (client) {
    for (const code of getClientLifetime(client)?.warnings ?? []) {
      diagnostics.warnings.push({ code, message: lifecycleMessages[code] });
    }
    if (isMiniappClient && !diagnostics.integrations.includes('MiniappLifecycle')) {
      diagnostics.warnings.push({
        code: 'lifecycle_unavailable',
        message: lifecycleMessages.lifecycle_unavailable,
      });
    }
  }
  return diagnostics;
}

function buildOptionsDiagnostics(
  options: MiniappOptions,
  customTransport: boolean,
  defaultIntegrations: MiniappDiagnosticsOptions['defaultIntegrations'],
  consentGranted: boolean,
  hasOfflineStore: boolean,
): MiniappDiagnosticsOptions {
  const dsn = normalizeDsn(options.dsn);
  return {
    dsn,
    release: options.release ?? null,
    environment: options.environment ?? null,
    debug: options.debug === true,
    sampleRate: options.sampleRate ?? 1,
    tracesSampleRate: options.tracesSampleRate ?? null,
    tracesSamplerConfigured: typeof options.tracesSampler === 'function',
    // 2.0 构造前已校验，只装配 core 原生 stream 路径。
    traceLifecycle: options.traceLifecycle ?? 'stream',
    sendClientReports: options.sendClientReports === true,
    enableSourceMap: options.enableSourceMap !== false,
    enableOfflineCache: hasOfflineStore,
    requireConsent: options.requireConsent === true,
    consentGranted,
    enableTracePropagation: options.enableTracePropagation !== false,
    enableStandaloneHttpSpans: options.enableStandaloneHttpSpans !== false,
    tracePropagationTargetsCount: options.tracePropagationTargets?.length ?? 0,
    propagateTraceparent: options.propagateTraceparent === true,
    enableAutoSessionTracking: options.enableAutoSessionTracking !== false,
    enableNetworkStatusMonitoring: options.enableNetworkStatusMonitoring !== false,
    enableConsoleBreadcrumbs: options.enableConsoleBreadcrumbs === true,
    enableNavigationBreadcrumbs: options.enableNavigationBreadcrumbs !== false,
    enableUserInteractionBreadcrumbs: options.enableUserInteractionBreadcrumbs !== false,
    enableMinigameLifecycle: isMinigame()
      ? options.enableMinigameLifecycle !== false
      : options.enableMinigameLifecycle === true,
    enableMinigameFrameRate: options.enableMinigameFrameRate === true,
    customTransport,
    customStackParser:
      typeof options.stackParser === 'function' && options.stackParser !== miniappStackParser,
    defaultIntegrations,
  };
}

function buildTransportDiagnostics(
  options: MiniappOptions,
  customTransport: boolean,
): MiniappDiagnosticsTransport {
  return {
    offlineStore: null,
    custom: customTransport,
    offlineCache:
      options.requireConsent === true || (!customTransport && options.enableOfflineCache !== false),
    consentGate: options.requireConsent === true,
    requestTimeout: customTransport
      ? null
      : normalizeRequestTimeout(options.transportOptions?.requestTimeout),
    maxConcurrentRequests: customTransport
      ? null
      : normalizeMaxConcurrentRequests(options.transportOptions?.maxConcurrentRequests),
  };
}

function normalizeDsn(dsn: string | undefined): MiniappDiagnosticsOptions['dsn'] {
  if (!dsn) {
    return {
      configured: false,
      valid: false,
      host: null,
    };
  }

  const parsed = makeDsn(dsn);
  return {
    configured: true,
    valid: !!parsed,
    host: parsed?.host || null,
  };
}

function buildWarnings(diagnostics: MiniappDiagnostics): MiniappDiagnosticsWarning[] {
  const warnings: MiniappDiagnosticsWarning[] = [];

  if (!diagnostics.platform.isMiniappEnvironment) {
    warnings.push({
      code: 'not_miniapp_environment',
      message: '当前运行时未检测到已支持的小程序平台全局对象。',
    });
  }

  if (!diagnostics.client.initialized) {
    warnings.push({
      code: 'client_not_initialized',
      message: '当前还没有绑定 Sentry client，请确认已在 App() 之前调用 Sentry.init()。',
    });
  }

  if (diagnostics.client.initialized && !diagnostics.client.miniappClient) {
    warnings.push({
      code: 'non_miniapp_client',
      message: '当前绑定的 Sentry client 不是 sentry-miniapp 的 MiniappClient。',
    });
  }

  const options = diagnostics.options;
  if (!options) {
    return warnings;
  }

  if (!options.dsn.configured) {
    warnings.push({
      code: 'missing_dsn',
      message: '未配置 dsn，SDK 不会上报事件到 Sentry。',
    });
  } else if (!options.dsn.valid) {
    warnings.push({
      code: 'invalid_dsn',
      message: 'dsn 不是有效 URL，请检查 Sentry 项目 DSN 配置。',
    });
  }

  if (!options.release) {
    warnings.push({
      code: 'missing_release',
      message: '未配置 release，生产环境 Source Map 解析通常无法稳定匹配。',
    });
  }

  if (!options.tracesSamplerConfigured && options.tracesSampleRate === null) {
    warnings.push({
      code: 'tracing_disabled',
      message: '未配置 tracesSampleRate 或 tracesSampler，性能 tracing 不会采样上报。',
    });
  }

  // 替换掉 defaultIntegrations 会连带删掉 SpanStreaming，而它是在 stream 生命周期下发送
  // 所有 span（包括无父 HTTP segment）的发送出口。
  if (
    (options.tracesSampleRate !== null || options.tracesSamplerConfigured) &&
    options.traceLifecycle === 'stream' &&
    !diagnostics.integrations.includes('SpanStreaming')
  ) {
    warnings.push({
      code: 'span_streaming_missing',
      message:
        '已开启 tracing，但集成列表里没有 SpanStreaming：业务 trace、无父 HTTP、导航与帧率汇总等 span 均不会被发送。通常是替换 defaultIntegrations 导致的，保留默认集成或手动加入 spanStreamingIntegration() 即可。',
    });
  }

  if (!options.enableSourceMap) {
    warnings.push({
      code: 'source_map_disabled',
      message: 'enableSourceMap=false，SDK 不会自动归一化小程序堆栈路径。',
    });
  }

  if (options.requireConsent && !options.consentGranted) {
    warnings.push({
      code: 'consent_blocking',
      message: diagnostics.transport?.offlineCache
        ? 'requireConsent 已开启且当前未同意，事件进入 SDK 缓冲，不会发送网络请求；介质及失败见 offlineStore 诊断。'
        : 'requireConsent 已开启且当前未同意，低层发送入口拒绝；没有 SDK 本地缓冲。',
    });
  }

  return warnings;
}
