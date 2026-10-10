import type { MiniappOptions } from '../src/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Scope,
  getCurrentScope,
  getIsolationScope,
  type Envelope,
  type Event,
  type ErrorEvent,
  makeSession,
  type SerializedSession,
} from '@sentry/core';
import { HttpContext } from '../src/integrations/httpcontext';
import { MiniappClient } from '../src/client';
import { resetPlatformCache } from '../src/crossPlatform';
import { automaticSpanAttributes } from '../src/spanDimensions';
import { getClientEnvironment } from '../src/clientState';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('client 自有环境与真实 core 事件管道', () => {
  const clients: MiniappClient[] = [];
  const envelopes: Envelope[] = [];
  function client(enableSystemInfo = true, target = envelopes, overrides: MiniappOptions = {}) {
    const result = new MiniappClient({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      defaultIntegrations: false,
      transport: createCapturingTransport(target),
      enableSystemInfo,
      ...overrides,
    });
    clients.push(result);
    return result;
  }

  /** 公开捕获一条事件并返回最终 envelope 负载。 */
  async function captureFinalEvent(
    owner: MiniappClient,
    event: Event,
    scope = new Scope(),
  ): Promise<Event | undefined> {
    owner.captureEvent(event, {}, scope);
    await owner.flush(2000);
    return collectEnvelopePayloads<Event>(envelopes, ['event']).find(
      (item) => item.message === event.message,
    );
  }

  beforeEach(() => {
    resetPlatformCache();
    envelopes.length = 0;
    vi.stubGlobal('wx', {
      request: vi.fn(),
      getSystemInfoSync: vi.fn(() => ({
        brand: 'Apple',
        model: 'iPhone',
        system: 'iOS 17.4',
        platform: 'ios',
        screenWidth: 390,
        screenHeight: 844,
        version: '8.0',
        SDKVersion: '3.1',
      })),
      getAccountInfoSync: vi.fn(() => ({ miniProgram: { appId: 'wx-owned', version: '1.2' } })),
    });
    getCurrentScope().setAttribute('device.model', undefined);
    getCurrentScope().setAttribute('network.type', undefined);
  });
  afterEach(() => {
    clients.splice(0).forEach((item) => item.dispose());
    getCurrentScope().setAttribute('device.model', undefined);
    getCurrentScope().setAttribute('network.type', undefined);
    vi.unstubAllGlobals();
    resetPlatformCache();
  });

  it('在 scope 合并后、scope processor 与 normalize 前补默认字段', async () => {
    const owner = client();
    const scope = new Scope();
    scope.setContext('device', { model: 'business-model', nested: { a: { b: { c: 1 } } } });
    scope.addEventProcessor((event) => {
      expect(event.contexts?.device).toMatchObject({ brand: 'Apple', model: 'business-model' });
      return event;
    });
    const prepared = await captureFinalEvent(owner, { message: 'prepared' }, scope);
    expect(prepared?.contexts?.os).toEqual({ name: 'iOS', version: '17.4' });
    expect(prepared?.contexts?.device?.nested).toEqual({ a: '[Object]' });
    expect(getIsolationScope().getScopeData().contexts.device).toBeUndefined();
  });

  it('显式 event context null 保留；Scope.setContext(null) 只删除覆盖', async () => {
    const owner = client();
    const scope = new Scope();
    scope.setContext('device', null);
    expect(
      (await captureFinalEvent(owner, { message: 'null-scope' }, scope))?.contexts?.device?.model,
    ).toBe('iPhone');
    expect(
      (
        await captureFinalEvent(owner, {
          message: 'null-event',
          contexts: { device: null } as unknown as NonNullable<Event['contexts']>,
        })
      )?.contexts?.device,
    ).toBeNull();
  });

  it('捕获 scope 贡献用户、tags 和 attachment，processor drop/throw 不回退原文', async () => {
    const owner = client();
    const scope = new Scope();
    scope.setUser({ id: 'explicit-scope' });
    scope.setTag('from-scope', 'yes');
    scope.addAttachment({ filename: 'owner.txt', data: 'owned' });
    const dropped = new Scope();
    dropped.addEventProcessor(() => null);
    const failing = new Scope();
    failing.addEventProcessor(() => {
      throw new Error('processor-failure');
    });
    owner.captureEvent({ message: 'owner' }, {}, scope);
    owner.captureEvent({ message: 'drop-canary' }, {}, dropped);
    owner.captureEvent({ message: 'raw-canary' }, {}, failing);
    await owner.flush(2000);
    const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(events.map((event) => event.message)).toEqual(['owner']);
    expect(events[0]?.user?.id).toBe('explicit-scope');
    expect(events[0]?.tags?.['from-scope']).toBe('yes');
    expect(collectEnvelopePayloads<Uint8Array>(envelopes, ['attachment'])).toEqual([
      new TextEncoder().encode('owned'),
    ]);
  });

  it('系统采集关闭不读取宿主，也不删除显式业务字段', async () => {
    const owner = client(false);
    expect((globalThis as any).wx.getSystemInfoSync).not.toHaveBeenCalled();
    expect((globalThis as any).wx.getAccountInfoSync).not.toHaveBeenCalled();
    const prepared = await captureFinalEvent(owner, {
      message: 'no-system-info',
      contexts: { device: { model: 'business' } },
    });
    expect(prepared?.contexts?.device).toEqual({ model: 'business' });
    expect(prepared?.contexts?.os).toBeUndefined();
    expect(prepared?.contexts?.app).toBeUndefined();
    expect(prepared?.contexts?.runtime).toEqual({ name: 'miniapp' });
    expect((globalThis as any).wx.getSystemInfoSync).not.toHaveBeenCalled();
    expect((globalThis as any).wx.getAccountInfoSync).not.toHaveBeenCalled();
  });

  it('不同实例最终 envelope 保留各自环境，SDK metadata 是 miniapp 身份', async () => {
    const a = client();
    const b = client(false);
    const scope = new Scope();
    scope.setClient(b);
    a.captureEvent({ message: 'A' }, {}, scope);
    b.captureEvent({ message: 'B' }, {}, scope);
    await Promise.all([a.flush(2000), b.flush(2000)]);
    const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(events.find((event) => event.message === 'A')?.contexts?.device?.model).toBe('iPhone');
    expect(events.find((event) => event.message === 'B')?.contexts?.device).toBeUndefined();
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event.sdk?.name).toBe('sentry.javascript.miniapp');
      expect(event.sdk?.packages).toContainEqual({
        name: 'npm:sentry-miniapp',
        version: event.sdk?.version,
      });
    }
    expect(
      envelopes.every((envelope) => envelope[0].sdk?.name === 'sentry.javascript.miniapp'),
    ).toBe(true);
  });

  it('实例 A 的 feedback 在全局 client 为 B 时仍发往 A', async () => {
    const aEnvelopes: Envelope[] = [];
    const bEnvelopes: Envelope[] = [];
    const a = client(true, aEnvelopes);
    const b = client(false, bEnvelopes);
    const previous = getCurrentScope().getClient();
    getCurrentScope().setClient(b);
    try {
      a.captureFeedback({ message: 'feedback-owned-by-a' });
      await Promise.all([a.flush(2000), b.flush(2000)]);
      const events = collectEnvelopePayloads<Event>(aEnvelopes, ['feedback']);
      expect(events).toHaveLength(1);
      expect(events[0]?.contexts?.device?.model).toBe('iPhone');
      expect(bEnvelopes).toHaveLength(0);
    } finally {
      getCurrentScope().setClient(previous);
    }
  });

  it('自动初始属性捕获开始页面，unit 不被强转或默认值覆盖', () => {
    const owner = client();
    getClientEnvironment(owner).setContext('network', { type: 'wifi' });
    vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/a' }]);
    getCurrentScope().setAttribute('device.model', { value: 2, unit: 'second' });
    getCurrentScope().setAttribute('network.type', { value: 'business-network' });
    const attributes = automaticSpanAttributes(owner, { 'http.request.method': 'GET' });
    expect(attributes.route).toBe('pages/a');
    expect(attributes['network.type']).toBe('business-network');
    expect(attributes).not.toHaveProperty('device.model');
    vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/b' }]);
    expect(attributes.route).toBe('pages/a');
    expect(automaticSpanAttributes(owner, {}, false)).not.toHaveProperty('route');
  });
  it.each([
    ['string', 'explicit', 'explicit'],
    ['boolean', false, false],
    ['number', 0, 0],
    ['strings', ['a', 'b'], ['a', 'b']],
    ['booleans', [true, false], [true, false]],
    ['numbers', [0, 2], [0, 2]],
    ['value wrapper', { value: 'wrapped' }, 'wrapped'],
    ['array wrapper', { value: [1, 2] }, [1, 2]],
    ['unit', { value: 2, unit: 'second' }, undefined],
    ['unknown object', { other: 'business' }, undefined],
    ['mixed array', [1, 'a'], undefined],
    ['nonfinite number', Infinity, undefined],
    ['nonfinite array', [1, NaN], undefined],
    ['null', null, undefined],
  ])('自动创建属性的 %s 只使用合法类型，非法显式值压住默认值', (_name, value, expected) => {
    const owner = client();
    // 模拟 JavaScript 用户绕过 RawAttribute 类型约束的实际输入。
    getCurrentScope().setAttribute('device.model', value as string);
    const attributes = automaticSpanAttributes(owner, {});
    expect(attributes['device.model']).toEqual(expected);
    if (expected === undefined) expect(attributes).not.toHaveProperty('device.model');
    expect(automaticSpanAttributes(owner, { 'device.model': 'operation' })['device.model']).toBe(
      'operation',
    );
  });

  it('自动页面能力缺失或抛错时使用已观测 route，延迟 entry 不借当前页面', () => {
    const owner = client(false);
    getClientEnvironment(owner).route = 'observed/page';
    vi.stubGlobal('getCurrentPages', () => {
      throw new Error('host unavailable');
    });
    expect(automaticSpanAttributes(owner, {})['route']).toBe('observed/page');
    vi.stubGlobal('getCurrentPages', () => [{ __route__: 'legacy/page' }]);
    expect(automaticSpanAttributes(owner, {})['route']).toBe('legacy/page');
    vi.stubGlobal('getCurrentPages', () => []);
    expect(automaticSpanAttributes(owner, {})['route']).toBe('observed/page');
    expect(automaticSpanAttributes(owner, {}, false)).not.toHaveProperty('route');
    expect(automaticSpanAttributes(undefined, { 'business.operation': 'explicit' })).toEqual({
      'business.operation': 'explicit',
    });
  });

  it('显式 HttpContext 集成沿用 client 快照，关闭系统采集仍保留用户值', () => {
    const owner = client(false);
    const integration = new HttpContext();
    expect(
      integration.processEvent({ contexts: { os: { name: 'BusinessOS' } } }, {}, owner).contexts
        ?.os,
    ).toEqual({ name: 'BusinessOS' });
    expect((globalThis as any).wx.getSystemInfoSync).not.toHaveBeenCalled();
  });

  it('SDK metadata 保留额外 package，但替换过期 miniapp 身份且不重复', async () => {
    const owner = client(true, envelopes, {
      _metadata: {
        sdk: {
          name: 'wrong-sdk',
          version: 'old',
          packages: [
            { name: 'npm:sentry-miniapp', version: 'stale' },
            { name: 'npm:business-plugin', version: '2.0' },
          ],
        },
      },
    });
    owner.captureEvent({ message: 'metadata-contract' }, {}, new Scope());
    await owner.flush(2000);
    const [event] = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(event?.sdk?.packages).toContainEqual({ name: 'npm:business-plugin', version: '2.0' });
    expect(event?.sdk?.packages?.filter((pkg) => pkg.name === 'npm:sentry-miniapp')).toEqual([
      { name: 'npm:sentry-miniapp', version: owner.getOptions()._metadata?.sdk?.version },
    ]);
    expect(envelopes[0]?.[0].sdk?.name).toBe('sentry.javascript.miniapp');
  });

  it('显式 isolation 的 session 与 attachment 经最终 envelope 保留，不更新当前其他 session', async () => {
    const owner = client(true, envelopes, { release: 'miniapp@owned' });
    const ownSession = makeSession({ release: 'miniapp@owned' });
    const unrelated = makeSession({ release: 'miniapp@other' });
    const isolation = new Scope();
    isolation.setSession(ownSession);
    isolation.setUser({ id: 'isolation-owner' });
    isolation.addAttachment({ filename: 'evidence.txt', data: 'owned-evidence' });
    const previous = getIsolationScope().getSession();
    getIsolationScope().setSession(unrelated);
    try {
      owner.captureEvent({
        exception: {
          values: [
            { type: 'Error', value: 'owned-error', mechanism: { type: 'test', handled: true } },
          ],
        },
        sdkProcessingMetadata: {
          capturedSpanScope: new Scope(),
          capturedSpanIsolationScope: isolation,
        },
      });
      await owner.flush(2000);
      const [event] = collectEnvelopePayloads<Event>(envelopes, ['event']);
      expect(event?.user?.id).toBe('isolation-owner');
      expect(collectEnvelopePayloads<Uint8Array>(envelopes, ['attachment'])).toEqual([
        new TextEncoder().encode('owned-evidence'),
      ]);
      const [session] = collectEnvelopePayloads<SerializedSession>(envelopes, ['session']);
      expect(session?.sid).toBe(ownSession.sid);
      expect(session?.errors).toBe(1);
      expect(unrelated.errors).toBe(0);
    } finally {
      getIsolationScope().setSession(previous);
    }
  });

  it('异步 scope processor 仍看到默认值，beforeSend 接收 normalize 后数据并可丢弃', async () => {
    const beforeSend = vi.fn((event: ErrorEvent) => {
      expect(event.contexts?.device?.model).toBe('iPhone');
      expect(event.contexts?.device?.nested).toEqual({ a: '[Object]' });
      return event.message === 'drop-in-beforeSend' ? null : event;
    });
    const owner = client(true, envelopes, { beforeSend });
    const scope = new Scope();
    scope.addEventProcessor(async (event) => {
      expect(event.contexts?.device?.brand).toBe('Apple');
      event.contexts!.device!.nested = { a: { b: { c: 1 } } };
      return event;
    });
    owner.captureEvent({ message: 'accepted' }, {}, scope);
    owner.captureEvent({ message: 'drop-in-beforeSend' }, {}, scope);
    await owner.flush(2000);
    expect(beforeSend).toHaveBeenCalledTimes(2);
    expect(
      collectEnvelopePayloads<Event>(envelopes, ['event']).map((event) => event.message),
    ).toEqual(['accepted']);
  });
  it('宿主与业务 getter 失败只省略对应维度，SDK 构造和自动属性生成继续', async () => {
    (globalThis as any).wx.getSystemInfoSync.mockReturnValue({
      brand: 'Apple',
      system: 'iOS 17.4',
      SDKVersion: '3.1',
      get model() {
        throw new Error('host getter unavailable');
      },
    });
    const owner = client();
    const prepared = await captureFinalEvent(owner, { message: 'getter-probe' });
    expect(prepared?.contexts?.device?.brand).toBe('Apple');
    expect(prepared?.contexts?.device?.model).toBeUndefined();
    expect(prepared?.contexts?.os).toEqual({ name: 'iOS', version: '17.4' });
    vi.stubGlobal('getCurrentPages', undefined);
    Object.defineProperty(globalThis, 'getCurrentPages', {
      configurable: true,
      get() {
        throw new Error('host page getter unavailable');
      },
    });
    getCurrentScope().setAttribute('device.model', {
      get value() {
        throw new Error('business getter unavailable');
      },
    });
    const attributes = automaticSpanAttributes(owner, {});
    expect(attributes['device.manufacturer']).toBe('Apple');
    expect(attributes).not.toHaveProperty('device.model');
    expect(attributes).not.toHaveProperty('route');
  });
});
