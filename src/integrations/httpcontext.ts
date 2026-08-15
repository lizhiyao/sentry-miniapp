import type { Event, Integration, IntegrationFn } from '@sentry/core';

import { getSystemInfo, getAccountInfo } from '../crossPlatform';

/** Add node request data to the event */
export class HttpContext implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'HttpContext';

  /**
   * @inheritDoc
   */
  public name: string = HttpContext.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // This integration adds context during event processing
  }

  /**
   * @inheritDoc
   */
  public processEvent(event: Event): Event {
    // runtime 与 appId 来源的 app 是本集成独有的贡献。
    // device 由 MiniappClient._prepareEvent 统一写（唯一权威，避免多处重复）；
    // network 由 NetworkStatusIntegration 写（带连接状态，且不走异步回调时序）。
    //
    // app_version / app_identifier 使用 Sentry 标准字段，宿主版本单独放在
    // contexts.miniapp，避免将微信基础库版本误当成小程序发布版本。
    const miniappVersion = this._getMiniappVersion();
    const account = getAccountInfo();

    event.contexts = {
      ...event.contexts,
      runtime: {
        ...(event.contexts?.['runtime'] || {}),
        name: 'miniapp',
        version: miniappVersion,
      },
      app: {
        ...(event.contexts?.['app'] || {}),
        app_identifier: account.appId,
        app_version: account.version,
        // 兼容 1.x 已有的非标准字段，2.0 再移除。
        name: account.appId,
        version: account.version,
      },
    };

    return event;
  }

  /**
   * Get miniapp version
   */
  private _getMiniappVersion(): string {
    const sys = getSystemInfo();
    return sys?.version || sys?.SDKVersion || 'unknown';
  }
}

/**
 * HttpContext integration
 */
export const httpContextIntegration: IntegrationFn = () => {
  return new HttpContext();
};
