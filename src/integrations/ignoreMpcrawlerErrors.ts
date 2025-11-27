import { addEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, Integration } from '@sentry/types';

import { appName, sdk } from "../crossPlatform";

/**
 * IgnoreMpcrawlerErrors
 *
 * https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/sitemap.html
 */
export class IgnoreMpcrawlerErrors implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = "IgnoreMpcrawlerErrors";
  /**
   * @inheritDoc
   */
  public name: string = IgnoreMpcrawlerErrors.id;
  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addEventProcessor((event: Event) => {
      if (
        getCurrentHub().getIntegration(IgnoreMpcrawlerErrors) &&
        appName === "wechat" &&
        sdk.getLaunchOptionsSync
      ) {
        const options = sdk.getLaunchOptionsSync();

        if (options.scene === 1129) {
          return null;
        }
      }

      return event;
    });
  }
}
