import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { getClient, flush, captureException, installedIntegrations } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { init } from '../src/index';

/**
 * 非 wx 平台（支付宝 `my`）的真 @sentry/core 端到端验证。
 *
 * 历史用例几乎只覆盖 wx；本用例确认在 `my` 环境下：平台检测、设备信息采集、事件经真 core
 * 上报这条主链路一样跑通，且事件带正确的平台标记 alipay。
 */
function collectEvents(captured: any[]): any[] {
  const events: any[] = [];
  for (const env of captured) {
    const items = env[1];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const header = item[0];
      if (header && header.type === 'event') events.push(item[1]);
    }
  }
  return events;
}

describe('支付宝 my 平台（真 @sentry/core 集成）', () => {
  const g = global as any;
  let captured: any[];
  let savedWx: any;

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0;
    // test/setup.ts 全局注入了 global.wx，detectPlatform 会优先命中 wx → 恒为 wechat。
    // 要真正走支付宝分支，必须先清掉 wx，只留 my。（这也正是非 wx 路径长期被遮蔽的原因。）
    savedWx = g.wx;
    delete g.wx;
    g.my = {
      request: jest.fn(),
      httpRequest: jest.fn(),
      getSystemInfoSync: () => ({
        brand: 'Alipay',
        model: 'AP-1',
        system: 'iOS 16',
        version: '10.3',
        SDKVersion: '2.7',
      }),
      onError: jest.fn(),
      onUnhandledRejection: jest.fn(),
    };
  });

  afterEach(async () => {
    const c = getClient();
    if (c) await c.close(0);
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    delete g.my;
    g.wx = savedWx;
  });

  it('init + captureException → 事件经真 core 上报，平台标记 alipay、设备信息来自 my', async () => {
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      transport: () => ({
        send: (env: any) => {
          captured.push(env);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);
    expect(client).toBeDefined();

    captureException(new Error('alipay boom'));
    await flush(2000);

    const events = collectEvents(captured);
    const ev = events.find((e) =>
      e.exception?.values?.some((v: any) => v.value?.includes('alipay boom')),
    );
    expect(ev).toBeDefined();
    // 平台标记由 appName() 写入，应识别为 alipay（而非默认 wechat / unknown）
    expect(ev.contexts?.miniapp?.platform).toBe('alipay');
    // 设备信息取自 my.getSystemInfoSync
    expect(ev.contexts?.device?.brand).toBe('Alipay');
    expect(ev.contexts?.os?.name).toBe('iOS 16');
  });
});
