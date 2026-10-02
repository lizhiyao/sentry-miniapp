import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getClient, getCurrentScope, getIsolationScope, logger, metrics,
  spanStreamingIntegration, startInactiveSpan, type Envelope, type Span,
} from '@sentry/core';
import { MiniappClient } from '../src/client';
import type { MiniappOptions } from '../src/types';
import { CoreV11Runtime, registerSpanStartSnapshots } from '../src/internal/coreV11Runtime';
import { assertDefined, collectEnvelopePayloads, collectSpans, createCapturingTransport, spanAttribute } from './support/envelopes';

describe('#428 runtime 原型（真实 core 11，不接入默认 SDK）', () => {
  let clients: MiniappClient[];
  let runtimes: CoreV11Runtime[];
  let envelopes: Envelope[];

  beforeEach(() => {
    vi.useFakeTimers();
    clients = [];
    runtimes = [];
    envelopes = [];
    getCurrentScope().clearBreadcrumbs();
    getCurrentScope().removeAttribute('duration.custom');
    getIsolationScope().clearBreadcrumbs();
  });
  afterEach(async () => {
    for (const runtime of runtimes) runtime.dispose();
    for (const client of clients) await settle(client.close(0));
    getCurrentScope().setClient(undefined);
    getCurrentScope().clearBreadcrumbs();
    getCurrentScope().removeAttribute('duration.custom');
    getIsolationScope().clearBreadcrumbs();
    vi.clearAllTimers();
  });

  function makeClient(options: MiniappOptions = {}): MiniappClient {
    const client = new MiniappClient({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableSystemInfo: false,
      enableOfflineCache: false,
      enableLogs: true,
      tracesSampleRate: 1,
      integrations: [spanStreamingIntegration({ flushOnSegmentEnd: false })],
      transport: createCapturingTransport(envelopes),
      ...options,
    });
    clients.push(client);
    getCurrentScope().setClient(client);
    client.init();
    return client;
  }
  async function settle<T>(promise: PromiseLike<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(1);
    return promise;
  }
  function runtime(client: MiniappClient): CoreV11Runtime {
    const value = new CoreV11Runtime(client);
    runtimes.push(value);
    return value;
  }

  it('晚到的 A 回调恢复 A owner；回调返回 Promise 也同步恢复 B scope', async () => {
    const a = makeClient();
    const owner = runtime(a);
    let span: Span | undefined;
    owner.run(() => { span = startInactiveSpan({ name: 'A request', parentSpan: null }); });
    assertDefined(span);
    const ownedSpan = span;
    const b = makeClient();
    owner.run(() => {
      expect(getClient()).toBe(a);
      ownedSpan.end();
      logger.info('A callback');
      return Promise.resolve();
    });
    expect(getClient()).toBe(b);
    await settle(a.flush(100));
    expect(collectSpans(envelopes).map((item) => item.name)).toEqual(['A request']);
    expect(collectEnvelopePayloads<any>(envelopes, ['log']).flatMap((item) => item.items).map((item) => item.body)).toEqual(['A callback']);
  });

  it('close 共享 Promise，finalizer 同步捕获，外部新回调被拒收', async () => {
    const client = makeClient();
    const owner = runtime(client);
    const cleanup = vi.fn();
    let reentrant: Promise<boolean> | undefined;
    owner.onCleanup(cleanup);
    owner.onFinalize(() => {
      reentrant = owner.close(100);
      logger.info('final log');
      metrics.count('final metric', 1);
      startInactiveSpan({ name: 'final span', parentSpan: null }).end();
    });
    const closing = owner.close(100);
    expect(reentrant).toBe(closing);
    expect(owner.close(10)).toBe(closing);
    expect(owner.run(() => logger.info('late callback'))).toBe(false);
    owner.onFinalize(() => { throw new Error('must not register after closing'); });
    expect(await settle(closing)).toBe(true);
    expect(collectSpans(envelopes).map((item) => item.name)).toEqual(['final span']);
    expect(collectEnvelopePayloads<any>(envelopes, ['log']).flatMap((item) => item.items).map((item) => item.body)).toEqual(['final log']);
    expect(collectEnvelopePayloads<any>(envelopes, ['trace_metric']).flatMap((item) => item.items).map((item) => item.name)).toEqual(['final metric']);
    expect(cleanup).toHaveBeenCalledTimes(1);
    owner.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(owner.canStartRequest()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('关闭的总预算不会因 pending event processor 或 transport drain 重置', async () => {
    const client = makeClient({
      transport: () => ({ send: () => Promise.resolve({ statusCode: 200 }), flush: () => new Promise<boolean>(() => {}) }),
    });
    client.addEventProcessor(() => new Promise(() => {}));
    client.captureMessage('pending event');
    const owner = runtime(client);
    const cleanup = vi.fn();
    owner.onCleanup(cleanup);
    let result: boolean | undefined;
    const closing = owner.close(50).then((value) => { result = value; return value; });
    await vi.advanceTimersByTimeAsync(49);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(await closing).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(client.getOptions().enabled).toBe(false);
    // close(0) 对故意永不完成的 processor 会等待；测试清理仅 dispose。
    clients.splice(clients.indexOf(client), 1);
  });

  it('同步 finalizer 消耗预算时，deadline 阻止后续 finalizer 和新 request，不等待 timer 回调', async () => {
    const client = makeClient();
    const owner = runtime(client);
    const flush = vi.spyOn(client, 'flush');
    const remaining = vi.fn();
    owner.onFinalize(() => {
      vi.setSystemTime(Date.now() + 60);
      expect(owner.canStartRequest()).toBe(false);
      expect(owner.run(() => logger.info('past deadline'))).toBe(false);
    });
    owner.onFinalize(remaining);
    expect(await owner.close(50)).toBe(false);
    expect(remaining).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(client.getOptions().enabled).toBe(false);
  });

  it('dispose 清理 buffers，之后直接绑定旧 client 的 logger/metrics 也不能重填', async () => {
    const client = makeClient();
    const owner = runtime(client);
    logger.info('discarded');
    metrics.count('discarded', 1);
    startInactiveSpan({ name: 'discarded', parentSpan: null }).end();
    owner.dispose();
    logger.info('late');
    metrics.count('late', 1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(await settle(owner.close())).toBe(false);
    const lateCleanup = vi.fn();
    owner.onCleanup(lateCleanup);
    expect(lateCleanup).toHaveBeenCalledOnce();
    owner.onCleanup(() => { throw new Error('cleanup'); });
  });

  it.each([['log', 'dispose'], ['metric', 'dispose'], ['log', 'close'], ['metric', 'close']] as const)('beforeSend%s 重入 %s 后不得重填 core buffer', async (kind, action) => {
    const client = makeClient({
      beforeSendLog: (log) => { if (action === 'dispose') owner.dispose(); else void owner.close(100); return log; },
      beforeSendMetric: (metric) => { if (action === 'dispose') owner.dispose(); else void owner.close(100); return metric; },
    });
    const owner = runtime(client);
    if (kind === 'log') logger.info('reentrant'); else metrics.count('reentrant', 1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(envelopes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('保留业务 beforeSendLog/Metric 修改与丢弃结果', async () => {
    const client = makeClient({
      beforeSendLog: (log) => log.message === 'drop' ? null : { ...log, message: 'changed' },
      beforeSendMetric: (metric) => metric.name === 'drop' ? null : { ...metric, name: 'changed' },
    });
    runtime(client);
    logger.info('drop');
    logger.info('keep');
    metrics.count('drop', 1);
    metrics.count('keep', 1);
    await settle(client.flush(100));
    expect(collectEnvelopePayloads<any>(envelopes, ['log']).flatMap((item) => item.items).map((item) => item.body)).toEqual(['changed']);
    expect(collectEnvelopePayloads<any>(envelopes, ['trace_metric']).flatMap((item) => item.items).map((item) => item.name)).toEqual(['changed']);
  });

  it('finalizer 失败仍完成清理并返回 false', async () => {
    const owner = runtime(makeClient());
    const cleanup = vi.fn();
    owner.onFinalize(() => { throw new Error('finalizer'); });
    owner.onCleanup(() => { throw new Error('cleanup'); });
    owner.onCleanup(cleanup);
    expect(await settle(owner.close())).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('finalizer 中 dispose 时不运行剩余 finalizers 或 flush', async () => {
    const client = makeClient();
    const owner = runtime(client);
    const flush = vi.spyOn(client, 'flush');
    const remaining = vi.fn();
    owner.onFinalize(() => owner.dispose());
    owner.onFinalize(remaining);
    expect(await settle(owner.close())).toBe(false);
    expect(remaining).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it.each(['reject', 'throw', 'false'] as const)('flush %s 时仍清理', async (mode) => {
    const client = makeClient();
    vi.spyOn(client, 'flush').mockImplementation(() => {
      if (mode === 'throw') throw new Error('flush');
      return mode === 'reject' ? Promise.reject(new Error('flush')) : Promise.resolve(false);
    });
    const owner = runtime(client);
    const cleanup = vi.fn();
    owner.onCleanup(cleanup);
    expect(await settle(owner.close(0))).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    clients.splice(clients.indexOf(client), 1);
  });

  it('关闭 hook 抛错仍执行 SDK cleanup', () => {
    const client = makeClient();
    const cleanup = vi.fn();
    client.registerCleanup(cleanup);
    client.on('close', () => { throw new Error('hook'); });
    runtime(client).dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    clients.splice(clients.indexOf(client), 1);
  });

  it('手动 span 使用开始时 route/network 快照，业务 span/scope 属性优先且保留单位', async () => {
    const client = makeClient();
    let route = 'pages/a';
    let network = 'wifi';
    const off = registerSpanStartSnapshots(client, () => ({
      route, 'network.type': network, 'duration.custom': 99, ignored: undefined,
    }));
    client.registerCleanup(off);
    getCurrentScope().setAttributes({ 'duration.custom': { value: 3, unit: 'millisecond' } });
    const first = startInactiveSpan({ name: 'start snapshot', parentSpan: null });
    const explicit = startInactiveSpan({ name: 'explicit route', parentSpan: null, attributes: { route: 'business' } });
    route = 'pages/b';
    network = '4g';
    first.end();
    explicit.end();
    await settle(client.flush(100));
    const span = collectSpans(envelopes).find((item) => item.name === 'start snapshot');
    assertDefined(span);
    expect(spanAttribute(span, 'route')).toBe('pages/a');
    expect(spanAttribute(span, 'network.type')).toBe('wifi');
    expect(span.attributes['duration.custom']).toMatchObject({ value: 3, unit: 'millisecond' });
    expect('ignored' in span.attributes).toBe(false);
    const user = collectSpans(envelopes).find((item) => item.name === 'explicit route');
    assertDefined(user);
    expect(spanAttribute(user, 'route')).toBe('business');
    off();
    off();
    startInactiveSpan({ name: 'after unsubscribe', parentSpan: null }).end();
    await settle(client.flush(100));
    const after = collectSpans(envelopes).find((item) => item.name === 'after unsubscribe');
    assertDefined(after);
    expect(spanAttribute(after, 'route')).toBeUndefined();
  });

  it('快照有界：第 257 个未结束 span 淘汰最旧快照；未采样 span 不保留', async () => {
    const client = makeClient();
    const snapshot = vi.fn(() => ({ 'snapshot.sequence': 1 }));
    client.registerCleanup(registerSpanStartSnapshots(client, snapshot));
    const spans = Array.from({ length: 257 }, (_, i) => startInactiveSpan({ name: 'bounded-' + i, parentSpan: null }));
    spans[0].end();
    spans[256].end();
    await settle(client.flush(100));
    const first = collectSpans(envelopes).find((item) => item.name === 'bounded-0');
    const last = collectSpans(envelopes).find((item) => item.name === 'bounded-256');
    assertDefined(first); assertDefined(last);
    expect(spanAttribute(first, 'snapshot.sequence')).toBeUndefined();
    expect(spanAttribute(last, 'snapshot.sequence')).toBe(1);
    client.getOptions().tracesSampleRate = 0;
    startInactiveSpan({ name: 'unsampled', parentSpan: null }).end();
    expect(snapshot).toHaveBeenCalledTimes(257);
  });
});
