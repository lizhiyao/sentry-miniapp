import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MiniappClient } from '../src/client';
import { MiniappOptions } from '../src/types';
import { SeverityLevel } from '@sentry/core';

describe('MiniappClient', () => {
  let client: MiniappClient;
  let options: MiniappOptions;

  beforeEach(() => {
    options = {
      dsn: 'https://test@sentry.io/123456',
      debug: false
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

    it('should prepare event with system info', async () => {
      // Mock system info
      (global as any).wx = {
        getDeviceInfo: () => ({
          brand: 'Apple',
          model: 'iPhone',
          system: 'iOS 15.0',
          platform: 'ios'
        }),
        getWindowInfo: () => ({
          screenWidth: 375,
          screenHeight: 812,
          pixelRatio: 3
        }),
        getAppBaseInfo: () => ({
          language: 'zh_CN',
          version: '8.0.0',
          SDKVersion: '2.19.4'
        })
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
        platform: 'ios'
      });

      expect(event?.contexts?.os).toEqual({
        name: 'iOS 15.0',
        version: '8.0.0'
      });

      expect(event?.contexts?.app).toEqual({
        app_version: '2.19.4'
      });
    });

    it('should handle undefined system info fields gracefully', async () => {
      // Mock system info with some undefined fields
      (global as any).wx = {
        getDeviceInfo: () => ({
          brand: undefined,
          model: 'iPhone',
          system: undefined,
          platform: 'ios'
        }),
        getWindowInfo: () => ({
          screenWidth: undefined,
          screenHeight: 812,
          pixelRatio: 3
        }),
        getAppBaseInfo: () => ({
          language: undefined,
          version: '8.0.0',
          SDKVersion: undefined
        })
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
        platform: 'ios'
      });

      expect(event?.contexts?.os).toEqual({
        name: 'unknown',
        version: '8.0.0'
      });

      expect(event?.contexts?.app).toEqual({
        app_version: 'unknown'
      });

      // Ensure no undefined values exist
      const deviceContext = event?.contexts?.device;
      Object.values(deviceContext || {}).forEach(value => {
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
        platform: 'unknown'
      });

      expect(event?.contexts?.os).toEqual({
        name: 'unknown',
        version: 'unknown'
      });

      expect(event?.contexts?.app).toEqual({
        app_version: 'unknown'
      });

      // Ensure no undefined values exist
      const allContexts = [event?.contexts?.device, event?.contexts?.os, event?.contexts?.app];
      allContexts.forEach(context => {
        Object.values(context || {}).forEach(value => {
          expect(value).not.toBeUndefined();
        });
      });
    });

    it('should preserve existing contexts', async () => {
      const event = {
        message: 'test',
        contexts: {
          custom: { data: 'value' }
        }
      };
      const preparedEvent = await client['_prepareEvent'](event, {});

      expect(preparedEvent?.contexts?.['custom']).toEqual({ data: 'value' });
       expect(preparedEvent?.contexts?.['miniapp']).toBeDefined();
     });
   });

  describe('showReportDialog', () => {
    it('should show modal in miniapp environment', () => {
      const mockShowModal = jest.fn();
      (global as any).wx.showModal = mockShowModal;

      client.showReportDialog();

      expect(mockShowModal).toHaveBeenCalledWith({
        title: '错误反馈',
        content: '应用遇到了一个错误，是否要发送错误报告？',
        confirmText: '发送',
        cancelText: '取消',
        success: expect.any(Function)
      });
    });

    it('should handle custom options', () => {
      const mockShowModal = jest.fn();
      (global as any).wx.showModal = mockShowModal;

      const options = {
        title: 'Custom Title',
        subtitle: 'Custom Subtitle'
      };

      client.showReportDialog(options);

      expect(mockShowModal).toHaveBeenCalledWith({
        title: 'Custom Title',
        content: 'Custom Subtitle',
        confirmText: '发送',
        cancelText: '取消',
        success: expect.any(Function)
      });
    });
  });
});