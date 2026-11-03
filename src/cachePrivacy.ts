import type { CollectBehavior, ResolvedDataCollection } from '@sentry/core';
import type { MiniappOptions } from './types';
import { resolveMaxBodyBytes } from './dataCollection';

function terms(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))].sort();
}

function behavior(value: CollectBehavior): boolean | { allow: string[] } | { deny: string[] } {
  if (typeof value === 'boolean') return value;
  if ('allow' in value) return { allow: terms(value.allow) };
  const deny = terms(value.deny);
  return deny.length ? { deny } : true;
}

/** 与采集共用初始化快照，不保留调用方可变数组；非支持的配置在退休旧 runtime 前报错。 */
export function snapshotPrivacyOptions<T extends MiniappOptions>(options: T): T {
  const copy = { ...options };
  if (copy.cachePrivacyVersion !== undefined && typeof copy.cachePrivacyVersion !== 'string') {
    throw new TypeError('cachePrivacyVersion must be a string');
  }
  const dc = copy.dataCollection;
  if (dc) {
    const query = dc.urlQueryParams;
    copy.dataCollection = { ...dc };
    if (query && typeof query === 'object') {
      copy.dataCollection.urlQueryParams =
        'allow' in query ? { allow: [...query.allow] } : { deny: [...query.deny] };
    }
    if (dc.httpBodies) copy.dataCollection.httpBodies = [...dc.httpBodies];
  }
  if (copy.sensitiveKeys) copy.sensitiveKeys = [...copy.sensitiveKeys];
  const metadata = copy._metadata;
  if (metadata?.sdk) {
    copy._metadata = {
      ...metadata,
      sdk: { ...metadata.sdk, settings: { ...metadata.sdk.settings } },
    };
  }
  return copy;
}

/** 只纳入本 SDK 自动采集的生效策略，Core 负责默认值；不同身份一律整批失效。 */
export function cachePrivacyPolicy(
  options: MiniappOptions,
  dc: ResolvedDataCollection,
  inferIp: unknown,
): string {
  const bodies = options.traceNetworkBody
    ? ['outgoingRequest', 'outgoingResponse'].filter((direction) =>
        dc.httpBodies.includes(direction as 'outgoingRequest' | 'outgoingResponse'),
      )
    : [];
  return JSON.stringify([
    'miniapp-privacy-v3',
    options.requireConsent === true,
    dc.userInfo,
    inferIp,
    behavior(dc.urlQueryParams),
    bodies,
    bodies.length ? resolveMaxBodyBytes(options.maxRequestBodySize) : null,
    terms(options.sensitiveKeys ?? []),
    options.cachePrivacyVersion ?? '',
  ]);
}
