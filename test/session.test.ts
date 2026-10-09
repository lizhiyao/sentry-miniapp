import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient,
  getCurrentScope,
  getIsolationScope,
  makeSession,
  type Envelope,
  type SerializedSession,
} from '@sentry/core';
import { SessionIntegration } from '../src/integrations/session';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init } from '../src/sdk';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';
import { MiniappClient } from '../src/client';

describe('Session owner 与前台 episode', () => {
  let app: { onLaunch: () => void; onShow: () => void; onHide: () => void };
  let savedApp: unknown;
  let envelopes: Envelope[];
  const clients: MiniappClient[] = [];
  function start(integration = new SessionIntegration()) {
    const owner = init({
      dsn: 'https://test@example.com/0',
      release: 'session@2.0',
      defaultIntegrations: [integration],
      transport: createCapturingTransport(envelopes),
    })!;
    clients.push(owner);
    return owner;
  }
  function sessions() {
    return collectEnvelopePayloads<SerializedSession>(envelopes, ['session']);
  }
  beforeEach(() => {
    _resetAppLifecycle();
    savedApp = (globalThis as { App?: unknown }).App;
    envelopes = [];
    vi.stubGlobal('App', (options: typeof app) => {
      app = options;
      return options;
    });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    getIsolationScope().setSession();
    (globalThis as { App?: unknown }).App = savedApp;
    vi.unstubAllGlobals();
    _resetAppLifecycle();
  });

  it('setup 配对清理 App wrapper，factory 创建不启动宿主资源', () => {
    const integration = new SessionIntegration();
    const original = (globalThis as { App?: unknown }).App;
    expect((globalThis as { App?: unknown }).App).toBe(original);
    const owner = start(integration);
    expect((globalThis as { App?: unknown }).App).not.toBe(original);
    owner.dispose();
    expect((globalThis as { App?: unknown }).App).toBe(original);
  });

  it('launch/show 不重复开始；业务 onHide 内错误仍属于当前 session，之后结束', () => {
    const owner = start();
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({
      onHide: () =>
        owner.captureEvent({
          exception: {
            values: [{ value: 'onHide failure', mechanism: { handled: false, type: 'onerror' } }],
          },
        }),
    });
    app.onLaunch();
    app.onShow();
    expect(sessions()).toHaveLength(1);
    const sid = sessions()[0]!.sid;
    app.onHide();
    expect(sessions().every((session) => session.sid === sid)).toBe(true);
    expect(
      sessions().filter((session) => session.errors === 1 && session.status === 'unhandled'),
    ).toHaveLength(1);
    expect(sessions().some((session) => session.status === 'crashed')).toBe(false);
    expect(getIsolationScope().getSession()).toBeUndefined();
    app.onShow();
    expect(sessions().at(-1)!.sid).not.toBe(sid);
  });

  it.each(['hide', 'close', 'replace'] as const)(
    '%s 不重复发送 core 已上报的 unhandled 会话',
    async (ending) => {
      const owner = start();
      (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({});
      app.onLaunch();
      const sid = getIsolationScope().getSession()!.sid;
      owner.captureEvent({
        exception: {
          values: [{ value: 'foreground failure', mechanism: { handled: false, type: 'onerror' } }],
        },
      });
      await owner.flush(100);
      expect(sessions().filter((session) => session.status === 'unhandled')).toHaveLength(1);
      if (ending === 'hide') {
        app.onHide();
        app.onHide();
      } else if (ending === 'close') {
        await owner.close();
        await owner.close();
      } else {
        start();
        await owner.close();
      }
      expect(sessions().filter((session) => session.sid === sid)).toHaveLength(2);
      expect(getIsolationScope().getSession()).toBeUndefined();
      if (ending === 'hide') {
        app.onShow();
        expect(getIsolationScope().getSession()!.sid).not.toBe(sid);
      }
    },
  );

  it('异步 S1 错误在 S2 开始后完成，保留 S1 终态且不污染 S2', async () => {
    const owner = start();
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({});
    app.onLaunch();
    const s1 = getIsolationScope().getSession()!;
    let resume!: () => void;
    owner.addEventProcessor(
      (event) =>
        new Promise((resolve) => {
          resume = () => resolve(event);
        }),
    );
    owner.captureEvent({
      exception: { values: [{ value: 'late S1', mechanism: { handled: false, type: 'onerror' } }] },
    });
    app.onHide();
    expect(s1.status).toBe('exited');
    expect(s1.errors).toBe(0);
    app.onShow();
    const s2 = getIsolationScope().getSession()!;
    expect(s2.sid).not.toBe(s1.sid);
    resume();
    await owner.flush(100);
    // core 不重开已结束的会话；迟到错误仍发送，但不追加旧会话终态更新。
    expect(s1.status).toBe('exited');
    expect(s1.errors).toBe(0);
    expect(
      sessions()
        .filter((session) => session.sid === s1.sid)
        .map(({ status, errors }) => ({ status, errors })),
    ).toEqual([
      { status: 'ok', errors: 0 },
      { status: 'exited', errors: 0 },
    ]);
    expect(collectEnvelopePayloads(envelopes, ['event'])).toHaveLength(1);
    expect(getIsolationScope().getSession()).toBe(s2);
    expect(s2.status).toBe('ok');
    expect(s2.errors).toBe(0);
    expect(
      sessions()
        .filter((session) => session.sid === s2.sid)
        .every((session) => session.errors === 0),
    ).toBe(true);
  });

  it('替换时同步结束 A 的 session，A cleanup 不删除 B 或业务手动 session', async () => {
    const first = start();
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({});
    app.onLaunch();
    const sid = sessions()[0]!.sid;
    const second = start();
    expect(sessions().some((session) => session.sid === sid && session.status === 'exited')).toBe(
      true,
    );
    app.onShow();
    const current = getIsolationScope().getSession()!;
    await first.close();
    expect(getClient()).toBe(second);
    expect(getIsolationScope().getSession()).toBe(current);
    const manual = makeSession();
    getIsolationScope().setSession(manual);
    second.dispose();
    expect(getIsolationScope().getSession()).toBe(manual);
  });
  it('手动 cleanup 幂等，已注册 App 的迟到事件不重新开始 session', () => {
    const integration = new SessionIntegration();
    start(integration);
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({});
    app.onLaunch();
    expect(sessions()).toHaveLength(1);
    integration.cleanup();
    integration.cleanup();
    app.onHide();
    app.onShow();
    expect(sessions()).toHaveLength(1);
    expect(getIsolationScope().getSession()).toBeUndefined();
  });

  it('session capture hook 失败仍解除自己的引用，业务回调仍运行', () => {
    const owner = start();
    const business = vi.fn();
    owner.on('beforeSendSession', () => {
      throw new Error('hook');
    });
    (globalThis as typeof globalThis & { App: (options: unknown) => void }).App({
      onHide: business,
    });
    expect(() => app.onLaunch()).not.toThrow();
    expect(getIsolationScope().getSession()).toBeDefined();
    expect(() => app.onHide()).not.toThrow();
    expect(business).toHaveBeenCalledOnce();
    expect(getIsolationScope().getSession()).toBeUndefined();
    expect(sessions()).toHaveLength(0);
  });
  it('同 client 重复 setup 幂等；退休同步释放 App；低层绑定也不安装 session', () => {
    const integration = new SessionIntegration();
    const original = (globalThis as any).App;
    const first = start(integration);
    integration.setup(first);
    (globalThis as any).App({});
    app.onLaunch();
    expect(sessions()).toHaveLength(1);
    first.dispose();
    expect((globalThis as any).App).toBe(original);
    const low = new MiniappClient({
      dsn: 'https://low@example.com/1',
      integrations: [integration],
      transport: createCapturingTransport(envelopes),
    });
    clients.push(low);
    getCurrentScope().setClient(low);
    low.init();
    expect((globalThis as any).App).toBe(original);
    expect(sessions()).toHaveLength(1);
  });
});
