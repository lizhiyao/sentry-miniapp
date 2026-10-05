import {
  Client,
  Scope,
  captureFeedback as captureFeedbackCore,
  eventFromMessage as eventFromMessageCore,
  eventFromUnknownInput,
  getCurrentScope,
  makeOfflineTransport,
  resolvedSyncPromise,
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

import { resolveMiniappPlatform } from './crossPlatform';
import { EnvironmentState, registerClientEnvironment } from './clientState';
import type { AppName } from './crossPlatform';
import { configureConsent, isConsentGranted, notifyConsentDrop } from './consent';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';
import { createMiniappTransport, createMiniappOfflineStore } from './transports';
import type { MiniappTransportOptions } from './transports';
import { createConsentAwareOfflineTransport } from './transports/consent';
import { SDK_NAME, SDK_VERSION } from './version';
import { syncDebugIdsToCoreGlobal } from './debugIds';
import { miniappStackParser } from './stacktrace';
import { registerClientSpanDimensions } from './spanDimensions';

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

/** @sentry/core 11 无日志开关，未显式开启时用它丢弃全部日志。 */
function dropLog(): null {
  return null;
}

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
    const environment = new EnvironmentState(options);
    const usesCustomTransport = typeof options.transport === 'function';
    const defaultIntegrationsMode = resolveDefaultIntegrationsMode(options.defaultIntegrations);
    const hasConfiguredMiniappPlatform =
      options.miniappPlatform !== undefined || options.platform !== undefined;
    const miniappPlatform = hasConfiguredMiniappPlatform
      ? resolveMiniappPlatform(options)
      : undefined;

    // 配置隐私合规「同意门禁」。必须在 super() 之前——transport 工厂在 super() 执行期间被 core
    // 调用建立，其同意门禁 / store 需读到已就绪的 consent 状态。configureConsent 是模块函数、
    // 不触碰 this，故在 super 前调用合法。requireConsent=false 时它把门禁置为「恒放行」，行为不变。
    configureConsent({
      required: options.requireConsent === true,
      cacheLimit: options.consentCacheLimit,
      cacheMaxBytes: options.consentCacheMaxBytes,
      cacheMaxAge: options.consentCacheMaxAge,
      onDrop: options.onConsentCacheDrop,
    });

    // traceLifecycle 完全交给 core：默认 'stream'，用户显式传 'static' 时由 core 处理，
    // SDK 不再为旧生命周期补适配。
    const clientOptions: MiniappClientOptions = {
      ...options,
      _metadata: {
        ...options._metadata,
        sdk: {
          ...options._metadata?.sdk,
          name: SDK_NAME,
          version: SDK_VERSION,
          packages: [
            ...(options._metadata?.sdk?.packages ?? []).filter(
              (pkg) => pkg.name !== 'npm:sentry-miniapp',
            ),
            { name: 'npm:sentry-miniapp', version: SDK_VERSION },
          ],
        },
      },
      // Sentry 后端按顶层 platform 选择 JavaScript 栈解析与聚合逻辑。
      // 小程序宿主类型单独放在 contexts.miniapp.platform。
      platform: 'javascript',
      miniappPlatform,
      // @sentry/core 10.71 起默认开启 Logs；保留 sentry-miniapp 的显式 opt-in 契约。
      // 11 删掉了 enableLogs 选项，因此改由 beforeSendLog 丢弃未开启时的日志。
      enableLogs: options.enableLogs ?? false,
      ...(options.enableLogs === true ? {} : { beforeSendLog: dropLog }),
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

        // 同意门禁：在调用 core offline transport 前同步闸断网络（同意前 envelope 不发、
        // 直接转入本地缓冲），setConsent(true) 后由 transport.flush() 补发。即便用户关了
        // enableOfflineCache，requireConsent 仍需缓冲，故强制走 offline 路径；若用户传了自定义
        // transport，也要包住它，避免合规开关被高级用法绕过。
        if (options.requireConsent === true) {
          const store = createMiniappOfflineStore({
            ...transportOptions,
            // 同意前缓存用独立上限 + 冷启动优先（保留最旧）淘汰，区别于弱网那套默认值。
            offlineCacheLimit: options.consentCacheLimit ?? 100,
            ...(options.consentCacheMaxAge !== undefined && {
              offlineCacheMaxAge: options.consentCacheMaxAge,
            }),
            ...(options.consentCacheMaxBytes !== undefined && {
              maxBytes: options.consentCacheMaxBytes,
            }),
            evictionMode: 'preserve-oldest',
            onDrop: notifyConsentDrop,
          });
          return createConsentAwareOfflineTransport(
            baseTransport,
            miniappTransportOptions,
            store,
            isConsentGranted,
          );
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
    registerClientEnvironment(this, environment);
    this.addEventProcessor((event) => environment.fillEvent(event));

    if (usesCustomTransport) {
      clientsWithCustomTransport.add(this);
    }
    clientDefaultIntegrationsModes.set(this, defaultIntegrationsMode);
    // 自动维度属于本 client，走 core 的 processSpan 钩子按 client 填充；不写共享 isolation scope。
    this.registerCleanup(registerClientSpanDimensions(this));
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    const event = eventFromUnknownInput(this, this.getOptions().stackParser, exception, hint);
    event.level = 'error';
    return resolvedSyncPromise(event);
  }

  public eventFromMessage(
    message: ParameterizedString,
    level: SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return resolvedSyncPromise(
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
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event | null> {
    try {
      syncDebugIdsToCoreGlobal();
    } catch (error) {
      if (this.getOptions().debug) {
        console.warn('[sentry-miniapp] Debug ID 全局同步失败:', error);
      }
    }
    return super._prepareEvent(event, hint, currentScope, isolationScope);
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
    const scope = getCurrentScope().clone();
    scope.setClient(this);
    return captureFeedbackCore(params, {}, scope);
  }
}
