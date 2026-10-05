import { getClientEnvironment, setClientContext } from '../clientState';
import { getCurrentScope, startInactiveSpan, startSpan, withActiveSpan } from '@sentry/core';
import type { Client, Integration, IntegrationFn } from '@sentry/core';

import {
  getPerformanceManager,
  sdk,
  epochNow,
  type PerformanceEntry,
  type NavigationPerformanceEntry,
  type RenderPerformanceEntry,
  type ResourcePerformanceEntry,
  type UserTimingPerformanceEntry,
  type PerformanceManager,
  type PerformanceObserver,
} from '../crossPlatform';
import { automaticSpanAttributes, setClientSpanDimension } from '../spanDimensions';
import { collectUrlName } from '../dataCollection';
import { resolveNonNegativeInteger } from '../numericOptions';
import { getClientLifetime } from '../lifecycle';
import { OwnerToken } from '../owner';

const EPOCH_TIMESTAMP_THRESHOLD = 100_000_000_000;
const MAX_PLAUSIBLE_RELATIVE_RUNTIME = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW = 60 * 1000;

/**
 * Performance API 集成配置
 */
export interface PerformanceIntegrationOptions {
  /** 是否启用导航性能监控 */
  enableNavigation?: boolean;
  /** 是否启用渲染性能监控 */
  enableRender?: boolean;
  /** 是否启用资源加载性能监控 */
  enableResource?: boolean;
  /** 是否启用用户自定义性能监控 */
  enableUserTiming?: boolean;
  /** 性能数据采样率 (0-1) */
  sampleRate?: number;
  /** 性能条目缓冲区大小 */
  bufferSize?: number;
  /** 性能条目统计汇总间隔 (毫秒) */
  reportInterval?: number;
  /** 性能阈值配置 */
  thresholds?: {
    /** 导航耗时阈值（毫秒，默认 3000） */
    navigation?: number;
    /** 渲染耗时阈值（毫秒，默认 1000） */
    render?: number;
    /** 资源加载耗时阈值（毫秒，默认 2000） */
    resource?: number;
    /** setData 渲染耗时阈值（毫秒，默认 50，参考微信官方建议） */
    setData?: number;
  };
  /** 是否启用内存信息采集 */
  enableMemory?: boolean;
}

/** Performance API 集成 */
class PerformanceController {
  private _options: Required<PerformanceIntegrationOptions>;
  private _performanceManager: PerformanceManager | null = null;
  private _observers: PerformanceObserver[] = [];
  private _entryBuffer: PerformanceEntry[] = [];
  private _reportTimer: ReturnType<typeof setInterval> | null = null;
  private _relativeTimeOrigin: number | null = null;
  private _setupEpochMilliseconds: number | null = null;
  private _client: Client | undefined;
  private _owner: OwnerToken | undefined;

  constructor(options: PerformanceIntegrationOptions = {}) {
    this._options = {
      enableNavigation: true,
      enableRender: true,
      enableResource: true,
      enableUserTiming: false,
      sampleRate: 1.0,
      enableMemory: false,
      ...options,
      bufferSize: resolveNonNegativeInteger(options.bufferSize, 100),
      reportInterval: Math.min(
        resolveNonNegativeInteger(options.reportInterval, 30000),
        2_147_483_647,
      ),
      thresholds: {
        navigation: 3000,
        render: 1000,
        resource: 2000,
        setData: 50,
        ...options?.thresholds,
      },
    };
  }

  /**
   * @inheritDoc
   */
  public setup(client: Client): void {
    this._client = client;
    const owner = new OwnerToken(client);
    this._owner = owner;
    owner.registerFinalizer(() => this._reportBufferedEntries(true));
    owner.run(() => this._setup());
  }

  private _observe(callback: () => void): void {
    try {
      this._owner?.run(callback);
    } catch (_error) {
      /* 不可读 entry 或用户 hook 故障不传播到 observer。 */
    }
  }

