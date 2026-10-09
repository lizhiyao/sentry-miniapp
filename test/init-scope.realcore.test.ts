import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureMessage,
  getClient,
  getCurrentScope,
  getDefaultCurrentScope,
  getIsolationScope,
  startSpan,
  withScope,
  type Envelope,
  type Event,
  type Scope,
} from '@sentry/core';
import { init } from '../src/sdk';
import { getDiagnostics } from '../src/diagnostics';
import type { MiniappClient } from '../src/client';
import { getClientLifetime } from '../src/lifecycle';
import { resetPlatformCache } from '../src/crossPlatform';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('真实 core init 的持久 scope 边界', () => {
  const clients: MiniappClient[] = [];
  let envelopes: Envelope[];

  function make(release: string, options: Parameters<typeof init>[0] = {}) {
    const client = init({
      dsn: 'https://test@example.com/0',
      release,
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
      ...options,
    });
    if (client) clients.push(client);
    return client;
  }

  async function flush(client: MiniappClient) {
    const flushed = client.flush(100);
    await vi.advanceTimersByTimeAsync(10);
    expect(await flushed).toBe(true);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetPlatformCache();
    envelopes = [];
    getDefaultCurrentScope().setTag('initialized', undefined);
    getDefaultCurrentScope().setSession(undefined);
    getDefaultCurrentScope().clearBreadcrumbs();
    getDefaultCurrentScope().setClient(undefined);
    getIsolationScope().setSession(undefined);
    getIsolationScope().clearBreadcrumbs();
    vi.stubGlobal('wx', { request: vi.fn() });
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    getDefaultCurrentScope().setClient(undefined);
    getIsolationScope().setSession(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });

  it.each(['withScope', 'startSpan'] as const)(
    '%s 的临时 scope 内首次 init 在构造前拒绝，不留下不可达 runtime',
    (entry) => {
      const initialScope = vi.fn((scope: Scope) => scope.setTag('initial', 'not applied'));
      const transport = vi.fn(createCapturingTransport(envelopes));
      const attempt = () => {
        expect(getCurrentScope()).not.toBe(getDefaultCurrentScope());
        expect(make('scoped first', { initialScope, transport })).toBeUndefined();
        expect(getClient()).toBeUndefined();
      };
      if (entry === 'withScope') withScope(attempt);
      else startSpan({ name: 'before init' }, attempt);
      expect(getClient()).toBeUndefined();
      expect(initialScope).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
      expect(envelopes).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    },
  );

  it('同步 withScope 内替换被拒绝，原 client 与业务 captureContext 保持有效', async () => {
    const owner = make('owner')!;
    const initialScope = vi.fn((scope: Scope) => scope.setTag('initial', 'not applied'));
    withScope((scope) => {
      scope.setTag('scope', 'fork');
      expect(make('rejected', { initialScope })).toBeUndefined();
      expect(getClient()).toBe(owner);
      expect(getClientLifetime(owner)?.state).toBe('open');
      captureMessage('inside fork', { tags: { capture_context: 'kept' } });
    });
    expect(getClient()).toBe(owner);
    captureMessage('after fork');
    await flush(owner);
    const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(events.map((event) => [event.release, event.message])).toEqual([
      ['owner', 'inside fork'],
      ['owner', 'after fork'],
    ]);
    expect(events[0]?.tags).toMatchObject({ scope: 'fork', capture_context: 'kept' });
    expect(events[1]?.tags?.['scope']).toBeUndefined();
    expect(events[1]?.tags?.['capture_context']).toBeUndefined();
    expect(initialScope).not.toHaveBeenCalled();
    expect(getDiagnostics().warnings.map((warning) => warning.code)).toContain(
      'init_scope_unsupported',
    );
  });

  it('未完成 startSpan 占用 stack 时拒绝替换，完成后根 init 可正常替换并发送', async () => {
    const owner = make('owner', { tracesSampleRate: 1 })!;
    let complete!: () => void;
    const pending = startSpan(
      { name: 'pending operation' },
      () => new Promise<void>((resolve) => (complete = resolve)),
    );
    // 此调用在 callback 外，但 fallback stack 仍处于旧异步 span 的 fork。
    expect(getCurrentScope()).not.toBe(getDefaultCurrentScope());
    const attempted = make('rejected');
    const boundBeforeResolution = getClient();
    const stateBeforeResolution = getClientLifetime(owner)?.state;
    captureMessage('before resolution');
    complete();
    await pending;
    expect(attempted).toBeUndefined();
    expect(boundBeforeResolution).toBe(owner);
    expect(stateBeforeResolution).toBe('open');
    expect(getCurrentScope()).toBe(getDefaultCurrentScope());
    expect(getClient()).toBe(owner);
    captureMessage('after resolution');
    await flush(owner);

    const next = make('next', { initialScope: { tags: { initialized: 'root' } } })!;
    expect(getClient()).toBe(next);
    expect(getClientLifetime(owner)?.state).toBe('closing');
    captureMessage('after replacement');
    await flush(next);
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).map((event) => [
        event.release,
        event.message,
        event.tags?.['initialized'],
      ]),
    ).toEqual([
      ['owner', 'before resolution', undefined],
      ['owner', 'after resolution', undefined],
      ['next', 'after replacement', 'root'],
    ]);
  });

  it('未完成 withScope 拒绝替换后，Promise rejection 恢复仍可用的原绑定', async () => {
    const owner = make('owner')!;
    const original = new Error('business rejection');
    let reject!: (error: Error) => void;
    const pending = withScope(() => new Promise<void>((_resolve, fail) => (reject = fail)));
    const rejected = expect(pending).rejects.toBe(original);
    const attempted = make('rejected');
    reject(original);
    await rejected;
    expect(attempted).toBeUndefined();
    expect(getClient()).toBe(owner);
    captureMessage('after rejected operation');
    await flush(owner);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event']).map((event) => event.message)).toEqual([
      'after rejected operation',
    ]);
  });
});
