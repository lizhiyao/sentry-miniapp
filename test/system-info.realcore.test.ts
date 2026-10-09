import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Envelope, type Event } from '@sentry/core';
import { MiniappClient } from '../src/client';
import { resetPlatformCache } from '../src/crossPlatform';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

const platforms = ['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks'] as const;
const clients: MiniappClient[] = [];

function installHost(name: (typeof platforms)[number], host: Record<string, unknown>): void {
  for (const platform of platforms) vi.stubGlobal(platform, undefined);
  vi.stubGlobal(name, host);
  resetPlatformCache();
}

async function captureEnvironment(): Promise<Event> {
  const envelopes: Envelope[] = [];
  const client = new MiniappClient({
    dsn: 'https://test@o0.ingest.sentry.io/0',
    defaultIntegrations: false,
    transport: createCapturingTransport(envelopes),
  });
  clients.push(client);
  client.captureEvent({ message: 'system-info-fallback' });
  expect(await client.flush(2000)).toBe(true);
  const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
  expect(events).toHaveLength(1);
  return events[0]!;
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.unstubAllGlobals();
  resetPlatformCache();
});

describe('系统信息逐项降级（真实 core 最终事件）', () => {
  it.each(platforms)('%s 的分体 API 抛错仍可使用旧 API 的设备和系统信息', async (name) => {
    installHost(name, {
      request: vi.fn(),
      getAppBaseInfo: () => {
        throw new Error('split API unavailable');
      },
      getSystemInfoSync: () => ({
        brand: `${name}-brand`,
        model: `${name}-model`,
        system: 'Android 15',
        version: '8.0',
        SDKVersion: '3.0',
      }),
    });
    const event = await captureEnvironment();
    expect(event.contexts?.device).toMatchObject({
      brand: `${name}-brand`,
      model: `${name}-model`,
    });
    expect(event.contexts?.os).toEqual({ name: 'Android', version: '15' });
    expect(event.contexts?.miniapp).toMatchObject({ host_version: '8.0', host_sdk_version: '3.0' });
  });

  it('一个分体 API 失败不丢弃其它 API 已返回的可用信息', async () => {
    installHost('wx', {
      request: vi.fn(),
      getAppBaseInfo: () => {
        throw new Error('base API unavailable');
      },
      getDeviceInfo: () => ({ brand: 'Apple', model: 'iPhone', system: 'iOS 18' }),
    });
    const event = await captureEnvironment();
    expect(event.contexts?.device).toMatchObject({ brand: 'Apple', model: 'iPhone' });
    expect(event.contexts?.os).toEqual({ name: 'iOS', version: '18' });
  });

  it('一个 API 的结果不可枚举时仍可读取其它分体 API', async () => {
    installHost('wx', {
      request: vi.fn(),
      getAppBaseInfo: () =>
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error('host keys unavailable');
            },
          },
        ),
      getDeviceInfo: () => ({ brand: 'Apple', model: 'iPhone', system: 'iOS 18' }),
    });
    const event = await captureEnvironment();
    expect(event.contexts?.device).toMatchObject({ brand: 'Apple', model: 'iPhone' });
    expect(event.contexts?.os).toEqual({ name: 'iOS', version: '18' });
  });

  it('旧 API 的非枚举和继承维度仍进入快照', async () => {
    const info = Object.create({ model: 'inherited-model', system: 'Android 15' });
    Object.defineProperty(info, 'brand', { value: 'non-enumerable-brand' });
    Object.defineProperty(info, 'version', { value: '8.0' });
    installHost('wx', { request: vi.fn(), getSystemInfoSync: () => info });
    const event = await captureEnvironment();
    expect(event.contexts?.device).toMatchObject({
      brand: 'non-enumerable-brand',
      model: 'inherited-model',
    });
    expect(event.contexts?.os).toEqual({ name: 'Android', version: '15' });
    expect(event.contexts?.miniapp).toMatchObject({ host_version: '8.0', host_sdk_version: '8.0' });
    expect(info).not.toHaveProperty('SDKVersion');
  });

  it('不读取没有遥测消费者的授权和系统开关 API', async () => {
    const unused = vi.fn(() => {
      throw new Error('permission settings unavailable');
    });
    installHost('wx', {
      request: vi.fn(),
      getDeviceInfo: () => ({ brand: 'Apple', model: 'iPhone', system: 'iOS 18' }),
      get getAppAuthorizeSetting() {
        return unused();
      },
      get getSystemSetting() {
        return unused();
      },
    });
    const event = await captureEnvironment();
    expect(event.contexts?.device?.brand).toBe('Apple');
    expect(event.contexts?.os).toEqual({ name: 'iOS', version: '18' });
    expect(unused).not.toHaveBeenCalled();
  });

  it('旧 API 的只读结果保留原样，版本归一化只影响 SDK 快照', async () => {
    const info = Object.freeze({
      brand: 'Alipay',
      model: 'phone',
      version: '10.3',
      system: 'iOS 18',
    });
    installHost('my', { request: vi.fn(), getSystemInfoSync: () => info });
    const event = await captureEnvironment();
    expect(event.contexts?.device?.brand).toBe('Alipay');
    expect(event.contexts?.miniapp).toMatchObject({
      host_version: '10.3',
      host_sdk_version: '10.3',
    });
    expect(info).not.toHaveProperty('SDKVersion');
  });
});
