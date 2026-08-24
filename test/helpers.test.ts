import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  wrap,
  fill,
  shouldIgnoreOnError,
  markErrorAsCaptured,
  getErrorDetails,
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

    it('contains host getter errors while checking whether restore still owns the wrapper', () => {
      const originalMethod = vi.fn(() => 'original');
      const target = { method: originalMethod };
      let rejectReads = false;
      const proxy = new Proxy(target, {
        get(targetObject, property, receiver) {
          if (rejectReads && property === 'method') throw new Error('read denied');
          return Reflect.get(targetObject, property, receiver);
        },
      });
      const result = fill(proxy, 'method', () => vi.fn(() => 'wrapped'));
      const wrappedMethod = target.method;

      rejectReads = true;
      expect(() => result?.restore()).not.toThrow();
      rejectReads = false;
      expect(target.method).toBe(wrappedMethod);
      expect(target.method).not.toBe(originalMethod);
    });

    it('does not restore over a host method replaced after fill', () => {
      const original = vi.fn(() => 'original');
      const replacement = vi.fn(() => 'replacement');
      const thirdParty = vi.fn(() => 'third-party');
      const target = { method: original };
      const result = fill(target, 'method', () => replacement);
      target.method = thirdParty;

      result?.restore();

      expect(target.method).toBe(thirdParty);
    });

    it('does not attempt to wrap a host property whose value cannot be read', () => {
      const target = { method: vi.fn() };
      const proxy = new Proxy(target, {
        get(targetObject, property, receiver) {
          if (property === 'method') throw new Error('read denied');
          return Reflect.get(targetObject, property, receiver);
        },
      });

      expect(() => fill(proxy, 'method', () => vi.fn())).not.toThrow();
      expect(fill(proxy, 'method', () => vi.fn())).toBeUndefined();
    });

    it('does not attempt to wrap a host proxy which rejects property checks', () => {
      const proxy = new Proxy(
        { method: vi.fn() },
        {
          has() {
            throw new Error('has denied');
          },
        },
      );

      expect(() => fill(proxy, 'method', () => vi.fn())).not.toThrow();
      expect(fill(proxy, 'method', () => vi.fn())).toBeUndefined();
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
    const createError = (message: string, location = 'engine/game.js:10555:48'): Error => {
      const error = new TypeError(message);
      error.stack = [`TypeError: ${message}`, `at o.OnInit (${location})`].join('\n');
      return error;
    };

    const createPlatformError = (
      message: string,
      location = 'engine/game.js:10555:48',
    ): string =>
      [
        'MiniProgramError',
        message,
        `TypeError: ${message}`,
        `at o.OnInit (${location})`,
      ].join('\n');

    it('should return false by default', () => {
      expect(shouldIgnoreOnError(createPlatformError('not captured'))).toBe(false);
    });

    it('should consume a matching platform error once', () => {
      const message = 'matching captured error';
      markErrorAsCaptured(createError(message));

      expect(shouldIgnoreOnError(createPlatformError(message))).toBe(true);
      expect(shouldIgnoreOnError(createPlatformError(message))).toBe(false);
    });

    it('should normalize the generic Error prefix from platform strings', () => {
      const message = 'generic matching error';
      const error = new Error(message);
      error.stack = [`Error: ${message}`, 'at o.OnInit (engine/game.js:10555:48)'].join('\n');
      markErrorAsCaptured(error);

      expect(
        shouldIgnoreOnError(
          [
            'MiniProgramError',
            message,
            `Error: ${message}`,
            'at o.OnInit (engine/game.js:10555:48)',
          ].join('\n'),
        ),
      ).toBe(true);
    });

    it('should match Safari-style stack locations', () => {
      const message = 'safari matching error';
      const error = new Error(message);
      error.stack = [`Error: ${message}`, 'o.OnInit@engine/game.js:10555:48'].join('\n');
      markErrorAsCaptured(error);

      expect(
        shouldIgnoreOnError(
          [
            'MiniProgramError',
            `Error: ${message}`,
            'o.OnInit@engine/game.js:10555:48',
          ].join('\n'),
        ),
      ).toBe(true);
    });

    it('should cover a delayed platform callback within the fingerprint window', () => {
      let now = 1000;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
      const message = 'delayed captured error';

      try {
        markErrorAsCaptured(createError(message));
        now += 303;

        expect(shouldIgnoreOnError(createPlatformError(message))).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('should not consume an expired captured error', () => {
      let now = 1000;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
      const message = 'expired captured error';

      try {
        markErrorAsCaptured(createError(message));
        now += 1001;

        expect(shouldIgnoreOnError(createPlatformError(message))).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('should not match another error type at a different location', () => {
      const message = 'same message from another error type';
      markErrorAsCaptured(createError(message));

      expect(
        shouldIgnoreOnError(
          [
            'MiniProgramError',
            message,
            `RangeError: ${message}`,
            'at o.OnInit (engine/game.js:58020:2130)',
          ].join('\n'),
        ),
      ).toBe(false);
      expect(shouldIgnoreOnError(createPlatformError(message))).toBe(true);
    });

    it('should match the same error type and message when host wrapping changes the stack', () => {
      const message = 'host-wrapped error';
      markErrorAsCaptured(createError(message));

      expect(
        shouldIgnoreOnError(
          createPlatformError(message, 'WAGameSubContext.js:1:200000'),
        ),
      ).toBe(true);
    });

    it('should read an embedded stack from an object payload with an empty stack field', () => {
      const message = 's.Ins.OnEventGameInit is not a function';
      markErrorAsCaptured(createError(message, 'Project/ViewBattleDebug.ts:52:23'));

      expect(
        shouldIgnoreOnError({
          message: [
            'MiniProgramError',
            message,
            `TypeError: ${message}`,
            'at bInit (subpackages/../file:/Project/ViewBattleDebug.ts:52:23)',
            'at Function.<anonymous> (WAGameSubContext.js:1:216128)',
          ].join('\n'),
          stack: '',
        }),
      ).toBe(true);
    });

    it('should prefer the core message immediately after MiniProgramError', () => {
      const message = 'core platform message';
      markErrorAsCaptured(createError(message));

      expect(
        shouldIgnoreOnError({
          message: [
            'MiniProgramError',
            message,
            `TypeError: ${message} (host suffix)`,
            'at Function.<anonymous> (WAGameSubContext.js:1:216128)',
          ].join('\n'),
          stack: '   ',
        }),
      ).toBe(true);
    });

    it('should use the error type when neither stack has a comparable location', () => {
      const message = 'type-only matching error';
      const error = new TypeError(message);
      error.stack = `TypeError: ${message}`;
      markErrorAsCaptured(error);

      expect(shouldIgnoreOnError(`MiniProgramError\nTypeError: ${message}`)).toBe(true);
    });

    it('should fall back to the constructor type when the runtime omits error.name', () => {
      const message = "Cannot read properties of null (reading 'TryChangeDataUserBySystemInit')";
      const error = new TypeError(message);
      error.name = '';
      error.stack = [message, 'at gameTick (subpackages/engine/game.js:12000:20)'].join('\n');
      markErrorAsCaptured(error);

      expect(
        shouldIgnoreOnError({
          message: [
            'MiniProgramError',
            message,
            `TypeError: ${message}`,
            'at sentryWrapped (sdk/sentry-miniapp.js:18:15817)',
            'at Function.<anonymous> (WAGameSubContext.js:1:216128)',
          ].join('\n'),
          stack: '',
        }),
      ).toBe(true);
    });

    it('should tolerate a throwing name getter and still use the constructor type', () => {
      const value = {
        message: 'host error',
        stack: '',
        constructor: TypeError,
      } as Record<string, unknown>;
      Object.defineProperty(value, 'name', {
        get() {
          throw new Error('name is unavailable');
        },
      });

      expect(getErrorDetails(value)?.type).toBe('TypeError');
    });

    it('should tolerate a throwing constructor getter without inventing an error type', () => {
      const value = { message: 'host error', stack: '', name: '' } as Record<string, unknown>;
      Object.defineProperty(value, 'constructor', {
        get() {
          throw new Error('constructor is unavailable');
        },
      });

      expect(getErrorDetails(value)).toEqual({ message: 'host error', stack: '' });
    });

    it('should consume multiple identical captured errors one by one', () => {
      const message = 'repeated captured error';
      markErrorAsCaptured(createError(message));
      markErrorAsCaptured(createError(message));

      expect(shouldIgnoreOnError(createPlatformError(message))).toBe(true);
      expect(shouldIgnoreOnError(createPlatformError(message))).toBe(true);
      expect(shouldIgnoreOnError(createPlatformError(message))).toBe(false);
    });

    it('should not suppress errors without a comparable stack location', () => {
      markErrorAsCaptured('missing platform stack');
      expect(shouldIgnoreOnError('missing platform stack')).toBe(false);
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
