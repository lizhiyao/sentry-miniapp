import type { Envelope } from '@sentry/core';
import type { OfflineStore, OfflineTransportOptions } from '@sentry/core/build/types/transports/offline';
import { sdk } from '../crossPlatform';

const MAX_OFFLINE_CACHE_SIZE = 30; // 最大缓存数量
const OFFLINE_STORE_KEY = 'sentry_offline_store';

/**
 * Creates an offline store using miniapp storage API
 */
export function createMiniappOfflineStore(_options: OfflineTransportOptions): OfflineStore {
  return {
    push: async (env: Envelope): Promise<void> => {
      try {
        const store = getStore();
        store.push(env);
        if (store.length > MAX_OFFLINE_CACHE_SIZE) {
          store.shift(); // 移除最早的缓存以限制大小
        }
        setStore(store);
      } catch (e) {
        console.warn('[Sentry] Failed to push to offline store', e);
      }
    },
    unshift: async (env: Envelope): Promise<void> => {
      try {
        const store = getStore();
        store.unshift(env);
        if (store.length > MAX_OFFLINE_CACHE_SIZE) {
          store.pop(); // 移除最旧的缓存以限制大小
        }
        setStore(store);
      } catch (e) {
        console.warn('[Sentry] Failed to unshift to offline store', e);
      }
    },
    shift: async (): Promise<Envelope | undefined> => {
      try {
        const store = getStore();
        if (store.length === 0) {
          return undefined;
        }
        const env = store.shift();
        setStore(store);
        return env;
      } catch (e) {
        console.warn('[Sentry] Failed to shift from offline store', e);
        return undefined;
      }
    },
  };
}

function getStore(): Envelope[] {
  try {
    const storageApi = sdk().getStorageSync;
    if (storageApi) {
      const storedStr = storageApi(OFFLINE_STORE_KEY);
      if (storedStr) {
        // storage API may return string or parsed object directly depending on platform
        return typeof storedStr === 'string' ? JSON.parse(storedStr) : storedStr;
      }
    }
  } catch (e) {
    // ignore
  }
  return [];
}

function setStore(store: Envelope[]): void {
  try {
    const storageApi = sdk().setStorageSync;
    if (storageApi) {
      storageApi(OFFLINE_STORE_KEY, JSON.stringify(store));
    }
  } catch (e) {
    // ignore
  }
}
