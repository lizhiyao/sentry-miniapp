import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { captureException, flush, getClient } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { init } from '../src/index';

describe('HttpContext（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: any[];

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    g.wx = {
      request: jest.fn(),
      getSystemInfoSync: jest.fn(() => ({
        brand: 'Apple',
        model: 'iPhone',
        system: 'iOS 17',
        platform: 'ios',
        screenWidth: 390,
        screenHeight: 844,
        language: 'zh_CN',
        version: '2.0.0',
        SDKVersion: '3.1.0',
      })),
      getAccountInfoSync: jest.fn(() => ({
        miniProgram: {
          appId: 'wx-app-id',
          version: '1.2.3',
        },
      })),
      onError: jest.fn(),
      onUnhandledRejection: jest.fn(),
      getNetworkType: jest.fn(),
    };
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    delete g.wx;
    resetPlatformCache();
  });

  function collectErrors(): any[] {
    const errors: any[] = [];
    for (const env of captured) {
      const items = env[1] as any[];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const header = item[0];
        if (header && (header.type === 'event' || header.type === 'error')) {
          errors.push(item[1]);
        }
      }
    }
    return errors;
  }

  it('processEvent 直接补充当前事件的 runtime/app context', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      transport: () => ({
        send: (envelope: any) => {
          captured.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    captureException(new Error('HttpContext current event'));
    await flush(2000);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const event = collectErrors().find((item) =>
      item.exception?.values?.[0]?.value?.includes('HttpContext current event'),
    );

    expect(event).toBeDefined();
    expect(event.contexts.runtime).toEqual({
      name: 'miniapp',
      version: '2.0.0',
    });
    expect(event.contexts.app).toEqual(
      expect.objectContaining({
        app_version: '3.1.0',
        name: 'wx-app-id',
        version: '1.2.3',
      }),
    );
  });
});
