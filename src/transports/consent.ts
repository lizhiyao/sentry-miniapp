import { envelopeContainsItemType, makeOfflineTransport } from '@sentry/core';
import type { BaseTransportOptions, OfflineStore, Transport } from '@sentry/core';
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
  const transport = makeOfflineTransport(() => baseTransport)({
    ...options,
    shouldSend: () => !stopped && hasConsent(),
    shouldStore: (envelope, error) =>
      !(error instanceof UnsupportedBinaryRequestError) &&
      !stopped &&
      canStore() &&
      !envelopeContainsItemType(envelope, ['client_report']),
    createStore: () => ({
      push: (envelope) => store.push(envelope),
      unshift: (envelope) => store.unshift(envelope),
      // 已安排的单次 timer 可空转，但未授权或退休 owner 不消费磁盘记录。
      shift: () =>
        !stopped && replayEnabled && hasConsent() && canStore()
          ? store.shift()
          : Promise.resolve(undefined),
    }),
    flushAtStartup,
  });
  runtimes.set(transport, {
    requestReplay: () => {
      if (stopped || !hasConsent() || !canStore()) return;
      replayEnabled = true;
      try {
        // 只有 undefined 调用才会触发 core 的 MIN_DELAY 重试，正 timeout 不会。
        void Promise.resolve(transport.flush()).catch(() => {});
      } catch (_error) {
        /* 不让底层 flush 故障逃逸宿主恢复入口。 */
      }
    },
    stopReplay: () => {
      replayEnabled = false;
    },
    shutdown: () => {
      stopped = true;
      replayEnabled = false;
    },
  });
  return transport;
}
