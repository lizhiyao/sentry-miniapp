import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  wrap,
  fill,
  shouldIgnoreOnError,
  ignoreNextOnErrorCall,
  getFunctionName,
} from '../src/helpers';

describe('Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wrap', () => {
    it('should wrap function and preserve original behavior', () => {
      const originalFn = vi.fn((a: number, b: number) => a + b);
      const wrappedFn = wrap(originalFn);

      const result = wrappedFn(2, 3);

      expect(result).toBe(5);
      expect(originalFn).toHaveBeenCalledWith(2, 3);
    });

    it('should handle function that throws error', () => {
      vi.useFakeTimers();
      const mockCaptureException = vi.fn();
      const mockGetClient = vi.fn(() => ({
        captureException: mockCaptureException,
      }));

      // Mock getCurrentHub
      vi.doMock('@sentry/core', () => ({
        getCurrentHub: () => ({
          getClient: mockGetClient,
        }),
      }));

      const errorFn = vi.fn(() => {
        throw new Error('Test error');
      });

      const wrappedFn = wrap(errorFn);

      try {
        expect(() => wrappedFn()).toThrow('Test error');
        expect(errorFn).toHaveBeenCalled();
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }
    });

    it('should preserve function properties', () => {
      const originalFn = vi.fn();
      (originalFn as any).customProperty = 'test';

      const wrappedFn = wrap(originalFn);

      expect((wrappedFn as any).customProperty).toBe('test');
    });

    it('should mark function as wrapped', () => {
      const originalFn = vi.fn();
      const wrappedFn = wrap(originalFn);

      expect((wrappedFn as any).__sentry__).toBe(true);
      expect((wrappedFn as any).__sentry_original__).toBe(originalFn);
    });

    it('should not double-wrap already wrapped functions', () => {
      const originalFn = vi.fn();
      const wrappedFn1 = wrap(originalFn);
      const wrappedFn2 = wrap(wrappedFn1);

      expect(wrappedFn1).toBe(wrappedFn2);
    });

    it('should handle non-function input', () => {
      const nonFunction = 'not a function';
      const result = wrap(nonFunction as any);

      expect(result).toBe(nonFunction);
    });

    it('runs the optional before hook with the original receiver and arguments', () => {
      const receiver = { value: 3 };
      const before = vi.fn();
      const wrapped = wrap(function (this: typeof receiver, increment: number) {
        return this.value + increment;
      }, {}, before);

      expect(wrapped.call(receiver, 4)).toBe(7);
      expect(before).toHaveBeenCalledWith(4);
      expect(before.mock.instances[0]).toBe(receiver);
    });

    it('returns a callable unchanged when host guards reject marker access', () => {
      const original = vi.fn();
      const guarded = new Proxy(original, {
        get(target, property, receiver) {
          if (property === '__sentry__') throw new Error('permission denied');
          return Reflect.get(target, property, receiver);
        },
      });

      expect(wrap(guarded)).toBe(guarded);
    });

    it('continues wrapping when host guards reject property enumeration', () => {
      const original = vi.fn(() => 'ok');
      const guarded = new Proxy(original, {
        ownKeys() {
          throw new Error('enumeration denied');
        },
      });

      const wrapped = wrap(guarded);
      expect(wrapped()).toBe('ok');
    });
  });

  describe('fill', () => {
    it('should replace object method with wrapped version', () => {
      const obj = {
        method: vi.fn(() => 'original'),
      };
      const originalMethod = obj.method;

      const fillResult = fill(obj, 'method', (original) => {
        return function (this: any, ...args: any[]) {
          return 'wrapped: ' + original.apply(this, args);
        };
      });

      const methodResult = obj.method();

      expect(methodResult).toBe('wrapped: original');
      expect(obj.method).not.toBe(originalMethod);
      expect(fillResult?.replaced).toBe(true);

      fillResult?.restore();
      expect(obj.method).toBe(originalMethod);
    });

    it('should replace and restore an accessor when its setter ignores assignment', () => {
      const originalMethod = vi.fn(() => 'original');
      const getter = vi.fn(() => originalMethod);
      const setter = vi.fn();
      const obj = {} as { method: () => string };

      Object.defineProperty(obj, 'method', {
        configurable: true,
        enumerable: true,
        get: getter,
        set: setter,
      });

      const result = fill(obj, 'method', (original) => {
        return function (this: any, ...args: any[]) {
          return 'wrapped: ' + original.apply(this, args);
        };
      });

      expect(setter).toHaveBeenCalledTimes(1);
      expect(result?.replaced).toBe(true);
      expect(obj.method()).toBe('wrapped: original');
      expect(Object.getOwnPropertyDescriptor(obj, 'method')).toMatchObject({
        configurable: true,
        enumerable: true,
        value: obj.method,
        writable: true,
      });

      result?.restore();

      const restoredDescriptor = Object.getOwnPropertyDescriptor(obj, 'method');
      expect(restoredDescriptor?.get).toBe(getter);
      expect(restoredDescriptor?.set).toBe(setter);
      expect(restoredDescriptor?.configurable).toBe(true);
      expect(restoredDescriptor?.enumerable).toBe(true);
      expect(obj.method).toBe(originalMethod);
    });

    it('should leave a non-configurable accessor unchanged when assignment is ignored', () => {
      const originalMethod = vi.fn(() => 'original');
      const obj = {} as { method: () => string };

      Object.defineProperty(obj, 'method', {
        configurable: false,
        get: () => originalMethod,
        set: () => {},
      });

      const result = fill(obj, 'method', () => vi.fn(() => 'wrapped'));

      expect(result?.replaced).toBe(false);
      expect(obj.method).toBe(originalMethod);
      expect(() => result?.restore()).not.toThrow();
    });

    it('should keep using assignment when a host proxy rejects descriptor inspection', () => {
      const originalMethod = vi.fn(() => 'original');
      const target = { method: originalMethod };
      const proxy = new Proxy(target, {
        getOwnPropertyDescriptor: () => {
          throw new Error('descriptor unavailable');
        },
      });

      const result = fill(proxy, 'method', (original) => {
        return function (this: any, ...args: any[]) {
          return 'wrapped: ' + original.apply(this, args);
        };
      });

      expect(result?.replaced).toBe(true);
      expect(proxy.method()).toBe('wrapped: original');

      result?.restore();
      expect(proxy.method).toBe(originalMethod);
    });

    it('should handle non-existent property', () => {
      const obj = {} as any;

      expect(() => {
        fill(obj, 'nonExistent', (original) => original);
      }).not.toThrow();
    });

    it('should handle non-function property', () => {
      const obj = {
        property: 'not a function',
      };

      expect(() => {
        fill(obj, 'property', (original) => original);
      }).not.toThrow();
    });

    it('should preserve function context', () => {
      const obj = {
        value: 42,
        getValue: function () {
          return this.value;
        },
      };

      fill(obj, 'getValue', (original) => {
        return function (this: any, ...args: any[]) {
          return original.apply(this, args) * 2;
        };
      });

      const result = obj.getValue();

      expect(result).toBe(84);
    });

    it('should handle replacement function that throws', () => {
      const obj = {
        method: vi.fn(() => 'original'),
      };

      fill(obj, 'method', () => {
        return function () {
          throw new Error('Replacement error');
        };
      });

      expect(() => obj.method()).toThrow('Replacement error');
    });

    it('should replace method multiple times', () => {
      const obj = {
        method: vi.fn(() => 'original'),
      };
      const originalMethod = obj.method;

      // First wrap
      fill(obj, 'method', (original) => {
        return function (this: any, ...args: any[]) {
          return 'wrapped1: ' + original.apply(this, args);
        };
      });
      const firstWrapped = obj.method;

      // Second wrap
      fill(obj, 'method', (original) => {
        return function (this: any, ...args: any[]) {
          return 'wrapped2: ' + original.apply(this, args);
        };
      });

      expect(obj.method).not.toBe(originalMethod);
      expect(obj.method).not.toBe(firstWrapped);
    });

    it('restores an inherited host method without leaving an own property', () => {
      const original = vi.fn(() => 'original');
      const prototype = { method: original };
      const obj = Object.create(prototype) as { method: () => string };
      const result = fill(obj, 'method', (method) => () => `wrapped: ${method()}`);

      expect(Object.prototype.hasOwnProperty.call(obj, 'method')).toBe(true);
      expect(obj.method()).toBe('wrapped: original');

      result?.restore();
      expect(Object.prototype.hasOwnProperty.call(obj, 'method')).toBe(false);
      expect(obj.method).toBe(original);
    });

    it('contains replacement prototype assignment failures', () => {
      const obj = { method: vi.fn() };
      const replacement = new Proxy(function replacement() {}, {
        set(target, property, value, receiver) {
          if (property === 'prototype') throw new Error('prototype is read-only');
          return Reflect.set(target, property, value, receiver);
        },
      });

      const result = fill(obj, 'method', () => replacement);
      expect(result?.replaced).toBe(true);
      expect(obj.method).toBe(replacement);
    });
  });

  describe('shouldIgnoreOnError', () => {
    it('should return false by default', () => {
      expect(shouldIgnoreOnError()).toBe(false);
    });

    it('should return true after ignoreNextOnErrorCall', () => {
      vi.useFakeTimers();

      try {
        ignoreNextOnErrorCall();
        expect(shouldIgnoreOnError()).toBe(true);
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }
    });

    it('should return false after timeout', async () => {
      vi.useFakeTimers();

      try {
        ignoreNextOnErrorCall();
        expect(shouldIgnoreOnError()).toBe(true);

        await vi.advanceTimersByTimeAsync(10);
        expect(shouldIgnoreOnError()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle multiple calls', () => {
      vi.useFakeTimers();

      try {
        ignoreNextOnErrorCall();
        ignoreNextOnErrorCall();
        expect(shouldIgnoreOnError()).toBe(true);
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }
    });
  });

  describe('getFunctionName', () => {
    it('should return function name', () => {
      function namedFunction() {}
      expect(getFunctionName(namedFunction)).toBe('namedFunction');
    });

    it('should return <anonymous> for anonymous functions', () => {
      const anonymousFunction = (() => function () {})();
      expect(getFunctionName(anonymousFunction)).toBe('<anonymous>');
    });

    it('should return <anonymous> for non-functions', () => {
      expect(getFunctionName(null)).toBe('<anonymous>');
      expect(getFunctionName(undefined)).toBe('<anonymous>');
      expect(getFunctionName('string')).toBe('<anonymous>');
      expect(getFunctionName(123)).toBe('<anonymous>');
    });

    it('should handle functions without name property', () => {
      const fn = function () {};
      Object.defineProperty(fn, 'name', {
        get() {
          throw new Error('Cannot access name');
        },
      });
      expect(getFunctionName(fn)).toBe('<anonymous>');
    });
  });

});
