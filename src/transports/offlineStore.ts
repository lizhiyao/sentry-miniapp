import type { Envelope } from '@sentry/core';
import type {
  OfflineStore,
  OfflineTransportOptions,
} from '@sentry/core/build/types/transports/offline';
import { sdk } from '../crossPlatform';

const DEFAULT_OFFLINE_CACHE_SIZE = 30;
const DEFAULT_MAX_AGE = 86400000; // 24 小时
const OFFLINE_STORE_KEY = 'sentry_offline_store';

interface CachedEnvelope {
  envelope: Envelope;
  timestamp: number;
}

export interface MiniappOfflineStoreOptions extends OfflineTransportOptions {
  offlineCacheLimit?: number;
  /** 离线缓存过期时间（ms），默认 86400000 (24h) */
  offlineCacheMaxAge?: number;
}

/**
 * Creates an offline store using miniapp storage API.
 * 支持事件过期淘汰和优先级保留。
 */
export function createMiniappOfflineStore(options: MiniappOfflineStoreOptions): OfflineStore {
  const maxCacheSize = options.offlineCacheLimit || DEFAULT_OFFLINE_CACHE_SIZE;
  const maxAge = options.offlineCacheMaxAge || DEFAULT_MAX_AGE;

  return {
    push: async (env: Envelope): Promise<void> => {
      try {
        let store = getStore();
        store = evictExpired(store, maxAge);

        store.push({ envelope: env, timestamp: Date.now() });

        // 超出上限时，优先丢弃非错误事件（transaction 等）
        while (store.length > maxCacheSize) {
          const nonErrorIdx = store.findIndex((item) => !isErrorEnvelope(item.envelope));
          if (nonErrorIdx >= 0) {
            store.splice(nonErrorIdx, 1);
          } else {
            store.shift(); // 全是错误事件则丢弃最早的
          }
        }

        setStore(store);
      } catch (e) {
        console.warn('[sentry-miniapp] Failed to push to offline store', e);
      }
    },
    unshift: async (env: Envelope): Promise<void> => {
      try {
        let store = getStore();
        store = evictExpired(store, maxAge);

        store.unshift({ envelope: env, timestamp: Date.now() });

        while (store.length > maxCacheSize) {
          const nonErrorIdx = findLastIndex(store, (item) => !isErrorEnvelope(item.envelope));
          if (nonErrorIdx >= 0) {
            store.splice(nonErrorIdx, 1);
          } else {
            store.pop();
          }
        }

        setStore(store);
      } catch (e) {
        console.warn('[sentry-miniapp] Failed to unshift to offline store', e);
      }
    },
    shift: async (): Promise<Envelope | undefined> => {
      try {
        let store = getStore();
        store = evictExpired(store, maxAge);

        if (store.length === 0) {
          return undefined;
        }
        const item = store.shift();
        setStore(store);
        return item?.envelope;
      } catch (e) {
        console.warn('[sentry-miniapp] Failed to shift from offline store', e);
        return undefined;
      }
    },
  };
}

/**
 * 判断 envelope 是否包含错误事件
 */
function isErrorEnvelope(envelope: Envelope): boolean {
  try {
    const items = envelope[1] || [];
    return items.some((item: any) => {
      const itemType = item[0]?.type;
      return itemType === 'event' || itemType === 'error';
    });
  } catch (_e) {
    return true; // 无法判断时当作错误事件保留
  }
}

/**
 * 淘汰过期事件
 */
function evictExpired(store: CachedEnvelope[], maxAge: number): CachedEnvelope[] {
  const now = Date.now();
  return store.filter((item) => now - item.timestamp < maxAge);
}

/**
 * 从后往前查找匹配项的索引
 */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}

function getStore(): CachedEnvelope[] {
  try {
    const storageApi = sdk().getStorageSync;
    if (storageApi) {
      const storedStr = storageApi(OFFLINE_STORE_KEY);
      if (storedStr) {
        const parsed = typeof storedStr === 'string' ? JSON.parse(storedStr) : storedStr;
        // 兼容旧版本格式（直接存储 Envelope[]）
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (parsed[0] && 'envelope' in parsed[0] && 'timestamp' in parsed[0]) {
            return parsed;
          }
          // 旧格式：直接是 Envelope 数组，迁移为新格式
          return parsed.map((env: Envelope) => ({
            envelope: env,
            timestamp: Date.now(),
          }));
        }
      }
    }
  } catch (_e) {
    // ignore
  }
  return [];
}

function setStore(store: CachedEnvelope[]): void {
  try {
    const storageApi = sdk().setStorageSync;
    if (storageApi) {
      storageApi(OFFLINE_STORE_KEY, JSON.stringify(store));
    }
  } catch (_e) {
    // ignore
  }
}
