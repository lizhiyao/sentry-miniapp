import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleBreadcrumbs, consoleBreadcrumbsIntegration } from '../src/integrations/console';

vi.mock('@sentry/core', () => ({
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => undefined),
}));

import { addBreadcrumb, getClient } from '@sentry/core';

const activeCleanups = new Set<() => void>();

function setupIntegration(integration: ConsoleBreadcrumbs): () => void {
  const registerCleanup = vi.fn((cleanup: () => void) => {
    activeCleanups.add(cleanup);
  });
  const client = { registerCleanup } as any;
  vi.mocked(getClient).mockReturnValue(client);
  integration.setup(client);
  return registerCleanup.mock.calls[0]![0];
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
    for (const cleanup of activeCleanups) cleanup();
    activeCleanups.clear();
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
    expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }));
    expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning' }));
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

    const cleanup = setupIntegration(integration);
    expect(console.log).not.toBe(originalLog);

    cleanup();
    cleanup();
    expect(console.log).toBe(originalLog);
  });

  it('registers and idempotently executes client-specific cleanup', () => {
    const registerCleanup = vi.fn();
    const integration = new ConsoleBreadcrumbs({ levels: ['error'] });

    integration.setup({ registerCleanup } as any);
    const cleanup = registerCleanup.mock.calls[0][0];
    cleanup();
    cleanup();

    expect(registerCleanup).toHaveBeenCalledWith(expect.any(Function));
  });

  it.each(['old-first', 'new-first'])('%s client cleanup 不清除另一 owner 的包装', (order) => {
    const result = {};
    const original = vi.fn(() => result);
    console.log = original as any;
    const integration = new ConsoleBreadcrumbs({ levels: ['log'] });
    const oldCleanup = setupIntegration(integration);
    const newCleanup = setupIntegration(integration);
    const wrapper = console.log;
    const [first, second] =
      order === 'old-first' ? [oldCleanup, newCleanup] : [newCleanup, oldCleanup];

    first!();
    first!();
    expect(console.log).toBe(wrapper);
    expect(console.log('business')).toBe(result);
    expect(addBreadcrumb).toHaveBeenCalledTimes(order === 'old-first' ? 1 : 0);

    second!();
    second!();
    expect(console.log).toBe(original);
    expect(console.log('after cleanup')).toBe(result);
    expect(original).toHaveBeenCalledTimes(2);
    expect(addBreadcrumb).toHaveBeenCalledTimes(order === 'old-first' ? 1 : 0);
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
      registerCleanup.mock.calls[0]![0]();
    } finally {
      console.error = savedError;
      console.warn = savedWarn;
    }
  });

  it('skips unavailable console methods', () => {
    (console as any).info = undefined;
    const integration = new ConsoleBreadcrumbs({ levels: ['info'] });

    expect(() => integration.setupOnce()).not.toThrow();
    const cleanup = setupIntegration(integration);
    expect(cleanup).not.toThrow();
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it('creates an integration through the public factory', () => {
    expect(consoleBreadcrumbsIntegration({ levels: ['error'] })).toBeInstanceOf(ConsoleBreadcrumbs);
  });
  it('breadcrumb 故障不阻断原 console 返回/this/参数', () => {
    const original = vi.fn(function (this: unknown, ...args: unknown[]) {
      return { receiver: this, args };
    });
    console.log = original as any;
    setupIntegration(new ConsoleBreadcrumbs({ levels: ['log'] }));
    vi.mocked(addBreadcrumb).mockImplementationOnce(() => {
      throw new Error('breadcrumb failed');
    });
    const receiver = {};
    const result = console.log.call(receiver, 'business');
    expect(result).toEqual({ receiver, args: ['business'] });
    expect(original).toHaveBeenCalledOnce();
  });
});
