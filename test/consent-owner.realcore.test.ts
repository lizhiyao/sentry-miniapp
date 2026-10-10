import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logger,
  getCurrentScope,
  parseEnvelope,
  type ClientReport,
  type ErrorEvent,
  type Envelope,
} from '@sentry/core';
import { getDiagnostics } from '../src/diagnostics';
import { MiniappClient } from '../src/client';
import { init, getConsent, setConsent } from '../src/sdk';
import { resetPlatformCache } from '../src/crossPlatform';
import { createEventEnvelope, createCapturingTransport } from './support/envelopes';

/** 使用真实默认 transport 检查构造其他 client 不会授权当前 owner。 */
describe('client consent 归属（真实 core）', () => {
  const clients: MiniappClient[] = [];
  let request: ReturnType<typeof vi.fn>;
  let disk: Map<string, string>;
  beforeEach(() => {
    vi.useFakeTimers();
    disk = new Map<string, string>();
    request = vi.fn();
    vi.stubGlobal('wx', {
      request,
      getStorageSync: (key: string) => disk.get(key),
      setStorageSync: (key: string, value: string) => disk.set(key, value),
      removeStorageSync: (key: string) => disk.delete(key),
    });
    resetPlatformCache();
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.dispose());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetPlatformCache();
  });

  it('直接构造必须显式提供 transport，旧无参数入口不能暗中创建默认 runtime', () => {
    // @ts-expect-error 2.0 要求公开构造选项必须显式提供 transport。
    expect(() => new MiniappClient()).toThrow('explicit transport');
    // @ts-expect-error 运行时也拒绝来自旧 JavaScript 调用方的无 transport 配置。
    expect(() => new MiniappClient({ dsn: 'https://first@example.com/1' })).toThrow(
      'explicit transport',
    );
    expect(request).not.toHaveBeenCalled();
    expect(disk.size).toBe(0);
  });

  it('非法 consent 条数回落自己的 100 条默认值，不误用离线 store 的 30 条', async () => {
    const client = init({
      dsn: 'https://first@example.com/1',
      requireConsent: true,
      consentCacheLimit: NaN,
      defaultIntegrations: false,
    })!;
    clients.push(client);
    for (let index = 0; index < 35; index++)
      await client.getTransport()!.send(createEventEnvelope(`cached-${index}`));
    const root = JSON.parse([...disk.values()].find((value) => value.includes('schemaVersion'))!);
    expect(root.records).toHaveLength(35);
    expect(client.getOptions().consentCacheLimit).toBe(100);
    expect(request).not.toHaveBeenCalled();
  });

  it('只读取一次 transport 配置，变化 getter 不能让低层入口回退为宿主默认发送', async () => {
    const envelopes: Envelope[] = [];
    const transport = createCapturingTransport(envelopes);
    const options = { dsn: 'https://first@example.com/1', transport };
    const getter = vi.fn().mockReturnValueOnce(transport).mockReturnValue(undefined);
    Object.defineProperty(options, 'transport', { get: getter });
    const client = new MiniappClient(options);
    clients.push(client);
    await client.getTransport()!.send(createEventEnvelope('explicit-only'));
    expect(getter).toHaveBeenCalledOnce();
    expect(envelopes).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    '同一目标切换 required=%s 时，不把旧策略的缓存作为新策略发送',
    async (required) => {
      request.mockImplementation((options) => {
        options.fail({ errMsg: 'offline' });
        return {};
      });
      const first = init({
        dsn: 'https://first@example.com/1',
        requireConsent: required,
        defaultIntegrations: false,
      })!;
      clients.push(first);
      await first.getTransport()!.send(createEventEnvelope('old-policy'));
      expect([...disk.values()].join('')).toContain('old-policy');
      const firstRequests = request.mock.calls.length;
      const second = init({
        dsn: 'https://first@example.com/1',
        requireConsent: !required,
        defaultIntegrations: false,
      })!;
      clients.push(second);
      await second.getTransport()!.send(createEventEnvelope('new-policy'));
      expect([...disk.values()].join('')).not.toContain('old-policy');
      expect([...disk.values()].join('')).toContain('new-policy');
      expect(second.getOfflineStoreDiagnostics()?.codes).toContain('policy_changed');
      expect(
        request.mock.calls
          .slice(firstRequests)
          .every((call) => !String(call[0].data).includes('old-policy')),
      ).toBe(true);
    },
  );

  it('低层 client 未授权时拒绝发送且有诊断，不声称已入库；授权后只使用自管 transport', async () => {
    const envelopes: Envelope[] = [];
    const low = new MiniappClient({
      dsn: 'https://first@example.com/1',
      requireConsent: true,
      transport: createCapturingTransport(envelopes),
    });
    clients.push(low);
    const envelope = createEventEnvelope('self-managed');
    await expect(low.getTransport()!.send(envelope)).rejects.toThrow('no SDK offline store');
    expect(envelopes).toEqual([]);
    expect(disk.size).toBe(0);
    expect(low.getOfflineStoreDiagnostics()).toBeNull();
    getCurrentScope().setClient(low);
    expect(getDiagnostics().warnings.map((warning) => warning.code)).toContain(
      'low_level_consent_blocking',
    );
    expect(getDiagnostics().transport?.offlineCache).toBe(false);
    expect(getDiagnostics().options?.enableOfflineCache).toBe(false);
    expect(
      getDiagnostics().warnings.find((warning) => warning.code === 'consent_blocking')?.message,
    ).toContain('没有 SDK 本地缓冲');
    low.setConsent(true);
    await low.getTransport()!.send(envelope);
    expect(envelopes).toEqual([envelope]);
    expect(request).not.toHaveBeenCalled();
    expect(disk.size).toBe(0);
  });

  it('授权立即唤醒磁盘重放，不等待尚未结束的 beforeSend processing', async () => {
    let release!: (event: ErrorEvent) => void;
    const processing = new Promise<ErrorEvent>((resolve) => {
      release = resolve;
    });
    request.mockImplementation((options) => {
      options.success({ statusCode: 200 });
      return {};
    });
    const owner = init({
      dsn: 'https://first@example.com/1',
      requireConsent: true,
      defaultIntegrations: false,
      beforeSend: () => processing,
    })!;
    clients.push(owner);
    await owner.getTransport()!.send(createEventEnvelope('disk-before-grant'));
    owner.captureEvent({ event_id: 'pending', message: 'processor pending' });
    owner.setConsent(true);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0].data).toContain('disk-before-grant');
    release({ type: undefined, event_id: 'pending', message: 'processor pending' });
    await vi.advanceTimersByTimeAsync(1);
  });

  it('实际缺少同步 storage 时，公开诊断报告 memory fallback，且读诊断不触发重放', async () => {
    vi.stubGlobal('wx', { request });
    resetPlatformCache();
    const owner = init({
      dsn: 'https://first@example.com/1',
      requireConsent: true,
      defaultIntegrations: false,
    })!;
    clients.push(owner);
    await owner.getTransport()!.send(createEventEnvelope('memory-only'));
    expect(getDiagnostics().transport?.offlineStore).toEqual({
      mode: 'memory',
      codes: ['memory_only'],
    });
    expect(request).not.toHaveBeenCalled();
    expect(JSON.stringify(getDiagnostics())).not.toContain('memory-only');
  });

  it('撤回取消在途并拒绝排队；重授后两事件重放成功，但报告仍记录两次发送失败', async () => {
    const abort = vi.fn(() => request.mock.calls[0]![0].fail({ errMsg: 'aborted' }));
    request.mockReturnValue({ abort });
    const owner = init({
      dsn: 'https://first@example.com/1',
      requireConsent: true,
      defaultIntegrations: false,
      transportOptions: { maxConcurrentRequests: 1 },
    })!;
    clients.push(owner);
    owner.setConsent(true);
    const transport = owner.getTransport()!;
    const first = transport.send(createEventEnvelope('inflight'));
    const second = transport.send(createEventEnvelope('queued'));
    expect(request).toHaveBeenCalledOnce();
    owner.setConsent(false);
    expect(abort).toHaveBeenCalledOnce();
    await Promise.all([first, second]);
    request.mock.calls[0]![0].success({ statusCode: 200 });
    expect(request).toHaveBeenCalledOnce();
    const stored = [...disk.values()].join('');
    expect(stored.match(/"event_id":"inflight"/g)).toHaveLength(2);
    expect(stored.match(/"event_id":"queued"/g)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(request).toHaveBeenCalledOnce();
    expect([...disk.values()].join('')).toBe(stored);

    const successfulEnvelopes: Envelope[] = [];
    request.mockImplementation((options) => {
      successfulEnvelopes.push(parseEnvelope(options.data));
      options.success({ statusCode: 200 });
      return {};
    });
    owner.setConsent(true);
    await vi.advanceTimersByTimeAsync(6000);
    const flushing = owner.flush(1000);
    await vi.advanceTimersByTimeAsync(1);
    expect(await flushing).toBe(true);

    const items = successfulEnvelopes.flatMap<Envelope[1][number]>((envelope) => envelope[1]);
    const events = items
      .filter(([header]) => header.type === 'event')
      .map(([, payload]) => payload as ErrorEvent);
    expect(events.map((event) => event.event_id).sort()).toEqual(['inflight', 'queued']);
    const reports = items
      .filter(([header]) => header.type === 'client_report')
      .map(([, payload]) => payload as ClientReport);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.discarded_events).toEqual([
      { reason: 'network_error', category: 'error', quantity: 2 },
    ]);
    expect(items.map(([header]) => header.type).sort()).toEqual([
      'client_report',
      'event',
      'event',
    ]);
    expect([...disk.values()].join('')).not.toContain('inflight');
    expect([...disk.values()].join('')).not.toContain('queued');
  });

  it('实例授权排 core 日志缓冲；新 runtime 不继承旧授权，旧实例 API 不授权新实例', () => {
    const first = init({
      dsn: 'https://first@example.com/1',
      requireConsent: true,
      defaultIntegrations: false,
    })!;
    clients.push(first);
    logger.info('grant flushes core buffer');
    expect(request).not.toHaveBeenCalled();
    first.setConsent(true);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0].data).toContain('grant flushes core buffer');
    const second = init({
      dsn: 'https://second@example.com/2',
      requireConsent: true,
      defaultIntegrations: false,
    })!;
    clients.push(second);
    expect(first.getConsent()).toBe(true);
    expect(second.getConsent()).toBe(false);
    first.setConsent(false);
    first.setConsent(true);
    expect(second.getConsent()).toBe(false);
    expect(getConsent()).toBe(false);
    setConsent(true);
    expect(second.getConsent()).toBe(true);
  });

  it('A 未同意时构造 required=false 的 B，不会让 A 默认 transport 发网', async () => {
    const first = init({
      dsn: 'https://first@example.com/1',
      requireConsent: true,
      defaultIntegrations: false,
    })!;
    clients.push(first);
    const second = new MiniappClient({
      dsn: 'https://second@example.com/2',
      requireConsent: false,
      transport: createCapturingTransport([]),
    });
    clients.push(second);
    const sent = first.getTransport()!.send(createEventEnvelope('blocked-A'));
    expect(request).not.toHaveBeenCalled();
    await sent;
    expect(getConsent()).toBe(false);
    setConsent(false);
    expect(getConsent()).toBe(false);
  });
});
