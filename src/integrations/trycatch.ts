import type { Integration, IntegrationFn } from '@sentry/core';

import { wrap, fill, getFunctionName } from '../helpers';

/** Wrap timer functions and event targets to catch errors and provide better meta data */
export class TryCatch implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'TryCatch';

  /**
   * @inheritDoc
   */
  public name: string = TryCatch.id;

  /** JSDoc */
  private _wrapTimeFunction(original: (...args: any[]) => any): (...args: any[]) => any {
    return function (this: any, ...args: any[]): any {
      const originalCallback = args[0];
      args[0] = wrap(originalCallback, {
        mechanism: {
          data: { function: getFunctionName(original) },
          handled: true,
          type: 'instrument',
        },
      });
      return original.apply(this, args);
    };
  }

  /** JSDoc */
  private _wrapRAF(original: any): (callback: () => void) => any {
    return function (this: any, callback: () => void): any {
      return original(
        wrap(callback, {
          mechanism: {
            data: {
              function: 'requestAnimationFrame',
              handler: getFunctionName(original),
            },
            handled: true,
            type: 'instrument',
          },
        }),
      );
    };
  }

  /**
   * Wrap timer functions and event targets to catch errors
   * and provide better metadata.
   */
  public setupOnce(): void {
    // In miniapp environment, we mainly focus on wrapping common async functions
    const global = globalThis as any;

    if (global.setTimeout) {
      fill(global, 'setTimeout', this._wrapTimeFunction.bind(this));
    }
    if (global.setInterval) {
      fill(global, 'setInterval', this._wrapTimeFunction.bind(this));
    }
    if (global.requestAnimationFrame) {
      fill(global, 'requestAnimationFrame', this._wrapRAF.bind(this));
    }
  }
}

/**
 * TryCatch integration
 */
export const tryCatchIntegration: IntegrationFn = () => {
  return new TryCatch();
};
