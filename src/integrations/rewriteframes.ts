import { rewriteFramesIntegration as coreRewriteFramesIntegration } from '@sentry/core';
import type { Integration } from '@sentry/core';

const DEFAULT_PREFIX = 'app:///';

/** 将各小程序宿主的虚拟路径归一化为 sentry-cli 可匹配的 app:/// 路径。 */
export function normalizeMiniappFrameFilename(
  filename: string,
  prefix: string = DEFAULT_PREFIX,
): string {
  if (filename.startsWith(prefix)) return filename;

  const normalized = filename
    .replace(/^(appservice|app-service|WAService)\//i, '')
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^chunks:\/\/\/?/i, 'chunks/')
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^\//, '');

  return `${prefix}${normalized}`;
}

/** 官方 RewriteFrames 处理器 + 小程序路径归一化规则。 */
export const rewriteFramesIntegration = (options: { prefix?: string } = {}): Integration => {
  const prefix = options.prefix || DEFAULT_PREFIX;
  return coreRewriteFramesIntegration({
    iteratee: (frame) =>
      frame.filename
        ? { ...frame, filename: normalizeMiniappFrameFilename(frame.filename, prefix) }
        : frame,
  });
};
