import {
  Client,
  Scope,
  captureFeedback as captureFeedbackCore,
  eventFromMessage as eventFromMessageCore,
  eventFromUnknownInput,
  getCurrentScope,
  makeOfflineTransport,
  withScope,
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
  Transport,
} from '@sentry/core';

import { resolveMiniappPlatform } from './crossPlatform';
import { EnvironmentState, registerClientEnvironment } from './clientState';
import { ClientLifetime, withTelemetryCritical, registerClientLifetime } from './lifecycle';
import type { AppName } from './crossPlatform';
import { configureConsent, isConsentGranted, notifyConsentDrop } from './consent';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';
import { createMiniappTransport, createMiniappOfflineStore } from './transports';
import type { MiniappTransportOptions } from './transports';
import { shutdownMiniappTransport } from './transports/xhr';
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
const runtimeConstructionOptions = new WeakSet<object>();

/** init 的明确构造标记；不会让任意直接构造 client 抢占持久消费权限。 */
export function markRuntimeConstruction(options: object): void {
  runtimeConstructionOptions.add(options);
}

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
  private readonly _lifetime: ClientLifetime;
  private readonly _shutdownTransport: () => void;
  private _closePromise: Promise<boolean> | undefined;
  private _stopClose: (() => void) | undefined;
  private _hookDepth = 0;
  private _finishPending = false;
  private _finishing = false;

  /** core hook 中 dispose 先关门，最外层 finally 再清理，避免 core 后续重建 bucket。 */
  public override emit: Client['emit'] = (hook: string, ...args: unknown[]): void => {
    if (
      this._lifetime.state === 'closed' &&
      (hook === 'spanStart' || hook === 'afterSpanEnd' || hook === 'afterSegmentSpanEnd')
    )
      return;
    this._hookDepth++;
    try {
      withTelemetryCritical(() => Reflect.apply(Client.prototype.emit, this, [hook, ...args]));
    } finally {
      this._hookDepth--;
      if (this._hookDepth === 0 && this._finishPending && !this._finishing) this._finishClosed();
    }
  };

  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: MiniappOptions | MiniappClientOptions = {}) {
    const environment = new EnvironmentState(options);
    const lifetime = new ClientLifetime();
    let shutdownTransport = (): void => {};
    const tracesSampler = options.tracesSampler;
    const beforeSendSpan = options.beforeSendSpan;
    const guardTransport = (transport: Transport): Transport => ({
      send: (envelope) => (lifetime.canSend() ? transport.send(envelope) : resolvedSyncPromise({})),
      flush: (timeout) => transport.flush(timeout),
    });
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
      beforeSendLog: (log) => {
        if (!lifetime.acceptsTelemetry()) return null;
        const result =
          options.enableLogs === true
            ? options.beforeSendLog
              ? options.beforeSendLog(log)
              : log
            : dropLog();
        return lifetime.acceptsTelemetry() ? result : null;
      },
      beforeSendMetric: (metric) => {
        if (!lifetime.acceptsTelemetry()) return null;
        const result = options.beforeSendMetric ? options.beforeSendMetric(metric) : metric;
        return lifetime.acceptsTelemetry() ? result : null;
      },
      ...(tracesSampler
        ? {
            tracesSampler: (context) => withTelemetryCritical(() => tracesSampler!(context)),
          }
        : {}),
      ...(beforeSendSpan
        ? { beforeSendSpan: (span) => withTelemetryCritical(() => beforeSendSpan!(span)) }
        : {}),
      integrations: Array.isArray(options.integrations) ? options.integrations : [],
      stackParser: stackParserFromStackParserOptions(options.stackParser ?? miniappStackParser),
      transport: (transportOptions: BaseTransportOptions) => {
        const miniappTransportOptions = transportOptions as MiniappTransportOptions;
        const underlyingTransport = options.transport
          ? options.transport(miniappTransportOptions)
          : createMiniappTransport(
              {
                ...miniappTransportOptions,
                headers: miniappTransportOptions.headers ?? {},
              },
              () => lifetime.canSend(),
            );
        if (!options.transport)
          shutdownTransport = () => shutdownMiniappTransport(underlyingTransport);
        const baseTransport = {
          send: (envelope: Parameters<typeof underlyingTransport.send>[0]) =>
            lifetime.canSend() ? underlyingTransport.send(envelope) : resolvedSyncPromise({}),
          flush: (timeout?: number) => underlyingTransport.flush(timeout),
        };

        // 同意门禁：在调用 core offline transport 前同步闸断网络（同意前 envelope 不发、
        // 直接转入本地缓冲），setConsent(true) 后由 transport.flush() 补发。即便用户关了
        // enableOfflineCache，requireConsent 仍需缓冲，故强制走 offline 路径；若用户传了自定义
        // transport，也要包住它，避免合规开关被高级用法绕过。
        if (options.requireConsent === true) {
          const store = createMiniappOfflineStore(
            {
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
            },
            () => lifetime.canUseStore(),
          );
          return guardTransport(
            createConsentAwareOfflineTransport(
              baseTransport,
              miniappTransportOptions,
              store,
              isConsentGranted,
            ),
          );
        }

        if (!options.transport && options.enableOfflineCache !== false) {
          return guardTransport(
            makeOfflineTransport(() => baseTransport)({
              ...transportOptions,
              createStore: (storeOptions: any) =>
                createMiniappOfflineStore(
                  {
                    ...storeOptions,
                    offlineCacheLimit: options.offlineCacheLimit,
                    offlineCacheMaxAge: options.offlineCacheMaxAge,
                  },
                  () => lifetime.canUseStore(),
                ),
              flushAtStartup: true, // 启动时自动重试发送
            } as any),
          );
        }

        return baseTransport;
      },
    };

    super(clientOptions);
    this._lifetime = lifetime;
    this._shutdownTransport = shutdownTransport;
    registerClientLifetime(this, lifetime);
    registerClientEnvironment(this, environment);
    this.addEventProcessor((event) => environment.fillEvent(event));

    if (usesCustomTransport) {
      clientsWithCustomTransport.add(this);
    }
    clientDefaultIntegrationsModes.set(this, defaultIntegrationsMode);
    // 自动维度属于本 client，走 core 的 processSpan 钩子按 client 填充；不写共享 isolation scope。
    this.registerCleanup(registerClientSpanDimensions(this));
    if (runtimeConstructionOptions.delete(options)) lifetime.activate();
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

  /** 固定采集时的 session 引用；异步 processor 不能把 S1 的错误计入新 S2。 */
  protected override _processEvent(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event> {
    const capturedCurrent = currentScope.clone();
    const capturedIsolation = isolationScope.clone();
    capturedCurrent.setSession(currentScope.getSession() ?? isolationScope.getSession());
    return super._processEvent(event, hint, capturedCurrent, capturedIsolation);
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
    if (this._lifetime.state === 'closed') this._runCleanup(callback);
    else this._disposeCallbacks.push(callback);
  }

  /** SDK summary 的同步收尾独立于只解除资源的 cleanup。 */
  public registerFinalizer(callback: () => void): () => void {
    return this._lifetime.registerFinalizer(callback);
  }

  public retireRuntime(): Promise<boolean> {
    this._lifetime.closingReason = 'client_replaced';
    return this.close(2000);
  }

  /** 原生无期限 processing poll 在 dispose 后仍会循环；每个 core tick 间检查宿主终态。 */
  protected override async _isClientDoneProcessing(timeout?: number): Promise<boolean> {
    let ticked = 0;
    while ((!timeout || ticked < timeout) && this._lifetime.state !== 'closed') {
      if (await super._isClientDoneProcessing(1)) return true;
      ticked++;
    }
    return false;
  }

  public override flush(timeout?: number): PromiseLike<boolean> {
    let flushed!: PromiseLike<boolean>;
    withScope((scope) => {
      scope.setClient(this);
      flushed = super.flush(timeout);
    });
    return flushed;
  }

  /** 立即禁采集/发送；排弃 core 公开 buffer 后解除资源。 */
  public override dispose(): void {
    if (this._lifetime.state === 'closed') return;
    this._lifetime.finish();
    this.getOptions().enabled = false;
    this._shutdownTransport();
    this._stopClose?.();
    this._finishPending = true;
    if (this._hookDepth === 0) this._finishClosed();
  }

  private _finishClosed(): void {
    this._finishPending = false;
    this._finishing = true;
    try {
      this.emit('flush');
    } catch (_error) {
      // 第三方 hook 可能中断 core emit，清理资源仍继续。
    }
    try {
      this.emit('close');
    } catch (_error) {
      // 不改 core 私有 hooks/buffers；第三方故障时仅保证 SDK 资源关闭。
    } finally {
      this._finishing = false;
      for (const callback of this._disposeCallbacks.splice(0)) this._runCleanup(callback);
    }
  }

  private _runCleanup(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      try {
        if (this.getOptions().debug) console.warn('[sentry-miniapp] 集成资源清理失败:', error);
      } catch (_error) {
        /* 宿主 console 故障也不能阻断关闭。 */
      }
    }
  }

  /** 一次 close operation、一个总预算；dispose 可以抢占未结束的 drain。 */
  public override close(timeout?: number): Promise<boolean> {
    if (this._closePromise) return this._closePromise;
    if (this._lifetime.state === 'closed') return Promise.resolve(false);
    let resolveClose!: (result: boolean) => void;
    let rejectClose!: (error: unknown) => void;
    this._closePromise = new Promise<boolean>((resolve, reject) => {
      resolveClose = resolve;
      rejectClose = reject;
    });
    const budget = this._lifetime.beginClose(timeout);
    let stop!: (result: boolean) => void;
    const stopped = new Promise<boolean>((resolve) => {
      stop = resolve;
    });
    this._stopClose = () => stop(false);
    const timer = budget === undefined ? undefined : setTimeout(() => stop(false), budget);
    this._lifetime.finalize();
    let drained: PromiseLike<boolean>;
    try {
      drained = this.flush(budget);
    } catch (error) {
      drained = Promise.reject(error);
    }
    const finish = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      this.dispose();
      this._stopClose = undefined;
    };
    void Promise.race([drained, stopped]).then(
      (result) => {
        const completedInBudget = result && this._lifetime.canSend();
        finish();
        resolveClose(completedInBudget);
      },
      (error) => {
        finish();
        rejectClose(error);
      },
    );
    return this._closePromise;
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
