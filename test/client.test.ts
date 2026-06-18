import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MiniappClient } from '../src/client';
import { MiniappOptions } from '../src/types';
import { resetPlatformCache } from '../src/crossPlatform';
import { SeverityLevel, getCurrentScope } from '@sentry/core';

describe('MiniappClient', () => {
  let client: MiniappClient;
  let options: MiniappOptions;

  beforeEach(() => {
    // getSystemInfo 现已记忆化（一次会话静态）；用例间会改 global.wx，故每例先清平台缓存重读。
    resetPlatformCache();
    options = {
      dsn: 'https://test@sentry.io/123456',
      debug: false,
    };
    client = new MiniappClient(options);
    jest.clearAllMocks();
  });

  describe('eventFromException', () => {
    it('should create event from Error object', async () => {
      const error = new Error('Test error');
      const event = await client.eventFromException(error);

      expect(event.exception).toBeDefined();
      expect(event.exception?.values).toHaveLength(1);
      expect(event.exception?.values?.[0]?.value).toBe('Test error');
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.level).toBe('error');
    });

    it('should create event from string', async () => {
      const error = 'String error';
      const event = await client.eventFromException(error);

      expect(event.exception).toBeDefined();
      expect(event.exception?.values).toHaveLength(1);
      expect(event.exception?.values?.[0]?.value).toBe('String error');
      expect(event.level).toBe('error');
    });

    it('should handle custom hint', async () => {
      const error = new Error('Test error');
      const event = await client.eventFromException(error);

      expect(event.exception).toBeDefined();
      expect(event.level).toBe('error');
    });
  });

  describe('eventFromMessage', () => {
    it('should create event from message string', async () => {
      const message = 'Test message';
      const level: SeverityLevel = 'info';
      const event = await client.eventFromMessage(message, level);

      expect(event.message).toBe(message);
      expect(event.level).toBe(level);
    });

    it('should default to info level', async () => {
      const message = 'Test message';
      const event = await client.eventFromMessage(message);

      expect(event.message).toBe(message);
      expect(event.level).toBe('info');
    });

    it('should handle custom hint', async () => {
      const message = 'Test message';
      const level: SeverityLevel = 'warning';
      const event = await client.eventFromMessage(message, level);

      expect(event.message).toBe(message);
      expect(event.level).toBe(level);
    });
  });

  describe('_prepareEvent', () => {
    it('should add SDK information to event', async () => {
      const event = { message: 'test' };
      const preparedEvent = await client['_prepareEvent'](event, {});

      expect(preparedEvent?.sdk).toBeDefined();
      expect(preparedEvent?.sdk?.name).toBe('sentry.javascript.miniapp');
      expect(preparedEvent?.sdk?.version).toBeDefined();
    });

    it('should add miniapp context', async () => {
      const event = { message: 'test' };
      const preparedEvent = await client['_prepareEvent'](event, {});

      expect(preparedEvent?.contexts).toBeDefined();
      expect(preparedEvent?.contexts?.['miniapp']).toBeDefined();
      expect(preparedEvent?.contexts?.['miniapp']?.['platform']).toBe('wechat');
    });

    it('should add system information', async () => {
      const event = { message: 'test' };
      const preparedEvent = await client['_prepareEvent'](event, {});

      expect(preparedEvent?.contexts?.['device']).toBeDefined();
      expect(preparedEvent?.contexts?.['os']).toBeDefined();
    });

    it('should skip system information when enableSystemInfo is false', async () => {
      const client = new MiniappClient({
        dsn: 'https://test@sentry.io/123',
        enableSystemInfo: false,
      });
      const event = await client['_prepareEvent']({ message: 'test' }, {});

      expect(event?.contexts?.['miniapp']).toBeDefined();
      expect(event?.contexts?.['device']).toBeUndefined();
      expect(event?.contexts?.['os']).toBeUndefined();
      expect(event?.contexts?.['app']).toBeUndefined();
    });

    it('should prepare event with system info', async () => {
      // Mock system info
      (global as any).wx = {
        getDeviceInfo: () => ({
          brand: 'Apple',
          model: 'iPhone',
          system: 'iOS 15.0',
          platform: 'ios',
        }),
        getWindowInfo: () => ({
          screenWidth: 375,
          screenHeight: 812,
          pixelRatio: 3,
        }),
        getAppBaseInfo: () => ({
          language: 'zh_CN',
          version: '8.0.0',
          SDKVersion: '2.19.4',
        }),
      };

      const client = new MiniappClient({ dsn: 'https://test@sentry.io/123' });
      const event = await client['_prepareEvent']({ message: 'test' }, {});

      expect(event?.contexts?.device).toEqual({
        brand: 'Apple',
        model: 'iPhone',
        screen_resolution: '375x812',
        language: 'zh_CN',
        version: '8.0.0',
        system: 'iOS 15.0',
        platform: 'ios',
      });

      expect(event?.contexts?.os).toEqual({
        name: 'iOS 15.0',
        version: '8.0.0',
      });

      expect(event?.contexts?.app).toEqual({
        app_version: '2.19.4',
      });
    });

    it('should handle undefined system info fields gracefully', async () => {
      // Mock system info with some undefined fields
      (global as any).wx = {
        getDeviceInfo: () => ({
          brand: undefined,
          model: 'iPhone',
          system: undefined,
          platform: 'ios',
        }),
        getWindowInfo: () => ({
          screenWidth: undefined,
          screenHeight: 812,
          pixelRatio: 3,
        }),
        getAppBaseInfo: () => ({
          language: undefined,
          version: '8.0.0',
          SDKVersion: undefined,
        }),
      };

      const client = new MiniappClient({ dsn: 'https://test@sentry.io/123' });
      const event = await client['_prepareEvent']({ message: 'test' }, {});

      expect(event?.contexts?.device).toEqual({
        brand: 'unknown',
        model: 'iPhone',
        screen_resolution: '0x812',
        language: 'unknown',
        version: '8.0.0',
        system: 'unknown',
        platform: 'ios',
      });

      expect(event?.contexts?.os).toEqual({
        name: 'unknown',
        version: '8.0.0',
      });

      expect(event?.contexts?.app).toEqual({
        app_version: 'unknown',
      });

      // Ensure no undefined values exist
      const deviceContext = event?.contexts?.device;
      Object.values(deviceContext || {}).forEach((value) => {
        expect(value).not.toBeUndefined();
      });
    });

    it('should provide fallback values when system info is null', async () => {
      // Mock no system info available
      (global as any).wx = {};

      const client = new MiniappClient({ dsn: 'https://test@sentry.io/123' });
      const event = await client['_prepareEvent']({ message: 'test' }, {});

      expect(event?.contexts?.device).toEqual({
        brand: 'unknown',
        model: 'unknown',
        screen_resolution: '0x0',
        language: 'unknown',
        version: 'unknown',
        system: 'unknown',
        platform: 'unknown',
      });

      expect(event?.contexts?.os).toEqual({
        name: 'unknown',
        version: 'unknown',
      });

      expect(event?.contexts?.app).toEqual({
        app_version: 'unknown',
      });

      // Ensure no undefined values exist
      const allContexts = [event?.contexts?.device, event?.contexts?.os, event?.contexts?.app];
      allContexts.forEach((context) => {
        Object.values(context || {}).forEach((value) => {
          expect(value).not.toBeUndefined();
        });
      });
    });

    it('should preserve existing contexts', async () => {
      const event = {
        message: 'test',
        contexts: {
          custom: { data: 'value' },
        },
      };
      const preparedEvent = await client['_prepareEvent'](event, {});

      expect(preparedEvent?.contexts?.['custom']).toEqual({ data: 'value' });
      expect(preparedEvent?.contexts?.['miniapp']).toBeDefined();
    });

    // F3：SDK 的 device/os/app 应为「缺省填充」，不得覆盖用户显式设置。
    it('fill-only：不覆盖 per-event 显式设置的 os（F3）', async () => {
      (global as any).wx = {
        getSystemInfoSync: () => ({
          brand: 'Apple',
          system: 'iOS 15',
          version: '8',
          SDKVersion: '2',
        }),
      };
      // integrations: [] 让 super._prepareEvent 真正跑通（裸 new 无 integrations 会在
      // core 的 options.integrations.map 处抛错走兜底，测不到真实 scope 合并路径）。
      const c = new MiniappClient({ dsn: 'https://test@sentry.io/123', integrations: [] });
      const event = await c['_prepareEvent'](
        { message: 'test', contexts: { os: { name: 'CustomOS', version: '99' } } },
        {},
      );

      // 用户 per-event 的 os 原样保留，未被 SDK 的 'iOS 15' 覆盖
      expect(event?.contexts?.os).toEqual({ name: 'CustomOS', version: '99' });
      // 未设置的 device 仍由 SDK 填充
      expect(event?.contexts?.device?.brand).toBe('Apple');
    });

    it('fill-only：不覆盖 scope setContext 的 os（F3）', async () => {
      (global as any).wx = {
        getSystemInfoSync: () => ({
          brand: 'Apple',
          system: 'iOS 15',
          version: '8',
          SDKVersion: '2',
        }),
      };
      const c = new MiniappClient({ dsn: 'https://test@sentry.io/123', integrations: [] });

      const scope = getCurrentScope();
      scope.setContext('os', { name: 'ScopeOS', version: '1' });
      try {
        const event = await c['_prepareEvent']({ message: 'test' }, {});
        // scope 上用户设的 os 经 core 合并后应胜出，不被 SDK 自动值覆盖
        expect(event?.contexts?.os).toEqual({ name: 'ScopeOS', version: '1' });
        expect(event?.contexts?.device?.brand).toBe('Apple');
      } finally {
        scope.setContext('os', null); // 清理全局 current scope，避免污染其它用例
      }
    });
  });

  describe('showReportDialog', () => {
    it('should show console warning instead of modal', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const mockShowModal = jest.fn();
      (global as any).wx.showModal = mockShowModal;

      client.showReportDialog();

      expect(mockShowModal).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('showReportDialog is deprecated'),
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
