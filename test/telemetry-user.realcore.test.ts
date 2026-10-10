import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope,
  logger,
  makeSession,
  metrics,
  withScope,
  type Envelope,
  type Event,
  type SerializedLogContainer,
  type SerializedMetricContainer,
  type SerializedSession,
} from '@sentry/core';
import { init } from '../src/sdk';
import { MiniappClient } from '../src/client';
import { resetPlatformCache } from '../src/crossPlatform';
import type { MiniappOptions } from '../src/types';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

/** 使用真实 core、公开 scope 与最终 envelope，覆盖 window 别名但没有 DOM 的宿主。 */
describe('显式用户与 core 自动用户推断的边界', () => {
  let client: MiniappClient;
  let envelopes: Envelope[];
  beforeEach(() => {
    vi.useFakeTimers();
    envelopes = [];
    resetPlatformCache();
    getCurrentScope().setClient(undefined);
    vi.stubGlobal('wx', { request: vi.fn() });
  });
  afterEach(() => {
    client?.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetPlatformCache();
  });

  it.each([true, false])(
    'userInfo=%s 控制 ingest 推断；业务 setUser 在三类 payload 保留',
    async (userInfo) => {
      client = init({
        dsn: 'https://key@example.com/1',
        defaultIntegrations: false,
        dataCollection: { userInfo },
        transport: createCapturingTransport(envelopes),
      })!;
      const explicit = {
        id: 'business-id',
        email: 'explicit@example.com',
        username: 'explicit',
        ip_address: '192.0.2.1',
      };
      let flushing!: PromiseLike<boolean>;
      const originalProcess = process;
      // Node runner 之外模拟实际 miniapp：window 是全局别名，process/document 不存在。
      vi.stubGlobal('window', globalThis);
      vi.stubGlobal('document', undefined);
      vi.stubGlobal('process', undefined);
      try {
        withScope((scope) => {
          scope.setClient(client);
          scope.setUser(explicit);
          client.captureMessage('explicit user');
          scope.setUser(null);
          client.captureException(new Error('no explicit user'));
          scope.setUser(explicit);
          logger.info('explicit user');
          metrics.count('explicit.user', 1);
          flushing = client.flush();
        });
      } finally {
        vi.stubGlobal('process', originalProcess);
      }
      await vi.advanceTimersByTimeAsync(1);
      expect(await flushing).toBe(true);
      const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
      expect(events).toHaveLength(2);
      expect(events[0]!.user).toEqual(explicit);
      expect(events[1]!.user?.ip_address).toBeUndefined();
      for (const event of events) {
        expect(event.sdk?.settings?.infer_ip).toBe(userInfo ? 'auto' : 'never');
      }
      const logs = collectEnvelopePayloads<SerializedLogContainer>(envelopes, ['log']);
      const metricContainers = collectEnvelopePayloads<SerializedMetricContainer>(envelopes, [
        'trace_metric',
      ]);
      expect(logs).toHaveLength(1);
      expect(metricContainers).toHaveLength(1);
      for (const container of [...logs, ...metricContainers]) {
        expect(container).toMatchObject({
          ingest_settings: {
            infer_ip: userInfo ? 'auto' : 'never',
            infer_user_agent: userInfo ? 'auto' : 'never',
          },
        });
        expect(container.items[0]!.attributes).toMatchObject({
          'user.id': { type: 'string', value: explicit.id },
          'user.email': { type: 'string', value: explicit.email },
          'user.name': { type: 'string', value: explicit.username },
        });
      }
    },
  );

  it('未配置 userInfo 时按 Core 默认传达 auto，保持调用方配置可复用', async () => {
    const settings = Object.freeze({});
    const sdk = Object.freeze({ settings });
    const metadata = Object.freeze({ sdk });
    const options: MiniappOptions = Object.freeze({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: false,
      _metadata: metadata,
      transport: createCapturingTransport(envelopes),
    });
    client = init(options)!;
    client.captureException(new Error('default IP inference'));
    const flushing = client.flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(await flushing).toBe(true);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0]!.sdk?.settings).toEqual({
      infer_ip: 'auto',
    });
    expect(options._metadata).toBe(metadata);
    expect(settings).toEqual({});
  });

  it.each([
    { userInfo: true, inferIp: 'never' as const },
    { userInfo: false, inferIp: 'auto' as const },
  ])('保留显式底层 infer_ip=$inferIp 设置（userInfo=$userInfo）', async ({ userInfo, inferIp }) => {
    const settings = Object.freeze({ infer_ip: inferIp });
    const metadata = Object.freeze({ sdk: Object.freeze({ settings }) });
    client = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: false,
      dataCollection: { userInfo },
      _metadata: metadata,
      transport: createCapturingTransport(envelopes),
    })!;
    client.captureException(new Error('explicit IP inference'));
    const flushing = client.flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(await flushing).toBe(true);
    expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0]!.sdk?.settings).toEqual({
      infer_ip: inferIp,
    });
    expect(metadata.sdk.settings).toBe(settings);
  });

  it.each([true, false])('userInfo=%s 不额外增加 Session IP，保留显式业务 IP', (userInfo) => {
    client = init({
      dsn: 'https://key@example.com/1',
      defaultIntegrations: false,
      dataCollection: { userInfo },
      transport: createCapturingTransport(envelopes),
    })!;
    client.captureSession(makeSession({ release: 'test@1' }));
    client.captureSession(makeSession({ release: 'test@1', ipAddress: '192.0.2.2' }));
    const sessions = collectEnvelopePayloads<SerializedSession>(envelopes, ['session']);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.attrs?.ip_address).toBeUndefined();
    expect(sessions[1]!.attrs?.ip_address).toBe('192.0.2.2');
  });

  it.each(['init', 'low-level'])('%s 在创建 transport 前拒绝不可读的推断配置', (entry) => {
    const failure = new Error('unreadable infer_ip');
    const settings = Object.freeze(
      Object.defineProperty({}, 'infer_ip', {
        enumerable: true,
        get() {
          throw failure;
        },
      }),
    );
    const transport = vi.fn(createCapturingTransport(envelopes));
    const options: MiniappOptions = {
      dsn: 'https://key@example.com/1',
      defaultIntegrations: false,
      _metadata: { sdk: { settings } },
      transport,
    };
    let thrown;
    try {
      if (entry === 'init') init(options);
      else new MiniappClient({ ...options, transport });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    expect(transport).not.toHaveBeenCalled();
    expect(envelopes).toEqual([]);
    expect(getCurrentScope().getClient()).toBeUndefined();
  });
});
