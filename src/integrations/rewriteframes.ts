import { rewriteFramesIntegration as coreRewriteFramesIntegration } from '@sentry/core';
import type { Event, Integration, Exception, StackFrame } from '@sentry/core';

const DEFAULT_PREFIX = 'app:///';

/** 将各小程序宿主的虚拟路径归一化为 sentry-cli 可匹配的 app:/// 路径。 */
export function normalizeMiniappFrameFilename(
  filename: string,
  prefix: string = DEFAULT_PREFIX,
): string {
  if (filename.startsWith(prefix)) return filename;

  const normalized = filename
    .replace(/^(appservice|app-service|WAService)\//i, '')
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^chunks:\/\/\/?/i, 'chunks/')
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^\//, '');

  return `${prefix}${normalized}`;
}

/** 官方 RewriteFrames 处理器 + 小程序路径归一化规则。 */
export const rewriteFramesIntegration = (options: { prefix?: string } = {}): Integration => {
  const prefix = options.prefix || DEFAULT_PREFIX;
  return coreRewriteFramesIntegration({
    iteratee: (frame) =>
      frame.filename
        ? { ...frame, filename: normalizeMiniappFrameFilename(frame.filename, prefix) }
        : frame,
  });
};

/**
 * Normalize miniapp stack trace paths to a standard format for source map resolution.
 * E.g., 'appservice/pages/index.js' -> 'app:///pages/index.js'
 */
export class RewriteFrames implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'RewriteFrames';

  /**
   * @inheritDoc
   */
  public name: string = RewriteFrames.id;

  /**
   * Optional prefix to append to the normalized path. Defaults to 'app:///'
   */
  private readonly _prefix: string;

  public constructor(options: { prefix?: string } = {}) {
    this._prefix = options.prefix || DEFAULT_PREFIX;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // In Sentry v10, we usually use addGlobalEventProcessor or similar to add an event processor
    // For integrations, we can just return the processor in processEvent or register it globally.
    // However, the cleanest way in v10 is to use `processEvent`.
  }

  /**
   * @inheritDoc
   */
  public processEvent(event: Event): Event {
    if (event.exception && event.exception.values) {
      event.exception.values.forEach((exception: Exception) => {
        if (exception.stacktrace && exception.stacktrace.frames) {
          exception.stacktrace.frames.forEach((frame: StackFrame) => {
            if (frame.filename) {
              frame.filename = this._normalizeFilename(frame.filename);
            }
          });
        }
      });
    }
    return event;
  }

  /**
   * Normalizes a filename from various miniapp platforms
   */
  private _normalizeFilename(filename: string): string {
    return normalizeMiniappFrameFilename(filename, this._prefix);
  }
}
