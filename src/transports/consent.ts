import { envelopeContainsItemType, makeOfflineTransport, resolvedSyncPromise } from '@sentry/core';
import type { BaseTransportOptions, Envelope, OfflineStore, Transport } from '@sentry/core';

type ConsentStateReader = () => boolean;

/**
 * 在 miniapp 生命周期同步段内执行同意判断，同时复用 core 的离线重试能力。
 *
 * core offline transport 的 `shouldSend` 会被 `await`，即使返回 boolean 也会产生微任务。
 * 抖音小游戏在 onHide 返回后可能冻结 JS，因此门禁必须在调用 core transport 前同步完成。
 */
export function createConsentAwareOfflineTransport(
  baseTransport: Transport,
  options: BaseTransportOptions,
  store: OfflineStore,
  hasConsent: ConsentStateReader,
): Transport {
  const isClientReport = (envelope: Envelope): boolean =>
    envelopeContainsItemType(envelope, ['client_report']);

  const consentGuardedTransport: Transport = {
    send: (envelope) => {
      if (hasConsent()) {
        return baseTransport.send(envelope);
      }

      // 已安排的离线重试可能遇到中途撤回同意。同步放回队首，并用 4xx 阻止 core
      // 继续安排重试；下次 setConsent(true) 会显式触发 flush。
      if (!isClientReport(envelope)) {
        void store.unshift(envelope);
      }
      return resolvedSyncPromise({ statusCode: 403 });
    },
    flush: (timeout) => baseTransport.flush(timeout),
  };

  const offlineTransport = makeOfflineTransport(() => consentGuardedTransport)({
    ...options,
    createStore: () => store,
    // requireConsent 初始化时默认未同意，必须等 setConsent(true) 后才能排空历史缓存。
    flushAtStartup: false,
  });

  return {
    send: (envelope) => {
      if (hasConsent()) {
        return offlineTransport.send(envelope);
      }
      if (isClientReport(envelope)) {
        return resolvedSyncPromise({});
      }

      // createMiniappOfflineStore 在返回 Promise 前已同步完成 Storage 写入。
      return resolvedSyncPromise(store.push(envelope)).then(() => ({}));
    },
    flush: (timeout) =>
      hasConsent() ? offlineTransport.flush(timeout) : baseTransport.flush(timeout),
  };
}
