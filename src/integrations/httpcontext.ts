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
    // app 上下文的两个版本字段语义不同，刻意并存：
    //   - app.version       = 小程序自身版本（getAccountInfoSync().miniProgram.version）
    //   - app.app_version   = 宿主基础库版本（client._prepareEvent 由 SDKVersion 写入）
    // 两者键不冲突，合并后并存，便于排查「小程序版本 vs 运行时基础库版本」两类问题。
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