  private _setup(): void {
    this._setupEpochMilliseconds = epochNow();
    this._initializePerformanceManager();
    if (!this._isActiveClient() || !this._setupPerformanceObservers() || !this._isActiveClient()) {
      return;
    }
    this._startAutoReporting();
    this._addPerformanceContext();
  }

  /**
   * 初始化性能管理器
   */
  private _initializePerformanceManager(): void {
    try {
      this._performanceManager = getPerformanceManager();
      if (!this._performanceManager) {
        return;
      }
    } catch (error) {
      console.warn('[sentry-miniapp] Failed to initialize performance manager:', error);
    }
  }

  /**
   * 设置性能观察者
   */
  private _setupPerformanceObservers(): boolean {
    if (!this._performanceManager) {
      return false;
    }

    try {
      if (typeof this._performanceManager.createObserver !== 'function') {
        return false;
      }

      const entryTypes: string[] = [];

      if (this._options.enableNavigation) {
        entryTypes.push('navigation');
      }
      if (this._options.enableRender) {
        entryTypes.push('render');
      }
      if (this._options.enableResource) {
        entryTypes.push('resource');
      }

      let canObserveUserTiming = this._options.enableUserTiming;

      if (canObserveUserTiming) {
        try {
          const systemInfo = this._client
            ? { platform: getClientEnvironment(this._client).hostPlatform }
            : undefined;

          if (systemInfo && systemInfo.platform === 'devtools') {
            canObserveUserTiming = false;
          }

          if (canObserveUserTiming) {
            const globalObj: any =
              typeof globalThis !== 'undefined'
                ? globalThis
                : typeof window !== 'undefined'
                  ? window
                  : {};

            const performanceObserverCtor: any = (globalObj as any).PerformanceObserver;
            const supportedTypes: string[] | undefined =
              performanceObserverCtor &&
              Array.isArray((performanceObserverCtor as any).supportedEntryTypes)
                ? (performanceObserverCtor as any).supportedEntryTypes
                : undefined;

            if (
              !supportedTypes ||
              !supportedTypes.includes('measure') ||
              !supportedTypes.includes('mark')
            ) {
              canObserveUserTiming = false;
            }
          }
        } catch {
          canObserveUserTiming = false;
        }
      }

      if (canObserveUserTiming) {
        entryTypes.push('measure', 'mark');
      }

      if (entryTypes.length === 0) {
        return false;
      }

      // 创建性能观察者
      const observer = this._performanceManager.createObserver((entries) => {
        this._observe(() => this._handlePerformanceEntries(entries));
      });

      if (!this._isActiveClient()) {
        observer.disconnect();
        return false;
      }
      // observe 可能回调或部分注册后抛错，先纳入资源 ledger。
      this._observers.push(observer);
      try {
        observer.observe({ entryTypes });
      } catch (e) {
        // 如果失败（例如微信小程序不支持 measure/mark），尝试移除这些类型后重试
        const safeTypes = entryTypes.filter((t) => t !== 'measure' && t !== 'mark');

        if (safeTypes.length < entryTypes.length && safeTypes.length > 0) {
          // 降级重试
          observer.observe({ entryTypes: safeTypes });
          console.warn('[sentry-miniapp] Failed to observe all types, falling back to:', safeTypes);

          // 更新 entryTypes 以便日志记录正确
          entryTypes.length = 0;
          entryTypes.push(...safeTypes);
        } else {
          throw e; // 如果没有可降级的类型或仍然失败，则抛出
        }
      }

      if (!this._isActiveClient()) return false;

      const globalProcess =
        typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
      if (globalProcess && globalProcess.env && globalProcess.env.NODE_ENV !== 'production') {
        console.log('[sentry-miniapp] Performance observers setup for:', entryTypes);
      }
      return true;
    } catch (error) {
      console.warn('[sentry-miniapp] Failed to setup performance observers:', error);
      return false;
    }
  }

