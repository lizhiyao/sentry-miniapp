import {
  closeSession,
  getClient,
  getCombinedScopeData,
  getCurrentScope,
  getIsolationScope,
  makeSession,
} from '@sentry/core';
import type { Client, Integration, Session } from '@sentry/core';
import { subscribeAppLifecycle } from '../appLifecycle';
import { getClientLifetime } from '../lifecycle';

/** 前台 episode 的 owner session；不通过全局 endSession 结束另一个 owner。 */
export class SessionIntegration implements Integration {
  public static id: string = 'Session';
  public name: string = SessionIntegration.id;
  private readonly _cleanups = new Set<() => void>();
  private readonly _clients = new WeakSet<Client>();

  public setupOnce(): void {}

  public setup(client: Client): void {
    const lifetime = getClientLifetime(client);
    if ((lifetime && !lifetime.canCollectAutomatic()) || this._clients.has(client)) return;
    this._clients.add(client);
    let ownedSession: Session | undefined;
    let active = true;
    const end = (): void => {
      const session = ownedSession;
      ownedSession = undefined;
      if (!session) return;
      try {
        closeSession(session);
        client.captureSession(session);
      } finally {
        const isolation = getIsolationScope();
        if (isolation.getSession() === session) isolation.setSession();
      }
    };
    const start = (): void => {
      if (
        !active ||
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
    const stopBefore = subscribeAppLifecycle({ onLaunch: start, onShow: start });
    const stopAfter = subscribeAppLifecycle({ onHide: end }, 'after');
    let detachFinalizer: (() => void) | undefined;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      detachFinalizer?.();
      detachFinalizer = undefined;
      stopBefore();
      stopAfter();
      const session = ownedSession;
      ownedSession = undefined;
      if (session && getIsolationScope().getSession() === session) getIsolationScope().setSession();
      this._clients.delete(client);
      this._cleanups.delete(cleanup);
    };
    this._cleanups.add(cleanup);
    detachFinalizer = lifetime?.registerFinalizer(end);
    const detach = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detach?.();
      cleanup();
    });
  }

  public cleanup(): void {
    for (const cleanup of [...this._cleanups]) cleanup();
  }
}
