import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import * as crossPlatform from '../src/crossPlatform';
import { init } from '../src/index';
import { getClient, captureException, flush } from '@sentry/core';

/**
 * 与 minigame-framerate.test.ts 不同：此文件**不 mock** `@sentry/core`，而是用真实
 * init → tracing → 自定义 transport，验证「会话汇总」确实产出一条合法 transaction，
 * 且分档 measurement 真的挂在 transaction 上（堵住「全 mock 只验调用形状」的盲区）。
 */
describe('MinigameFrameRateIntegration（真 @sentry/core 集成）', () => {
  const g = global as any;
  let rafCallback: (() => void) | null;
  let clock: number;
  let savedRaf: any;
  let hideCb: (() => void) | null;
  let captured: any[];

  function frame(t: number): void {
    clock = t;
    const cb = rafCallback;
    rafCallback = null;
    cb && cb();
  }

  beforeEach(() => {
    rafCallback = null;
    clock = 0;
    hideCb = null;
    captured = [];

    savedRaf = g.requestAnimationFrame;
    g.requestAnimationFrame = jest.fn((cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    // 平台 sdk：通过环境检测、捕获 onHide、提供默认集成所需的 wx.* API。
    g.wx = {
      request: jest.fn(),
      getSystemInfo: jest.fn(),
      getNetworkType: jest.fn(),
      onError: jest.fn(),
      onUnhandledRejection: jest.fn(),
      onMemoryWarning: jest.fn(),
      onHide: jest.fn((cb: any) => {
        hideCb = cb;
      }),
      onShow: jest.fn(),
      offHide: jest.fn(),
      offShow: jest.fn(),
    };

    jest.spyOn(crossPlatform, 'now').mockImplementation(() => clock);
    jest.spyOn(crossPlatform, 'epochNow').mockReturnValue(1700000000000);
  });

  afterEach(async () => {
    const client = getClient();
    if (client) await client.close(0);
    g.requestAnimationFrame = savedRaf;
    jest.restoreAllMocks();
    delete g.wx;
  });

  /** 从捕获的 envelope 列表里收集所有 transaction item。 */
  function collectTransactions(): any[] {
    const txns: any[] = [];
    for (const env of captured) {
      const items = env[1] as any[];
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        const header = it[0];
        if (header && header.type === 'transaction') txns.push(it[1]);
      }
    }
    return txns;
  }

  it('开启 tracing 后，分级会话汇总产出真实 transaction（含分档 measurement）', async () => {
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      tracesSampleRate: 1.0,
      enableMinigameFrameRate: true,
      minigameFrameRateOptions: {
        reportInterval: 10000,
        jankLevels: { minor: 17, major: 33, severe: 100 },
      },
      transport: () => ({
        send: (envelope: any) => {
          captured.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    // setupOnce 已在 init 内执行：rAF loop 与 onHide 都应已注册。
    expect(rafCallback).not.toBeNull();
    expect(hideCb).not.toBeNull();

    frame(20); // delta 20 → minor（17<20≤33）
    frame(85); // delta 65 → major（33<65≤100）
    frame(285); // delta 200 → severe（>100）

    hideCb!(); // 退后台 → 发会话汇总 transaction
    // transaction 经异步 prepareEvent 后才进 transport，放掉微任务 + 一个宏任务。
    await new Promise((resolve) => setTimeout(resolve, 0));

    const summary = collectTransactions().find(
      (t) => t.transaction === 'minigame.framerate.summary',
    );
    expect(summary).toBeDefined();
    expect(summary.contexts.trace.op).toBe('ui.framerate');

    const m = summary.measurements || {};
    expect(m.jank_count?.value).toBe(3); // 总数
    expect(m.jank_minor_count?.value).toBe(1);
    expect(m.jank_major_count?.value).toBe(1);
    expect(m.jank_severe_count?.value).toBe(1);
    expect(m.fps_avg).toBeDefined();
  });

  it('client.close() 经公开 getOptions().integrations 调到集成 cleanup', async () => {
    const cleanupSpy = jest.fn();
    const probe = {
      name: 'CleanupProbe',
      setupOnce() {},
      cleanup: cleanupSpy,
    };
    const client = init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      integrations: [probe],
      transport: () => ({
        send: () => Promise.resolve({ statusCode: 200 }),
        flush: () => Promise.resolve(true),
      }),
    } as any);

    expect(client).toBeDefined();
    await client!.close(0);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('ignoreErrors 经 EventFilters 生效：匹配错误被丢弃、其余保留', async () => {
    const captured: any[] = [];
    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      ignoreErrors: ['DropThisError'],
      transport: () => ({
        send: (envelope: any) => {
          captured.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    } as any);

    captureException(new Error('DropThisError boom'));
    captureException(new Error('KeepThisError ok'));
    await flush(2000);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const values: string[] = [];
    for (const env of captured) {
      const items = env[1];
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        const header = it[0];
        if (header && (header.type === 'event' || header.type === 'error')) {
          const v = it[1]?.exception?.values?.[0]?.value;
          if (typeof v === 'string') values.push(v);
        }
      }
    }
    expect(values.some((v) => v.includes('KeepThisError'))).toBe(true);
    expect(values.some((v) => v.includes('DropThisError'))).toBe(false);
  });
});
