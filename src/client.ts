import {
  Client,
  Scope,
  captureFeedback as captureFeedbackCore,
  eventFromMessage as eventFromMessageCore,
  eventFromUnknownInput,
  getCurrentScope,
  makeDsn,
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
import { ensureEnvelopeEncoding } from './coreCompat';
import { resolveNonNegativeInteger } from './numericOptions';
import { ClientLifetime, withTelemetryCritical, registerClientLifetime } from './lifecycle';
import type { AppName } from './crossPlatform';
import { ConsentController } from './consent';
import type { MiniappOptions, ReportDialogOptions, SendFeedbackParams } from './types';
import { createMiniappTransport, createMiniappOfflineStore } from './transports';
import type { MiniappTransportOptions } from './transports';
import { shutdownMiniappTransport, revokeMiniappTransport } from './transports/xhr';
import {
  createConsentAwareOfflineTransport,
  getTransportRuntime,
  type TransportRuntimeHandle,
} from './transports/consent';
import type { MiniappOfflineStore, OfflineStoreDiagnostics } from './transports/offlineStore';
import { offlineTargetId } from './transports/offlineRecords';
import { SDK_NAME, SDK_VERSION } from './version';
import { syncDebugIdsToCoreGlobal } from './debugIds';
import { miniappStackParser } from './stacktrace';
import { registerClientSpanDimensions } from './spanDimensions';

/** 在任何宿主安装或替换旧 runtime 前校验；低层构造同样遵守唯一 tracing 契约。 */
export function assertStreamTracingOptions(options: MiniappOptions): void {
  if (options.traceLifecycle !== undefined && options.traceLifecycle !== 'stream') {
    throw new Error(
      'sentry-miniapp 2.0 only supports traceLifecycle: stream; migrate static transactions to span attributes and beforeSendSpan',
    );
  }
}

export type MiniappClientOptions = Omit<
  MiniappOptions,
  'integrations' | 'miniappPlatform' | 'platform' | 'stackParser' | 'transport'
> &
  ClientOptions<MiniappTransportOptions> & {
    platform: string;
    /** 小程序宿主标识；与 Sentry 顶层 event.platform 分离。 */
    miniappPlatform?: AppName | undefined;
  };

/** 直接构造只支持自管 transport；自动 runtime 请使用 init。 */
export type MiniappLowLevelClientOptions = MiniappOptions & {
  transport: NonNullable<MiniappOptions['transport']>;
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
  private readonly _consent: ConsentController;
  private readonly _shutdownTransport: () => void;
  private readonly _revokeTransport: () => void;
  private readonly _transportRuntime: TransportRuntimeHandle | undefined;
  private readonly _offlineStore: MiniappOfflineStore | undefined;
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
  public constructor(options: MiniappLowLevelClientOptions) {
    const runtimeManaged = !!options && runtimeConstructionOptions.delete(options);
    if (!options) {
      throw new Error(
        'Direct MiniappClient construction requires an explicit transport; use init for the managed runtime',
      );
    }
    const { transport: transportFactory, ...snapshot } = options;
    if (!runtimeManaged && typeof transportFactory !== 'function') {
      throw new Error(
        'Direct MiniappClient construction requires an explicit transport; use init for the managed runtime',
      );
    }
    options = { ...snapshot, transport: transportFactory };
    assertStreamTracingOptions(options);
    ensureEnvelopeEncoding();
    const environment = new EnvironmentState(options);
    const lifetime = new ClientLifetime();
    const dsn = options.dsn ? makeDsn(options.dsn) : undefined;
    const storeIdentity = {
      targetId: dsn ? offlineTargetId(dsn, options.tunnel) : 'no-dsn',
      policyId: JSON.stringify(['miniapp-privacy-v2', options.requireConsent === true]),
    };
    let shutdownTransport = (): void => {};
    let revokeTransport = (): void => {};
    let transportRuntime: TransportRuntimeHandle | undefined;
    let offlineStore: MiniappOfflineStore | undefined;
    const tracesSampler = options.tracesSampler;
    const beforeSendSpan = options.beforeSendSpan;
    const guardTransport = (transport: Transport): Transport => ({
      send: (envelope) => (lifetime.canSend() ? transport.send(envelope) : resolvedSyncPromise({})),
      flush: (timeout) => transport.flush(timeout),
    });
    const managedOffline = (transport: Transport): Transport => {
      transportRuntime = getTransportRuntime(transport);
      return guardTransport(transport);
    };
    const usesCustomTransport = typeof transportFactory === 'function';
    const defaultIntegrationsMode = resolveDefaultIntegrationsMode(options.defaultIntegrations);
    const hasConfiguredMiniappPlatform =
      options.miniappPlatform !== undefined || options.platform !== undefined;
    const miniappPlatform = hasConfiguredMiniappPlatform
      ? resolveMiniappPlatform(options)
      : undefined;

    // super 创建 transport 前，先建立只属于此 client 的控制闭包。
    const consentCacheLimit = resolveNonNegativeInteger(options.consentCacheLimit, 100);
    const consent = new ConsentController({
      required: options.requireConsent === true,
      cacheLimit: consentCacheLimit,
      cacheMaxBytes: options.consentCacheMaxBytes,
      cacheMaxAge: options.consentCacheMaxAge,
      onDrop: options.onConsentCacheDrop,
    });

    // 2.0 固定 stream；采样、SpanBuffer 与发送格式由 core 原生实现负责。
    const clientOptions: MiniappClientOptions = {
      ...options,
      traceLifecycle: 'stream',
      consentCacheLimit,
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
        const underlyingTransport = transportFactory
          ? transportFactory(miniappTransportOptions)
          : createMiniappTransport(
              {
                ...miniappTransportOptions,
                headers: miniappTransportOptions.headers ?? {},
              },
              () => lifetime.canSend(),
              () => consent.isGranted(),
              () => lifetime.warnings.add('binary_request_unsupported'),
            );
        if (!transportFactory) {
          shutdownTransport = () => shutdownMiniappTransport(underlyingTransport);
          revokeTransport = () => revokeMiniappTransport(underlyingTransport);
        }
        const baseTransport: Transport = {
          send: (envelope) => {
            if (!lifetime.canSend()) return resolvedSyncPromise({});
            if (!runtimeManaged && !consent.isGranted()) {
              lifetime.warnings.add('low_level_consent_blocking');
              return Promise.reject(
                new Error('Low-level client consent blocked; no SDK offline store is available'),
              );
            }
            return underlyingTransport.send(envelope);
          },
          flush: (timeout) => underlyingTransport.flush(timeout),
        };
        if (!runtimeManaged) return baseTransport;

        // 同意门与弱网重试共用一层 core offline；required=true 保留强制缓存含义。
        // 自定义 transport 也经过 consent 入口，不旁路 core 私有队列。
        if (options.requireConsent === true) {
          const store = createMiniappOfflineStore(
            {
              ...storeIdentity,
              // 同意前缓存用独立上限 + 冷启动优先（保留最旧）淘汰，区别于弱网那套默认值。
              offlineCacheLimit: consent.config.cacheLimit ?? 100,
              ...(consent.config.cacheMaxAge !== undefined && {
                offlineCacheMaxAge: consent.config.cacheMaxAge,
              }),
              ...(consent.config.cacheMaxBytes !== undefined && {
                maxBytes: consent.config.cacheMaxBytes,
              }),
              evictionMode: 'preserve-oldest',
              onDrop: consent.notifyDrop,
            },
            () => lifetime.canUseStore(),
          );
          offlineStore = store;
          return managedOffline(
            createConsentAwareOfflineTransport(
              baseTransport,
              miniappTransportOptions,
              store,
              () => consent.isGranted(),
              () => lifetime.canUseStore(),
            ),
          );
        }

        if (!transportFactory && options.enableOfflineCache !== false) {
          const store = createMiniappOfflineStore(
            {
              ...storeIdentity,
              ...(options.offlineCacheLimit !== undefined && {
                offlineCacheLimit: options.offlineCacheLimit,
              }),
              ...(options.offlineCacheMaxAge !== undefined && {
                offlineCacheMaxAge: options.offlineCacheMaxAge,
              }),
            },
            () => lifetime.canUseStore(),
          );
          offlineStore = store;
          return managedOffline(
            createConsentAwareOfflineTransport(
              baseTransport,
              transportOptions,
              store,
              () => consent.isGranted(),
              () => lifetime.canUseStore(),
              true,
            ),
          );
        }

        return baseTransport;
      },
    };

    super(clientOptions);
    this._lifetime = lifetime;
    this._consent = consent;
    this._shutdownTransport = shutdownTransport;
    this._revokeTransport = revokeTransport;
    this._transportRuntime = transportRuntime;
    this._offlineStore = offlineStore;
    lifetime.registerStop(() => transportRuntime?.stopReplay());
    registerClientLifetime(this, lifetime);
    registerClientEnvironment(this, environment);
    this.addEventProcessor((event) => environment.fillEvent(event));

    if (usesCustomTransport) {
      clientsWithCustomTransport.add(this);
    }
    clientDefaultIntegrationsModes.set(this, defaultIntegrationsMode);
    // 自动维度属于本 client，走 core 的 processSpan 钩子按 client 填充；不写共享 isolation scope。
    this.registerCleanup(registerClientSpanDimensions(this));
    if (runtimeManaged) lifetime.activate();
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

  /** 顶层 API 只路由当前实例；实例 API 永远修改自己的 consent。 */
  public getConsent(): boolean {
    return this._consent.isGranted();
  }

  public setConsent(granted: boolean): void {
    if (this._lifetime.state !== 'open' || !this._consent.config.required) return;
    this._consent.setGranted(granted);
    if (!granted) {
      this._transportRuntime?.stopReplay();
      this._revokeTransport();
    }
    if (granted) {
      try {
        void Promise.resolve(this.flush()).catch(() => {});
      } catch (_error) {
        /* 同步用户 hook 故障不撤回已提交的授权状态。 */
      }
    }
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
    try {
      withScope((scope) => {
        scope.setClient(this);
        flushed = super.flush(timeout);
      });
    } finally {
      // 授权/show/reconnect 都经过此入口；不等 processing drain 才唤醒磁盘重放。
      this._transportRuntime?.requestReplay();
    }
    return flushed;
  }

  public getOfflineStoreDiagnostics(): OfflineStoreDiagnostics | null {
    return this._offlineStore?.getDiagnostics() ?? null;
  }

  /** 立即禁采集/发送；排弃 core 公开 buffer 后解除资源。 */
  public override dispose(): void {
    if (this._lifetime.state === 'closed') return;
    this._lifetime.finish();
    this.getOptions().enabled = false;
    this._transportRuntime?.shutdown();
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
