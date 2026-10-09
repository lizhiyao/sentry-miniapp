import type { Envelope, OfflineStore } from '@sentry/core';
import { appName, sdk, getStorageApi, type MiniappStorageApiName } from '../crossPlatform';
import { utf8ByteLength } from '../coreCompat';
import { withTelemetryCritical } from '../lifecycle';
import { resolveNonNegativeInteger } from '../numericOptions';
import { MAX_STORE_BYTES } from './envelopeCodec';
import {
  OFFLINE_STORE_KEY,
  LEGACY_OFFLINE_STORE_KEY,
  OfflineRecordCodec,
  readOfflineRoot,
  type OfflineRecord,
  type OfflineRoot,
} from './offlineRecords';

export type DropReason =
  'count' | 'bytes' | 'age' | 'target_changed' | 'policy_changed' | 'migration_drop';
export type EvictionMode = 'error-priority' | 'preserve-oldest';
export type StoreDiagnosticCode =
  | 'storage_error'
  | 'memory_only'
  | 'invalid_record'
  | 'serialization_error'
  | 'retired_write'
  | 'target_changed'
  | 'policy_changed'
  | 'migration_drop';
export interface OfflineStoreDiagnostics {
  mode: 'unknown' | 'persistent' | 'memory';
  codes: StoreDiagnosticCode[];
}
export interface MiniappOfflineStore extends OfflineStore {
  getDiagnostics(): OfflineStoreDiagnostics;
}
export interface MiniappOfflineStoreOptions {
  /** Canonical ingest target (DSN components and tunnel); never the request URL with SDK query fields. */
  targetId: string;
  /** Versioned privacy/storage policy; capacity, TTL and eviction are not identity. */
  policyId: string;
  offlineCacheLimit?: number;
  offlineCacheMaxAge?: number;
  maxBytes?: number;
  evictionMode?: EvictionMode;
  onDrop?: (reason: DropReason, dropped: number) => void;
}

/**
 * 支付宝单 key 额度为 200 KB；钉钉采用同样的保守预算，给宿主存储封装留余量。
 * 协议解析仍保留 MAX_STORE_BYTES，读入旧容器后按当前宿主预算裁剪，而非变更身份。
 */
function storageByteBudget(): number {
  const platform = appName();
  return platform === 'alipay' || platform === 'dingtalk' ? 180 * 1024 : MAX_STORE_BYTES;
}