  /**
   * 处理性能条目
   */
  private _handlePerformanceEntries(entries: PerformanceEntry[] | any): void {
    if (!this._isActiveClient() || !entries) {
      return;
    }

    // 确保 entries 是数组格式
    let entriesArray: PerformanceEntry[];
    if (Array.isArray(entries)) {
      entriesArray = entries;
    } else if (typeof entries === 'object' && entries.getEntries) {
      // 微信小程序可能传入 PerformanceObserverEntryList 对象
      entriesArray = entries.getEntries();
    } else if (typeof entries === 'object') {
      // 如果是单个对象，转换为数组
      entriesArray = [entries];
    } else {
      console.warn('[sentry-miniapp] Invalid entries format:', typeof entries);
      return;
    }

    if (entriesArray.length === 0) {
      return;
    }

    const currentEpoch = epochNow();
    entriesArray = entriesArray.filter((entry) =>
      this._isPlausiblePerformanceEntry(entry, currentEpoch),
    );
    if (entriesArray.length === 0) return;

    // 采样控制
    if (Math.random() > this._options.sampleRate) {
      return;
    }

    this._initializeRelativeTimeOrigin(entriesArray);
    const rootStart = Math.min(...entriesArray.map((entry) => this._entryTimes(entry).start));
    const rootEnd = Math.max(...entriesArray.map((entry) => this._entryTimes(entry).end));
    const navigation = entriesArray.find((entry) => entry.entryType === 'navigation');
    if (!this._isActiveClient()) return;
    const rootSpan = startInactiveSpan({
      name: navigation ? `Navigation: ${collectUrlName(navigation.name)}` : 'Miniapp Performance',
      op: navigation ? 'navigation' : 'miniapp.performance',
      // core 11 废弃 forceTransaction；无父 span 的 root span 自成 segment，子 span 按 traceId 归到
      // 同一条 envelope 发出（SpanStreaming 的 buffer 负责攒批）。
      parentSpan: null,
      startTime: rootStart,
    });
    if (!this._isActiveClient()) return;
    rootSpan.setAttributes({
      'performance.entry_count': entriesArray.length,
      'performance.entry_types': Array.from(
        new Set(entriesArray.map((entry) => entry.entryType)),
      ).join(','),
    });

    withActiveSpan(rootSpan, () => {
      entriesArray.forEach((entry) => {
        if (!this._isActiveClient()) return;
        try {
          this._processPerformanceEntry(entry);
          if (this._isActiveClient()) this._addToBuffer(entry);
        } catch (error) {
          console.warn('[sentry-miniapp] Failed to process performance entry:', error);
        }
      });
    });
    if (this._isActiveClient()) rootSpan.end(rootEnd);
  }

  /**
   * 小程序 PerformanceEntry.startTime 通常是相对运行时起点的毫秒数，不是 Unix epoch。
   * 第一批条目用“最晚结束点 ≈ 当前时间”建立稳定锚点；已是 epoch 毫秒的宿主值则原样使用。
   * 锚点不得晚于 SDK setup 时刻，否则延迟送达的陈旧首批数据会被错误平移到当前甚至未来。
   */
  private _initializeRelativeTimeOrigin(entries: PerformanceEntry[]): void {
    if (this._relativeTimeOrigin !== null) return;
    const currentEpoch = epochNow();
    const relativeEnds = entries
      .filter(
        (entry) => Number.isFinite(entry.startTime) && entry.startTime < EPOCH_TIMESTAMP_THRESHOLD,
      )
      .map(
        (entry) =>
          Math.max(0, entry.startTime) +
          (Number.isFinite(entry.duration) ? Math.max(0, entry.duration) : 0),
      )
      .filter((relativeEnd) => relativeEnd <= MAX_PLAUSIBLE_RELATIVE_RUNTIME);
    if (relativeEnds.length === 0) return;

    const candidate = currentEpoch - Math.max(0, ...relativeEnds);
    const latestPlausibleOrigin = this._setupEpochMilliseconds ?? currentEpoch;
    const earliestPlausibleOrigin = currentEpoch - MAX_PLAUSIBLE_RELATIVE_RUNTIME;
    this._relativeTimeOrigin = Math.min(
      latestPlausibleOrigin,
      Math.max(earliestPlausibleOrigin, candidate),
    );
  }

