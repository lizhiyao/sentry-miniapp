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