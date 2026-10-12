/** Core 实际使用 record 序列化和字符串参数名迭代，不要求完整 URL。 */
export function hasRequiredQueryRuntime(): boolean {
  try {
    const Native = globalThis.URLSearchParams;
    if (typeof Native !== 'function') return false;
    const record = new Native({ sentry_key: 'key', sentry_client: 'sdk/1.0' });
    const query = new Native('sentry%5Fkey+%E4%B8%AD%2B=');
    return (
      record.toString() === 'sentry_key=key&sentry_client=sdk%2F1.0' &&
      query.keys().next().value === 'sentry_key 中+'
    );
  } catch (_error) {
    return false;
  }
}

/** 安装独立回退时保留已有数据属性的约束。 */
export function ensureURLSearchParams(fallback: typeof URLSearchParams): void {
  if (hasRequiredQueryRuntime()) return;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams');
  Object.defineProperty(globalThis, 'URLSearchParams', {
    value: fallback,
    configurable: descriptor?.configurable ?? true,
    writable: descriptor && 'writable' in descriptor ? descriptor.writable : true,
  });
}
