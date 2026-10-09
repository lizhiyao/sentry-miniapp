import {
  Client,
  Scope,
  captureFeedback as captureFeedbackCore,
  createClientReportEnvelope,
  dsnToString,
  eventFromMessage as eventFromMessageCore,
  eventFromUnknownInput,
  getCurrentScope,
  isPlainObject,
  isThenable,
  makeDsn,
  withScope,
  resolvedSyncPromise,
  uuid4,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type {
  BaseTransportOptions,
  ClientOptions,
  DataCategory,
  EventDropReason,
  Outcome,
  Event,
  EventHint,
  ParameterizedString,
  SeverityLevel,
  Session,
  Transport,
} from '@sentry/core';

import { resolveMiniappPlatform } from './crossPlatform';
import { EnvironmentState, registerClientEnvironment } from './clientState';
import { ensureEnvelopeEncoding } from './coreCompat';
import { resolveNonNegativeInteger } from './numericOptions';
import { ClientLifetime, withTelemetryCritical, registerClientLifetime } from './lifecycle';
import type { AppName } from './crossPlatform';
import { ConsentController } from './consent';
import type { MiniappOptions, SendFeedbackParams } from './types';
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
import { SessionCapture } from './sessionCapture';

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
  private readonly _sessionCapture: SessionCapture;
  // core 构造 transport 时即可调用 recorder；懒初始化且不在 super 返回后覆盖早期计数。
  declare private _clientReportOutcomes: Map<string, Outcome> | undefined;
  private readonly _pendingFlushStops = new Set<() => void>();
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
    const sessionCapture = new SessionCapture();
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
    const beforeSend = options.beforeSend;
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
      // 2.0 按 core 调用即采集；关闭前后都守住用户回调边界。
      sendClientReports: options.sendClientReports ?? true,
      beforeSend: (event, hint) => {
        const result = beforeSend ? beforeSend(event, hint) : event;
        // 每次 callback 结果独立绑定，业务复用同一对象也不能串 Session；非法结果仍由 core 验证。
        const bind = (processed: typeof event | null): typeof event | null =>
          sessionCapture.bind(isPlainObject(processed) ? { ...processed } : processed, hint);
        return isThenable(result) ? resolvedSyncPromise(result).then(bind) : bind(result);
      },
      beforeSendLog: (log) => {
        if (!lifetime.acceptsTelemetry()) return null;
        const result = options.beforeSendLog ? options.beforeSendLog(log) : log;
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
    // JS 未处理异常不是宿主进程崩溃证据。
    this._unhandledSessionStatus = 'unhandled';
    this._lifetime = lifetime;
    this._consent = consent;
    this._shutdownTransport = shutdownTransport;
    this._revokeTransport = revokeTransport;
    this._transportRuntime = transportRuntime;
    this._offlineStore = offlineStore;
    this._sessionCapture = sessionCapture;
    lifetime.registerStop(() => transportRuntime?.stopReplay());
    registerClientLifetime(this, lifetime);
    registerClientEnvironment(this, environment);
    this.on('preprocessEvent', () => {
      try {
        syncDebugIdsToCoreGlobal();
      } catch (error) {
        if (this.getOptions().debug) console.warn('[sentry-miniapp] Debug ID 全局同步失败:', error);
      }
    });
    this.on('postprocessEvent', (event, hint) => {
      sessionCapture.bind(event, hint);
    });
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

  public override captureException(exception: unknown, hint?: EventHint, scope?: Scope): string {
    if (!this._lifetime.acceptsTelemetry()) return hint?.event_id ?? uuid4();
    const captured = this._sessionCapture.prepare(hint, scope);
    return super.captureException(exception, captured.hint, captured.scope);
  }

  public override captureMessage(
    message: ParameterizedString | string,
    level?: SeverityLevel,
    hint?: EventHint,
    scope?: Scope,
  ): string {
    if (!this._lifetime.acceptsTelemetry()) return hint?.event_id ?? uuid4();
    const captured = this._sessionCapture.prepare(hint, scope);
    return super.captureMessage(message, level, captured.hint, captured.scope);
  }

  public override captureEvent(event: Event, hint?: EventHint, scope?: Scope): string {
    if (!this._lifetime.acceptsTelemetry()) return hint?.event_id ?? uuid4();
    const metadata = event.sdkProcessingMetadata;
    const captured = this._sessionCapture.prepare(
      hint,
      metadata?.capturedSpanScope ?? scope,
      metadata?.capturedSpanIsolationScope,
    );
    if (metadata?.capturedSpanScope) {
      event = {
        ...event,
        sdkProcessingMetadata: { ...metadata, capturedSpanScope: captured.scope },
      };
    }
    return super.captureEvent(event, captured.hint, captured.scope);
  }

  /** 只选择捕获时的 Session；是否更新、状态和发送时机继续由 core 决定。 */
  protected override _updateSessionFromEvent(session: Session, event: Event): void {
    const captured = this._sessionCapture.sessionFor(event, session);
    if (captured) super._updateSessionFromEvent(captured, event);
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

  /** 宿主控制报告排放；core 通过公开 recorder 提交所有 drop，格式由 core 组装。 */
  public override recordDroppedEvent(
    reason: EventDropReason,
    category: DataCategory,
    count = 1,
  ): void {
    if (!this.getOptions().sendClientReports || this._lifetime?.state === 'closed') return;
    const key = `${reason}:${category}`;
    const outcomes = (this._clientReportOutcomes ??= new Map());
    const previous = outcomes.get(key);
    outcomes.set(key, {
      reason,
      category,
      quantity: (previous?.quantity ?? 0) + count,
    });
  }

  private _sendClientReport(): void {
    const dsn = this.getDsn();
    if (
      !dsn ||
      !this.getOptions().sendClientReports ||
      !this._consent.isGranted() ||
      !this._lifetime.canSend() ||
      !this._clientReportOutcomes?.size
    )
      return;
    const outcomes = [...this._clientReportOutcomes.values()];
    // 发送 hook 的新 drop 属于下一批；失败报告仍由现有 transport 策略处理。
    this._clientReportOutcomes = new Map();
    void this.sendEnvelope(
      createClientReportEnvelope(outcomes, this.getOptions().tunnel ? dsnToString(dsn) : undefined),
    );
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
    if (this._lifetime.state === 'closed') return Promise.resolve(false);
    let flushed!: PromiseLike<boolean>;
    try {
      withScope((scope) => {
        scope.setClient(this);
        // core 的 flush 同步排 buffer；outcomes 随后入同一 transport，再等待原 flush。
        flushed = super.flush(timeout);
        this._sendClientReport();
      });
    } finally {
      // 授权/show/reconnect 都经过此入口；不等 processing drain 才唤醒磁盘重放。
      this._transportRuntime?.requestReplay();
    }
    return new Promise<boolean>((resolve, reject) => {
      const stop = (): void => resolve(false);
      this._pendingFlushStops.add(stop);
      void Promise.resolve(flushed)
        .then(resolve, reject)
        .finally(() => {
          this._pendingFlushStops.delete(stop);
        });
      if (this._lifetime.state === 'closed') {
        this._pendingFlushStops.delete(stop);
        stop();
      }
    });
  }

  public getOfflineStoreDiagnostics(): OfflineStoreDiagnostics | null {
    return this._offlineStore?.getDiagnostics() ?? null;
  }

  /** 立即禁采集/发送；排弃 core 公开 buffer 后解除资源。 */
  public override dispose(): void {
    if (this._lifetime.state === 'closed') return;
    this._lifetime.finish();
    this._clientReportOutcomes?.clear();
    for (const stop of this._pendingFlushStops) stop();
    this._pendingFlushStops.clear();
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