  private _isPlausiblePerformanceEntry(entry: PerformanceEntry, currentEpoch: number): boolean {
    if (!Number.isFinite(entry.startTime)) return false;
    const start = Math.max(0, entry.startTime);
    const duration = Number.isFinite(entry.duration) ? Math.max(0, entry.duration) : 0;
    const end = start + duration;

    if (start < EPOCH_TIMESTAMP_THRESHOLD) {
      return end <= MAX_PLAUSIBLE_RELATIVE_RUNTIME;
    }

    return (
      start >= currentEpoch - MAX_PLAUSIBLE_RELATIVE_RUNTIME &&
      end <= currentEpoch + MAX_FUTURE_CLOCK_SKEW
    );
  }

  private _entryTimes(entry: PerformanceEntry): { start: number; end: number } {
    const validStart = Number.isFinite(entry.startTime) ? entry.startTime : 0;
    const startMilliseconds =
      validStart >= EPOCH_TIMESTAMP_THRESHOLD
        ? validStart
        : (this._relativeTimeOrigin ?? epochNow()) + Math.max(0, validStart);
    const endMilliseconds =
      startMilliseconds + (Number.isFinite(entry.duration) ? Math.max(0, entry.duration) : 0);
    return { start: startMilliseconds / 1000, end: endMilliseconds / 1000 };
  }

  /**
   * 处理单个性能条目
   */
  private _processPerformanceEntry(entry: PerformanceEntry): void {
    switch (entry.entryType) {
      case 'navigation':
        this._processNavigationEntry(entry as NavigationPerformanceEntry);
        break;
      case 'render':
        this._processRenderEntry(entry as RenderPerformanceEntry);
        break;
      case 'resource':
        this._processResourceEntry(entry as ResourcePerformanceEntry);
        break;
      case 'measure':
      case 'mark':
        this._processUserTimingEntry(entry as UserTimingPerformanceEntry);
        break;
      default:
        console.log('[sentry-miniapp] Unknown entry type:', entry.entryType);
    }
  }

  /**
   * 处理导航性能条目
   */
  private _processNavigationEntry(entry: NavigationPerformanceEntry): void {
    const times = this._entryTimes(entry);
    const name = collectUrlName(entry.name);
    // 添加面包屑
    const scope = getCurrentScope();
    scope.addBreadcrumb({
      message: `页面导航: ${name}`,
      category: 'performance.navigation',
      level: 'info',
      data: {
        duration: entry.duration,
        appLaunchTime: entry.appLaunchTime,
        pageReadyTime: entry.pageReadyTime,
      },
    });

    startSpan(
      {
        name: `Navigation: ${name}`,
        op: 'navigation',
        startTime: times.start,
        attributes: automaticSpanAttributes(
          this._client,
          {
            'navigation.name': name,
            'navigation.duration': entry.duration,
            'navigation.app_launch_time': entry.appLaunchTime || 0,
            'navigation.page_ready_time': entry.pageReadyTime || 0,
            'navigation.first_render_time': entry.firstRenderTime || 0,
          },
          false,
        ),
      },
      (span) => {
        if (this._isActiveClient()) span.end(times.end);
      },
    );
  }

  /**
   * 处理渲染性能条目
   */
  private _processRenderEntry(entry: RenderPerformanceEntry): void {
    const times = this._entryTimes(entry);
    startSpan(
      {
        name: `Render: ${entry.name}`,
        op: 'render',
        startTime: times.start,
        attributes: automaticSpanAttributes(
          this._client,
          {
            'render.name': entry.name,
            'render.duration': entry.duration,
            'render.start': entry.renderStart || 0,
            'render.end': entry.renderEnd || 0,
            'render.script_start': entry.scriptStart || 0,
            'render.script_end': entry.scriptEnd || 0,
          },
          false,
        ),
      },
      (span) => {
        if (this._isActiveClient()) span.end(times.end);
      },
    );

    // 检测慢渲染（可能由 setData 引起）
    const setDataThreshold = this._options.thresholds?.setData ?? 50;
    if (entry.duration > setDataThreshold) {
      const scope = getCurrentScope();
      scope.addBreadcrumb({
        message: `慢渲染检测: ${entry.name} (${entry.duration.toFixed(1)}ms)`,
        category: 'performance.setData.slow',
        level: 'warning',
        data: {
          name: entry.name,
          duration: entry.duration,
          threshold: setDataThreshold,
          renderStart: entry.renderStart,
          renderEnd: entry.renderEnd,
          scriptStart: entry.scriptStart,
          scriptEnd: entry.scriptEnd,
        },
      });
    }
  }

