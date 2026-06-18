import type { Envelope, OfflineStore, OfflineTransportOptions } from '@sentry/core';
import { sdk } from '../crossPlatform';

const DEFAULT_OFFLINE_CACHE_SIZE = 30;
const DEFAULT_MAX_AGE = 86400000; // 24 小时
const OFFLINE_STORE_KEY = 'sentry_offline_store';
// 微信等平台单 key storage 上限约 1MB；留余量到 900KB，超出则丢最旧非错误事件再写，
// 避免 setStorageSync 因超限抛错导致整批离线缓存写入静默失败。
const MAX_STORE_BYTES = 900 * 1024;

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
  // 用 ?? 而非 ||：尊重显式的 0（|| 会把 0 当成未设置而回退默认值）。
  const maxCacheSize = options.offlineCacheLimit ?? DEFAULT_OFFLINE_CACHE_SIZE;
  const maxAge = options.offlineCacheMaxAge ?? DEFAULT_MAX_AGE;

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
  const storageApi = sdk().getStorageSync;
  if (!storageApi) {
    return [];
  }
  let storedStr: any;
  try {
    storedStr = storageApi(OFFLINE_STORE_KEY);
  } catch (_e) {
    return [];
  }
  if (!storedStr) {
    return [];
  }
  try {
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
    return [];
  } catch (_e) {
    // 解析失败 = 存储被写坏（部分写入 / 配额截断等）。主动清键自愈，避免坏数据常驻、
    // 让后续 flush 永远读到空，且坏 blob 一直占着这个 key 的空间。
    removeStore();
    return [];
  }
}

function removeStore(): void {
  try {
    const removeApi = sdk().removeStorageSync;
    if (removeApi) {
      removeApi(OFFLINE_STORE_KEY);
    }
  } catch (_e) {
    // ignore
  }
}

function setStore(store: CachedEnvelope[]): void {
  const storageApi = sdk().setStorageSync;
  if (!storageApi) {
    return;
  }
  let working = store;
  let serialized = JSON.stringify(working);
  // 超出单 key 体积上限时，从最旧的非错误事件开始丢弃（错误事件优先保留），直到落回上限内。
  // 否则 setStorageSync 直接抛错 → 整批离线缓存写入静默失败（连已缓存的也一起丢）。
  while (working.length > 0 && utf8ByteLength(serialized) > MAX_STORE_BYTES) {
    const nonErrorIdx = working.findIndex((item) => !isErrorEnvelope(item.envelope));
    const dropIdx = nonErrorIdx >= 0 ? nonErrorIdx : 0;
    working = working.slice(0, dropIdx).concat(working.slice(dropIdx + 1));
    serialized = JSON.stringify(working);
  }
  try {
    storageApi(OFFLINE_STORE_KEY, serialized);
  } catch (_e) {
    // ignore（已尽力压到上限内；极端单条仍超限则吞掉，不阻断主流程）
  }
}

/** 估算字符串的 UTF-8 字节数（小程序运行时不保证有 TextEncoder），用于体积上限判断。 */
function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // 代理对：一个 4 字节字符，跳过低位代理
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
