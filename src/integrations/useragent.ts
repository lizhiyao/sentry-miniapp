import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";
import { getGlobalObject } from "@sentry/utils";

const global = getGlobalObject<Window>();

// console.log("global", global);

/** UserAgent */
export class UserAgent implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = UserAgent.id;

  /**
   * @inheritDoc
   */
  public static id: string = "UserAgent";

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event) => {
      // console.log(event);
      if (getCurrentHub().getIntegration(UserAgent)) {
        if (!global.navigator || !global.location) {
          return event;
        }

        // HTTP Interface: https://docs.sentry.io/clientdev/interfaces/http/?platform=javascript
        const request = event.request || {};
        request.url = request.url || global.location.href;
        request.headers = request.headers || {};
        request.headers["User-Agent"] = global.navigator.userAgent;

        return {
          ...event,
          request
        };
      }
      return event;
    });
  }
}
