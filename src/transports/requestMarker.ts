const sentryRequestOptions = new WeakSet<object>();

export function markSentryRequest(options: object): void {
  markObject(options);

  const requestOptions = options as Record<string, unknown>;
  markObject(requestOptions['header']);
  markObject(requestOptions['headers']);
}

export function isMarkedSentryRequest(options: unknown): boolean {
  if (!isObject(options)) return false;
  if (sentryRequestOptions.has(options)) return true;

  const requestOptions = options as Record<string, unknown>;
  return isMarkedObject(requestOptions['header']) || isMarkedObject(requestOptions['headers']);
}

function markObject(value: unknown): void {
  if (isObject(value)) sentryRequestOptions.add(value);
}

function isMarkedObject(value: unknown): boolean {
  return isObject(value) && sentryRequestOptions.has(value);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
