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
import { getClientLifetime, withTelemetryCritical } from '../lifecycle';

/** 前台 episode 的 owner session；不通过全局 endSession 结束另一个 owner。 */
export class SessionIntegration implements Integration {
  public static id: string = 'Session';
  public name: string = SessionIntegration.id;
  private readonly _clients = new WeakSet<Client>();
  private readonly _initialSessions = new WeakMap<Client, () => void>();

  public setup(client: Client): void {
    const lifetime = getClientLifetime(client);
    if ((lifetime && !lifetime.canCollectAutomatic()) || this._clients.has(client)) return;
    this._clients.add(client);
    let ownedSession: Session | undefined;
    let pendingStart: object | undefined;
    let active = true;
    let ready = false;
    const end = (): void => {
      pendingStart = undefined;
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
    const canStart = (): boolean =>
      active &&
      ready &&
      (!lifetime || lifetime.canCollectAutomatic()) &&
      getClient() === client &&
      client.getOptions().enabled !== false;
    const start = (): void =>
      withTelemetryCritical(() => {
        if (!canStart() || ownedSession || pendingStart) return;
        const attempt = {};
        pendingStart = attempt;
        try {
          const session = makeSession({
            ignoreDuration: true,
            user: getCombinedScopeData(getIsolationScope(), getCurrentScope()).user,
          });
          // 用户字段读取可触发 hide、嵌套 show 或 dispose；只提交仍有效的前台创建操作。
          if (!canStart() || pendingStart !== attempt) return;
          ownedSession = session;
          getIsolationScope().setSession(session);
          // scope 监听器可同步结束或替换会话，不能再次捕获已收尾的旧会话。
          if (canStart() && pendingStart === attempt && ownedSession === session) {
            client.captureSession(session);
          }
        } finally {
          if (pendingStart === attempt) pendingStart = undefined;
        }
      });
    const stops: Array<() => void> = [];
    let detachFinalizer: (() => void) | undefined;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      pendingStart = undefined;
      detachFinalizer?.();
      detachFinalizer = undefined;
      for (const stop of stops.splice(0)) stop();
      const session = ownedSession;
      ownedSession = undefined;
      if (session && getIsolationScope().getSession() === session) getIsolationScope().setSession();
      this._clients.delete(client);
      this._initialSessions.delete(client);
    };
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
}

/** 每次装配创建独立实例，资源仍由 client lifetime 管理。 */
export function sessionIntegration(): Integration {
  return new SessionIntegration();
}
