import { hasRequiredQueryRuntime } from './queryRuntime';

// 不导入 Core，不安装标准方法；在共享 SDK 实现求值前报告缺失能力。
export function assertRequiredRuntime(): void {
  const missing: string[] = [];
  if (typeof globalThis === 'undefined') missing.push('globalThis');
  if (typeof Array.prototype.includes !== 'function') missing.push('Array.prototype.includes');
  if (typeof Object.entries !== 'function') missing.push('Object.entries');
  if (typeof Object.values !== 'function') missing.push('Object.values');
  if (typeof Object.fromEntries !== 'function') missing.push('Object.fromEntries');
  if (typeof Promise === 'undefined' || typeof Promise.allSettled !== 'function')
    missing.push('Promise.allSettled');
  const stringMethods = String.prototype as unknown as {
    isWellFormed?: unknown;
    toWellFormed?: unknown;
  };
  if (typeof stringMethods.isWellFormed !== 'function')
    missing.push('String.prototype.isWellFormed');
  if (typeof stringMethods.toWellFormed !== 'function')
    missing.push('String.prototype.toWellFormed');
  if (!hasRequiredQueryRuntime()) missing.push('URLSearchParams');
  if (missing.length) {
    throw new Error(
      `[sentry-miniapp/lite] Missing runtime capabilities: ${missing.join(', ')}. ` +
        'Load application polyfills before importing the SDK, or use sentry-miniapp.',
    );
  }
}

assertRequiredRuntime();
