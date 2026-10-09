import type { Client, Event, EventHint, Integration, IntegrationFn } from '@sentry/core';
import { getClientEnvironment } from '../clientState';

/** @deprecated 环境数据已由 MiniappClient 统一提供；2.0 使用 factory。 */
export class HttpContext implements Integration {
  public static id = 'HttpContext';
  public name = HttpContext.id;
  public processEvent(event: Event, _hint: EventHint, client: Client): Event {
    return getClientEnvironment(client).fillEvent(event);
  }
}

export const httpContextIntegration: IntegrationFn = () => new HttpContext();
