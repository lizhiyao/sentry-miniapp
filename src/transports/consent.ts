import { envelopeContainsItemType, makeOfflineTransport } from '@sentry/core';
import type { BaseTransportOptions, Envelope, OfflineStore, Transport } from '@sentry/core';
import { UnsupportedBinaryRequestError } from './xhr';

/** 宿主控制句柄独立于 core Transport，不伪装成公开 flush/持久化 ACK。 */
export interface TransportRuntimeHandle {
  requestReplay(): void;
  stopReplay(): void;
  shutdown(): void;
}
const runtimes = new WeakMap<Transport, TransportRuntimeHandle>();
export function getTransportRuntime(transport: Transport): TransportRuntimeHandle | undefined {
  return runtimes.get(transport);
}

/** 一个 core offline 层拥有入库/重入/重试；同步 boolean 门禁不会增加 await。 */
export function createConsentAwareOfflineTransport(
  baseTransport: Transport,
  options: BaseTransportOptions,
  store: OfflineStore,
  hasConsent: () => boolean,
  canStore: () => boolean = () => true,
  flushAtStartup = false,
): Transport {
  let replayEnabled = true;
  let stopped = false;
  const replayed = new WeakSet<Envelope>();
  const transport = makeOfflineTransport(() => baseTransport)({
    ...options,
    shouldSend: (envelope) => !stopped && hasConsent() && (!replayed.has(envelope) || canStore()),
    shouldStore: (envelope, error) =>
      !(error instanceof UnsupportedBinaryRequestError) &&
      !stopped &&
      canStore() &&
      !envelopeContainsItemType(envelope, ['client_report']),
    createStore: () => ({
      push: (envelope) => store.push(envelope),
      unshift: (envelope) => store.unshift(envelope),
      shift: async () => {
        if (stopped || !replayEnabled || !hasConsent() || !canStore()) return undefined;
        const envelope = await store.shift();
        // 删除提交后的 Promise 交付仍可能退休 owner；撤权则交由 Core unshift 保留原记录。
        if (stopped || !canStore()) return undefined;
        // Core await 此交付后才调用 shouldSend；发送门禁须识别重放，不能阻止 closing 的新鲜 drain。
        if (envelope) replayed.add(envelope);
        return envelope;
      },
    }),
    flushAtStartup,
  });
  const wakeRetry = (): void => {
    try {
      // Core 的公开无参数 flush 将已有退避替换为一次最短 tick，不复制或访问其 timer。
      void Promise.resolve(transport.flush()).catch(() => {});
    } catch (_error) {
      /* 不让底层 flush 故障逃逸宿主恢复或清理入口。 */
    }
  };
  runtimes.set(transport, {
    requestReplay: () => {
      if (stopped || !hasConsent() || !canStore()) return;
      replayEnabled = true;
      wakeRetry();
    },
    stopReplay: () => {
      replayEnabled = false;
    },
    shutdown: () => {
      if (stopped) return;
      stopped = true;
      replayEnabled = false;
      // 退休门禁使该 tick 空转，尽早释放长退避持有的闭包；不再读盘或发送。
      wakeRetry();
    },
  });
  return transport;
}
