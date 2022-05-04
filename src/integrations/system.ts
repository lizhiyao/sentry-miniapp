import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";

import { appName as currentAppName, sdk } from "../crossPlatform";

/** UserAgent */
export class System implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = System.id;

  /**
   * @inheritDoc
   */
  public static id: string = "System";

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event) => {
      if (getCurrentHub().getIntegration(System)) {
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
            statusBarHeight,
            system,
            version,
            windowHeight,
            windowWidth,
            app, // 支付宝小程序
            appName, // 字节跳动小程序
            fontSizeSetting, // 支付宝小程序、 钉钉小程序、微信小程序
          } = systemInfo;
          const [systemName, systemVersion] = system.split(" ");

          return {
            ...event,
            contexts: {
              ...event.contexts,
              device: {
                brand,
                battery_level: batteryLevel || currentBattery || battery,
                model,
                screen_dpi: pixelRatio
              },
              os: {
                name: systemName || system,
                version: systemVersion || system
              },
              extra: {
                SDKVersion,
                language,
                platform,
                screenHeight,
                screenWidth,
                statusBarHeight,
                version,
                windowHeight,
                windowWidth,
                fontSizeSetting,
                app: app || appName || currentAppName,
                ...systemInfo,
              }
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
