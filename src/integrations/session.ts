import {
  closeSession,
  getClient,
  getCombinedScopeData,
  getCurrentScope,
  getIsolationScope,
  makeSession,
} from '@sentry/core';
import type { Client, Integration, Session } from '@sentry/core';
import { subscribeMiniappLifecycle } from '../appLifecycle';
import { getClientLifetime } from '../lifecycle';

/** 前台 episode 的 owner session；不通过全局 endSession 结束另一个 owner。 */
export class SessionIntegration implements Integration {
  public static id: string = 'Session';
  public name: string = SessionIntegration.id;
  private readonly _cleanups = new Set<() => void>();
  private readonly _clients = new WeakSet<Client>();
  private readonly _initialSessions = new WeakMap<Client, () => void>();

  public setup(client: Client): void {
    const lifetime = getClientLifetime(client);
    if ((lifetime && !lifetime.canCollectAutomatic()) || this._clients.has(client)) return;
    this._clients.add(client);
    let ownedSession: Session | undefined;
    let active = true;
    let ready = false;
    const end = (): void => {
      const session = ownedSession;
      ownedSession = undefined;
      if (!session) return;
      try {
        // core 已发送 unhandled 等终态；Relay 按更新累加终态计数，不能在收尾重发。
        if (session.status === 'ok') {
          closeSession(session);
          client.captureSession(session);
        }
      } finally {
        const isolation = getIsolationScope();
        if (isolation.getSession() === session) isolation.setSession();
      }
    };
    const start = (): void => {
      if (
        !active ||
        !ready ||
        (lifetime && !lifetime.canCollectAutomatic()) ||
        getClient() !== client ||
        client.getOptions().enabled === false ||
        ownedSession
      )
        return;
      const session = makeSession({
        ignoreDuration: true,
        user: getCombinedScopeData(getIsolationScope(), getCurrentScope()).user,
      });
      ownedSession = session;
      getIsolationScope().setSession(session);
      client.captureSession(session);
    };
    const stops: Array<() => void> = [];
    let detachFinalizer: (() => void) | undefined;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      detachFinalizer?.();
      detachFinalizer = undefined;
      for (const stop of stops.splice(0)) stop();
      const session = ownedSession;
      ownedSession = undefined;
      if (session && getIsolationScope().getSession() === session) getIsolationScope().setSession();
      this._clients.delete(client);
      this._initialSessions.delete(client);
      this._cleanups.delete(cleanup);
    };
    this._cleanups.add(cleanup);
    detachFinalizer = lifetime?.registerFinalizer(end);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
    const adopt = (stop: () => void): void => {
      if (active) stops.push(stop);
      else stop();
    };
    const before = subscribeMiniappLifecycle(client, { onLaunch: start, onShow: start });
    adopt(before.stop);
    const native = before.mode === 'native';
    ready = before.complete && !native;
    if (!active) return;
    if (!before.complete) {
      lifetime?.warnings.add('lifecycle_unavailable');
      return;
    }
    adopt(subscribeMiniappLifecycle(client, { onHide: end }, 'after').stop);
    if (active && native) {
      // 完整安装后再建首会话，避免其它集成的长寿命 owner 固定首次 Session。
      // 注册期间可能收到 hide；此处保留原生通道，afterAllSetup 读取最新状态。
      this._initialSessions.set(client, () => {
        ready = true;
        if (before.initialForeground) start();
      });
    }
  }

  public afterAllSetup(client: Client): void {
    const startInitialSession = this._initialSessions.get(client);
    this._initialSessions.delete(client);
    startInitialSession?.();
  }

  public cleanup(): void {
    for (const cleanup of [...this._cleanups]) cleanup();
  }
}

/** 每次装配创建独立实例，资源仍由 client lifetime 管理。 */
export function sessionIntegration(): Integration {
  return new SessionIntegration();
}
