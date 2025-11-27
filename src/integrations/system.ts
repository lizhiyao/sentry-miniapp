import { addEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, Integration } from '@sentry/types';

import { appName as currentAppName, sdk } from "../crossPlatform";

/** UserAgent */
export class System implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = "System";
  /**
   * @inheritDoc
   */
  public name: string = System.id;
  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addEventProcessor((event: Event) => {
      const currentHub = getCurrentHub();
      if (currentHub.getIntegration(System)) {
        try {
          const systemInfo = sdk.getSystemInfoSync();
          const {
            SDKVersion = "0.0.0",
            batteryLevel, // 微信小程序
            currentBattery, // 支付宝小程序、 钉钉小程序
            battery, // 字节跳动小程序
            brand,
            language,
            model,
            pixelRatio,
            platform,
            screenHeight,
            screenWidth,
            // statusBarHeight,
            system,
            version,
            // windowHeight,
            // windowWidth,
            app, // 支付宝小程序
            appName, // 字节跳动小程序
            // fontSizeSetting, // 支付宝小程序、 钉钉小程序、微信小程序
          } = systemInfo;
          const [systemName, systemVersion] = system.split(" ");

          currentHub.setTag("SDKVersion", SDKVersion);

          const appDisplay = app || appName || currentAppName || "app" // wechat

          return {
            ...event,
            contexts: {
              ...event.contexts,
              device: {
                brand,
                battery_level: batteryLevel || currentBattery || battery,
                model,
                language,
                platform,
                screen_dpi: pixelRatio,
                screen_height: screenHeight,
                screen_width: screenWidth,
              },
              os: {
                name: systemName || system,
                version: systemVersion || system
              },
              browser: {
                name: appDisplay,
                version: version,
              },
            }
          };
        } catch (e) {
          console.warn(`sentry-miniapp get system info fail: ${e}`);
        }
      }

      return event;
    });
  }
}
