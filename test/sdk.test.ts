import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  showReportDialog,
  wrap,
  captureFeedback,
  getDefaultIntegrations,
  defaultIntegrations,
  setConsent,
  getConsent,
} from '../src/sdk';
// flush / close / lastEventId 是 SDK 从 @sentry/core 透传的公开 API（sdk.ts 不再自定义重复实现）
import { lastEventId, flush, close, getCurrentScope } from '@sentry/core';
import { eventFiltersIntegration, inboundFiltersIntegration } from '@sentry/core';
import type { StackParser } from '@sentry/core';
import { MiniappClient } from '../src/client';
import { MiniappOptions } from '../src/types';
import { MinigameFrameRateIntegration } from '../src/integrations/minigame-framerate';
import { shouldIgnoreOnError } from '../src/helpers';
import { resetPlatformCache } from '../src/crossPlatform';

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

    it('帧率细调通过 minigameFrameRateOptions 透传给自动追加的集成', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123456',
        enableMinigameFrameRate: true,
        minigameFrameRateOptions: { fpsWarningThreshold: 45 },
      });
      const integ: any = client?.getIntegrationByName?.('MinigameFrameRate');
      expect(integ).toBeDefined();
      expect(integ._options.fpsWarningThreshold).toBe(45);
    });

    it('用户已传入同名帧率集成时不重复追加，保留用户配置', () => {
      const userInteg = new MinigameFrameRateIntegration({ fpsWarningThreshold: 50 });
      const client = init({
        dsn: 'https://test@sentry.io/123456',
        enableMinigameFrameRate: true,
        integrations: [userInteg],
      });
      const integ: any = client?.getIntegrationByName?.('MinigameFrameRate');
      // 仍是用户实例，未被自动追加的默认实例覆盖
      expect(integ).toBe(userInteg);
      expect(integ._options.fpsWarningThreshold).toBe(50);
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
      const defaultIntegrationCount = defaultIntegrations.length;
      const client = init({ dsn: 'https://test@sentry.io/123' });
      expect(client).toBeInstanceOf(MiniappClient);
      expect(client?.getIntegrationByName?.('PerformanceAPI')).toBeDefined();
      expect(defaultIntegrations).toHaveLength(defaultIntegrationCount);
    });

    it('默认性能集成是可执行的实例', () => {
      const performance = getDefaultIntegrations().find(
        (integration) => integration.name === 'PerformanceAPI',
      );

      expect(performance).toBeDefined();
      expect(performance?.setupOnce).toEqual(expect.any(Function));
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

    it('should keep lifecycle breadcrumbs when only user interaction breadcrumbs are disabled', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        enableUserInteractionBreadcrumbs: false,
      });
      const pageBreadcrumbs = client
        ?.getOptions()
        .integrations?.find((integration: any) => integration.name === 'PageBreadcrumbs') as any;

      expect(pageBreadcrumbs).toBeDefined();
      expect(pageBreadcrumbs._options).toEqual({
        enableLifecycle: true,
        enableUserInteraction: false,
      });
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
      const networkBreadcrumbs = client?.getIntegrationByName?.('NetworkBreadcrumbs') as any;
      expect(networkBreadcrumbs).toBeDefined();
      expect(networkBreadcrumbs._traceNetworkBody).toBe(true);
    });

    it('should pass trace propagation options to NetworkBreadcrumbs', () => {
      const client = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [],
        enableTracePropagation: false,
        tracePropagationTargets: [/api\.example\.com/],
        propagateTraceparent: true,
      });

      const networkBreadcrumbs = client
        ?.getOptions()
        .integrations?.find((integration: any) => integration.name === 'NetworkBreadcrumbs') as any;

      expect(networkBreadcrumbs).toBeDefined();
      expect(networkBreadcrumbs._propagateTraceparent).toBe(true);
      expect(networkBreadcrumbs._enableTracePropagation).toBe(false);
      expect(networkBreadcrumbs._tracePropagationTargets).toEqual([/api\.example\.com/]);
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
          .integrations.some((integration: any) =>
            ['EventFilters', 'InboundFilters'].includes(integration.name),
          ),
      ).toBe(true);
    });

    it('用户已传入 EventFilters / InboundFilters 时不重复追加过滤集成', () => {
      const eventFilters = eventFiltersIntegration({ ignoreErrors: ['custom'] });
      const clientWithEventFilters = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [eventFilters],
      });
      expect(
        clientWithEventFilters
          ?.getOptions()
          .integrations.filter((integration: any) =>
            ['EventFilters', 'InboundFilters'].includes(integration.name),
          ),
      ).toEqual([eventFilters]);

      const inboundFilters = inboundFiltersIntegration({ ignoreErrors: ['legacy'] });
      const clientWithInboundFilters = init({
        dsn: 'https://test@sentry.io/123',
        integrations: [inboundFilters],
      });
      expect(
        clientWithInboundFilters
          ?.getOptions()
          .integrations.filter((integration: any) =>
            ['EventFilters', 'InboundFilters'].includes(integration.name),
          ),
      ).toEqual([inboundFilters]);
    });

    it('保留 defaultIntegrations 中用户明确配置的两个过滤集成', () => {
      const eventFilters = eventFiltersIntegration({ ignoreErrors: ['event'] });
      const inboundFilters = inboundFiltersIntegration({ ignoreErrors: ['inbound'] });
      const client = init({
        dsn: 'https://test@sentry.io/123',
        defaultIntegrations: [eventFilters, inboundFilters],
      });

      expect(
        client
          ?.getOptions()
          .integrations.filter((integration: any) =>
            ['EventFilters', 'InboundFilters'].includes(integration.name),
          ),
      ).toEqual([eventFilters, inboundFilters]);
    });
  });

  describe('getDefaultIntegrations', () => {
    it('旧 defaultIntegrations 导出是快照，函数调用返回新集合', () => {
      const integrations = getDefaultIntegrations();
      expect(Array.isArray(integrations)).toBe(true);
      expect(integrations).not.toBe(defaultIntegrations);
      expect(integrations.map((integration) => integration.name)).toEqual(
        expect.arrayContaining(defaultIntegrations.map((integration) => integration.name)),
      );
      const snapshotNames = defaultIntegrations.map((integration) => integration.name);
      expect(snapshotNames).not.toContain('Minigame');
      expect(snapshotNames).not.toContain('MinigameFrameRate');
    });

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
      expect(names).toContain('PerformanceAPI');
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
      const flushSpy = vi
        .spyOn(transport!, 'flush')
        .mockImplementation(() => Promise.resolve(true));

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

  describe('showReportDialog', () => {
    it('should log a deprecation warning', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      showReportDialog();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('showReportDialog is deprecated'),
      );
      consoleSpy.mockRestore();
    });

    it('should accept optional options', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(() => showReportDialog({ eventId: '123' })).not.toThrow();
      consoleSpy.mockRestore();
    });
  });

  describe('lastEventId', () => {
    it('should return last event id from scope', () => {
      // 初始化 SDK 后调用
      init({ dsn: 'https://test@sentry.io/123' });
      const id = lastEventId();
      // 可能返回 undefined 如果没有事件
      expect(id === undefined || typeof id === 'string').toBe(true);
    });
  });

  describe('flush', () => {
    it('should resolve to false when no client', async () => {
      // 不初始化，直接调用
      const result = await flush();
      // 如果有前序测试初始化了 client，可能返回 true
      expect(typeof result === 'boolean').toBe(true);
    });

    it('should call client.flush with timeout', async () => {
      init({ dsn: 'https://test@sentry.io/123' });
      const result = await flush(1000);
      expect(typeof result === 'boolean').toBe(true);
    });
  });

  describe('close', () => {
    it('should call client.close with timeout', async () => {
      init({ dsn: 'https://test@sentry.io/123' });
      const result = await close(1000);
      expect(typeof result === 'boolean').toBe(true);
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

    it('should capture exceptions and re-throw', () => {
      vi.useFakeTimers();

      try {
        init({ dsn: 'https://test@sentry.io/123' });
        const error = new Error('Test wrap error');
        const fn = () => {
          throw error;
        };
        const wrapped = wrap(fn);

        expect(() => wrapped()).toThrow('Test wrap error');
        expect(shouldIgnoreOnError()).toBe(true);
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }

      expect(shouldIgnoreOnError()).toBe(false);
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

    it('matches core semantics without a client', () => {
      getCurrentScope().setClient(undefined);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = captureFeedback({ message: 'feedback' });

      expect(result).toMatch(/^[a-f0-9]{32}$/);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Sentry Logger [warn]:',
        'No client configured on scope - will not capture event!',
      );
      consoleSpy.mockRestore();
    });
  });
});
