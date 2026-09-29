import { setAttributes } from '@sentry/core';

import { getAccountInfo, getSystemInfo, resolveMiniappPlatform } from './crossPlatform';
import type { MiniappOptions } from './types';

/**
 * 把 SDK 自动采集的运行环境维度写成隔离作用域属性，让 streamed span 也带上它们。
 *
 * core 11 的 span 只携带 attributes：scope tags 不再继承，contexts 也只有 response /
 * profile / culture 等白名单会被映射。设备与系统如果只进事件，Performance / Traces 里
 * 就按机型、系统切不出来。
 *
 * 键名使用 `@sentry/conventions` 的 OTel 语义常量（`os.name` / `os.version` / `os.type` /
 * `device.manufacturer` / `device.model` / `app.app_version`），并按该语义拆分取值：事件的
 * `contexts.os.version` 是宿主版本、宿主版本在这里另用 `miniapp.host_version` 表达，两个
 * 通道里同名键必须同义。
 */
export function applyAutoSpanDimensions(options: MiniappOptions = {}): void {
  const dimensions: Record<string, unknown> = {
    'miniapp.platform': resolveMiniappPlatform(options),
  };

  if (options.enableSystemInfo !== false) {
    const info = getSystemInfo();
    if (info) {
      const [osName = 'unknown', osVersion = 'unknown'] = (info.system || '').split(' ');
      dimensions['device.manufacturer'] = info.brand || 'unknown';
      dimensions['device.model'] = info.model || 'unknown';
      dimensions['os.name'] = osName;
      dimensions['os.version'] = osVersion;
      dimensions['os.type'] = (info.platform || 'unknown').toLowerCase();
      // 与事件 contexts.miniapp.host_version 同义：小程序宿主（微信 / 抖音等）的版本号。
      dimensions['miniapp.host_version'] = info.version || 'unknown';
    }

    const account = getAccountInfo();
    // 宿主缺失时 getAccountInfo 返回 'unknown' 占位，不该作为 span 维度发出。
    if (account.version && account.version !== 'unknown') {
      // 与事件 contexts.app.app_version 同义：小程序自身的版本号，不是宿主版本。
      dimensions['app.app_version'] = account.version;
    }
  }

  try {
    setAttributes(dimensions);
  } catch (error) {
    if (options.debug) {
      console.warn('[sentry-miniapp] 写入 span 维度属性失败:', error);
    }
  }
}
