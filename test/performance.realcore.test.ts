import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { flush, getClient } from '@sentry/core';
import { init } from '../src/index';

/**
 * 用真实 @sentry/core 验证默认性能集成的完整链路，避免工厂多返回一层函数时
 * 单测只检查类方法、却没有发现 core 根本未安装集成的盲区。
 */
describe('PerformanceIntegration（真 @sentry/core 集成）', () => {
  const g = global as any;
  let observerCallback: ((entries: any[]) => void) | undefined;
  let captured: any[];

  beforeEach(() => {
    observerCallback = undefined;
    captured = [];

    g.wx = {
      request: jest.fn(),
      getSystemInfo: jest.fn(),
      getSystemInfoSync: jest.fn(() => ({ platform: 'ios' })),
      getPerformance: jest.fn(() => ({
        getEntries: jest.fn(() => []),
        getEntriesByType: jest.fn(() => []),
        getEntriesByName: jest.fn(() => []),
        mark: jest.fn(),
        measure: jest.fn(),
        clearMarks: jest.fn(),
        clearMeasures: jest.fn(),
        createObserver: jest.fn((callback: (entries: any[]) => void) => {
          observerCallback = callback;
          return {
            observe: jest.fn(),
            disconnect: jest.fn(),
          };
        }),
      })),
      onError: jest.fn(),
      onUnhandledRejection: jest.fn(),
      onMemoryWarning: jest.fn(),
    };
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    delete g.wx;
  });

  it('默认集成接收微信性能条目后会发送 transaction', async () => {
    const beforeSendTransaction = jest.fn((event: any) => event);

    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      tracesSampleRate: 1,
      beforeSendTransaction,
      transport: () => ({
        send: (envelope: any) => {
          captured.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    expect(client?.getIntegrationByName?.('PerformanceAPI')).toBeDefined();
    expect(observerCallback).toBeDefined();

    observerCallback!([
      {
        name: 'appLaunch',
        entryType: 'navigation',
        startTime: 1640995200000,
        duration: 120,
      },
    ]);
    await flush(2000);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const transactions = captured.flatMap((envelope) =>
      (envelope[1] as any[])
        .filter((item) => item[0]?.type === 'transaction')
        .map((item) => item[1]),
    );

    expect(beforeSendTransaction).toHaveBeenCalled();
    expect(transactions.some((event) => event.transaction === 'Navigation: appLaunch')).toBe(true);
  });
});
