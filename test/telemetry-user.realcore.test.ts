import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentScope,
  logger,
  metrics,
  withScope,
  type Envelope,
  type Event,
  type SerializedLogContainer,
  type SerializedMetricContainer,
} from '@sentry/core';
import { init } from '../src/sdk';
import { MiniappClient } from '../src/client';
import { resetPlatformCache } from '../src/crossPlatform';
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
      const explicit = { id: 'business-id', email: 'explicit@example.com', username: 'explicit' };
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
          logger.info('explicit user');
          metrics.count('explicit.user', 1);
          flushing = client.flush();
        });
      } finally {
        vi.stubGlobal('process', originalProcess);
      }
      await vi.advanceTimersByTimeAsync(1);
      expect(await flushing).toBe(true);
      expect(collectEnvelopePayloads<Event>(envelopes, ['event'])[0]!.user).toEqual(explicit);
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
});
