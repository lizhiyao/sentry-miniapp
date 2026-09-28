import { getClient, isEnabled, makeDsn } from '@sentry/core';
import { isConsentGranted, isConsentRequired } from './consent';
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

/** 读取当前 SDK 运行时诊断信息。不会发送事件，也不会触发缓存 flush。 */
export function getDiagnostics(): MiniappDiagnostics {
  const client = getClient();
  const isMiniappClient = client instanceof MiniappClient;
  const options = isMiniappClient ? (client.getOptions() as MiniappOptions) : null;
  const customTransport = isMiniappClient ? usesCustomTransport(client) : false;
  const transport = options ? buildTransportDiagnostics(options, customTransport) : null;
  const diagnosticsOptions =
    options && isMiniappClient
      ? buildOptionsDiagnostics(
          options,
          customTransport,
          getConfiguredDefaultIntegrationsMode(client),
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
  return diagnostics;
}

function buildOptionsDiagnostics(
  options: MiniappOptions,
  customTransport: boolean,
  defaultIntegrations: MiniappDiagnosticsOptions['defaultIntegrations'],
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
    enableLogs: options.enableLogs === true,
    enableSourceMap: options.enableSourceMap !== false,
    enableOfflineCache:
      options.requireConsent === true || (!customTransport && options.enableOfflineCache !== false),
    requireConsent: options.requireConsent === true,
    consentGranted: isConsentGranted(),
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
    enableMinigameFrameRate: isMinigame()
      ? options.enableMinigameFrameRate !== false
      : options.enableMinigameFrameRate === true,
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

  if (!options.enableSourceMap) {
    warnings.push({
      code: 'source_map_disabled',
      message: 'enableSourceMap=false，SDK 不会自动归一化小程序堆栈路径。',
    });
  }

  if (isConsentRequired() && !options.consentGranted) {
    warnings.push({
      code: 'consent_blocking',
      message: 'requireConsent 已开启且当前未同意，事件会进入本地缓冲，不会发送网络请求。',
    });
  }

  return warnings;
}
