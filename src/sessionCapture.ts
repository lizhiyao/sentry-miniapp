import {
  getCurrentScope,
  getIsolationScope,
  type Event,
  type EventHint,
  type Scope,
  type Session,
} from '@sentry/core';

const capturedSessionKey = Symbol('miniapp.capturedSession');
const ownedSessionKey = Symbol('miniapp.ownedSession');
type CapturedSession = { session: Session | undefined };
type CaptureHint = EventHint & { [capturedSessionKey]?: CapturedSession };
type SessionStrategy = 'capture' | 'current';
type OwnershipMetadata = {
  miniappSession?: { owner?: { [ownedSessionKey]: CapturedSession } | undefined };
};

/** Core 的两层 metadata merge 不复制 Symbol 键，holder 放在 merge 深度之外。 */
export function setOwnedScopeSession(
  scope: Scope,
  session: Session | undefined,
  strategy: SessionStrategy,
): void {
  scope.setSession(session);
  scope.setSDKProcessingMetadata({
    miniappSession: {
      owner: strategy === 'capture' ? { [ownedSessionKey]: { session } } : undefined,
    },
  });
}

/** SDK 操作明确捕获的空会话不能回落；普通业务 Scope 仍沿用 Core 的查找次序。 */
export function resolveScopeSession(
  current: Scope,
  isolation: Scope = getIsolationScope(),
): Session | undefined {
  const metadata = current.getScopeData().sdkProcessingMetadata as OwnershipMetadata;
  const captured = metadata.miniappSession?.owner?.[ownedSessionKey];
  return captured ? captured.session : (current.getSession() ?? isolation.getSession());
}

/** 只固定 Session 归属；isolation scope 的状态与副作用仍由 core 管理。 */
export class SessionCapture {
  private readonly _sessions = new WeakMap<Event, CapturedSession>();

  public prepare(
    hint?: EventHint,
    current: Scope = getCurrentScope(),
    isolation: Scope = getIsolationScope(),
  ): { hint: EventHint; scope: Scope } {
    const session = resolveScopeSession(current, isolation);
    const scope = current.clone();
    scope.setSession(session);
    const capturedHint: CaptureHint = { ...hint, [capturedSessionKey]: { session } };
    return { hint: capturedHint, scope };
  }

  /** postprocessEvent 与 beforeSend 替换结果共用；symbol 只在 hint 中，不进入 payload。 */
  public bind<T extends Event | null>(event: T, hint?: EventHint): T {
    const captured = (hint as CaptureHint | undefined)?.[capturedSessionKey];
    // JS callback 的非法返回仍交由 core 验证，不能在这里改变错误处理路径。
    if (captured && event && typeof event === 'object') this._sessions.set(event, captured);
    return event;
  }

  public sessionFor(event: Event, fallback: Session): Session | undefined {
    const captured = this._sessions.get(event);
    // undefined 也是采集时的有效快照，不能回落到后来启动的 Session。
    return captured ? captured.session : fallback;
  }
}
