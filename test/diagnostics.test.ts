import { describe, it, expect, afterEach } from 'vitest';
import { close, getClient, getCurrentScope } from '@sentry/core';
import { getDiagnostics, init, setConsent } from '../src/index';
import { MiniappClient } from '../src/client';
import { resetPlatformCache } from '../src/crossPlatform';
import type { Envelope, Event } from '@sentry/core';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('getDiagnostics', () => {
  afterEach(async () => {
    await close(0);
    getCurrentScope().setClient(undefined);
    delete (global as any).GameGlobal;
    resetPlatformCache();
  });

  it('returns structured runtime state without exposing the full DSN', () => {
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      release: 'miniapp@1.0.0',
      environment: 'production',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      enableStandaloneHttpSpans: false,
      propagateTraceparent: true,
      tracePropagationTargets: [/api/],
    });

    const diagnostics = getDiagnostics();

    expect(diagnostics.sdk.name).toBe('sentry.javascript.miniapp');
    expect(diagnostics.client.initialized).toBe(true);
    expect(diagnostics.client.miniappClient).toBe(true);
    expect(diagnostics.platform).toMatchObject({
      name: 'wechat',
      isMiniappEnvironment: true,
    });
    expect(diagnostics.options).toMatchObject({
      dsn: {
        configured: true,
        valid: true,
        host: 'example.ingest.sentry.io',
      },
      release: 'miniapp@1.0.0',
      environment: 'production',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      enableStandaloneHttpSpans: false,
      propagateTraceparent: true,
      tracePropagationTargetsCount: 1,
      defaultIntegrations: 'enabled',
    });
    expect(diagnostics.transport).toMatchObject({
      custom: false,
      requestTimeout: 3000,
      maxConcurrentRequests: 2,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('public@example');
    expect(diagnostics.integrations).toContain('NetworkBreadcrumbs');
    expect(diagnostics.warnings.map((warning) => warning.code)).not.toContain('missing_release');
  });

  it('reports custom built-in transport safeguards', () => {
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      transportOptions: {
        requestTimeout: 1500,
        maxConcurrentRequests: 1,
      },
    });

    expect(getDiagnostics().transport).toMatchObject({
      custom: false,
      requestTimeout: 1500,
      maxConcurrentRequests: 1,
    });
  });

  it('does not report built-in safeguards for a custom transport', () => {
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      transport: () => ({
        send: async () => ({}),
        flush: async () => true,
      }),
    });

    expect(getDiagnostics().transport).toMatchObject({
      custom: true,
      requestTimeout: null,
      maxConcurrentRequests: null,
    });
  });

  it('reports consent gate blocking and clears it after setConsent(true)', () => {
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      release: 'miniapp@1.0.0',
      requireConsent: true,
    });

    const beforeConsent = getDiagnostics();
    expect(beforeConsent.options?.requireConsent).toBe(true);
    expect(beforeConsent.options?.consentGranted).toBe(false);
    expect(beforeConsent.transport).toMatchObject({
      consentGate: true,
      offlineCache: true,
    });
    expect(beforeConsent.warnings.map((warning) => warning.code)).toContain('consent_blocking');

    setConsent(true);

    const afterConsent = getDiagnostics();
    expect(afterConsent.options?.consentGranted).toBe(true);
    expect(afterConsent.warnings.map((warning) => warning.code)).not.toContain('consent_blocking');
  });

  it('surfaces missing production options as warnings', () => {
    init({ dsn: 'not-a-valid-dsn' });

    const diagnostics = getDiagnostics();
    const warningCodes = diagnostics.warnings.map((warning) => warning.code);

    expect(diagnostics.options?.dsn).toMatchObject({
      configured: true,
      valid: false,
    });
    expect(warningCodes).toEqual(
      expect.arrayContaining(['invalid_dsn', 'missing_release', 'tracing_disabled']),
    );
  });

  it('reports missing DSN, disabled source maps, and disabled default integrations', () => {
    init({
      release: 'miniapp@1.0.0',
      enableSourceMap: false,
      defaultIntegrations: false,
    });

    const diagnostics = getDiagnostics();
    const warningCodes = diagnostics.warnings.map((warning) => warning.code);

    expect(diagnostics.options).toMatchObject({
      dsn: { configured: false, valid: false, host: null },
      enableSourceMap: false,
      defaultIntegrations: 'disabled',
    });
    expect(warningCodes).toEqual(expect.arrayContaining(['missing_dsn', 'source_map_disabled']));
  });

  it('reports a custom default integration list', () => {
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      defaultIntegrations: [],
    });

    expect(getDiagnostics().options?.defaultIntegrations).toBe('custom');
  });

  it('handles an unnormalized client integration callback defensively', () => {
    const client = new MiniappClient({
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
      dsn: 'https://public@example.ingest.sentry.io/123',
      integrations: (defaults) => defaults,
    });
    getCurrentScope().setClient(client);

    expect(getDiagnostics().integrations).toEqual([]);
  });

  it('reports explicit standard-runtime minigame opt-ins and a custom stack parser', () => {
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      enableMinigameLifecycle: true,
      enableMinigameFrameRate: true,
      stackParser: () => [],
    });

    expect(getDiagnostics().options).toMatchObject({
      enableMinigameLifecycle: true,
      enableMinigameFrameRate: true,
      customStackParser: true,
    });
  });

  it('小游戏生命周期默认启用，FPS 默认关闭', () => {
    (global as any).GameGlobal = {};
    resetPlatformCache();
    init({ dsn: 'https://public@example.ingest.sentry.io/123' });

    expect(getDiagnostics().options).toMatchObject({
      enableMinigameLifecycle: true,
      enableMinigameFrameRate: false,
    });

    delete (global as any).GameGlobal;
  });

  it('uses minigame defaults and respects explicit lifecycle opt-outs', () => {
    (global as any).GameGlobal = {};
    resetPlatformCache();
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      enableMinigameLifecycle: false,
      enableMinigameFrameRate: false,
    });

    expect(getDiagnostics()).toMatchObject({
      platform: { isMinigame: true },
      options: {
        enableMinigameLifecycle: false,
        enableMinigameFrameRate: false,
      },
    });

    delete (global as any).GameGlobal;
  });

  it('works before init in unsupported runtimes', async () => {
    await close(0);
    getCurrentScope().setClient(undefined);
    delete (global as any).wx;
    resetPlatformCache();

    const diagnostics = getDiagnostics();
    const warningCodes = diagnostics.warnings.map((warning) => warning.code);

    expect(diagnostics.client.initialized).toBe(false);
    expect(diagnostics.platform).toMatchObject({
      name: 'unknown',
      isMiniappEnvironment: false,
    });
    expect(warningCodes).toEqual(
      expect.arrayContaining(['not_miniapp_environment', 'client_not_initialized']),
    );
  });

  it('warns when another Sentry client type is bound', () => {
    getCurrentScope().setClient({
      getOptions: () => ({ enabled: true }),
      getTransport: () => ({}),
      close: async () => true,
    } as any);

    const diagnostics = getDiagnostics();

    expect(diagnostics.client).toMatchObject({ initialized: true, miniappClient: false });
    expect(diagnostics.options).toBeNull();
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain('non_miniapp_client');
  });

  it('替换 defaultIntegrations 漏掉 SpanStreaming 时给出可自检警告', () => {
    // stream 生命周期下所有 span 的发送都需要 SpanStreaming。
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      release: 'miniapp@1.0.0',
      tracesSampleRate: 1,
      defaultIntegrations: false,
    });

    const diagnostics = getDiagnostics();

    expect(diagnostics.integrations).not.toContain('SpanStreaming');
    expect(diagnostics.options?.traceLifecycle).toBe('stream');
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain('span_streaming_missing');
  });

  it('拒绝失效的生命周期与采集配置，保留当前 runtime 可继续发送', async () => {
    const envelopes: Envelope[] = [];
    const previous = init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      release: 'miniapp@1.0.0',
      tracesSampleRate: 1,
      transport: createCapturingTransport(envelopes),
    });
    const withDefaults = getDiagnostics();
    expect(withDefaults.integrations).toContain('SpanStreaming');
    expect(withDefaults.warnings.map((warning) => warning.code)).not.toContain(
      'span_streaming_missing',
    );

    // JS 配置在替换当前 runtime 前明确失败。
    expect(() => init({ traceLifecycle: 'static' } as any)).toThrow(/only supports traceLifecycle: stream/);
    for (const key of ['sendDefaultPii', 'enableLogs']) {
      for (const value of [false, true]) {
        const configure = () => {
          throw new Error('must reject before configuration callbacks');
        };
        expect(() => init({
          [key]: value,
          dataCollection: { userInfo: false },
          beforeSendLog: () => null,
          integrations: configure,
          initialScope: configure,
          transport: configure,
        } as any)).toThrow(new RegExp(`${key}.*removed`));
        expect(getClient()).toBe(previous);
      }
      const changingOptions = {
        [key]: undefined as boolean | undefined,
        integrations: () => {
          changingOptions[key] = false;
          return [];
        },
      };
      expect(() => init(changingOptions)).toThrow(new RegExp(`${key}.*removed`));
      expect(getClient()).toBe(previous);
    }
    expect(getClient()).toBe(previous);
    expect(getDiagnostics().options?.traceLifecycle).toBe('stream');
    const eventId = previous!.captureMessage('still-active', 'info', {}, getCurrentScope());
    expect(await previous!.flush(100)).toBe(true);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toContainEqual(
      expect.objectContaining({ event_id: eventId, message: 'still-active' }),
    );
  });
});
