import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleBreadcrumbs, consoleBreadcrumbsIntegration } from '../src/integrations/console';

vi.mock('@sentry/core', () => ({
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => undefined),
}));

import { addBreadcrumb, getClient } from '@sentry/core';

const activeIntegrations = new Set<ConsoleBreadcrumbs>();

function setupIntegration(integration: ConsoleBreadcrumbs): void {
  const client = { registerCleanup: vi.fn() } as any;
  vi.mocked(getClient).mockReturnValue(client);
  integration.setup(client);
  activeIntegrations.add(integration);
}

describe('ConsoleBreadcrumbs Integration', () => {
  const originalConsole: Record<string, any> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockReturnValue(undefined);
    // Save original console methods
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      originalConsole[level] = console[level as keyof Console];
    }
  });

  afterEach(() => {
    for (const integration of activeIntegrations) integration.cleanup();
    activeIntegrations.clear();
    // Restore original console methods
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      (console as any)[level] = originalConsole[level];
    }
  });

  it('should capture console.log as breadcrumb', () => {
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    console.log('test message');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'info',
      message: 'test message',
    });
  });

  it('setupOnce only installs neutral wrappers', () => {
    const integration = new ConsoleBreadcrumbs({ levels: ['log'] });

    integration.setupOnce();
    console.log('not captured');

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('should capture console.error with error level', () => {
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    console.error('something failed');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'error',
      message: 'something failed',
    });
  });

  it('should capture console.warn with warning level', () => {
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    console.warn('deprecation warning');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'warning',
      message: 'deprecation warning',
    });
  });

  it('should capture console.debug with debug level', () => {
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    console.debug('debug info');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'debug',
      message: 'debug info',
    });
  });

  it('should join multiple arguments', () => {
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    console.log('user', 'logged in', 'successfully');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'info',
      message: 'user logged in successfully',
    });
  });

  it('should serialize objects', () => {
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    console.log('data:', { id: 1, name: 'test' });

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'info',
      message: 'data: {"id":1,"name":"test"}',
    });
  });

  it('should preserve original console behavior', () => {
    // Restore and reinstall to test preservation
    (console as any).log = originalConsole['log'];
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    console.log('test');
    expect(addBreadcrumb).toHaveBeenCalled();
  });

  it('should only capture specified levels', () => {
    const integration = new ConsoleBreadcrumbs({ levels: ['error', 'warn'] });
    setupIntegration(integration);

    console.log('ignored');
    console.error('captured');
    console.warn('also captured');

    // log should not trigger breadcrumb (not in levels)
    expect(addBreadcrumb).toHaveBeenCalledTimes(2);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
    );
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning' }),
    );
  });

  it('should handle circular references gracefully', () => {
    const integration = new ConsoleBreadcrumbs();
    setupIntegration(integration);

    const circular: any = { a: 1 };
    circular.self = circular;

    expect(() => console.log('circular:', circular)).not.toThrow();
    expect(addBreadcrumb).toHaveBeenCalled();
  });

  it('restores the original console methods during cleanup', () => {
    const originalLog = console.log;
    const integration = new ConsoleBreadcrumbs({ levels: ['log'] });

    setupIntegration(integration);
    expect(console.log).not.toBe(originalLog);

    integration.cleanup();
    expect(console.log).toBe(originalLog);
  });

  it('registers and idempotently executes client-specific cleanup', () => {
    const registerCleanup = vi.fn();
    const integration = new ConsoleBreadcrumbs({ levels: ['error'] });

    integration.setup({ registerCleanup } as any);
    const cleanup = registerCleanup.mock.calls[0][0];
    integration.cleanup();
    cleanup();
    cleanup();

    expect(registerCleanup).toHaveBeenCalledWith(expect.any(Function));
  });

  it('client setup skips unavailable levels and detached calls preserve console as this', () => {
    const savedError = console.error;
    const savedWarn = console.warn;
    const original = vi.fn(function (this: unknown) {
      return this;
    });
    try {
      (console as any).error = undefined;
      (console as any).warn = original;
      const registerCleanup = vi.fn();
      const client = { registerCleanup } as any;
      vi.mocked(getClient).mockReturnValue(client);
      const integration = new ConsoleBreadcrumbs({ levels: ['error', 'warn'] });
      integration.setup(client);

      const detached = console.warn;
      expect(detached()).toBe(console);
      integration.cleanup();
    } finally {
      console.error = savedError;
      console.warn = savedWarn;
    }
  });

  it('skips unavailable console methods', () => {
    (console as any).info = undefined;
    const integration = new ConsoleBreadcrumbs({ levels: ['info'] });

    expect(() => integration.setupOnce()).not.toThrow();
    expect(() => integration.cleanup()).not.toThrow();
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('creates an integration through the public factory', () => {
    expect(consoleBreadcrumbsIntegration({ levels: ['error'] })).toBeInstanceOf(
      ConsoleBreadcrumbs,
    );
  });
});
