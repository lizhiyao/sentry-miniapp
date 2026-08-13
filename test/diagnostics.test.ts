import { describe, it, expect, afterEach } from '@jest/globals';
import { close, getCurrentScope } from '@sentry/core';
import { getDiagnostics, init, setConsent } from '../src/index';
import { resetConsentState } from '../src/consent';
import { resetPlatformCache } from '../src/crossPlatform';

describe('getDiagnostics', () => {
  afterEach(async () => {
    await close(0);
    getCurrentScope().setClient(undefined);
    resetConsentState();
    resetPlatformCache();
  });

  it('returns structured runtime state without exposing the full DSN', () => {
    init({
      dsn: 'https://public@example.ingest.sentry.io/123',
      release: 'miniapp@1.0.0',
      environment: 'production',
      enableLogs: true,
      tracesSampleRate: 0.5,
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
      enableLogs: true,
      tracesSampleRate: 0.5,
      propagateTraceparent: true,
      tracePropagationTargetsCount: 1,
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

  it('works before init in unsupported runtimes', async () => {
    await close(0);
    getCurrentScope().setClient(undefined);
    delete (global as any).wx;
    resetConsentState();
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
});
