import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TryCatch } from '../src/integrations/trycatch';

// Mock @sentry/core
jest.mock('@sentry/core', () => ({
  captureException: jest.fn(),
  getCurrentScope: jest.fn(() => ({
    addEventProcessor: jest.fn(),
  })),
}));

describe('TryCatch', () => {
  let originalSetTimeout: typeof setTimeout;
  let originalSetInterval: typeof setInterval;
  let originalRAF: typeof requestAnimationFrame | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    originalSetTimeout = globalThis.setTimeout;
    originalSetInterval = globalThis.setInterval;
    originalRAF = (globalThis as any).requestAnimationFrame;
  });

  afterEach(() => {
    // 恢复原始函数
    globalThis.setTimeout = originalSetTimeout;
    globalThis.setInterval = originalSetInterval;
    if (originalRAF) {
      (globalThis as any).requestAnimationFrame = originalRAF;
    } else {
      delete (globalThis as any).requestAnimationFrame;
    }
  });

  describe('setupOnce', () => {
    it('should wrap setTimeout', () => {
      const integration = new TryCatch();
      const original = globalThis.setTimeout;
      integration.setupOnce();

      // setTimeout 应该已被替换
      expect(globalThis.setTimeout).not.toBe(original);
    });

    it('should wrap setInterval', () => {
      const integration = new TryCatch();
      const original = globalThis.setInterval;
      integration.setupOnce();

      expect(globalThis.setInterval).not.toBe(original);
    });

    it('should wrap requestAnimationFrame when available', () => {
      const mockRAF = jest.fn();
      (globalThis as any).requestAnimationFrame = mockRAF;

      const integration = new TryCatch();
      integration.setupOnce();

      expect((globalThis as any).requestAnimationFrame).not.toBe(mockRAF);
    });

    it('should not throw when requestAnimationFrame is not available', () => {
      delete (globalThis as any).requestAnimationFrame;

      const integration = new TryCatch();
      expect(() => integration.setupOnce()).not.toThrow();
    });
  });

  describe('wrapped setTimeout', () => {
    it('should call original setTimeout with wrapped callback', () => {
      const calls: any[] = [];
      const fakeSetTimeout = jest.fn((...args: any[]) => {
        calls.push(args);
        return 1 as any;
      });
      (globalThis as any).setTimeout = fakeSetTimeout;

      const integration = new TryCatch();
      integration.setupOnce();

      const callback = jest.fn();
      globalThis.setTimeout(callback, 100);

      // 原始 setTimeout 应该被调用
      expect(fakeSetTimeout).toHaveBeenCalled();
      // 回调应该已被包装（不是原始回调）
      const wrappedCallback = fakeSetTimeout.mock.calls[0]?.[0];
      expect(wrappedCallback).not.toBe(callback);
    });

    it('should preserve non-function arguments', () => {
      const fakeSetTimeout = jest.fn((..._args: any[]) => 1 as any);
      (globalThis as any).setTimeout = fakeSetTimeout;

      const integration = new TryCatch();
      integration.setupOnce();

      globalThis.setTimeout(jest.fn() as any, 200);

      expect(fakeSetTimeout).toHaveBeenCalled();
      // 延迟参数应保持不变
      expect(fakeSetTimeout.mock.calls[0]?.[1]).toBe(200);
    });
  });

  describe('wrapped setInterval', () => {
    it('should call original setInterval with wrapped callback', () => {
      const fakeSetInterval = jest.fn((..._args: any[]) => 1 as any);
      (globalThis as any).setInterval = fakeSetInterval;

      const integration = new TryCatch();
      integration.setupOnce();

      const callback = jest.fn();
      globalThis.setInterval(callback, 1000);

      expect(fakeSetInterval).toHaveBeenCalled();
      const wrappedCallback = fakeSetInterval.mock.calls[0]?.[0];
      expect(wrappedCallback).not.toBe(callback);
    });
  });

  describe('wrapped requestAnimationFrame', () => {
    it('should call original requestAnimationFrame with wrapped callback', () => {
      const fakeRAF = jest.fn((..._args: any[]) => 1);
      (globalThis as any).requestAnimationFrame = fakeRAF;

      const integration = new TryCatch();
      integration.setupOnce();

      const callback = jest.fn();
      (globalThis as any).requestAnimationFrame(callback);

      expect(fakeRAF).toHaveBeenCalled();
    });
  });

  describe('integration metadata', () => {
    it('should have correct id and name', () => {
      const integration = new TryCatch();
      expect(integration.name).toBe('TryCatch');
      expect(TryCatch.id).toBe('TryCatch');
    });
  });
});