/** One active owner, one target container. Commit before handing data to core or notifying users. */
export function createMiniappOfflineStore(
  options: MiniappOfflineStoreOptions,
  isActive: () => boolean = () => true,
): MiniappOfflineStore {
  const { targetId, policyId } = options;
  if (typeof targetId !== 'string' || typeof policyId !== 'string' || !targetId || !policyId)
    throw new Error('Offline store requires targetId and policyId');
  const countLimit = resolveNonNegativeInteger(options.offlineCacheLimit, 30);
  const maxAge = resolveNonNegativeInteger(options.offlineCacheMaxAge, 86400000);
  const byteLimit = Math.min(
    storageByteBudget(),
    resolveNonNegativeInteger(options.maxBytes, MAX_STORE_BYTES),
  );
  const codec = new OfflineRecordCodec(targetId);
  const evictionMode = options.evictionMode;
  const onDrop = options.onDrop;
  const codes = new Set<StoreDiagnosticCode>();
  let mode: OfflineStoreDiagnostics['mode'] = 'unknown';
  let memory: OfflineRecord[] = [];
  let legacyChecked = false;
  type Notice = { reason: DropReason; dropped: number };

  function active(): void {
    if (!isActive()) throw new Error('Offline store owner is retired');
  }
  function host(): Record<string, unknown> {
    active();
    const source = sdk() as unknown as Record<string, unknown>;
    active();
    return source;
  }
  function api(source: Record<string, unknown>, name: MiniappStorageApiName): Function | undefined {
    active();
    const method = getStorageApi(source, name);
    active();
    return typeof method === 'function' ? method : undefined;
  }
  function call(source: Record<string, unknown>, method: Function, ...args: unknown[]): unknown {
    active();
    const result: unknown = method.call(source, ...args);
    active();
    return result;
  }
  function fallback(code: StoreDiagnosticCode): void {
    codes.add(code);
    codes.add('memory_only');
    mode = 'memory';
    // Do not copy an uncommitted disk snapshot into memory: disk may still contain it.
    memory = [];
  }
  function root(records: OfflineRecord[]): OfflineRoot {
    return { schemaVersion: 1, targetId, policyId, records };
  }
  function read(notices: Notice[]): OfflineRecord[] {
    active();
    if (mode === 'memory') return memory.slice();
    const source = host();
    const get = api(source, 'getStorageSync');
    const set = api(source, 'setStorageSync');
    if (!get || !set) {
      fallback('memory_only');
      return [];
    }
    if (!legacyChecked) {
      const legacy = call(source, get, LEGACY_OFFLINE_STORE_KEY);
      if (legacy !== undefined && legacy !== null && legacy !== '') {
        const remove = api(source, 'removeStorageSync');
        if (!remove) throw new Error('Cannot discard legacy offline storage');
        call(source, remove, LEGACY_OFFLINE_STORE_KEY);
        codes.add('migration_drop');
      }
      legacyChecked = true;
    }
    const raw = call(source, get, OFFLINE_STORE_KEY);
    const result = readOfflineRoot(raw, targetId, policyId, codec);
    mode = 'persistent';
    if (result.state === 'empty') return [];
    if (result.state === 'discard') {
      const remove = api(source, 'removeStorageSync');
      if (!remove) throw new Error('Cannot discard incompatible offline storage');
      call(source, remove, OFFLINE_STORE_KEY);
      codes.add(result.reason);
      // Only the bounded parser can provide a count from a recognized root schema.
      if (result.dropped) notices.push({ reason: result.reason, dropped: result.dropped });
      return [];
    }
    if (result.invalidRecords > 0) codes.add('invalid_record');
    return result.root.records;
  }
  function commit(records: OfflineRecord[]): void {
    active();
    if (mode === 'memory') {
      memory = records;
      return;
    }
    const source = host();
    const set = api(source, 'setStorageSync');
    if (!set) throw new Error('Offline storage write unavailable');
    // Empty value costs no metadata budget, and does not require remove support for an owned root.
    const serialized = records.length ? JSON.stringify(root(records)) : '';
    if (utf8ByteLength(serialized) > byteLimit) throw new Error('Offline root exceeds byte budget');
    call(source, set, OFFLINE_STORE_KEY, serialized);
  }
  function crop(
    records: OfflineRecord[],
    context: 'push' | 'unshift',
    notices: Notice[],
  ): OfflineRecord[] {
    const now = Date.now();
    const kept = records.filter((record) => now - record.createdAt < maxAge);
    if (records.length > kept.length)
      notices.push({ reason: 'age', dropped: records.length - kept.length });
    const sizes = kept.map((record) => utf8ByteLength(JSON.stringify(record)));
    let bytes =
      utf8ByteLength(JSON.stringify(root([]))) +
      sizes.reduce((sum, size) => sum + size, 0) +
      Math.max(0, kept.length - 1);
    let count = kept.length;
    let order = kept.map((_record, index) => index);
    if (evictionMode === 'preserve-oldest' || context === 'unshift') order.reverse();
    if (evictionMode !== 'preserve-oldest') {
      // Stable partition: discard non-errors first, then errors in the same endpoint order.
      const isError = (index: number): boolean =>
        kept[index]!.payload.items.some((item) => item[0]['type'] === 'event');
      order = [...order.filter((index) => !isError(index)), ...order.filter(isError)];
    }
    const removed = new Set<number>();
    let countDrops = 0;
    let byteDrops = 0;
    for (const index of order) {
      if (count <= countLimit && (count === 0 || bytes <= byteLimit)) break;
      if (count > countLimit) countDrops++;
      else byteDrops++;
      removed.add(index);
      bytes -= sizes[index]! + (count > 1 ? 1 : 0);
      count--;
    }
    if (countDrops) notices.push({ reason: 'count', dropped: countDrops });
    if (byteDrops) notices.push({ reason: 'bytes', dropped: byteDrops });
    return kept.filter((_record, index) => !removed.has(index));
  }
  function notify(notices: Notice[]): void {
    for (const notice of notices) {
      if (!isActive()) break;
      if (notice.dropped <= 0) continue;
      try {
        onDrop?.(notice.reason, notice.dropped);
      } catch (_error) {
        /* Observers are isolated. */
      }
    }
  }
  function write(envelope: Envelope, context: 'push' | 'unshift'): Promise<void> {
    const confirmed: Notice[] = [];
    let candidate: OfflineRecord | undefined;
    let error: unknown;
    let failed = false;
    let serializationFailed = false;
    try {
      withTelemetryCritical(() => {
        active();
        try {
          candidate = codec.encode(envelope);
        } catch (failure) {
          serializationFailed = true;
          codes.add('serialization_error');
          throw failure;
        }
        const records = read(confirmed);
        const proposed: Notice[] = [];
        // Same identity may be retried only once in this container.
        const unique = records.filter((record) => record.recordId !== candidate!.recordId);
        if (context === 'push') unique.push(candidate!);
        else unique.unshift(candidate!);
        const next = crop(unique, context, proposed);
        commit(next);
        confirmed.push(...proposed);
      });
    } catch (failure) {
      failed = true;
      error = failure;
      if (!isActive()) codes.add('retired_write');
      else if (!serializationFailed) {
        fallback('storage_error');
        if (candidate) memory = crop([candidate], context, []);
      }
    }
    notify(confirmed);
    return failed ? Promise.reject(error) : Promise.resolve();
  }
  return {
    push: (envelope) => write(envelope, 'push'),
    unshift: (envelope) => write(envelope, 'unshift'),
    shift: async () => {
      if (!isActive()) return undefined;
      const confirmed: Notice[] = [];
      let envelope: Envelope | undefined;
      try {
        withTelemetryCritical(() => {
          const proposed: Notice[] = [];
          const records = crop(read(confirmed), 'push', proposed);
          const first = records.shift();
          if (first) envelope = codec.decode(first).envelope;
          // Never deliver before deletion/expiry pruning has committed.
          commit(records);
          confirmed.push(...proposed);
        });
      } catch (_error) {
        envelope = undefined;
        if (isActive()) fallback('storage_error');
      }
      notify(confirmed);
      return isActive() ? envelope : undefined;
    },
    getDiagnostics: () => ({ mode, codes: [...codes] }),
  };
}
