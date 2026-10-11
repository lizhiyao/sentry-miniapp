import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope,
  getIsolationScope,
  startSession,
  eventFiltersIntegration,
  logger,
  metrics,
  type Envelope,
  type ErrorEvent,
} from '@sentry/core';
import { init } from '../src/sdk';
import { MiniappClient } from '../src/client';
import { resetPlatformCache } from '../src/crossPlatform';
import { globalHandlersIntegration } from '../src/integrations/globalhandlers';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

type Report = { discarded_events: Array<{ reason: string; category: string; quantity: number }> };
describe('client reports 的真实 core flush 与隐私契约', () => {
  const clients: MiniappClient[] = [];
  let envelopes: Envelope[];
  let onUnhandledRejection: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    resetPlatformCache();
    getCurrentScope().setClient(undefined);
    envelopes = [];
    onUnhandledRejection = vi.fn();
    vi.stubGlobal('wx', { request: vi.fn(), onUnhandledRejection });
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    getCurrentScope().setSession();
    getIsolationScope().setSession();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetPlatformCache();
  });
  function start(extra: Record<string, unknown> = {}) {
    const client = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: false,
      transport: createCapturingTransport(envelopes),
      ...extra,
    })!;
    clients.push(client);
    return client;
  }
  async function drain(client: MiniappClient) {
    const result = client.flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(true);
  }
  function reports() {
    return collectEnvelopePayloads<Report>(envelopes, ['client_report']);
  }

  it('默认记录并同步 flush reports；core 日志 buffer 先排出，报告走同一个 transport', async () => {
    const client = start();
    logger.info('core buffer');
    client.recordDroppedEvent('sample_rate', 'error', 2);
    const result = client.flush();
    expect(envelopes.flatMap((envelope) => envelope[1].map((item) => item[0].type))).toEqual([
      'log',
      'client_report',
    ]);
    expect(reports()[0]!.discarded_events).toEqual([
      { reason: 'sample_rate', category: 'error', quantity: 2 },
    ]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(true);
    await drain(client);
    expect(reports()).toHaveLength(1);
  });

  it('显式 false 不记录和发送报告；实际 sampleRate drop 仍按 core 执行', async () => {
    const client = start({ sendClientReports: false, sampleRate: 0 });
    client.recordDroppedEvent('sample_rate', 'error', 2);
    client.captureMessage('sampled out');
    await drain(client);
    expect(client.getOptions().sendClientReports).toBe(false);
    expect(envelopes).toEqual([]);
  });

  it('未同意不清 outcomes，grant 后一次发出，撤回后的新 outcomes 留到再次同意', async () => {
    const client = start({ requireConsent: true });
    client.recordDroppedEvent('sample_rate', 'error', 3);
    await drain(client);
    expect(envelopes).toEqual([]);
    client.setConsent(true);
    expect(reports()[0]!.discarded_events[0]!.quantity).toBe(3);
    client.setConsent(false);
    client.recordDroppedEvent('before_send', 'error');
    await drain(client);
    expect(reports()).toHaveLength(1);
    client.setConsent(true);
    expect(reports()[1]!.discarded_events).toEqual([
      { reason: 'before_send', category: 'error', quantity: 1 },
    ]);
  });

  it('无 DSN 不清 outcomes；之后具有 DSN 的实例不接管旧计数', async () => {
    const noDsn = start({ dsn: undefined });
    noDsn.recordDroppedEvent('sample_rate', 'error', 4);
    await drain(noDsn);
    expect(envelopes).toEqual([]);
    const beforeEnvelope = vi.fn();
    noDsn.on('beforeEnvelope', beforeEnvelope);
    await drain(noDsn);
    expect(beforeEnvelope).not.toHaveBeenCalled();
    const next = start();
    await drain(next);
    expect(envelopes).toEqual([]);
  });

  it('报告发送中产生的新 drop 留给下次 flush，不递归提交', async () => {
    const client = start();
    let once = false;
    client.on('beforeEnvelope', (envelope) => {
      if (envelope[1][0]![0].type === 'client_report' && !once) {
        once = true;
        client.recordDroppedEvent('network_error', 'error', 2);
      }
    });
    client.recordDroppedEvent('sample_rate', 'error');
    await drain(client);
    expect(reports()).toHaveLength(1);
    await drain(client);
    expect(reports()[1]!.discarded_events).toEqual([
      { reason: 'network_error', category: 'error', quantity: 2 },
    ]);
  });

  it('close 排报告一次，dispose/closed 不清 outcomes 或产生实际网络', async () => {
    const client = start();
    client.recordDroppedEvent('sample_rate', 'error');
    const closed = client.close();
    await vi.advanceTimersByTimeAsync(1);
    expect(await closed).toBe(true);
    expect(reports()).toHaveLength(1);
    client.recordDroppedEvent('network_error', 'error');
    const beforeEnvelope = vi.fn();
    client.on('beforeEnvelope', beforeEnvelope);
    expect(await client.flush()).toBe(false);
    expect(beforeEnvelope).not.toHaveBeenCalled();
    expect(reports()).toHaveLength(1);
  });
  it('原生拒绝入口复用过滤、回调和采样顺序，最终报告与 Session 状态一致', async () => {
    const modes = [
      'pass',
      'filter',
      'processor',
      'before-null',
      'before-throw',
      'async-null',
      'async-reject',
      'sample-zero',
    ] as const;
    for (const kind of ['primitive', 'error', 'object'] as const) {
      for (const mode of modes) {
        envelopes.length = 0;
        getCurrentScope().setSession();
        const reason =
          kind === 'primitive'
            ? 'pipeline value'
            : kind === 'error'
              ? new Error('pipeline value')
              : { message: 'pipeline value', code: 42 };
        const originals: unknown[] = [];
        const beforeSend = vi.fn((event: ErrorEvent, hint: { originalException?: unknown }) => {
          originals.push(hint.originalException);
          if (mode === 'before-null') return null;
          if (mode === 'before-throw') throw new Error('callback failure');
          if (mode === 'async-null') return Promise.resolve(null);
          if (mode === 'async-reject') return Promise.reject(new Error('callback failure'));
          return event;
        });
        const client = start({
          release: 'pipeline@1',
          defaultIntegrations: [globalHandlersIntegration(), eventFiltersIntegration()],
          ignoreErrors: mode === 'filter' ? [/pipeline value/] : undefined,
          sampleRate: mode === 'sample-zero' ? 0 : 1,
          beforeSend,
        });
        if (mode === 'processor') client.addEventProcessor(() => null);
        const session = startSession();
        onUnhandledRejection.mock.calls.at(-1)![0]({ reason });
        // 异步 callback 在本次 flush 开始后丢弃时，报告由下一次 flush 排出。
        await drain(client);
        await drain(client);
        const expectedDrop = {
          filter: 'event_processor',
          processor: 'event_processor',
          'before-null': 'before_send',
          'before-throw': 'callback_error',
          'async-null': 'before_send',
          'async-reject': 'callback_error',
          'sample-zero': 'sample_rate',
          pass: undefined,
        }[mode];
        expect(reports().flatMap((report) => report.discarded_events)).toEqual(
          expectedDrop ? [{ reason: expectedDrop, category: 'error', quantity: 1 }] : [],
        );
        expect(collectEnvelopePayloads<ErrorEvent>(envelopes, ['event'])).toHaveLength(
          mode === 'pass' ? 1 : 0,
        );
        expect(beforeSend).toHaveBeenCalledTimes(mode === 'filter' || mode === 'processor' ? 0 : 1);
        if (beforeSend.mock.calls.length) expect(originals[0]).toBe(reason);
        const updatesSession = mode === 'pass' || mode === 'sample-zero';
        expect(session).toMatchObject({
          status: updatesSession ? 'unhandled' : 'ok',
          errors: updatesSession ? 1 : 0,
        });
        client.dispose();
      }
    }
  });

  it('异步 processor 在 flush 开始后 drop，仅在下一次 flush 提交报告', async () => {
    const client = start();
    let finish!: (value: null) => void;
    client.addEventProcessor(
      () =>
        new Promise<null>((resolve) => {
          finish = resolve;
        }),
    );
    client.captureMessage('pending');
    const flushing = client.flush();
    expect(reports()).toEqual([]);
    finish(null);
    await vi.advanceTimersByTimeAsync(1);
    expect(await flushing).toBe(true);
    expect(reports()).toEqual([]);
    await drain(client);
    expect(reports()[0]!.discarded_events).toEqual([
      { reason: 'event_processor', category: 'error', quantity: 1 },
    ]);
  });

  it('transport 构造期间的 drop 不丢失；不同 reason/category 独立累加，tunnel 保留 DSN', async () => {
    const client = start({
      tunnel: 'https://tunnel.example.com/sentry',
      transport: (
        options: Parameters<NonNullable<import('../src/types').MiniappOptions['transport']>>[0],
      ) => {
        options.recordDroppedEvent('network_error', 'error', 2);
        return createCapturingTransport(envelopes)();
      },
    });
    client.recordDroppedEvent('network_error', 'error', 3);
    client.recordDroppedEvent('network_error', 'span', 4);
    client.recordDroppedEvent('sample_rate', 'error', 5);
    await drain(client);
    expect(reports()[0]!.discarded_events).toEqual([
      { reason: 'network_error', category: 'error', quantity: 5 },
      { reason: 'network_error', category: 'span', quantity: 4 },
      { reason: 'sample_rate', category: 'error', quantity: 5 },
    ]);
    const report = envelopes.find((envelope) => envelope[1][0]?.[0].type === 'client_report')!;
    expect(report[0].dsn).toBe('https://key@example.com/1');
    await drain(client);
    expect(reports()).toHaveLength(1);
  });

  it('同一 core offline 管道中报告失败不落盘，正常事件失败仍落盘', async () => {
    const disk = new Map<string, string>();
    const request = vi.fn((options) => {
      options.fail({ errMsg: 'offline' });
      return {};
    });
    vi.stubGlobal('wx', {
      request,
      getStorageSync: (key: string) => disk.get(key),
      setStorageSync: (key: string, value: string) => disk.set(key, value),
      removeStorageSync: (key: string) => disk.delete(key),
    });
    resetPlatformCache();
    const client = init({ dsn: 'https://key@example.com/1', defaultIntegrations: false })!;
    clients.push(client);
    client.recordDroppedEvent('sample_rate', 'error');
    await drain(client);
    expect(request).toHaveBeenCalledOnce();
    expect([...disk.values()].join('')).not.toContain('client_report');
    expect(disk.size).toBe(0);
    client.captureMessage('retained event');
    await drain(client);
    expect([...disk.values()].join('')).toContain('retained event');
    expect([...disk.values()].join('')).not.toContain('client_report');
  });
  it('close 的 transport flush 拒绝仍清理 owner，报告不重复发送', async () => {
    const failure = new Error('flush rejected');
    const client = start({
      transport: () => ({
        send: (envelope: Envelope) => {
          envelopes.push(envelope);
          return Promise.resolve({});
        },
        flush: () => Promise.reject(failure),
      }),
    });
    client.recordDroppedEvent('sample_rate', 'error');
    const closing = client.close();
    const rejected = expect(closing).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(client.getOptions().enabled).toBe(false);
    expect(reports()).toHaveLength(1);
    client.dispose();
    expect(reports()).toHaveLength(1);
  });
  it('无 transport 的 flush 仍同步排 core logs/metrics buffers，并取消 idle timers', async () => {
    const client = start({ dsn: undefined });
    const flushedLogs = vi.fn();
    const flushedMetrics = vi.fn();
    client.on('flushLogs', flushedLogs);
    client.on('flushMetrics', flushedMetrics);
    logger.info('no dsn log');
    metrics.count('no.dsn.metric', 1);
    await drain(client);
    expect(flushedLogs).toHaveBeenCalledOnce();
    expect(flushedMetrics).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    await drain(client);
    expect(flushedLogs).toHaveBeenCalledOnce();
    expect(flushedMetrics).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(envelopes).toEqual([]);
  });
});
