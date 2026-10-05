import { getCombinedScopeData, getCurrentScope, getIsolationScope } from '@sentry/core';
import type { Client, SpanAttributes, SpanAttributeValue } from '@sentry/core';
import { getClientEnvironment } from './clientState';

/** 仅登记稳定能力字段；route/network 由自动 producer 在创建时捕获。 */
export function setClientSpanDimension(
  client: Client | undefined,
  key: string,
  value: string | number | boolean,
): void {
  if (client) getClientEnvironment(client).spanAttributes[key] = value;
}

function currentPageRoute(): string | undefined {
  try {
    const getter = (
      globalThis as { getCurrentPages?: () => Array<{ route?: string; __route__?: string }> }
    ).getCurrentPages;
    const pages = getter?.();
    const page = pages?.[pages.length - 1];
    return page?.route || page?.__route__ || undefined;
  } catch (_error) {
    return undefined;
  }
}

function creationValue(raw: unknown): SpanAttributeValue | undefined {
  try {
    let value = raw;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('unit' in value || !('value' in value)) return undefined;
      value = value.value;
    }
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (!Array.isArray(value)) return undefined;
    if (value.every((item) => typeof item === 'string')) return value as string[];
    if (value.every((item) => typeof item === 'boolean')) return value as boolean[];
    if (value.every((item) => typeof item === 'number' && Number.isFinite(item)))
      return value as number[];
    return undefined;
  } catch (_error) {
    return undefined;
  }
}

/** 初始属性用于 core 创建时采样；只检查此操作需要的 scope 键。 */
export function automaticSpanAttributes(
  client: Client | undefined,
  operation: SpanAttributes,
  includeCurrentRoute = true,
): SpanAttributes {
  if (!client) return operation;
  const state = getClientEnvironment(client);
  const attributes: SpanAttributes = { ...state.spanAttributes };
  const route = includeCurrentRoute ? (currentPageRoute() ?? state.route) : undefined;
  if (route) attributes['route'] = route;
  const network = state.contexts['network']?.['type'];
  if (typeof network === 'string') attributes['network.type'] = network;
  const scopeAttributes = getCombinedScopeData(getIsolationScope(), getCurrentScope()).attributes;
  for (const key of new Set([
    ...Object.keys(attributes),
    ...Object.keys(operation),
    'network.type',
    ...(includeCurrentRoute ? ['route'] : []),
  ])) {
    if (!(key in scopeAttributes)) continue;
    const value = creationValue(scopeAttributes[key]);
    if (value === undefined) delete attributes[key];
    else attributes[key] = value;
  }
  return { ...attributes, ...operation };
}

/** core 已合并捕获的公共 attributes，只补稳定的缺失键。 */
export function registerClientSpanDimensions(client: Client): () => void {
  const state = getClientEnvironment(client);
  return client.on('preprocessSpan', (span) => {
    for (const [key, value] of Object.entries(state.spanAttributes)) {
      if (value !== undefined && !(key in span.attributes)) span.attributes[key] = value;
    }
  });
}
