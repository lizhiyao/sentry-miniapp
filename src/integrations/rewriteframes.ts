import type { Event, Integration, Exception, StackFrame } from '@sentry/core';

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
    this._prefix = options.prefix || 'app:///';
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
    let normalized = filename;

    // Remove common platform prefixes
    // WeChat: appservice/, app-service/, WAService.js
    // Alipay: https://appx/...
    // ByteDance: tt://...
    normalized = normalized
      .replace(/^(appservice|app-service|WAService)\//i, '')
      .replace(/^https?:\/\/[^/]+\//i, '') // Remove alipay http(s) protocol and domain
      .replace(/^[a-z]+:\/\//i, '') // Remove other protocols like tt://, swan://
      .replace(/^\//, ''); // Remove leading slash if any

    // Prevent double prefixing if it's already an absolute path
    if (normalized.startsWith(this._prefix)) {
      return normalized;
    }

    return `${this._prefix}${normalized}`;
  }
}
