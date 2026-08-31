const sentryRequestOptions = new WeakSet<object>();

export function markSentryRequest(options: object): void {
  sentryRequestOptions.add(options);
}

export function isMarkedSentryRequest(options: unknown): boolean {
  return typeof options === 'object' && options !== null && sentryRequestOptions.has(options);
}
