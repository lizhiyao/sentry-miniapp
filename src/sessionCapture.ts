import {
  getCurrentScope,
  getIsolationScope,
  type Event,
  type EventHint,
  type Scope,
  type Session,
} from '@sentry/core';

const capturedSessionKey = Symbol('miniapp.capturedSession');
type CapturedSession = { session: Session | undefined };
type CaptureHint = EventHint & { [capturedSessionKey]?: CapturedSession };

/** 只固定 Session 归属；isolation scope 的状态与副作用仍由 core 管理。 */
export class SessionCapture {
  private readonly _sessions = new WeakMap<Event, CapturedSession>();

  public prepare(
    hint?: EventHint,
    current: Scope = getCurrentScope(),
    isolation: Scope = getIsolationScope(),
  ): { hint: EventHint; scope: Scope } {
    const session = current.getSession() ?? isolation.getSession();
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
