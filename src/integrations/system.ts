import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";

declare const wx: {
  getSystemInfoSync: Function;
};

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
          const systemInfo = wx.getSystemInfoSync();
          const {
            SDKVersion,
            batteryLevel,
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
            windowWidth
          } = systemInfo;
          const [systemName, systemVersion] = system.split(" ");

          return {
            ...event,
            contexts: {
              ...event.contexts,
              device: {
                brand,
                battery_level: batteryLevel,
                model,
                screen_dpi: pixelRatio
              },
              os: {
                name: systemName,
                version: systemVersion
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
                windowWidth
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
