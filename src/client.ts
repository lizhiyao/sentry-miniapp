import {
  Client,
  Scope,
  captureFeedback as captureFeedbackCore,
  eventFromMessage as eventFromMessageCore,
  eventFromUnknownInput,
  getIsolationScope,
  getCurrentScope,
  makeOfflineTransport,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type {
  BaseTransportOptions,
  ClientOptions,
  Event,
  EventHint,
  ParameterizedString,
  SeverityLevel,
} from '@sentry/core';

import { getAccountInfo, getSystemInfo, resolveMiniappPlatform } from './crossPlatform';
import type { AppName } from './crossPlatform';
import { configureConsent, isConsentGranted, notifyConsentDrop } from './consent';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';
import { createMiniappTransport, createMiniappOfflineStore } from './transports';
import type { MiniappTransportOptions } from './transports';
import { SDK_NAME, SDK_VERSION } from './version';
import { syncDebugIdsToCoreGlobal } from './debugIds';
import { miniappStackParser } from './stacktrace';

export type MiniappClientOptions = Omit<
  MiniappOptions,
  'integrations' | 'miniappPlatform' | 'platform' | 'stackParser' | 'transport'
> &
  ClientOptions<MiniappTransportOptions> & {
    platform: string;
    /** 小程序宿主标识；与 Sentry 顶层 event.platform 分离。 */
    miniappPlatform?: AppName | undefined;
  };

const clientsWithCustomTransport = new WeakSet<MiniappClient>();
type DefaultIntegrationsMode = 'enabled' | 'disabled' | 'custom';
const clientDefaultIntegrationsModes = new WeakMap<MiniappClient, DefaultIntegrationsMode>();

function resolveDefaultIntegrationsMode(
  configured: MiniappOptions['defaultIntegrations'],
): DefaultIntegrationsMode {
  if (configured === false) {
    return 'disabled';
  }
  if (Array.isArray(configured)) {
    return 'custom';
  }
  return 'enabled';
}

export function usesCustomTransport(client: MiniappClient): boolean {
  return clientsWithCustomTransport.has(client);
}

/** 读取用户传入的 defaultIntegrations 模式，而不是 core 归一化后的空数组。 */
export function getConfiguredDefaultIntegrationsMode(
  client: MiniappClient,
): DefaultIntegrationsMode {
  return (
    clientDefaultIntegrationsModes.get(client) ??
    resolveDefaultIntegrationsMode(client.getOptions().defaultIntegrations)
  );
}

/** init() 会把 defaultIntegrations 归一化为空数组；在绑定后恢复诊断所需的原始语义。 */
export function setConfiguredDefaultIntegrationsMode(
  client: MiniappClient,
  configured: MiniappOptions['defaultIntegrations'],
): void {
  clientDefaultIntegrationsModes.set(client, resolveDefaultIntegrationsMode(configured));
}

/**
 * The Sentry Miniapp SDK Client.
 *
 * @see MiniappOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class MiniappClient extends Client<MiniappClientOptions> {
  private readonly _disposeCallbacks: Array<() => void> = [];

  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: MiniappOptions | MiniappClientOptions = {}) {
    const usesCustomTransport = typeof options.transport === 'function';
    const defaultIntegrationsMode = resolveDefaultIntegrationsMode(options.defaultIntegrations);
    const hasConfiguredMiniappPlatform =
      options.miniappPlatform !== undefined || options.platform !== undefined;
    const miniappPlatform = hasConfiguredMiniappPlatform
      ? resolveMiniappPlatform(options)
      : undefined;

    // 配置隐私合规「同意门禁」。必须在 super() 之前——transport 工厂在 super() 执行期间被 core
    // 调用建立，其 shouldSend / store 需读到已就绪的 consent 状态。configureConsent 是模块函数、
    // 不触碰 this，故在 super 前调用合法。requireConsent=false 时它把门禁置为「恒放行」，行为不变。
    configureConsent({
      required: options.requireConsent === true,
      cacheLimit: options.consentCacheLimit,
      cacheMaxBytes: options.consentCacheMaxBytes,
      cacheMaxAge: options.consentCacheMaxAge,
      onDrop: options.onConsentCacheDrop,
    });

    const clientOptions: MiniappClientOptions = {
      ...options,
      // Sentry 后端按顶层 platform 选择 JavaScript 栈解析与聚合逻辑。
      // 小程序宿主类型单独放在 contexts.miniapp.platform。
      platform: 'javascript',
      miniappPlatform,
      // @sentry/core 10.71 起默认开启 Logs；保留 sentry-miniapp 的显式 opt-in 契约。
      enableLogs: options.enableLogs ?? false,
      integrations: Array.isArray(options.integrations) ? options.integrations : [],
      stackParser: stackParserFromStackParserOptions(options.stackParser ?? miniappStackParser),
      transport: (transportOptions: BaseTransportOptions) => {
        const miniappTransportOptions = transportOptions as MiniappTransportOptions;
        const baseTransport = options.transport
          ? options.transport(miniappTransportOptions)
          : createMiniappTransport({
              ...miniappTransportOptions,
              headers: miniappTransportOptions.headers ?? {},
            });

        // 同意门禁：用 core offline transport 的 shouldSend 闸断网络（同意前 envelope 不发、
        // 转入本地缓冲），setConsent(true) 后由 transport.flush() 补发。即便用户关了
        // enableOfflineCache，requireConsent 仍需缓冲，故强制走 offline 路径；若用户传了自定义
        // transport，也要包住它，避免合规开关被高级用法绕过。
        if (options.requireConsent === true) {
          return makeOfflineTransport(() => baseTransport)({
            ...transportOptions,
            createStore: (storeOptions: any) =>
              createMiniappOfflineStore({
                ...storeOptions,
                // 同意前缓存用独立上限 + 冷启动优先（保留最旧）淘汰，区别于弱网那套默认值。
                offlineCacheLimit: options.consentCacheLimit ?? 100,
                offlineCacheMaxAge: options.consentCacheMaxAge,
                maxBytes: options.consentCacheMaxBytes,
                evictionMode: 'preserve-oldest',
                onDrop: notifyConsentDrop,
              }),
            // 返回 false → core 不发网络、转 shouldStore 入缓存。同意后恒为 true。
            shouldSend: () => isConsentGranted(),
            flushAtStartup: true,
          } as any);
        }

        if (!options.transport && options.enableOfflineCache !== false) {
          return makeOfflineTransport(() => baseTransport)({
            ...transportOptions,
            createStore: (storeOptions: any) =>
              createMiniappOfflineStore({
                ...storeOptions,
                offlineCacheLimit: options.offlineCacheLimit,
                offlineCacheMaxAge: options.offlineCacheMaxAge,
              }),
            flushAtStartup: true, // 启动时自动重试发送
          } as any);
        }

        return baseTransport;
      },
    };

    super(clientOptions);

    if (usesCustomTransport) {
      clientsWithCustomTransport.add(this);
    }
    clientDefaultIntegrationsModes.set(this, defaultIntegrationsMode);
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    const event = eventFromUnknownInput(this, this.getOptions().stackParser, exception, hint);
    event.level = 'error';
    return Promise.resolve(event);
  }

  public eventFromMessage(
    message: ParameterizedString,
    level: SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return Promise.resolve(
      eventFromMessageCore(
        this.getOptions().stackParser,
        message,
        level,
        hint,
        this.getOptions().attachStacktrace,
      ),
    );
  }

  protected override _prepareEvent(
    event: Event,
    hint?: EventHint,
    scope?: Scope,
  ): PromiseLike<Event | null> {
    event.platform = event.platform || 'javascript';

    // Add SDK information
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []).filter(
          (pkg) => pkg.name !== 'npm:sentry-miniapp',
        ),
        { name: 'npm:sentry-miniapp', version: SDK_VERSION },
      ],
      version: SDK_VERSION,
    };

    try {
      // @sentry/core 只读取 globalThis 上的 Debug ID maps。微信小游戏可能由 sentry-cli
      // 注入到 global / window / self，因此在 core 准备事件前合并一次候选全局。
      try {
        syncDebugIdsToCoreGlobal();
      } catch (error) {
        if (this.getOptions().debug) {
          console.warn('[sentry-miniapp] Debug ID 全局同步失败:', error);
        }
      }

      const currentScope = scope || getCurrentScope();
      const isolationScope = getIsolationScope();
      return Promise.resolve(
        super._prepareEvent(event, hint || {}, currentScope, isolationScope),
      ).then((prepared) => this._fillDefaultContexts(prepared));
    } catch (error) {
      // Fallback if scopes are not properly initialized
      if (this.getOptions().debug) {
        console.warn('[sentry-miniapp] _prepareEvent 兜底（scope 未就绪）:', error);
      }
      return Promise.resolve(this._fillDefaultContexts(event));
    }
  }

  /**
   * 用 SDK 采集的 device/os/app 填充事件上下文——**仅填充缺失的键**，不覆盖用户经
   * setContext / per-event hint / 其它集成（如 HttpContext 写的 app.name）已提供的值。
   *
   * 必须在 super._prepareEvent **之后**调用：core 以「event 优先」合并 scope contexts
   * （scopeData.js：`event.contexts = {...scope, ...event}`），若在 super 之前写，SDK 的
   * 自动值会盖掉用户的 setContext('device'/'os'/'app')。放到 super 之后按缺失填充即可两头兼顾。
   */
  private _fillDefaultContexts(event: Event | null): Event | null {
    if (!event) {
      return event;
    }
    if (!event.contexts) {
      event.contexts = {};
    }
    const contexts = event.contexts;
    contexts['miniapp'] = {
      environment: 'miniapp',
      ...contexts['miniapp'],
      platform: this.getOptions().miniappPlatform ?? resolveMiniappPlatform({}),
      sdk_version: SDK_VERSION,
    };

    if (this.getOptions().enableSystemInfo === false) {
      return event;
    }

    const info = getSystemInfo();
    const account = getAccountInfo();
    contexts['miniapp'] = {
      ...contexts['miniapp'],
      host_version: info?.version || 'unknown',
      host_sdk_version: info?.SDKVersion || 'unknown',
    };
    contexts.device = {
      brand: info?.brand || 'unknown',
      model: info?.model || 'unknown',
      screen_resolution: `${info?.screenWidth || 0}x${info?.screenHeight || 0}`,
      language: info?.language || 'unknown',
      version: info?.version || 'unknown',
      system: info?.system || 'unknown',
      platform: info?.platform || 'unknown',
      ...contexts.device,
    };
    contexts.os = {
      name: info?.system || 'unknown',
      version: info?.version || 'unknown',
      ...contexts.os,
    };
    contexts.app = {
      app_identifier: account.appId,
      app_version: account.version,
      ...contexts.app,
    };
    return event;
  }

  /** @inheritDoc */
  public override registerCleanup(callback: () => void): void {
    this._disposeCallbacks.push(callback);
  }

  /** @inheritDoc */
  public override dispose(): void {
    for (const callback of this._disposeCallbacks.splice(0)) {
      try {
        callback();
      } catch (error) {
        if (this.getOptions().debug) {
          console.warn('[sentry-miniapp] 集成资源清理失败:', error);
        }
      }
    }
    super.dispose();
  }

  /**
   * 关闭客户端并执行集成通过 `setup(client)` 注册的清理回调。
   */
  public override async close(timeout?: number): Promise<boolean> {
    try {
      return await super.close(timeout);
    } finally {
      this.dispose();
    }
  }

  /**
   * @deprecated Miniapp environment does not support Sentry's default HTML report dialog.
   * Please implement your own UI form to collect user feedback (name, email, comments)
   * and use `Sentry.captureFeedback()` to submit it to Sentry.
   */
  public showReportDialog(_options: ReportDialogOptions = {}): void {
    console.warn(
      '[sentry-miniapp] showReportDialog is deprecated and does nothing. ' +
        'Please build your own UI and use `Sentry.captureFeedback()` instead.',
    );
  }

  /**
   * Capture feedback using the new feedback API.
   * 使用新的反馈 API 捕获反馈
   *
   * @param params Feedback parameters
   * @returns Event ID
   */
  public captureFeedback(params: SendFeedbackParams): string {
    return captureFeedbackCore(params, {}, getCurrentScope());
  }
}
