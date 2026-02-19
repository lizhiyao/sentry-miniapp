import { getCurrentScope } from '@sentry/core';
import type { Integration, IntegrationFn } from '@sentry/core';
import { startSpan } from '@sentry/core';

import { 
  getPerformanceManager, 
  sdk,
  type PerformanceEntry,
  type NavigationPerformanceEntry,
  type RenderPerformanceEntry,
  type ResourcePerformanceEntry,
  type UserTimingPerformanceEntry,
  type PerformanceManager,
  type PerformanceObserver
} from '../crossPlatform';

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
  /** 自动上报间隔 (毫秒) */
  reportInterval?: number;
}

/** Performance API 集成 */
export class PerformanceIntegration implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'PerformanceAPI';

  /**
   * @inheritDoc
   */
  public name: string = PerformanceIntegration.id;

  private _options: Required<PerformanceIntegrationOptions>;
  private _performanceManager: PerformanceManager | null = null;
  private _observers: PerformanceObserver[] = [];
  private _entryBuffer: PerformanceEntry[] = [];
  private _reportTimer: any = null;

  constructor(options: PerformanceIntegrationOptions = {}) {
    this._options = {
      enableNavigation: true,
      enableRender: true,
      enableResource: true,
      enableUserTiming: true,
      sampleRate: 1.0,
      bufferSize: 100,
      reportInterval: 30000, // 30秒
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    this._initializePerformanceManager();
    this._setupPerformanceObservers();
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
        console.warn('[Sentry Performance] Performance API not available');
        return;
      }

      // 设置性能监控标签
      const scope = getCurrentScope();
      scope.setTag('performance.api.available', true);
      scope.setContext('performance', {
        api_version: 'miniapp-1.0',
        sample_rate: this._options.sampleRate,
        buffer_size: this._options.bufferSize,
      });
    } catch (error) {
      console.warn('[Sentry Performance] Failed to initialize performance manager:', error);
    }
  }

  /**
   * 设置性能观察者
   */
  private _setupPerformanceObservers(): void {
    if (!this._performanceManager) {
      return;
    }

    try {
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
      if (this._options.enableUserTiming) {
        entryTypes.push('measure', 'mark');
      }

      if (entryTypes.length === 0) {
        return;
      }

      // 创建性能观察者
      const observer = this._performanceManager.createObserver((entries) => {
        this._handlePerformanceEntries(entries);
      });

      try {
        observer.observe({ entryTypes });
      } catch (e) {
        // 如果失败（例如微信小程序不支持 measure/mark），尝试移除这些类型后重试
        const safeTypes = entryTypes.filter(t => t !== 'measure' && t !== 'mark');
        
        if (safeTypes.length < entryTypes.length && safeTypes.length > 0) {
          // 降级重试
          observer.observe({ entryTypes: safeTypes });
          console.warn('[Sentry Performance] Failed to observe all types, falling back to:', safeTypes);
          
          // 更新 entryTypes 以便日志记录正确
          entryTypes.length = 0;
          entryTypes.push(...safeTypes);
        } else {
          throw e; // 如果没有可降级的类型或仍然失败，则抛出
        }
      }

      this._observers.push(observer);

      console.log('[Sentry Performance] Performance observers setup for:', entryTypes);
    } catch (error) {
      console.warn('[Sentry Performance] Failed to setup performance observers:', error);
    }
  }

  /**
   * 处理性能条目
   */
  private _handlePerformanceEntries(entries: PerformanceEntry[] | any): void {
    if (!entries) {
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
      console.warn('[Sentry Performance] Invalid entries format:', typeof entries);
      return;
    }

    if (entriesArray.length === 0) {
      return;
    }

    // 采样控制
    if (Math.random() > this._options.sampleRate) {
      return;
    }

    entriesArray.forEach(entry => {
      try {
        this._processPerformanceEntry(entry);
        this._addToBuffer(entry);
      } catch (error) {
        console.warn('[Sentry Performance] Failed to process performance entry:', error);
      }
    });
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
        console.log('[Sentry Performance] Unknown entry type:', entry.entryType);
    }
  }

  /**
   * 处理导航性能条目
   */
  private _processNavigationEntry(entry: NavigationPerformanceEntry): void {
    // 添加面包屑
    const scope = getCurrentScope();
    scope.addBreadcrumb({
      message: `页面导航: ${entry.name}`,
      category: 'performance.navigation',
      level: 'info',
      data: {
        duration: entry.duration,
        appLaunchTime: entry.appLaunchTime,
        pageReadyTime: entry.pageReadyTime,
      },
    });

    startSpan({
      name: `Navigation: ${entry.name}`,
      op: 'navigation',
      startTime: entry.startTime / 1000, // 转换为秒
    }, (span) => {
      span.setAttributes({
        'navigation.name': entry.name,
        'navigation.duration': entry.duration,
        'navigation.app_launch_time': entry.appLaunchTime || 0,
        'navigation.page_ready_time': entry.pageReadyTime || 0,
        'navigation.first_render_time': entry.firstRenderTime || 0,
      });

      span.end((entry.startTime + entry.duration) / 1000);
    });
  }

  /**
   * 处理渲染性能条目
   */
  private _processRenderEntry(entry: RenderPerformanceEntry): void {
    startSpan({
      name: `Render: ${entry.name}`,
      op: 'render',
      startTime: entry.startTime / 1000,
    }, (span) => {
      span.setAttributes({
        'render.name': entry.name,
        'render.duration': entry.duration,
        'render.start': entry.renderStart || 0,
        'render.end': entry.renderEnd || 0,
        'render.script_start': entry.scriptStart || 0,
        'render.script_end': entry.scriptEnd || 0,
      });

      span.end((entry.startTime + entry.duration) / 1000);
    });
  }

  /**
   * 处理资源加载性能条目
   */
  private _processResourceEntry(entry: ResourcePerformanceEntry): void {
    startSpan({
      name: `Resource: ${entry.name}`,
      op: 'resource',
      startTime: entry.startTime / 1000,
    }, (span) => {
      span.setAttributes({
        'resource.name': entry.name,
        'resource.duration': entry.duration,
        'resource.type': entry.initiatorType || 'unknown',
        'resource.transfer_size': entry.transferSize || 0,
        'resource.encoded_size': entry.encodedBodySize || 0,
        'resource.decoded_size': entry.decodedBodySize || 0,
      });

      // 网络时序信息
      if (entry.fetchStart && entry.responseEnd) {
        span.setAttributes({
          'resource.fetch_start': entry.fetchStart,
          'resource.response_end': entry.responseEnd,
          'resource.network_time': entry.responseEnd - entry.fetchStart,
        });
      }

      span.end((entry.startTime + entry.duration) / 1000);
    });
  }

  /**
   * 处理用户自定义性能条目
   */
  private _processUserTimingEntry(entry: UserTimingPerformanceEntry): void {
    if (entry.entryType === 'measure') {
      startSpan({
        name: `Measure: ${entry.name}`,
        op: 'measure',
        startTime: entry.startTime / 1000,
      }, (span) => {
        span.setAttributes({
          'measure.name': entry.name,
          'measure.duration': entry.duration,
          'measure.detail': entry.detail ? JSON.stringify(entry.detail) : undefined,
        });

        span.end((entry.startTime + entry.duration) / 1000);
      });
    } else if (entry.entryType === 'mark') {
      // 标记事件作为面包屑记录
      const scope = getCurrentScope();
      scope.addBreadcrumb({
        message: `性能标记: ${entry.name}`,
        category: 'performance.mark',
        level: 'info',
        data: {
          timestamp: entry.startTime,
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
    
    // 缓冲区溢出处理
    if (this._entryBuffer.length > this._options.bufferSize) {
      this._entryBuffer = this._entryBuffer.slice(-this._options.bufferSize);
    }
  }

  /**
   * 开始自动上报
   */
  private _startAutoReporting(): void {
    if (this._options.reportInterval <= 0) {
      return;
    }

    this._reportTimer = setInterval(() => {
      this._reportBufferedEntries();
    }, this._options.reportInterval);
  }

  /**
   * 上报缓冲的性能条目
   */
  private _reportBufferedEntries(): void {
    if (this._entryBuffer.length === 0) {
      return;
    }

    try {
      const scope = getCurrentScope();
      
      // 计算性能统计
      const stats = this._calculatePerformanceStats();
      
      scope.setContext('performance_summary', {
        total_entries: this._entryBuffer.length,
        navigation_count: this._entryBuffer.filter(e => e.entryType === 'navigation').length,
        render_count: this._entryBuffer.filter(e => e.entryType === 'render').length,
        resource_count: this._entryBuffer.filter(e => e.entryType === 'resource').length,
        measure_count: this._entryBuffer.filter(e => e.entryType === 'measure').length,
        mark_count: this._entryBuffer.filter(e => e.entryType === 'mark').length,
        report_time: new Date().toISOString(),
        ...stats,
      });

      // 检查性能阈值并发送警告
      this._checkPerformanceThresholds(stats);

      // 使用小程序原生 API 上报性能数据
      this._reportToNativeAPI();

      // 清空缓冲区
      this._entryBuffer = [];
    } catch (error) {
      console.warn('[Sentry Performance] Failed to report buffered entries:', error);
    }
  }

  /**
   * 计算性能统计数据
   */
  private _calculatePerformanceStats(): Record<string, any> {
    const navigationEntries = this._entryBuffer.filter(e => e.entryType === 'navigation');
    const renderEntries = this._entryBuffer.filter(e => e.entryType === 'render');
    const resourceEntries = this._entryBuffer.filter(e => e.entryType === 'resource');
    
    const stats: Record<string, any> = {};
    
    // 导航性能统计
     if (navigationEntries.length > 0) {
       const durations = navigationEntries.map(e => e.duration);
       stats['navigation_stats'] = {
         avg_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
         max_duration: Math.max(...durations),
         min_duration: Math.min(...durations),
       };
     }
     
     // 渲染性能统计
     if (renderEntries.length > 0) {
       const durations = renderEntries.map(e => e.duration);
       stats['render_stats'] = {
         avg_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
         max_duration: Math.max(...durations),
         min_duration: Math.min(...durations),
       };
     }
     
     // 资源加载统计
     if (resourceEntries.length > 0) {
       const durations = resourceEntries.map(e => e.duration);
       const sizes = resourceEntries
         .map(e => (e as ResourcePerformanceEntry).transferSize || 0)
         .filter(size => size > 0);
       
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
     if (stats['navigation_stats']?.avg_duration > 3000) {
       scope.addBreadcrumb({
         message: '页面导航性能较慢',
         category: 'performance.warning',
         level: 'warning',
         data: {
           avg_duration: stats['navigation_stats'].avg_duration,
           threshold: 3000,
         },
       });
     }
     
     // 检查渲染性能
     if (stats['render_stats']?.avg_duration > 1000) {
       scope.addBreadcrumb({
         message: '页面渲染性能较慢',
         category: 'performance.warning',
         level: 'warning',
         data: {
           avg_duration: stats['render_stats'].avg_duration,
           threshold: 1000,
         },
       });
     }
     
     // 检查资源加载
     if (stats['resource_stats']?.avg_load_time > 2000) {
       scope.addBreadcrumb({
         message: '资源加载性能较慢',
         category: 'performance.warning',
         level: 'warning',
         data: {
           avg_load_time: stats['resource_stats'].avg_load_time,
           threshold: 2000,
         },
       });
     }
  }

  /**
   * 使用小程序原生 API 上报性能数据
   */
  private _reportToNativeAPI(): void {
    try {
      const currentSdk = sdk();
      if (currentSdk.reportPerformance && this._entryBuffer.length > 0) {
        const performanceData = {
          entries: this._entryBuffer.map(entry => ({
            name: entry.name,
            entryType: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration,
          })),
          timestamp: Date.now(),
          sampleRate: this._options.sampleRate,
        };
        
        currentSdk.reportPerformance(performanceData);
      }
    } catch (error) {
      console.warn('[Sentry Performance] Failed to report to native API:', error);
    }
  }

  /**
   * 添加性能上下文信息
   */
  private _addPerformanceContext(): void {
    try {
      const scope = getCurrentScope();
      const currentSdk = sdk();
      
      // 检查 Performance API 支持情况
      const hasPerformanceAPI = !!(currentSdk.getPerformance);
      const hasReportAPI = !!(currentSdk.reportPerformance);
      
      scope.setContext('performance_support', {
        has_performance_api: hasPerformanceAPI,
        has_report_api: hasReportAPI,
        integration_enabled: true,
        options: this._options,
      });

      scope.setTag('performance.integration', 'enabled');
    } catch (error) {
      console.warn('[Sentry Performance] Failed to add performance context:', error);
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    // 断开所有观察者
    this._observers.forEach(observer => {
      try {
        observer.disconnect();
      } catch (error) {
        console.warn('[Sentry Performance] Failed to disconnect observer:', error);
      }
    });
    this._observers = [];

    // 清除定时器
    if (this._reportTimer) {
      clearInterval(this._reportTimer);
      this._reportTimer = null;
    }

    // 最后一次上报
    this._reportBufferedEntries();
  }
}

/**
 * Performance API 集成工厂函数
 */
export const performanceIntegration = (options?: PerformanceIntegrationOptions): IntegrationFn => {
  return () => new PerformanceIntegration(options);
};