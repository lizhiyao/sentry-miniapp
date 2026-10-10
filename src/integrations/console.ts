import { getClientLifetime, withTelemetryCritical } from '../lifecycle';
import { addBreadcrumb, getClient } from '@sentry/core';
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

  constructor(options: ConsoleBreadcrumbsOptions = {}) {
    this._levels = options.levels || [...CONSOLE_LEVELS];
  }

  public setupOnce(): void {
    for (const level of this._levels) {
      ensureFunctionInstrumentation(console, level);
    }
  }

  public setup(client: Client): void {
    const lifetime = getClientLifetime(client);
    if (lifetime && !lifetime.canCollectAutomatic()) return;
    const isActive = (): boolean =>
      getClient() === client &&
      client.getOptions().enabled !== false &&
      (!lifetime || lifetime.canCollectAutomatic());
    const cleanups: Array<() => void> = [];
    for (const level of this._levels) {
      cleanups.push(
        addFunctionInstrumentationHandler(console, level, client, (original, thisArg, args) =>
          this._handleConsole(isActive, level, original, thisArg, args),
        ),
      );
    }
    const cleanup = this._trackCleanup(cleanups);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
  }

  private _handleConsole(
    isActive: () => boolean,
    level: ConsoleLevel,
    original: Function,
    thisArg: unknown,
    args: unknown[],
  ): unknown {
    try {
      withTelemetryCritical(() => {
        const parts: string[] = [];
        for (const arg of args) {
          if (!isActive()) return;
          if (typeof arg === 'string') {
            parts.push(arg);
            continue;
          }
          let serialized: string | undefined;
          try {
            serialized = JSON.stringify(arg);
          } catch (_error) {
            /* 活动 client 的不可序列化参数回落到 String。 */
          }
          if (!isActive()) return;
          parts.push(serialized ?? String(arg));
        }
        if (!isActive()) return;
        addBreadcrumb({
          category: 'console',
          level: LEVEL_TO_SEVERITY[level],
          message: parts.join(' '),
        });
      });
    } catch (_error) {
      /* SDK 格式化/采集故障不影响原 console。 */
    }

    return Function.prototype.apply.call(original, thisArg ?? console, args);
  }

  private _trackCleanup(cleanups: Array<() => void>): () => void {
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      for (const callback of cleanups.splice(0).reverse()) {
        try {
          callback();
        } catch (_error) {
          /* 继续解除其余订阅。 */
        }
      }
    };
    return cleanup;
  }
}

/**
 * Console 面包屑集成工厂函数
 */
export const consoleBreadcrumbsIntegration = (options?: ConsoleBreadcrumbsOptions): Integration => {
  return new ConsoleBreadcrumbs(options);
};
