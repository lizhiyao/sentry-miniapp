import { ConsoleBreadcrumbs } from '../src/integrations/console';

jest.mock('@sentry/core', () => ({
  addBreadcrumb: jest.fn(),
}));

import { addBreadcrumb } from '@sentry/core';

describe('ConsoleBreadcrumbs Integration', () => {
  const originalConsole: Record<string, any> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    // Save original console methods
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      originalConsole[level] = console[level as keyof Console];
    }
  });

  afterEach(() => {
    // Restore original console methods
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      (console as any)[level] = originalConsole[level];
    }
  });

  it('should capture console.log as breadcrumb', () => {
    const integration = new ConsoleBreadcrumbs();
    integration.setupOnce();

    console.log('test message');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'info',
      message: 'test message',
    });
  });

  it('should capture console.error with error level', () => {
    const integration = new ConsoleBreadcrumbs();
    integration.setupOnce();

    console.error('something failed');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'error',
      message: 'something failed',
    });
  });

  it('should capture console.warn with warning level', () => {
    const integration = new ConsoleBreadcrumbs();
    integration.setupOnce();

    console.warn('deprecation warning');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'warning',
      message: 'deprecation warning',
    });
  });

  it('should capture console.debug with debug level', () => {
    const integration = new ConsoleBreadcrumbs();
    integration.setupOnce();

    console.debug('debug info');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'debug',
      message: 'debug info',
    });
  });

  it('should join multiple arguments', () => {
    const integration = new ConsoleBreadcrumbs();
    integration.setupOnce();

    console.log('user', 'logged in', 'successfully');

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'console',
      level: 'info',
      message: 'user logged in successfully',
    });
  });

  it('should serialize objects', () => {
    const integration = new ConsoleBreadcrumbs();
    integration.setupOnce();

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
    integration.setupOnce();

    console.log('test');
    expect(addBreadcrumb).toHaveBeenCalled();
  });

  it('should only capture specified levels', () => {
    const integration = new ConsoleBreadcrumbs({ levels: ['error', 'warn'] });
    integration.setupOnce();

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
    integration.setupOnce();

    const circular: any = { a: 1 };
    circular.self = circular;

    expect(() => console.log('circular:', circular)).not.toThrow();
    expect(addBreadcrumb).toHaveBeenCalled();
  });
});
