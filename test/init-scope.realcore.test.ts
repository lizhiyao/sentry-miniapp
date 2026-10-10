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
import { MiniappClient } from '../src/client';
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
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).map((event) => event.message),
    ).toEqual(['after rejected operation']);
  });

  it.each(['integrations', 'initialScope', 'transport'] as const)(
    '%s 在装配中留下临时 scope 时拒绝绑定，完成后根初始化仍可交付',
    async (phase) => {
      const owner = make('owner', { tracesSampleRate: 1 })!;
      const dispose = vi.spyOn(MiniappClient.prototype, 'dispose');
      let complete!: () => void;
      const completion = new Promise<void>((resolve) => (complete = resolve));
      let pending!: Promise<void>;
      const beginSpan = () => {
        pending = startSpan({ name: `initialization ${phase}` }, () => completion);
      };
      const initialScope = vi.fn((scope: Scope) => {
        if (phase === 'initialScope') beginSpan();
        return scope;
      });
      const transport = vi.fn(() => {
        if (phase === 'transport') beginSpan();
        return createCapturingTransport(envelopes)();
      });
      const attempted = make('rejected', {
        initialScope,
        transport,
        ...(phase === 'integrations' && {
          integrations: (defaults) => {
            beginSpan();
            return defaults;
          },
        }),
      });
      const stateBeforeCompletion = getClientLifetime(owner)?.state;
      captureMessage('during initialization context');
      complete();
      await pending;

      expect(attempted).toBeUndefined();
      expect(getCurrentScope()).toBe(getDefaultCurrentScope());
      expect(getClientLifetime(owner)?.warnings).toContain('init_scope_unsupported');
      if (phase === 'integrations') {
        expect(initialScope).not.toHaveBeenCalled();
        expect(transport).not.toHaveBeenCalled();
        expect(stateBeforeCompletion).toBe('open');
        expect(getClient()).toBe(owner);
        captureMessage('after initialization context');
        await flush(owner);
      } else {
        expect(initialScope).toHaveBeenCalledOnce();
        expect(stateBeforeCompletion).toBe('closing');
        expect(getClient()).toBeUndefined();
        if (phase === 'initialScope') expect(transport).not.toHaveBeenCalled();
        else {
          expect(transport).toHaveBeenCalledOnce();
          const discarded = dispose.mock.contexts.find(
            (client): client is MiniappClient =>
              client instanceof MiniappClient && client !== owner,
          );
          expect(discarded).toBeInstanceOf(MiniappClient);
          expect(discarded?.getOptions().enabled).toBe(false);
          expect(getClientLifetime(discarded!)?.state).toBe('closed');
        }
      }

      const next = make('next')!;
      captureMessage('after safe root initialization');
      await flush(next);
      expect(getClient()).toBe(next);
      expect(
        collectEnvelopePayloads<Event>(envelopes, ['event']).map((event) => event.message),
      ).toEqual(
        phase === 'integrations'
          ? [
              'during initialization context',
              'after initialization context',
              'after safe root initialization',
            ]
          : ['after safe root initialization'],
      );
    },
  );

  it('setup 在新 client 已根绑定后启动异步 span，不丢失该绑定', async () => {
    make('owner');
    let complete!: () => void;
    const completion = new Promise<void>((resolve) => (complete = resolve));
    let pending!: Promise<void>;
    const next = make('next', {
      integrations: [
        {
          name: 'AsyncSetupScopeFixture',
          setup() {
            pending = startSpan({ name: 'integration setup' }, () => completion);
          },
        },
      ],
    })!;
    captureMessage('before setup span completion');
    complete();
    await pending;
    expect(getCurrentScope()).toBe(getDefaultCurrentScope());
    expect(getClient()).toBe(next);
    captureMessage('after setup span completion');
    await flush(next);
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).map((event) => event.message),
    ).toEqual(['before setup span completion', 'after setup span completion']);
  });

  it.each(['getter', 'call'] as const)(
    '首次 transport 留下临时 scope 且 console.warn %s 失败时仍清理未绑定 client',
    async (failure) => {
      const descriptor = Object.getOwnPropertyDescriptor(console, 'warn')!;
      const diagnosticError = new Error('diagnostic unavailable');
      const constructed = new Set<MiniappClient>();
      const cleaned = vi.fn();
      const originalRegisterCleanup = MiniappClient.prototype.registerCleanup;
      const registration = vi
        .spyOn(MiniappClient.prototype, 'registerCleanup')
        .mockImplementation(function (this: MiniappClient, cleanup) {
          constructed.add(this);
          originalRegisterCleanup.call(this, () => {
            cleaned();
            cleanup();
          });
        });
      const dispose = vi.spyOn(MiniappClient.prototype, 'dispose');
      let complete!: () => void;
      const completion = new Promise<void>((resolve) => (complete = resolve));
      let pending!: Promise<void>;
      const unavailable = () => {
        throw diagnosticError;
      };
      Object.defineProperty(console, 'warn', {
        configurable: true,
        ...(failure === 'getter' ? { get: unavailable } : { value: unavailable }),
      });
      let attempted: MiniappClient | undefined;
      let thrown: unknown;
      try {
        try {
          attempted = make('rejected first', {
            transport: () => {
              pending = startSpan({ name: 'first constructor context' }, () => completion);
              return createCapturingTransport(envelopes)();
            },
          });
        } catch (error) {
          thrown = error;
        } finally {
          Object.defineProperty(console, 'warn', descriptor);
          complete();
        }
        await pending;

        expect(thrown).toBeUndefined();
        expect(attempted).toBeUndefined();
        const discarded = [...constructed][0]!;
        expect(discarded).toBeInstanceOf(MiniappClient);
        expect(dispose.mock.contexts).toContain(discarded);
        expect(discarded.getOptions().enabled).toBe(false);
        expect(getClientLifetime(discarded)?.state).toBe('closed');
        expect(registration.mock.calls.length).toBeGreaterThan(0);
        expect(cleaned).toHaveBeenCalledTimes(registration.mock.calls.length);
        expect(getCurrentScope()).toBe(getDefaultCurrentScope());
        expect(getClient()).toBeUndefined();
        discarded.captureMessage('discarded client cannot deliver');
        expect(await discarded.flush(100)).toBe(false);
        expect(envelopes).toEqual([]);
        registration.mockRestore();
        dispose.mockRestore();

        const next = make('safe root')!;
        captureMessage('after diagnostic failure');
        await flush(next);
        expect(getClient()).toBe(next);
        expect(
          collectEnvelopePayloads<Event>(envelopes, ['event']).map((event) => event.message),
        ).toEqual(['after diagnostic failure']);
      } finally {
        Object.defineProperty(console, 'warn', descriptor);
        for (const client of constructed) client.dispose();
        registration.mockRestore();
        dispose.mockRestore();
      }
    },
  );
});
