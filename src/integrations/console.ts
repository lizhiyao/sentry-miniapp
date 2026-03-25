import { addBreadcrumb } from '@sentry/core';
import type { Integration, SeverityLevel } from '@sentry/core';

const CONSOLE_LEVELS = ['debug', 'info', 'warn', 'error', 'log'] as const;

type ConsoleLevel = (typeof CONSOLE_LEVELS)[number];

const LEVEL_TO_SEVERITY: Record<ConsoleLevel, SeverityLevel> = {
  debug: 'debug',
  info: 'info',
  log: 'info',
  warn: 'warning',
  error: 'error',
};

/**
 * Console 面包屑集成配置
 */
export interface ConsoleBreadcrumbsOptions {
  /** 要拦截的 console 级别（默认全部） */
  levels?: ConsoleLevel[];
}

/**
 * Console 面包屑集成
 *
 * 拦截 console.log/info/warn/error/debug，将输出记录为面包屑，
 * 帮助在 Sentry 后台重放用户操作时看到开发者的日志输出。
 *
 * 默认不启用，需通过 enableConsoleBreadcrumbs: true 开启。
 */
export class ConsoleBreadcrumbs implements Integration {
  public static id: string = 'ConsoleBreadcrumbs';
  public name: string = ConsoleBreadcrumbs.id;

  private _levels: ConsoleLevel[];
  private _originalMethods: Partial<Record<ConsoleLevel, (...args: any[]) => void>> = {};

  constructor(options: ConsoleBreadcrumbsOptions = {}) {
    this._levels = options.levels || [...CONSOLE_LEVELS];
  }

  public setupOnce(): void {
    for (const level of this._levels) {
      if (typeof console[level] !== 'function') continue;

      const original = console[level];
      this._originalMethods[level] = original;

      console[level] = function (...args: any[]) {
        addBreadcrumb({
          category: 'console',
          level: LEVEL_TO_SEVERITY[level],
          message: args
            .map((a) => {
              if (typeof a === 'string') return a;
              try {
                return JSON.stringify(a);
              } catch (_e) {
                return String(a);
              }
            })
            .join(' '),
        });

        return original.apply(console, args);
      };
    }
  }

  /**
   * 清理资源，恢复原始 console 方法
   */
  public cleanup(): void {
    for (const level of this._levels) {
      const original = this._originalMethods[level];
      if (original) {
        console[level] = original;
      }
    }
    this._originalMethods = {};
  }
}

/**
 * Console 面包屑集成工厂函数
 */
export const consoleBreadcrumbsIntegration = (options?: ConsoleBreadcrumbsOptions) => {
  return new ConsoleBreadcrumbs(options);
};
