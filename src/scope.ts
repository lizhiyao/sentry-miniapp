import { getCurrentScope, type Scope } from '@sentry/core';

/**
 * Lightweight replacement for the removed `configureScope` helper.
 * Invokes the provided callback with the current scope.
 */
export function configureScope(callback: (scope: Scope) => void): void {
  const scope = getCurrentScope();
  callback(scope);
}
