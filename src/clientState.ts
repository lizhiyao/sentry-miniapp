import type { Client, Event, SpanAttributes } from '@sentry/core';
import { getAccountInfo, getSystemInfo, resolveMiniappPlatform } from './crossPlatform';
import type { MiniappOptions } from './types';
import { SDK_VERSION } from './version';

type Context = Record<string, unknown>;
const environments = new WeakMap<Client, EnvironmentState>();

function present(value: unknown): string | undefined {
  return typeof value === 'string' && value && value !== 'unknown' ? value : undefined;
}

function compact(values: Context): Context {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/** 部分宿主对象以 getter 暴露字段，单字段不可读不阻断 SDK 构造。 */
function readHostField<T, K extends keyof T>(value: T | null, key: K): T[K] | undefined {
  try {
    return value?.[key];
  } catch (_error) {
    return undefined;
  }
}

/** SDK 自动环境数据只属于 client；用户 scope 仍完全由 core 管理。 */
export class EnvironmentState {
  public readonly contexts: Record<string, Context> = {};
  public readonly tags: Record<string, string | number | boolean> = {};
  public readonly spanAttributes: SpanAttributes = {};
  public route: string | undefined;

  public constructor(options: {
    miniappPlatform?: unknown;
    platform?: unknown;
    enableSystemInfo?: boolean | undefined;
  }) {
    const platform = present(resolveMiniappPlatform(options));
    this.contexts['miniapp'] = compact({
      environment: 'miniapp',
      platform,
      sdk_version: SDK_VERSION,
    });
    this.contexts['runtime'] = { name: 'miniapp' };
    if (platform) this.spanAttributes['miniapp.platform'] = platform;
    if (options.enableSystemInfo === false) return;

    const info = getSystemInfo();
    const account = getAccountInfo();
    const hostPlatform = present(readHostField(info, 'platform'));
    const system = present(readHostField(info, 'system'));
    const os = system?.match(/^(iOS|Android|HarmonyOS)(?:\s+(.+))?$/i);
    const osName = os?.[1];
    const osVersion = os?.[2];
    const hostVersion = present(readHostField(info, 'version'));
    const hostSdkVersion = present(readHostField(info, 'SDKVersion'));
    const brand = present(readHostField(info, 'brand'));
    const model = present(readHostField(info, 'model'));
    const appId = present(account.appId);
    const appVersion = present(account.version);
    const width = readHostField(info, 'screenWidth');
    const height = readHostField(info, 'screenHeight');
    const screenResolution =
      typeof width === 'number' &&
      Number.isFinite(width) &&
      width > 0 &&
      typeof height === 'number' &&
      Number.isFinite(height) &&
      height > 0
        ? `${width}x${height}`
        : undefined;

    Object.assign(
      this.contexts['miniapp']!,
      compact({ host_version: hostVersion, host_sdk_version: hostSdkVersion }),
    );
    if (hostVersion || hostSdkVersion)
      this.contexts['runtime']!['version'] = hostVersion ?? hostSdkVersion;
    this.setContext(
      'device',
      compact({
        brand,
        model,
        screen_resolution: screenResolution,
        language: present(readHostField(info, 'language')),
        platform: hostPlatform,
        system,
        version: hostVersion,
      }),
    );
    this.setContext('os', compact({ name: osName, version: osVersion }));
    this.setContext('app', compact({ app_identifier: appId, app_version: appVersion }));
    Object.assign(
      this.spanAttributes,
      compact({
        'device.manufacturer': brand,
        'device.model': model,
        'os.name': osName,
        'os.version': osVersion,
        'os.type': hostPlatform?.toLowerCase(),
        'miniapp.host_version': hostVersion,
        'miniapp.host_sdk_version': hostSdkVersion,
        'app.app_version': appVersion,
      }),
    );
  }

  public setContext(name: string, context: Context): void {
    if (Object.keys(context).length) this.contexts[name] = { ...context };
  }

  /** 合并已经完成，只填缺失字段；显式 null 和用户字段都保留。 */
  public fillEvent(event: Event): Event {
    event.platform ??= 'javascript';
    const contexts = event.contexts ?? (event.contexts = {});
    for (const [name, defaults] of Object.entries(this.contexts)) {
      const current = contexts[name];
      if (current === null) continue;
      contexts[name] = { ...defaults, ...current };
    }
    if (Object.keys(this.tags).length) event.tags = { ...this.tags, ...event.tags };
    return event;
  }
}

export function registerClientEnvironment(client: Client, environment: EnvironmentState): void {
  environments.set(client, environment);
}

export function getClientEnvironment(client: Client): EnvironmentState {
  let environment = environments.get(client);
  if (!environment) {
    environment = new EnvironmentState((client.getOptions?.() as MiniappOptions) ?? {});
    environments.set(client, environment);
  }
  return environment;
}

export function setClientContext(client: Client | undefined, name: string, context: Context): void {
  if (client) getClientEnvironment(client).setContext(name, context);
}
