import type { Envelope, OfflineStore, OfflineTransportOptions } from '@sentry/core';
import { sdk } from '../crossPlatform';

const DEFAULT_OFFLINE_CACHE_SIZE = 30;
const DEFAULT_MAX_AGE = 86400000; // 24 小时
const OFFLINE_STORE_KEY = 'sentry_offline_store';
// 微信等平台单 key storage 上限约 1MB；留余量到 900KB，超出则按淘汰策略丢弃再写，
// 避免 setStorageSync 因超限抛错导致整批离线缓存写入静默失败。
const DEFAULT_MAX_STORE_BYTES = 900 * 1024;

interface CachedEnvelope {
  envelope: Envelope;
  timestamp: number;
}

/** 因超限 / 过期丢弃事件的原因。 */
export type DropReason = 'count' | 'bytes' | 'age';

/**
 * 缓存淘汰策略：
 * - `'error-priority'`（默认，弱网重试场景）：满则优先丢弃最旧的非 error 事件，保留异常。
 * - `'preserve-oldest'`（同意门禁场景）：满则从**最新**端丢弃，保留最旧的冷启动数据。
 */
export type EvictionMode = 'error-priority' | 'preserve-oldest';

export interface MiniappOfflineStoreOptions extends OfflineTransportOptions {
  offlineCacheLimit?: number;
  /** 离线缓存过期时间（ms），默认 86400000 (24h) */
  offlineCacheMaxAge?: number;
  /** 单 key 字节上限（默认约 900KB，受平台 Storage 限制） */
  maxBytes?: number;
  /** 淘汰策略，默认 `'error-priority'` */
  evictionMode?: EvictionMode;
  /** 因超限 / 过期丢弃事件时回调（用于可观测，如同意前缓存丢弃统计） */
  onDrop?: (reason: DropReason, dropped: number) => void;
}

/**
 * Creates an offline store using miniapp storage API.
 * 支持事件过期淘汰、按条数 / 体积上限淘汰，以及两种淘汰策略（见 {@link EvictionMode}）。
 */
export function createMiniappOfflineStore(options: MiniappOfflineStoreOptions): OfflineStore {
  // 用 ?? 而非 ||：尊重显式的 0（|| 会把 0 当成未设置而回退默认值）。
  const maxCacheSize = options.offlineCacheLimit ?? DEFAULT_OFFLINE_CACHE_SIZE;
  const maxAge = options.offlineCacheMaxAge ?? DEFAULT_MAX_AGE;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_STORE_BYTES;
  const evictionMode = options.evictionMode ?? 'error-priority';
  const onDrop = options.onDrop;

  function report(reason: DropReason, dropped: number): void {
    if (dropped > 0 && typeof onDrop === 'function') {
      try {
        onDrop(reason, dropped);
      } catch (_e) {
        // 回调里抛错不应影响 store 主流程
      }
    }
  }

  /** 淘汰过期事件，返回保留下来的子集并上报丢弃数。 */
  function evictExpired(store: CachedEnvelope[]): CachedEnvelope[] {
    const now = Date.now();
    const kept = store.filter((item) => now - item.timestamp < maxAge);
    report('age', store.length - kept.length);
    return kept;
  }

  /**
   * 按条数上限就地淘汰，返回丢弃条数。
   * context 区分 push（新事件在尾部）与 unshift（重试事件回插到头部）：error-priority 下分别
   * 丢最旧 / 最新的非 error，避免 unshift 立刻把刚回插的事件淘汰掉。preserve-oldest 一律丢最新。
   */
  function evictByCount(store: CachedEnvelope[], context: 'push' | 'unshift'): number {
    let dropped = 0;
    while (store.length > maxCacheSize) {
      if (evictionMode === 'preserve-oldest') {
        store.pop(); // 丢最新，保留最旧（冷启动）
      } else if (context === 'push') {
        const nonErrorIdx = store.findIndex((item) => !isErrorEnvelope(item.envelope));
        if (nonErrorIdx >= 0) {
          store.splice(nonErrorIdx, 1);
        } else {
          store.shift(); // 全是错误事件则丢弃最早的
        }
      } else {
        const nonErrorIdx = findLastIndex(store, (item) => !isErrorEnvelope(item.envelope));
        if (nonErrorIdx >= 0) {
          store.splice(nonErrorIdx, 1);
        } else {
          store.pop();
        }
      }
      dropped++;
    }
    return dropped;
  }

  /** 写回 storage：超出字节上限时按策略丢弃再写，避免 setStorageSync 因超限整批失败。 */
  function persist(store: CachedEnvelope[]): void {
    const storageApi = sdk().setStorageSync;
    if (!storageApi) {
      return;
    }
    let working = store;
    let serialized = JSON.stringify(working);
    let dropped = 0;
    while (working.length > 0 && utf8ByteLength(serialized) > maxBytes) {
      if (evictionMode === 'preserve-oldest') {
        working = working.slice(0, working.length - 1); // 丢最新（末尾）
      } else {
        const nonErrorIdx = working.findIndex((item) => !isErrorEnvelope(item.envelope));
        const dropIdx = nonErrorIdx >= 0 ? nonErrorIdx : 0;
        working = working.slice(0, dropIdx).concat(working.slice(dropIdx + 1));
      }
      dropped++;
      serialized = JSON.stringify(working);
    }
    report('bytes', dropped);
    try {
      storageApi(OFFLINE_STORE_KEY, serialized);
    } catch (_e) {
      // ignore（已尽力压到上限内；极端单条仍超限则吞掉，不阻断主流程）
    }
  }

  return {
    push: async (env: Envelope): Promise<void> => {
      try {
        const store = evictExpired(getStore());
        store.push({ envelope: env, timestamp: Date.now() });
        report('count', evictByCount(store, 'push'));
        persist(store);
      } catch (e) {
        console.warn('[sentry-miniapp] Failed to push to offline store', e);
      }
    },
    unshift: async (env: Envelope): Promise<void> => {
      try {
        const store = evictExpired(getStore());
        store.unshift({ envelope: env, timestamp: Date.now() });
        report('count', evictByCount(store, 'unshift'));
        persist(store);
      } catch (e) {
        console.warn('[sentry-miniapp] Failed to unshift to offline store', e);
      }
    },
    shift: async (): Promise<Envelope | undefined> => {
      try {
        const before = getStore();
        const store = evictExpired(before);
        if (store.length === 0) {
          if (before.length > 0) {
            persist(store);
          }
          return undefined;
        }
        const item = store.shift();
        persist(store);
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