  /**
   * 处理资源加载性能条目
   */
  private _processResourceEntry(entry: ResourcePerformanceEntry): void {
    const times = this._entryTimes(entry);
    const name = collectUrlName(entry.name);
    startSpan(
      {
        name: `Resource: ${name}`,
        op: 'resource',
        startTime: times.start,
        attributes: automaticSpanAttributes(
          this._client,
          {
            'resource.name': name,
            'resource.duration': entry.duration,
            'resource.type': entry.initiatorType || 'unknown',
            'resource.transfer_size': entry.transferSize || 0,
            'resource.encoded_size': entry.encodedBodySize || 0,
            'resource.decoded_size': entry.decodedBodySize || 0,
            ...(entry.fetchStart && entry.responseEnd
              ? {
                  'resource.fetch_start': entry.fetchStart,
                  'resource.response_end': entry.responseEnd,
                  'resource.network_time': entry.responseEnd - entry.fetchStart,
                }
              : {}),
          },
          false,
        ),
      },
      (span) => {
        if (this._isActiveClient()) span.end(times.end);
      },
    );
  }

  /**
   * 处理用户自定义性能条目
   */
  private _processUserTimingEntry(entry: UserTimingPerformanceEntry): void {
    const times = this._entryTimes(entry);
    if (entry.entryType === 'measure') {
      startSpan(
        {
          name: `Measure: ${entry.name}`,
          op: 'measure',
          startTime: times.start,
          attributes: automaticSpanAttributes(
            this._client,
            {
              'measure.name': entry.name,
              'measure.duration': entry.duration,
              'measure.detail': entry.detail ? JSON.stringify(entry.detail) : undefined,
            },
            false,
          ),
        },
        (span) => {
          if (this._isActiveClient()) span.end(times.end);
        },
      );
    } else if (entry.entryType === 'mark') {
      // 标记事件作为面包屑记录
      const scope = getCurrentScope();
      scope.addBreadcrumb({
        message: `性能标记: ${entry.name}`,
        category: 'performance.mark',
        level: 'info',
        data: {
          timestamp: times.start * 1000,
          detail: entry.detail,
        },
      });
    }
  }

  /**
   * 添加到缓冲区
   */
  private _addToBuffer(entry: PerformanceEntry): void {
    this._entryBuffer.push(entry);

    // 缓冲区溢出处理：移除最早的条目
    while (this._entryBuffer.length > this._options.bufferSize) {
      this._entryBuffer.shift();
    }
  }

  /** 开始定时汇总性能条目 */
  private _startAutoReporting(): void {
    if (!this._performanceManager || this._options.reportInterval <= 0) {
      return;
    }

    const timer = setInterval(() => {
      this._observe(() => this._reportBufferedEntries());
    }, this._options.reportInterval);
    if (this._isActiveClient()) this._reportTimer = timer;
    else clearInterval(timer);
  }

