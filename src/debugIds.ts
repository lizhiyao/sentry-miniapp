import { getGlobalObjectCandidates } from './crossPlatform';

type DebugIdMap = Record<string, string>;
type DebugIdGlobal = {
  _sentryDebugIds?: Record<string, unknown>;
  _debugIds?: Record<string, unknown>;
};

function isDebugIdGlobal(value: unknown): value is DebugIdGlobal {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function syncDebugIdMapToCoreGlobal(
  target: DebugIdGlobal,
  candidates: DebugIdGlobal[],
  key: '_sentryDebugIds' | '_debugIds',
): void {
  const merged: DebugIdMap = {};
  let hasEntries = false;

  for (const candidate of candidates) {
    const candidateMap = candidate[key];
    if (!candidateMap) {
      continue;
    }
    for (const [stack, debugId] of Object.entries(candidateMap)) {
      if (merged[stack] === undefined && typeof debugId === 'string' && debugId) {
        merged[stack] = debugId;
        hasEntries = true;
      }
    }
  }

  if (hasEntries) {
    target[key] = merged;
  }
}

/**
 * @sentry/core 当前只从 globalThis 读取 Debug ID maps。微信小游戏等运行时可能由
 * sentry-cli 注入到 global / window / self，因此进入 core 事件准备流程前做一次同步。
 */
export function syncDebugIdsToCoreGlobal(): void {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const target = globalThis as DebugIdGlobal;
  const candidates = getGlobalObjectCandidates().filter(isDebugIdGlobal);
  syncDebugIdMapToCoreGlobal(target, candidates, '_sentryDebugIds');
  syncDebugIdMapToCoreGlobal(target, candidates, '_debugIds');
}
