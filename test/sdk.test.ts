import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  wrap,
  captureFeedback,
  getDefaultIntegrations,
  setConsent,
  getConsent,
} from '../src/sdk';
// flush / close / lastEventId 是 SDK 从 @sentry/core 透传的公开 API（sdk.ts 不再自定义重复实现）
import { lastEventId, flush, close } from '../src/index';
import { getCurrentScope, getIsolationScope, type Envelope, type Event } from '@sentry/core';
import { eventFiltersIntegration } from '@sentry/core';
import type { StackParser } from '@sentry/core';
import { MiniappClient } from '../src/client';
import { MiniappOptions } from '../src/types';
import { MinigameFrameRateIntegration } from '../src/integrations/minigame-framerate';
import { resetPlatformCache } from '../src/crossPlatform';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('should initialize with minimal configuration', () => {
      const client = init({ dsn: 'https://test@sentry.io/123456' });
      expect(client).toBeInstanceOf(MiniappClient);
      expect(client?.getOptions().dsn).toBe('https://test@sentry.io/123456');
    });

    it('用户已传入同名帧率集成时不重复追加，保留用户配置', () => {
      const userInteg = new MinigameFrameRateIntegration({ fpsWarningThreshold: 50 });
      const client = init({
        dsn: 'https://test@sentry.io/123456',
        enableMinigameFrameRate: true,
        integrations: [userInteg],
      });
      const integ: any = client?.getIntegrationByName?.('MinigameFrameRate');
      // 仍是用户实例，未被自动追加的默认实例覆盖。
      // 选项生效的行为证据由 minigame-framerate.realcore.test.ts 经 init 接线验证。
      expect(integ).toBe(userInteg);
    });

    it('should initialize with full configuration', () => {
      const options: MiniappOptions = {
        dsn: 'https://test@sentry.io/123456',
        debug: true,
        environment: 'test',
        release: '1.0.0',
        sampleRate: 0.5,
        maxBreadcrumbs: 50,
        beforeSend: vi.fn((event: any) => event) as any,
        beforeBreadcrumb: vi.fn((breadcrumb: any) => breadcrumb) as any,
      };

      const client = init(options);

      expect(client).toBeInstanceOf(MiniappClient);
      expect(client?.getOptions().dsn).toBe(options.dsn);
      expect(client?.getOptions().debug).toBe(true);
      expect(client?.getOptions().environment).toBe('test');
      expect(client?.getOptions().release).toBe('1.0.0');
      expect(client?.getOptions().sampleRate).toBe(0.5);
    });

    it('should allow overriding stackParser', () => {
      const stackParser = vi.fn(() => []) as StackParser;
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        stackParser,
      });

      expect(client?.getOptions().stackParser).toBe(stackParser);
    });

    it('should handle missing DSN gracefully', () => {
      const client = init({} as MiniappOptions);
      expect(client).toBeInstanceOf(MiniappClient);
    });

    it('returns undefined with a warning outside supported miniapp runtimes', () => {
      delete (global as any).wx;
      resetPlatformCache();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        expect(init({ dsn: 'https://test@sentry.io/123' })).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
          '[sentry-miniapp] Not running in a supported miniapp environment',
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should use default integrations when not specified', () => {
      const client = init({ dsn: 'https://test@sentry.io/123' });
      expect(client).toBeInstanceOf(MiniappClient);
      expect(client?.getIntegrationByName?.('PerformanceAPI')).toBeUndefined();
      expect(client?.getIntegrationByName?.('FunctionToString')).toBeDefined();
    });

    it('默认集合不安装 Performance observer', () => {
      const performance = getDefaultIntegrations().find(
        (integration) => integration.name === 'PerformanceAPI',
      );

      expect(performance).toBeUndefined();
    });

    it('defaultIntegrations=false 时关闭全部默认集成', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: false,
      });

      const names = client?.getOptions().integrations.map((integration: any) => integration.name);
      expect(names).toEqual([]);
    });

    it('defaultIntegrations=false 时仍安装显式传入的用户集成', () => {
      const userIntegration = { name: 'UserIntegration' };
      const client = init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: false,
        integrations: [userIntegration],
      });

      expect(client?.getOptions().integrations).toEqual([userIntegration]);
    });

    it('defaultIntegrations 数组会替换完整默认集成基底', () => {
      const customDefault = {
        name: 'CustomDefaultIntegration',
        setupOnce: vi.fn(),
      };

      const client = init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: [customDefault],
      });

      const names = client?.getOptions().integrations.map((integration: any) => integration.name);
      expect(names).toEqual(['CustomDefaultIntegration']);
    });

    it('integrations 数组追加到默认集合', () => {
      const userIntegration = { name: 'UserIntegration' };
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [userIntegration],
      });

      const integrations = client?.getOptions().integrations ?? [];
      expect(integrations).toContain(userIntegration);
      expect(integrations.some((integration: any) => integration.name === 'GlobalHandlers')).toBe(
        true,
      );
      expect(
        integrations.some((integration: any) => integration.name === 'NetworkBreadcrumbs'),
      ).toBe(true);
    });

    it('integrations 中的同名用户实例覆盖默认实例', () => {
      const userDedupe = { name: 'Dedupe' };
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [userDedupe],
      });

      expect(
        client?.getOptions().integrations.filter((integration) => integration.name === 'Dedupe'),
      ).toEqual([userDedupe]);
    });

    it('integrations 函数接收默认集合并返回最终集合', () => {
      let receivedDefaults: any[] = [];
      const userIntegration = { name: 'UserIntegration' };
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: (defaults) => {
          receivedDefaults = defaults;
          return [
            ...defaults.filter((integration) => integration.name !== 'GlobalHandlers'),
            userIntegration,
          ];
        },
      });

      expect(receivedDefaults.some((integration) => integration.name === 'GlobalHandlers')).toBe(
        true,
      );
      expect(client?.getOptions().integrations).toContain(userIntegration);
      expect(
        client
          ?.getOptions()
          .integrations.some((integration) => integration.name === 'GlobalHandlers'),
      ).toBe(false);
    });

    it('defaultIntegrations=false 时 integrations 函数接收空集合', () => {
      const integrations = vi.fn(() => [{ name: 'UserIntegration' }]);
      const client = init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: false,
        integrations,
      });

      expect(integrations).toHaveBeenCalledWith([]);
      expect(client?.getOptions().integrations.map((integration) => integration.name)).toEqual([
        'UserIntegration',
      ]);
    });

    it('should add RewriteFrames when enableSourceMap is not false', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
      });
      expect(client?.getIntegrationByName?.('RewriteFrames')).toBeDefined();
    });

    it('should skip RewriteFrames when enableSourceMap is false', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        enableSourceMap: false,
      });
      expect(client?.getIntegrationByName?.('RewriteFrames')).toBeUndefined();
    });

    it('should add PageBreadcrumbs by default', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
      });
      expect(client?.getIntegrationByName?.('PageBreadcrumbs')).toBeDefined();
    });

    it('should skip PageBreadcrumbs when lifecycle and user interaction breadcrumbs are disabled', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        enableNavigationBreadcrumbs: false,
        enableUserInteractionBreadcrumbs: false,
      });
      const pageBreadcrumbs = client
        ?.getOptions()
        .integrations?.find((integration: any) => integration.name === 'PageBreadcrumbs');

      expect(pageBreadcrumbs).toBeUndefined();
    });

    it('should add ConsoleBreadcrumbs when enableConsoleBreadcrumbs is true', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        enableConsoleBreadcrumbs: true,
      });
      expect(client?.getIntegrationByName?.('ConsoleBreadcrumbs')).toBeDefined();
    });

    it('should skip ConsoleBreadcrumbs by default', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
      });
      expect(client?.getIntegrationByName?.('ConsoleBreadcrumbs')).toBeUndefined();
    });

    it('should add NetworkBreadcrumbs with traceNetworkBody option', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        traceNetworkBody: true,
      });
      // 选项生效的行为证据由 networkbreadcrumbs.realcore.test.ts 的正文采集用例验证。
      expect(client?.getIntegrationByName?.('NetworkBreadcrumbs')).toBeDefined();
    });

    it('passes all inbound filter options to the default EventFilters integration', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        allowUrls: [/trusted\.example\.com/],
        denyUrls: [/blocked\.example\.com/],
        ignoreErrors: ['expected failure'],
      });

      expect(
        client
          ?.getOptions()
          .integrations.some((integration: any) => integration.name === 'EventFilters'),
      ).toBe(true);
    });

    it('用户已传入 EventFilters 时由 core 去重、不重复追加', () => {
      const eventFilters = eventFiltersIntegration({ ignoreErrors: ['custom'] });
      const clientWithEventFilters = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [eventFilters],
      });
      expect(
        clientWithEventFilters
          ?.getOptions()
          .integrations.filter((integration: any) => integration.name === 'EventFilters'),
      ).toEqual([eventFilters]);
    });

    it('保留 defaultIntegrations 中用户明确配置的过滤集成', () => {
      const eventFilters = eventFiltersIntegration({ ignoreErrors: ['event'] });
      const client = init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: [eventFilters],
      });

      expect(
        client
          ?.getOptions()
          .integrations.filter((integration: any) => integration.name === 'EventFilters'),
      ).toEqual([eventFilters]);
    });
  });

  describe('getDefaultIntegrations', () => {
    it('根据初始化选项构造完整的条件默认集成集合', () => {
      const integrations = getDefaultIntegrations({
        enableSourceMap: false,
        enableAutoSessionTracking: false,
        enableNavigationBreadcrumbs: false,
        enableUserInteractionBreadcrumbs: false,
        enableNetworkStatusMonitoring: false,
        enableConsoleBreadcrumbs: true,
        enableMinigameLifecycle: false,
        enableMinigameFrameRate: false,
      });
      const names = integrations.map((integration) => integration.name);

      expect(names).toContain('GlobalHandlers');
      expect(names).not.toContain('PerformanceAPI');
      expect(names).toContain('NetworkBreadcrumbs');
      expect(names).toContain('EventFilters');
      expect(names).toContain('ConsoleBreadcrumbs');
      expect(names).not.toContain('RewriteFrames');
      expect(names).not.toContain('Session');
      expect(names).not.toContain('PageBreadcrumbs');
      expect(names).not.toContain('NetworkStatus');
      expect(names).not.toContain('Minigame');
      expect(names).not.toContain('MinigameFrameRate');
    });

    it('显式开启时将小游戏条件集成加入默认集合', () => {
      const names = getDefaultIntegrations({
        enableMinigameLifecycle: true,
        enableMinigameFrameRate: true,
      }).map((integration) => integration.name);

      expect(names).toEqual(expect.arrayContaining(['Minigame', 'MinigameFrameRate']));
    });

    it('每次返回全新实例，不跨调用共享单例（多 init / 多 client 不互踩补丁状态）', () => {
      const a = getDefaultIntegrations();
      const b = getDefaultIntegrations();
      expect(a).not.toBe(b);
      // 关键：元素也必须是全新实例。修复前 return [...defaultIntegrations] 会复用同一批单例，
      // 跨多次 init / 多 client 时 setupOnce/cleanup 留在实例上的补丁状态互相踩踏。
      a.forEach((intA, i) => {
        expect(intA).not.toBe(b[i]);
      });
      const ga = a.find((i) => i.name === 'GlobalHandlers');
      const gb = b.find((i) => i.name === 'GlobalHandlers');
      expect(ga).toBeDefined();
      expect(ga).not.toBe(gb);
    });
  });

  describe('consent API', () => {
    it('starts blocked with requireConsent and flushes queued events when granted', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        requireConsent: true,
        enableOfflineCache: false,
      });
      const transport = client?.getTransport();
      expect(transport).toBeDefined();
      const flushSpy = vi.spyOn(client!, 'flush').mockImplementation(() => Promise.resolve(true));

      expect(getConsent()).toBe(false);

      setConsent(true);
      expect(getConsent()).toBe(true);
      expect(flushSpy).toHaveBeenCalledWith();

      setConsent(false);
      expect(getConsent()).toBe(false);
      expect(flushSpy).toHaveBeenCalledTimes(1);

      flushSpy.mockRestore();
    });

    it('keeps reporting granted when requireConsent is disabled', () => {
      init({ dsn: 'https://test@sentry.io/123' });

      setConsent(false);

      expect(getConsent()).toBe(true);
    });

    it('wraps custom transport with the consent gate', async () => {
      const send = vi.fn((_: any) => Promise.resolve({ statusCode: 200 }));
      const client = init({
        dsn: 'https://test@sentry.io/123',
        requireConsent: true,
        transport: () => ({
          send,
          flush: () => Promise.resolve(true),
        }),
      });
      const transport = client?.getTransport();
      const beforeConsent: any = [{ event_id: 'before' }, [[{ type: 'event' }, {}]]];
      const afterConsent: any = [{ event_id: 'after' }, [[{ type: 'event' }, {}]]];

      await transport?.send(beforeConsent);
      expect(send).not.toHaveBeenCalled();

      setConsent(true);
      await transport?.send(afterConsent);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]?.[0]?.event_id).toBe('after');
    });
  });

  describe('lastEventId', () => {
    it('returns the id of the captured event and its final envelope', async () => {
      const envelopes: Envelope[] = [];
      getIsolationScope().setLastEventId(undefined);
      const client = init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: false,
        transport: createCapturingTransport(envelopes),
      })!;

      expect(lastEventId()).toBeUndefined();
      const id = client.captureException(new Error('last event id probe'));
      expect(lastEventId()).toBe(id);
      expect(await flush(100)).toBe(true);
      expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toEqual([
        expect.objectContaining({ event_id: id }),
      ]);
    });
  });

  describe('flush', () => {
    it('should resolve to false when no client', async () => {
      const scope = getCurrentScope();
      const previous = scope.getClient();
      scope.setClient(undefined);
      try {
        expect(await flush()).toBe(false);
      } finally {
        scope.setClient(previous);
      }
    });

    it('should call client.flush with timeout', async () => {
      const client = init({ dsn: 'https://test@sentry.io/123' })!;
      const flushSpy = vi.spyOn(client, 'flush').mockResolvedValue(false);

      expect(await flush(1000)).toBe(false);
      expect(flushSpy).toHaveBeenCalledExactlyOnceWith(1000);
    });
  });

  describe('close', () => {
    it('should call client.close with timeout', async () => {
      const client = init({ dsn: 'https://test@sentry.io/123' })!;
      const closeSpy = vi.spyOn(client, 'close').mockResolvedValue(false);

      expect(await close(1000)).toBe(false);
      expect(closeSpy).toHaveBeenCalledExactlyOnceWith(1000);
    });
  });

  describe('wrap', () => {
    it('should return a wrapped function', () => {
      const fn = () => 42;
      const wrapped = wrap(fn);
      expect(typeof wrapped).toBe('function');
    });

    it('should call the original function', () => {
      init({ dsn: 'https://test@sentry.io/123' });
      const fn = vi.fn(() => 'result');
      const wrapped = wrap(fn as any);
      const result = wrapped();
      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('captures the original exception with its mechanism and rethrows the same error', async () => {
      const envelopes: Envelope[] = [];
      init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: false,
        transport: createCapturingTransport(envelopes),
      });
      const error = new Error('Test wrap error');
      const fn = () => {
        throw error;
      };
      const wrapped = wrap(fn);

      let thrown: unknown;
      try {
        wrapped();
      } catch (caught) {
        thrown = caught;
      }
      expect(thrown).toBe(error);
      expect(await flush(100)).toBe(true);
      const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]).toMatchObject({
        type: 'Error',
        value: 'Test wrap error',
        mechanism: { type: 'instrument', handled: false, data: { function: 'wrap' } },
      });
    });

    it('should preserve this context', () => {
      init({ dsn: 'https://test@sentry.io/123' });
      const obj = {
        value: 42,
        getValue(this: { value: number }) {
          return this.value;
        },
      };
      obj.getValue = wrap(obj.getValue);
      expect(obj.getValue()).toBe(42);
    });

    it('should pass arguments through', () => {
      init({ dsn: 'https://test@sentry.io/123' });
      const fn = (a: number, b: number) => a + b;
      const wrapped = wrap(fn);
      expect(wrapped(1, 2)).toBe(3);
    });
  });

  describe('captureFeedback', () => {
    it('uses the core feedback pipeline and emits beforeSendFeedback', () => {
      const client = init({ dsn: 'https://test@sentry.io/123' });
      const beforeSendFeedback = vi.fn();
      client?.on('beforeSendFeedback', beforeSendFeedback);

      const result = captureFeedback({
        message: 'Great app!',
        name: 'Test User',
        email: 'test@example.com',
      });

      expect(result).toMatch(/^[a-f0-9]{32}$/);
      expect(beforeSendFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'feedback',
          contexts: expect.objectContaining({
            feedback: expect.objectContaining({
              message: 'Great app!',
              name: 'Test User',
              contact_email: 'test@example.com',
            }),
          }),
        }),
        {},
      );
    });

    it('returns an event id without a client', () => {
      getCurrentScope().setClient(undefined);
      const result = captureFeedback({ message: 'feedback' });

      expect(result).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