  /** 汇总缓冲的性能条目，并写入当前 Sentry scope */
  private _reportBufferedEntries(finalizing = false): void {
    const lifetime = this._client && getClientLifetime(this._client);
    const accepted = (): boolean =>
      finalizing ? !!this._client && !!lifetime?.acceptsTelemetry() : this._isActiveClient();
    if (!accepted() || this._entryBuffer.length === 0) {
      return;
    }

    try {
      // 计算性能统计
      const stats = this._calculatePerformanceStats();

      // 采集内存信息
      const memoryInfo = this._collectMemoryInfo();
      if (memoryInfo) {
        stats['memory'] = memoryInfo;
      }

      if (!accepted()) return;
      setClientContext(this._client, 'performance_summary', {
        total_entries: this._entryBuffer.length,
        navigation_count: this._entryBuffer.filter((e) => e.entryType === 'navigation').length,
        render_count: this._entryBuffer.filter((e) => e.entryType === 'render').length,
        resource_count: this._entryBuffer.filter((e) => e.entryType === 'resource').length,
        measure_count: this._entryBuffer.filter((e) => e.entryType === 'measure').length,
        mark_count: this._entryBuffer.filter((e) => e.entryType === 'mark').length,
        report_time: new Date().toISOString(),
        ...stats,
      });

      // 成功提交后先释放窗口，用户 breadcrumb 重入关闭不能再提交同一批。
      this._entryBuffer = [];
      if (accepted()) this._checkPerformanceThresholds(stats);
    } catch (error) {
      console.warn('[sentry-miniapp] Failed to summarize buffered performance entries:', error);
    }
  }

  /**
   * 计算性能统计数据
   */
  private _calculatePerformanceStats(): Record<string, any> {
    const navigationEntries = this._entryBuffer.filter((e) => e.entryType === 'navigation');
    const renderEntries = this._entryBuffer.filter((e) => e.entryType === 'render');
    const resourceEntries = this._entryBuffer.filter((e) => e.entryType === 'resource');

    const stats: Record<string, any> = {};

    // 导航性能统计
    if (navigationEntries.length > 0) {
      const durations = navigationEntries.map((e) => e.duration);
      stats['navigation_stats'] = {
        avg_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
        max_duration: Math.max(...durations),
        min_duration: Math.min(...durations),
      };
    }

    // 渲染性能统计
    if (renderEntries.length > 0) {
      const durations = renderEntries.map((e) => e.duration);
      stats['render_stats'] = {
        avg_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
        max_duration: Math.max(...durations),
        min_duration: Math.min(...durations),
      };

      const slowRenders = renderEntries.filter(
        (e) => e.duration > (this._options.thresholds?.setData ?? 50),
      );
      stats['render_stats'].slow_render_count = slowRenders.length;
      stats['render_stats'].slow_render_ratio = slowRenders.length / renderEntries.length;
    }

    // 资源加载统计
    if (resourceEntries.length > 0) {
      const durations = resourceEntries.map((e) => e.duration);
      const sizes = resourceEntries
        .map((e) => (e as ResourcePerformanceEntry).transferSize || 0)
        .filter((size) => size > 0);

      stats['resource_stats'] = {
        avg_load_time: durations.reduce((a, b) => a + b, 0) / durations.length,
        max_load_time: Math.max(...durations),
        total_transfer_size: sizes.reduce((a, b) => a + b, 0),
        avg_transfer_size: sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
      };
    }

    return stats;
  }

  /**
   * 检查性能阈值
   */
  private _checkPerformanceThresholds(stats: Record<string, any>): void {
    const scope = getCurrentScope();

    // 检查导航性能
    const navigationThreshold = this._options.thresholds?.navigation ?? 3000;
    if (stats['navigation_stats']?.avg_duration > navigationThreshold) {
      scope.addBreadcrumb({
        message: '页面导航性能较慢',
        category: 'performance.warning',
        level: 'warning',
        data: {
          avg_duration: stats['navigation_stats'].avg_duration,
          threshold: navigationThreshold,
        },
      });
    }

    // 检查渲染性能
    const renderThreshold = this._options.thresholds?.render ?? 1000;
    if (stats['render_stats']?.avg_duration > renderThreshold) {
      scope.addBreadcrumb({
        message: '页面渲染性能较慢',
        category: 'performance.warning',
        level: 'warning',
        data: {
          avg_duration: stats['render_stats'].avg_duration,
          threshold: renderThreshold,
        },
      });
    }

    // 检查资源加载
    const resourceThreshold = this._options.thresholds?.resource ?? 2000;
    if (stats['resource_stats']?.avg_load_time > resourceThreshold) {
      scope.addBreadcrumb({
        message: '资源加载性能较慢',
        category: 'performance.warning',
        level: 'warning',
        data: {
          avg_load_time: stats['resource_stats'].avg_load_time,
          threshold: resourceThreshold,
        },
      });
    }
  }

