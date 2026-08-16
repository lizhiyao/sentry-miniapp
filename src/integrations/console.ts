import { addBreadcrumb } from '@sentry/core';
import type { Client, Integration, SeverityLevel } from '@sentry/core';

import {
  addFunctionInstrumentationHandler,
  ensureFunctionInstrumentation,
} from '../instrumentation';

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

  private readonly _levels: ConsoleLevel[];
  private readonly _cleanupCallbacks = new Set<() => void>();

  constructor(options: ConsoleBreadcrumbsOptions = {}) {
    this._levels = options.levels || [...CONSOLE_LEVELS];
  }

  public setupOnce(): void {
    for (const level of this._levels) {
      if (typeof console[level] !== 'function') continue;
      ensureFunctionInstrumentation(console, level);
    }
  }

  public setup(client: Client): void {
    const cleanups: Array<() => void> = [];
    for (const level of this._levels) {
      if (typeof console[level] !== 'function') continue;
      cleanups.push(
        addFunctionInstrumentationHandler(console, level, client, (original, thisArg, args) =>
          this._handleConsole(level, original, thisArg, args),
        ),
      );
    }
    const cleanup = this._trackCleanup(cleanups);
    client.registerCleanup(cleanup);
  }

  private _handleConsole(
    level: ConsoleLevel,
    original: Function,
    thisArg: unknown,
    args: unknown[],
  ): unknown {
    addBreadcrumb({
      category: 'console',
      level: LEVEL_TO_SEVERITY[level],
      message: args
        .map((arg) => {
          if (typeof arg === 'string') return arg;
          try {
            return JSON.stringify(arg);
          } catch (_e) {
            return String(arg);
          }
        })
        .join(' '),
    });

    return original.apply(thisArg ?? console, args);
  }

  /**
   * 清理资源，恢复原始 console 方法
   */
  public cleanup(): void {
    for (const cleanup of [...this._cleanupCallbacks]) cleanup();
  }

  private _trackCleanup(cleanups: Array<() => void>): () => void {
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      for (const callback of cleanups.reverse()) callback();
      this._cleanupCallbacks.delete(cleanup);
    };
    this._cleanupCallbacks.add(cleanup);
    return cleanup;
  }
}

/**
 * Console 面包屑集成工厂函数
 */
export const consoleBreadcrumbsIntegration = (options?: ConsoleBreadcrumbsOptions) => {
  return new ConsoleBreadcrumbs(options);
};
