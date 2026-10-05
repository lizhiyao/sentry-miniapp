import { uuid4, type DsnComponents, type Envelope } from '@sentry/core';
import { utf8ByteLength } from '../coreCompat';
import {
  decodeEnvelope,
  encodeEnvelope,
  MAX_STORE_BYTES,
  type EncodedEnvelope,
} from './envelopeCodec';

export const OFFLINE_STORE_KEY = 'sentry_miniapp_offline_v2';
export const LEGACY_OFFLINE_STORE_KEY = 'sentry_offline_store';

export interface OfflineRecord {
  schemaVersion: 1;
  targetId: string;
  recordId: string;
  createdAt: number;
  payload: EncodedEnvelope;
}

export interface OfflineRoot {
  schemaVersion: 1;
  targetId: string;
  policyId: string;
  records: OfflineRecord[];
}

export type RootReadResult =
  | { state: 'empty' }
  | {
      state: 'discard';
      reason: 'target_changed' | 'policy_changed' | 'migration_drop';
      dropped?: number;
    }
  | { state: 'ready'; root: OfflineRoot; invalidRecords: number };

/** 使用 core 已解析的 DSN；身份包含实际 ingest 目标，不包含废弃的私钥。 */
export function offlineTargetId(dsn: DsnComponents, tunnel?: string): string {
  const protocol = dsn.protocol;
  const port = dsn.port || '';
  return JSON.stringify([
    protocol,
    dsn.host.toLowerCase(),
    port === (protocol === 'https' ? '443' : '80') ? '' : port,
    dsn.path || '',
    dsn.projectId,
    dsn.publicKey || '',
    tunnel || '',
  ]);
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 元数据只属于离线协议，重试时沿用；绝不写入线上 envelope header。 */
export class OfflineRecordCodec {
  private readonly identities = new WeakMap<Envelope, { recordId: string; createdAt: number }>();

  public constructor(private readonly targetId: string) {}

  public encode(envelope: Envelope): OfflineRecord {
    const payload = encodeEnvelope(envelope);
    let identity = this.identities.get(envelope);
    if (!identity) {
      identity = { recordId: uuid4(), createdAt: Date.now() };
      this.identities.set(envelope, identity);
    }
    return { schemaVersion: 1, targetId: this.targetId, ...identity, payload };
  }

  public decode(value: unknown): { record: OfflineRecord; envelope: Envelope } {
    if (
      !object(value) ||
      value['schemaVersion'] !== 1 ||
      value['targetId'] !== this.targetId ||
      typeof value['recordId'] !== 'string' ||
      !/^[a-f0-9]{32}$/.test(value['recordId']) ||
      !Number.isSafeInteger(value['createdAt']) ||
      (value['createdAt'] as number) < 0
    )
      throw new Error('Invalid offline record');
    const envelope = decodeEnvelope(value['payload']);
    const identity = { recordId: value['recordId'], createdAt: value['createdAt'] as number };
    this.identities.set(envelope, identity);
    return {
      // decodeEnvelope 已校验 discriminator/header/bytes；保持原存储值，避免再编码二进制。
      record: {
        schemaVersion: 1,
        targetId: this.targetId,
        ...identity,
        payload: value['payload'] as EncodedEnvelope,
      },
      envelope,
    };
  }
}

/** 外部 storage 值先按总字节预算检查，再解析。坏记录隔离，未知根协议整批丢弃。 */
export function readOfflineRoot(
  raw: unknown,
  targetId: string,
  policyId: string,
  codec: OfflineRecordCodec,
): RootReadResult {
  if (raw === undefined || raw === null || raw === '') return { state: 'empty' };
  if (
    typeof raw !== 'string' ||
    raw.length > MAX_STORE_BYTES ||
    utf8ByteLength(raw) > MAX_STORE_BYTES
  )
    return { state: 'discard', reason: 'migration_drop' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (_error) {
    return { state: 'discard', reason: 'migration_drop' };
  }
  if (
    !object(value) ||
    value['schemaVersion'] !== 1 ||
    typeof value['targetId'] !== 'string' ||
    typeof value['policyId'] !== 'string' ||
    !Array.isArray(value['records'])
  )
    return { state: 'discard', reason: 'migration_drop' };
  if (value['targetId'] !== targetId)
    return { state: 'discard', reason: 'target_changed', dropped: value['records'].length };
  if (value['policyId'] !== policyId)
    return { state: 'discard', reason: 'policy_changed', dropped: value['records'].length };
  const records: OfflineRecord[] = [];
  const ids = new Set<string>();
  let invalidRecords = 0;
  for (const candidate of value['records']) {
    try {
      const { record } = codec.decode(candidate);
      if (ids.has(record.recordId)) throw new Error('Duplicate offline record');
      ids.add(record.recordId);
      records.push(record);
    } catch (_error) {
      invalidRecords += 1;
    }
  }
  return {
    state: 'ready',
    root: { schemaVersion: 1, targetId, policyId, records },
    invalidRecords,
  };
}
