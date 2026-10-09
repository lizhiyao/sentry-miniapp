import { isPlainObject, getSanitizedUrlString, parseUrl, stripDataUrlContent } from '@sentry/core';
import type { Client, CollectBehavior } from '@sentry/core';
import { resolveNonNegativeInteger } from './numericOptions';
import { filterKeyValueData as coreFilterKeyValueData, utf8ByteLength } from './coreCompat';
export { utf8ByteLength } from './coreCompat';

/**
 * core 11 的内置敏感片段（auth / token / secret / key / sid …）按大小写不敏感的
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
  return resolveNonNegativeInteger(option, DEFAULT_MAX_BODY_BYTES) || DEFAULT_MAX_BODY_BYTES;
}

/** 按字节上限截断并补 `...`，与 core 的截断标记一致；结果不超过 maxBytes。 */
export function truncateToBytes(value: string, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return '';
  if (utf8ByteLength(value) <= maxBytes) return value;

  const marker = '.'.repeat(Math.min(3, maxBytes));

  const budget = maxBytes - marker.length;
  let output = '';
  let used = 0;
  for (const character of value) {
    const size = utf8ByteLength(character);
    if (used + size > budget) break;
    output += character;
    used += size;
  }
  return `${output}${marker}`;
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
    return filterRecordLevel(value as Record<string, unknown>, behavior, denyTerms, depth);
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

  try {
    return filterRecordLevel(data, behavior, sensitiveDenyTerms(extraDenyTerms), 0);
  } catch (_error) {
    // 宿主入参可能含 getter/proxy；采集失败不能阻断业务回调。
    return undefined;
  }
}

/** SDK 自动产生的 URL 名称不含 query、fragment 或明文 userinfo。 */
export function collectUrlName(url: string): string {
  if (typeof url !== 'string') return '';
  const parsed = parseUrl(url);
  if (parsed.protocol === 'data') return stripDataUrlContent(url, false);
  if (parsed.protocol && !/^(https?|wxfile|ttfile|file)$/i.test(parsed.protocol)) {
    return `${parsed.protocol}:[Filtered]`;
  }
  return getSanitizedUrlString(parsed);
}

/** query 与 body 使用独立策略；敏感值替换不重排重复键或改变其他字段的编码。 */
export function collectQueryString(
  query: string | undefined,
  client: Client | undefined,
  extraDenyTerms: string[] = [],
): string | undefined {
  const behavior = client?.getDataCollectionOptions?.().urlQueryParams ?? true;
  if (!query || behavior === false) return undefined;
  return filterEncodedPairs(query.replace(/^\?/, ''), behavior, sensitiveDenyTerms(extraDenyTerms));
}

export function collectUrl(
  url: string,
  client: Client | undefined,
  extraDenyTerms: string[] = [],
): string {
  const name = collectUrlName(url);
  const parsed = parseUrl(url);
  const query =
    !parsed.protocol || /^(https?|wxfile|ttfile|file)$/i.test(parsed.protocol)
      ? collectQueryString(parsed.search, client, extraDenyTerms)
      : undefined;
  return query ? `${name}?${query}` : name;
}

/**
 * 采集请求 / 响应体：**先**对能解析成 JSON 的体做敏感键脱敏，再按字节上限截断。
 * 顺序反了会把截断后的半截 JSON 解析失败，敏感字段原样发出。
 * form-urlencoded 使用独立的 body 脱敏策略，保留重复键与非敏感字段原始编码；
 * 声明不支持的格式、未知纯文本、JSON 原始值、multipart/binary 或坏编码省略正文。
 * 体采不采由 `httpBodies` 管，不由 `urlQueryParams` 控制。
 * 体积按截断前的完整字节数上报，与 core 的 `request_body_size` 口径一致。
 */
export function collectBody(
  data: unknown,
  maxBytes: number,
  extraDenyTerms: string[] = [],
  contentType?: string,
): { body?: string; byteLength?: number } {
  // 保留真实 binary 视图的大小，但不把 bytes JSON 化后宣称已经按键脱敏。
  if (
    data &&
    typeof data === 'object' &&
    (Object.prototype.toString.call(data) === '[object ArrayBuffer]' ||
      (typeof ArrayBuffer !== 'undefined' &&
        typeof ArrayBuffer.isView === 'function' &&
        ArrayBuffer.isView(data)))
  ) {
    return { byteLength: (data as ArrayBuffer | ArrayBufferView).byteLength };
  }
  const structured = isPlainObject(data) || Array.isArray(data);
  if (typeof data !== 'string' && !structured) return {};
  const mime = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  const jsonType = mime === 'application/json' || mime?.endsWith('+json');
  const formType = mime === 'application/x-www-form-urlencoded';
  const unsupported = Boolean(mime && !jsonType && !formType);
  // 未知对象格式无法证明宿主的编码大小，不为了估算 size 调用其 JSON serializer。
  if (unsupported && typeof data !== 'string') return {};
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  if (typeof body !== 'string') return {};
  const byteLength = utf8ByteLength(body);
  const omitted = { byteLength };
  if (unsupported) return omitted;
  const denyTerms = sensitiveDenyTerms(extraDenyTerms);
  let sanitized: string;
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || (formType && !structured)) return omitted;
    // 体由 httpBodies 门控，与 query 无关；解析后的 object/array 经过 core 的键过滤。
    sanitized = JSON.stringify(sanitizeCollectedData(parsed, true, denyTerms));
  } catch (_error) {
    if (jsonType || !isFormBody(body)) return omitted;
    const filtered = filterEncodedPairs(body, true, denyTerms);
    if (filtered === undefined) return omitted;
    sanitized = filtered;
  }

  return { body: truncateToBytes(sanitized, maxBytes), byteLength };
}

function isFormBody(body: string): boolean {
  const pairs = body.split('&').filter(Boolean);
  return (
    pairs.length > 0 &&
    !/[\r\n]/.test(body) &&
    pairs.every((pair) => {
      const equals = pair.indexOf('=');
      // 无 content-type 时也只接收可确认的 URL-encoded 键值结构，不把任意文本当 query。
      return equals > 0 && /^[a-z0-9_.~*%+[\]-]+$/i.test(pair.slice(0, equals));
    })
  );
}

function filterEncodedPairs(
  body: string,
  behavior: CollectBehavior,
  denyTerms: string[],
): string | undefined {
  try {
    return body
      .split('&')
      .map((segment) => {
        const equals = segment.indexOf('=');
        const rawKey = equals < 0 ? segment : segment.slice(0, equals);
        const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
        // core 的结果对象有 Object.prototype；此键不能通过赋值判断过滤结果。
        if (key === '__proto__') return `${rawKey}=[Filtered]`;
        const filtered = coreFilterKeyValueData({ [key]: true }, behavior, denyTerms);
        return filtered[key] === '[Filtered]' ? `${rawKey}=[Filtered]` : segment;
      })
      .join('&');
  } catch (_error) {
    return undefined;
  }
}