  /**
   * 采集内存信息
   */
  private _collectMemoryInfo(): Record<string, any> | null {
    if (!this._options.enableMemory) return null;

    try {
      const currentSdk = sdk();
      if (currentSdk.getPerformance) {
        const perf = currentSdk.getPerformance();
        // 微信小程序 performance 对象可能包含 memory 信息
        if (perf && (perf as any).memory) {
          return {
            jsHeapSizeUsed: (perf as any).memory.jsHeapSizeUsed,
            jsHeapSizeLimit: (perf as any).memory.jsHeapSizeLimit,
          };
        }
      }
    } catch (_e) {
      // Silently ignore
    }
    return null;
  }

  /**
   * 添加性能上下文信息
   */
  private _addPerformanceContext(): void {
    try {
      const currentSdk = sdk();

      // 检查 Performance API 支持情况
      const hasPerformanceAPI = !!currentSdk.getPerformance;
      if (!this._isActiveClient()) return;

      if (this._client) getClientEnvironment(this._client).tags['performance.api.available'] = true;
      setClientSpanDimension(this._client, 'performance.api.available', true);
      setClientContext(this._client, 'performance', {
        api_version: 'miniapp-1.0',
        sample_rate: this._options.sampleRate,
        buffer_size: this._options.bufferSize,
      });

      setClientContext(this._client, 'performance_support', {
        has_performance_api: hasPerformanceAPI,
        integration_enabled: true,
        options: this._options,
      });

      if (this._client)
        getClientEnvironment(this._client).tags['performance.integration'] = 'enabled';
      setClientSpanDimension(this._client, 'performance.integration', 'enabled');
    } catch (error) {
      console.warn('[sentry-miniapp] Failed to add performance context:', error);
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    const owner = this._owner;
    this._owner = undefined;
    this._client = undefined;
    owner?.release();
    const observers = this._observers;
    this._observers = [];
    const timer = this._reportTimer;
    this._reportTimer = null;
    this._entryBuffer = [];
    this._performanceManager = null;
    this._relativeTimeOrigin = null;
    this._setupEpochMilliseconds = null;
    if (timer !== null) clearInterval(timer);
    for (const observer of observers) {
      try {
        observer.disconnect();
      } catch (_error) {
        /* 解除失败不阻断其余资源。 */
      }
    }
  }

  private _isActiveClient(): boolean {
    return !!this._owner?.isActive();
  }
}

/** 配置对象可复用；每次 setup 的 observer、timer 与状态归属独立 client。 */
export class PerformanceIntegration implements Integration {
  public static id = 'PerformanceAPI';
  public name = PerformanceIntegration.id;
  private readonly _clients = new WeakSet<Client>();
  private readonly _cleanups = new Set<() => void>();

  private readonly _options: PerformanceIntegrationOptions;

  public constructor(options: PerformanceIntegrationOptions = {}) {
    this._options = { ...options };
    if (options.thresholds) this._options.thresholds = { ...options.thresholds };
  }

  public setup(client: Client): void {
    if (this._clients.has(client)) return;
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    const controller = new PerformanceController(this._options);
    this._clients.add(client);
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      controller.cleanup();
      this._clients.delete(client);
      this._cleanups.delete(cleanup);
    };
    this._cleanups.add(cleanup);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
    controller.setup(client);
  }

  public cleanup(): void {
    for (const cleanup of [...this._cleanups]) cleanup();
  }
}

export const performanceIntegration = ((
  options?: PerformanceIntegrationOptions,
): PerformanceIntegration => new PerformanceIntegration(options)) satisfies IntegrationFn;
