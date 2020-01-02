import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";

declare const getCurrentPages: any;

/** UserAgent */
export class Router implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Router.id;

  /**
   * @inheritDoc
   */
  public static id: string = "Router";

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event) => {
      if (getCurrentHub().getIntegration(Router)) {
        try {
          const routers = getCurrentPages().map(
            (route: { route: string; options: object }) => ({
              route: route.route,
              options: route.options
            })
          );

          return {
            ...event,
            extra: {
              ...event.extra,
              routers
            }
          };
        } catch (e) {
          console.warn(`sentry-miniapp get router info fail: ${e}`);
        }
      }

      return event;
    });
  }
}
