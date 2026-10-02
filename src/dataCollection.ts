import {
  _INTERNAL_filterKeyValueData as coreFilterKeyValueData,
  filterCollectedUrlQuery,
} from '@sentry/core';
import type { Client, CollectBehavior } from '@sentry/core';

/**
 * core 11 的内置敏感片段（auth / token / secret / key / sid …，共 18 项）按大小写不敏感的
 * **片段**匹配键名。支付与证件类键不在其中，本 SDK 额外补齐；口径与内置名单一致，
 * 只作用于 SDK 自己采集的键值数据（请求 / 响应体、页面入参）。
 */
export const EXTRA_SENSITIVE_KEY_SNIPPETS: string[] = [
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'ssn',
  'idcard',
  'id_card',
];

/** 与 core 的 `getMaxBodyByteLength` 对齐：small=1 KB、medium=10 KB、默认 1 MB。 */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export type MaxBodySizeOption = 'small' | 'medium' | number;

export function resolveMaxBodyBytes(option: MaxBodySizeOption | undefined): number {
  if (option === 'small') return 1000;
  if (option === 'medium') return 10_000;
  if (typeof option === 'number' && option > 0) return option;
  return DEFAULT_MAX_BODY_BYTES;
}

/**
 * UTF-8 字节长度。小程序不保证有 `TextEncoder`（部分宿主与小游戏缺失），
 * 这里按码点自己算，行为在各平台一致。
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x80) bytes += 1;
    else if (codePoint < 0x800) bytes += 2;
    else if (codePoint < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** 按字节上限截断并补 `...`，与 core 的截断标记一致；结果不超过 maxBytes。 */
export function truncateToBytes(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) return value;

  const budget = Math.max(0, maxBytes - 3);
  let output = '';
  let used = 0;
  for (const character of value) {
    const size = utf8ByteLength(character);
    if (used + size > budget) break;
    output += character;
    used += size;
  }
  return `${output}...`;
}

/** 本 SDK 追加到 core 内置名单上的敏感键片段（core 内置部分由 core 自己判，不在此列）。 */
export function sensitiveDenyTerms(extra: string[] = []): string[] {
  return [...EXTRA_SENSITIVE_KEY_SNIPPETS, ...extra.map((term) => term.toLowerCase())];
}

/**
 * 递归按 core 的 `CollectBehavior` 脱敏键值数据：键名一律保留，值被就地替换为
 * `[Filtered]`。深度上限同时挡住自引用对象——这段代码跑在页面 `onLoad` 回调里，
 * 递归爆栈会把业务页面一起拖死。超过上限的值一律 `[Filtered]`：core 的 normalize
 * 本来也不会把它完整发出去，宁可少留也不漏敏感键。
 */
export const MAX_SANITIZE_DEPTH = 5;

export function sanitizeCollectedData(
  value: unknown,
  behavior: CollectBehavior,
  denyTerms: string[] = EXTRA_SENSITIVE_KEY_SNIPPETS,
  depth = 0,
): unknown {
  if (depth >= MAX_SANITIZE_DEPTH) return '[Filtered]';
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCollectedData(item, behavior, denyTerms, depth + 1));
  }
  if (value && typeof value === 'object') {
    return filterRecordLevel(
      value as Record<string, unknown>,
      behavior,
      denyTerms,
      depth,
    );
  }
  return value;
}

function filterRecordLevel(
  record: Record<string, unknown>,
  behavior: CollectBehavior,
  denyTerms: string[],
  depth: number,
): Record<string, unknown> {
  const prepared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    prepared[key] = sanitizeCollectedData(value, behavior, denyTerms, depth + 1);
  }
  return coreFilterKeyValueData(prepared, behavior, denyTerms);
}

/** 页面入参这类键值对象；`urlQueryParams: false` 时整块不采，返回 undefined。 */
export function collectKeyValueData(
  data: Record<string, unknown>,
  client: Client | undefined,
  extraDenyTerms: string[] = [],
): Record<string, unknown> | undefined {
  const behavior = client?.getDataCollectionOptions?.().urlQueryParams ?? true;
  if (behavior === false) return undefined;

  return filterRecordLevel(data, behavior, sensitiveDenyTerms(extraDenyTerms), 0) as Record<string, unknown>;
}

/**
 * 采集请求 / 响应体：**先**对能解析成 JSON 的体做敏感键脱敏，再按字节上限截断。
 * 顺序反了会把截断后的半截 JSON 解析失败，敏感字段原样发出。
 * 其余形态（form-urlencoded、纯文本）走 core 的 query 串过滤语义；
 * `filterCollectedUrlQuery` 在 `urlQueryParams: false` 时返回 undefined，此时保留原文——
 * 体采不采由 `httpBodies` 管，不该被 query 开关连带清空。
 * 体积按截断前的完整字节数上报，与 core 的 `request_body_size` 口径一致。
 */
export function collectBody(
  body: string,
  client: Client | undefined,
  maxBytes: number,
  extraDenyTerms: string[] = [],
): { body: string; byteLength: number } {
  const byteLength = utf8ByteLength(body);
  const denyTerms = sensitiveDenyTerms(extraDenyTerms);

  let sanitized = body;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      // 体本身由 httpBodies 门控；urlQueryParams=false 只该影响 query，
      // 所以这里恒按内置名单 + 追加片段脱敏，不因 query 开关把整块放过。
      sanitized = JSON.stringify(sanitizeCollectedData(parsed, true, denyTerms));
    }
  } catch (_error) {
    const filtered = filterCollectedUrlQuery(body, client);
    sanitized = filtered ?? body;
  }

  return { body: truncateToBytes(sanitized, maxBytes), byteLength };
}
