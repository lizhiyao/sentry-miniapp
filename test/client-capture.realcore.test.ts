import { afterEach, describe, expect, it } from 'vitest';
import {
  Client,
  Scope,
  getCurrentScope,
  getIsolationScope,
  lastEventId,
  makeSession,
  type Envelope,
  type ErrorEvent,
} from '@sentry/core';
import { MiniappClient } from '../src/client';
import type { MiniappOptions } from '../src/types';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('公共 capture 入口与 core Session/Scope 契约', () => {
  const clients: MiniappClient[] = [];
  const envelopes: Envelope[] = [];
  function make(options: MiniappOptions = {}) {
    const client = new MiniappClient({
      dsn: 'https://test@example.com/0',
      release: 'capture@2.0',
      defaultIntegrations: false,
      ...options,
      transport: createCapturingTransport(envelopes),
    });
    clients.push(client);
    return client;
  }
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    envelopes.length = 0;
    getCurrentScope().setSession();
    getIsolationScope().setSession();
    getIsolationScope().setLastEventId(undefined);
  });

  it.each(['exception', 'message', 'event'] as const)(
    '%s 更新原 isolation scope 的 lastEventId',
    (kind) => {
      const client = make();
      const id =
        kind === 'exception'
          ? client.captureException(new Error('exception'))
          : kind === 'message'
            ? client.captureMessage('message')
            : client.captureEvent({ message: 'event' });
      expect(lastEventId()).toBe(id);
      expect(collectEnvelopePayloads<ErrorEvent>(envelopes, ['event'])[0]?.event_id).toBe(id);
    },
  );

  it('processor 读取最近 ID、重入采集和 drop 均保留 core 的更新顺序', () => {
    const client = make();
    let nestedId: string | undefined;
    client.addEventProcessor((event) => {
      expect(lastEventId()).toBe(event.event_id);
      if (event.message === 'outer') nestedId = client.captureMessage('nested');
      return event.message === 'drop' ? null : event;
    });
    client.captureMessage('outer');
    expect(lastEventId()).toBe(nestedId);
    const droppedId = client.captureMessage('drop');
    expect(lastEventId()).toBe(droppedId);
    expect(
      collectEnvelopePayloads<ErrorEvent>(envelopes, ['event']).map((event) => event.message),
    ).toEqual(['nested', 'outer']);
  });

  it('显式 captured scopes 的 lastEventId 写回原 isolation，Session 使用显式 current scope', async () => {
    const client = make();
    const current = new Scope();
    const isolation = new Scope();
    const session = makeSession();
    const unrelated = makeSession();
    current.setSession(session);
    getIsolationScope().setSession(unrelated);
    const id = client.captureEvent({
      exception: { values: [{ value: 'explicit', mechanism: { handled: false, type: 'test' } }] },
      sdkProcessingMetadata: { capturedSpanScope: current, capturedSpanIsolationScope: isolation },
    });
    await client.flush(100);
    expect(isolation.lastEventId()).toBe(id);
    expect(getIsolationScope().lastEventId()).toBeUndefined();
    expect(session.status).toBe('unhandled');
    expect(unrelated.errors).toBe(0);
  });

  it.each([true, false])(
    '异步 beforeSend 替换事件仍固定采集时 Session（初始有 Session=%s）',
    async (hasSession) => {
      let resume!: () => void;
      const client = make({
        beforeSend: (event) =>
          new Promise((resolve) => {
            resume = () => resolve({ ...event, message: 'replaced by beforeSend' });
          }),
      });
      const captured = hasSession ? makeSession() : undefined;
      getIsolationScope().setSession(captured);
      client.captureEvent({
        exception: { values: [{ value: 'late', mechanism: { handled: false, type: 'test' } }] },
      });
      const next = makeSession();
      getIsolationScope().setSession(next);
      resume();
      await client.flush(100);
      expect(next.status).toBe('ok');
      expect(next.errors).toBe(0);
      if (captured) expect(captured.status).toBe('unhandled');
      expect(collectEnvelopePayloads<ErrorEvent>(envelopes, ['event'])[0]?.message).toBe(
        'replaced by beforeSend',
      );
    },
  );

  it('并发 beforeSend 返回同一对象时，各自只更新采集时的 Session', async () => {
    const shared: ErrorEvent = {
      type: undefined,
      exception: { values: [{ value: 'shared', mechanism: { handled: false, type: 'test' } }] },
    };
    const completions: Array<() => void> = [];
    const client = make({
      beforeSend: () => new Promise((resolve) => completions.push(() => resolve(shared))),
    });
    const first = makeSession();
    const second = makeSession();
    getIsolationScope().setSession(first);
    client.captureMessage('first');
    getIsolationScope().setSession(second);
    client.captureMessage('second');
    completions.forEach((complete) => complete());
    await client.flush(100);
    expect(first.status).toBe('unhandled');
    expect(second.status).toBe('unhandled');
  });

  it('没有 SDK capture hint 的 core 入口仍使用 core 提供的 Session', async () => {
    const client = make();
    const scope = new Scope();
    const session = makeSession();
    scope.setSession(session);
    Client.prototype.captureEvent.call(
      client,
      {
        exception: {
          values: [{ value: 'core entry', mechanism: { handled: false, type: 'test' } }],
        },
      },
      {},
      scope,
    );
    await client.flush(100);
    expect(session.status).toBe('unhandled');
  });
});
