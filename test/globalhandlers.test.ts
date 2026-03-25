import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { captureException, getCurrentScope } from '@sentry/core';
import { GlobalHandlers } from '../src/integrations/globalhandlers';

// Mock @sentry/core
jest.mock('@sentry/core', () => ({
  captureException: jest.fn(),
  getCurrentScope: jest.fn(),
}));

// Mock crossPlatform
const mockSdk: any = {};

jest.mock('../src/crossPlatform', () => ({
  sdk: jest.fn(() => mockSdk),
}));

describe('GlobalHandlers', () => {
  let mockScope: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockScope = {
      setTag: jest.fn(),
      setContext: jest.fn(),
    };
    (getCurrentScope as jest.Mock).mockReturnValue(mockScope);

    // 重置 mockSdk
    Object.keys(mockSdk).forEach((key) => delete mockSdk[key]);
    mockSdk.onError = jest.fn();
    mockSdk.onUnhandledRejection = jest.fn();
    mockSdk.onPageNotFound = jest.fn();
    mockSdk.onMemoryWarning = jest.fn();
    mockSdk.offError = jest.fn();
    mockSdk.offUnhandledRejection = jest.fn();
    mockSdk.offPageNotFound = jest.fn();
    mockSdk.offMemoryWarning = jest.fn();
  });

  describe('setupOnce', () => {
    it('should register all handlers by default', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      expect(mockSdk.onError).toHaveBeenCalledWith(expect.any(Function));
      expect(mockSdk.onUnhandledRejection).toHaveBeenCalledWith(expect.any(Function));
      expect(mockSdk.onPageNotFound).toHaveBeenCalledWith(expect.any(Function));
      expect(mockSdk.onMemoryWarning).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should respect disabled options', () => {
      const integration = new GlobalHandlers({
        onerror: false,
        onunhandledrejection: false,
        onpagenotfound: false,
        onmemorywarning: false,
      });
      integration.setupOnce();

      expect(mockSdk.onError).not.toHaveBeenCalled();
      expect(mockSdk.onUnhandledRejection).not.toHaveBeenCalled();
      expect(mockSdk.onPageNotFound).not.toHaveBeenCalled();
      expect(mockSdk.onMemoryWarning).not.toHaveBeenCalled();
    });

    it('should not register handlers twice', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();
      integration.setupOnce();

      expect(mockSdk.onError).toHaveBeenCalledTimes(1);
    });

    it('should handle missing SDK methods gracefully', () => {
      delete mockSdk.onError;
      delete mockSdk.onUnhandledRejection;
      delete mockSdk.onPageNotFound;
      delete mockSdk.onMemoryWarning;

      const integration = new GlobalHandlers();
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });

  describe('onError handler', () => {
    it('should capture string errors', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onError.mock.calls[0][0];
      handler('Something went wrong');

      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          mechanism: { type: 'onerror', handled: false },
        }),
      );
    });

    it('should capture Error objects', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onError.mock.calls[0][0];
      const error = new Error('Test error');
      handler(error);

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          mechanism: { type: 'onerror', handled: false },
        }),
      );
    });
  });

  describe('onUnhandledRejection handler', () => {
    it('should capture string reason', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onUnhandledRejection.mock.calls[0][0];
      handler({ reason: 'Promise failed', promise: Promise.resolve() });

      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          mechanism: { type: 'onunhandledrejection', handled: false },
        }),
      );
    });

    it('should capture Error reason directly', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onUnhandledRejection.mock.calls[0][0];
      const error = new Error('Rejection error');
      handler({ reason: error, promise: Promise.resolve() });

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          mechanism: { type: 'onunhandledrejection', handled: false },
        }),
      );
    });
  });

  describe('onPageNotFound handler', () => {
    it('should capture page not found with context', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onPageNotFound.mock.calls[0][0];
      handler({
        path: 'pages/missing?id=1',
        query: { id: '1' },
        isEntryPage: false,
      });

      expect(mockScope.setTag).toHaveBeenCalledWith('pagenotfound', 'pages/missing');
      expect(mockScope.setContext).toHaveBeenCalledWith(
        'page_not_found',
        expect.objectContaining({
          path: 'pages/missing?id=1',
          query: { id: '1' },
          isEntryPage: false,
        }),
      );
      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: '页面无法找到: pages/missing' }),
        expect.objectContaining({
          mechanism: { type: 'onpagenotfound', handled: true },
        }),
      );
    });
  });

  describe('onMemoryWarning handler', () => {
    it('should capture level 5 warning (MODERATE)', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onMemoryWarning.mock.calls[0][0];
      handler({ level: 5 });

      expect(mockScope.setTag).toHaveBeenCalledWith('memory-warning', '5');
      expect(mockScope.setContext).toHaveBeenCalledWith(
        'memory_warning',
        expect.objectContaining({
          level: 5,
          message: 'TRIM_MEMORY_RUNNING_MODERATE',
        }),
      );
      expect(captureException).toHaveBeenCalled();
    });

    it('should capture level 10 warning (LOW)', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onMemoryWarning.mock.calls[0][0];
      handler({ level: 10 });

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'memory_warning',
        expect.objectContaining({ message: 'TRIM_MEMORY_RUNNING_LOW' }),
      );
    });

    it('should capture level 15 warning (CRITICAL)', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onMemoryWarning.mock.calls[0][0];
      handler({ level: 15 });

      expect(mockScope.setContext).toHaveBeenCalledWith(
        'memory_warning',
        expect.objectContaining({ message: 'TRIM_MEMORY_RUNNING_CRITICAL' }),
      );
    });

    it('should ignore unknown levels', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onMemoryWarning.mock.calls[0][0];
      handler({ level: 99 });

      expect(captureException).not.toHaveBeenCalled();
    });

    it('should ignore default level (-1)', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();

      const handler = mockSdk.onMemoryWarning.mock.calls[0][0];
      handler({ level: -1 });

      expect(captureException).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should unregister all handlers via off* methods', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();
      integration.cleanup();

      expect(mockSdk.offError).toHaveBeenCalled();
      expect(mockSdk.offUnhandledRejection).toHaveBeenCalled();
      expect(mockSdk.offPageNotFound).toHaveBeenCalled();
      expect(mockSdk.offMemoryWarning).toHaveBeenCalled();
    });

    it('should handle missing off* methods gracefully', () => {
      delete mockSdk.offError;
      delete mockSdk.offUnhandledRejection;
      delete mockSdk.offPageNotFound;
      delete mockSdk.offMemoryWarning;

      const integration = new GlobalHandlers();
      integration.setupOnce();

      expect(() => integration.cleanup()).not.toThrow();
    });

    it('should allow re-setup after cleanup', () => {
      const integration = new GlobalHandlers();
      integration.setupOnce();
      integration.cleanup();

      jest.clearAllMocks();
      mockSdk.onError = jest.fn();
      mockSdk.onUnhandledRejection = jest.fn();
      mockSdk.onPageNotFound = jest.fn();
      mockSdk.onMemoryWarning = jest.fn();

      integration.setupOnce();
      expect(mockSdk.onError).toHaveBeenCalled();
    });
  });
});
