import type { Client, StreamedSpanJSON } from '@sentry/core';

import { getAccountInfo, getSystemInfo, resolveMiniappPlatform } from './crossPlatform';
import type { MiniappOptions } from './types';

/**
 * SDK 自动采集的运行环境维度，按 client 附加到 span 上。
 *
 * core 11 的 streamed span 只携带 attributes：scope tags 不再继承，contexts 也只有
 * response / profile / culture 等白名单会被映射，所以设备、系统、页面这些维度需要显式补齐，
 * 否则 Performance / Traces 里切不出来。
 *
 * 这些维度属于「哪个 client 在采集」，不能写进跨 client 共享的 isolation scope：那样一旦换
 * client 或下一轮 init 关掉 `enableSystemInfo`，旧值仍会跟着新 span 发出去。因此走 core 公开
 * 的 `processSpan` 钩子，在 span 处理阶段按所属 client 填充，并且不覆盖已存在的属性。
 *
 * 键名沿用 `@sentry/conventions` 的 OTel 语义（`os.name` / `os.version` / `os.type` /
 * `device.manufacturer` / `device.model` / `app.app_version`）；宿主版本与小程序版本分用
 * `miniapp.host_version` 与 `app.app_version` 两个键。
 */

type SpanDimensionValue = string | number | boolean;

const dynamicDimensions = new WeakMap<Client, Record<string, SpanDimensionValue>>();

/** 供各集成登记属于本 client 的动态维度（网络类型、性能能力标记等）。 */
export function setClientSpanDimension(
  client: Client | undefined,
  key: string,
  value: SpanDimensionValue,
): void {
  if (!client) {
    return;
  }

  const store = dynamicDimensions.get(client);
  if (store) {
    store[key] = value;
  } else {
    dynamicDimensions.set(client, { [key]: value });
  }
}

/** 小程序同一时刻只有一个前台页面，页面栈栈顶就是当前 route；小游戏没有 getCurrentPages。 */
function currentPageRoute(): string | undefined {
  const pagesGetter = (globalThis as { getCurrentPages?: () => Array<{ route?: string; __route__?: string }> }).getCurrentPages;
  if (typeof pagesGetter !== 'function') {
    return undefined;
  }

  try {
    const pages = pagesGetter();
    const current = pages?.[pages.length - 1];
    return current?.route || current?.__route__ || undefined;
  } catch (_error) {
    return undefined;
  }
}

function collectDimensions(options: MiniappOptions): Record<string, SpanDimensionValue | undefined> {
  const dimensions: Record<string, SpanDimensionValue | undefined> = {
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
      dimensions['miniapp.host_version'] = info.version || 'unknown';
    }

    const account = getAccountInfo();
    // 宿主缺失时 getAccountInfo 返回 'unknown' 占位，不该作为 span 维度发出。
    if (account.version && account.version !== 'unknown') {
      dimensions['app.app_version'] = account.version;
    }
  }

  dimensions['route'] = currentPageRoute();

  return dimensions;
}

/** 在本 client 的每个 span 结束进入处理阶段时补齐维度；已存在的属性一律保留。 */
export function registerClientSpanDimensions(client: Client): () => void {
  return client.on('processSpan', (spanJSON: StreamedSpanJSON) => {
    try {
      const options = client.getOptions() as MiniappOptions;
      const dimensions = { ...collectDimensions(options), ...dynamicDimensions.get(client) };

      for (const [key, value] of Object.entries(dimensions)) {
        if (value === undefined || key in spanJSON.attributes) {
          continue;
        }
        spanJSON.attributes[key] = value;
      }
    } catch (error) {
      if (client.getOptions().debug) {
        console.warn('[sentry-miniapp] 填充 span 维度属性失败:', error);
      }
    }
  });
}
