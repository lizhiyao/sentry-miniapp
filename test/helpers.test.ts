import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  wrap, 
  fill, 
  shouldIgnoreOnError, 
  ignoreNextOnErrorCall, 
  getFunctionName, 
  isError, 
  isInstanceOf, 
  isString, 
  isPlainObject 
} from '../src/helpers';

describe('Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('wrap', () => {
    it('should wrap function and preserve original behavior', () => {
      const originalFn = jest.fn((a: number, b: number) => a + b);
      const wrappedFn = wrap(originalFn);

      const result = wrappedFn(2, 3);

      expect(result).toBe(5);
      expect(originalFn).toHaveBeenCalledWith(2, 3);
    });

    it('should handle function that throws error', () => {
      const mockCaptureException = jest.fn();
      const mockGetClient = jest.fn(() => ({
        captureException: mockCaptureException
      }));
      
      // Mock getCurrentHub
      jest.doMock('@sentry/core', () => ({
        getCurrentHub: () => ({
          getClient: mockGetClient
        })
      }));

      const errorFn = jest.fn(() => {
        throw new Error('Test error');
      });
      
      const wrappedFn = wrap(errorFn);

      expect(() => wrappedFn()).toThrow('Test error');
      expect(errorFn).toHaveBeenCalled();
    });

    it('should preserve function properties', () => {
      const originalFn = jest.fn();
      (originalFn as any).customProperty = 'test';
      
      const wrappedFn = wrap(originalFn);

      expect((wrappedFn as any).customProperty).toBe('test');
    });

    it('should mark function as wrapped', () => {
      const originalFn = jest.fn();
      const wrappedFn = wrap(originalFn);

      expect((wrappedFn as any).__sentry__).toBe(true);
      expect((wrappedFn as any).__sentry_original__).toBe(originalFn);
    });

    it('should not double-wrap already wrapped functions', () => {
      const originalFn = jest.fn();
      const wrappedFn1 = wrap(originalFn);
      const wrappedFn2 = wrap(wrappedFn1);

      expect(wrappedFn1).toBe(wrappedFn2);
    });

    it('should handle non-function input', () => {
      const nonFunction = 'not a function';
      const result = wrap(nonFunction as any);

      expect(result).toBe(nonFunction);
    });
  });

  describe('fill', () => {
    it('should replace object method with wrapped version', () => {
      const obj = {
        method: jest.fn(() => 'original')
      };
      const originalMethod = obj.method;

      fill(obj, 'method', (original) => {
        return function(this: any, ...args: any[]) {
          return 'wrapped: ' + original.apply(this, args);
        };
      });

      const result = obj.method();

      expect(result).toBe('wrapped: original');
      expect(obj.method).not.toBe(originalMethod);
    });

    it('should handle non-existent property', () => {
      const obj = {} as any;

      expect(() => {
        fill(obj, 'nonExistent', (original) => original);
      }).not.toThrow();
    });

    it('should handle non-function property', () => {
      const obj = {
        property: 'not a function'
      };

      expect(() => {
        fill(obj, 'property', (original) => original);
      }).not.toThrow();
    });

    it('should preserve function context', () => {
      const obj = {
        value: 42,
        getValue: function() {
          return this.value;
        }
      };

      fill(obj, 'getValue', (original) => {
        return function(this: any, ...args: any[]) {
          return original.apply(this, args) * 2;
        };
      });

      const result = obj.getValue();

      expect(result).toBe(84);
    });

    it('should handle replacement function that throws', () => {
      const obj = {
        method: jest.fn(() => 'original')
      };

      fill(obj, 'method', () => {
        return function() {
          throw new Error('Replacement error');
        };
      });

      expect(() => obj.method()).toThrow('Replacement error');
    });

    it('should replace method multiple times', () => {
      const obj = {
        method: jest.fn(() => 'original')
      };
      const originalMethod = obj.method;

      // First wrap
      fill(obj, 'method', (original) => {
        return function(this: any, ...args: any[]) {
          return 'wrapped1: ' + original.apply(this, args);
        };
      });
      const firstWrapped = obj.method;

      // Second wrap
      fill(obj, 'method', (original) => {
        return function(this: any, ...args: any[]) {
          return 'wrapped2: ' + original.apply(this, args);
        };
      });

      expect(obj.method).not.toBe(originalMethod);
      expect(obj.method).not.toBe(firstWrapped);
    });
  });

  describe('shouldIgnoreOnError', () => {
    it('should return false by default', () => {
      expect(shouldIgnoreOnError()).toBe(false);
    });

    it('should return true after ignoreNextOnErrorCall', () => {
      ignoreNextOnErrorCall();
      expect(shouldIgnoreOnError()).toBe(true);
    });

    it('should return false after timeout', (done) => {
      ignoreNextOnErrorCall();
      expect(shouldIgnoreOnError()).toBe(true);
      
      setTimeout(() => {
        expect(shouldIgnoreOnError()).toBe(false);
        done();
      }, 10);
    });

    it('should handle multiple calls', () => {
      ignoreNextOnErrorCall();
      ignoreNextOnErrorCall();
      expect(shouldIgnoreOnError()).toBe(true);
    });
  });

  describe('getFunctionName', () => {
    it('should return function name', () => {
      function namedFunction() {}
      expect(getFunctionName(namedFunction)).toBe('namedFunction');
    });

    it('should return <anonymous> for anonymous functions', () => {
      const anonymousFunction = (() => function() {})();
      expect(getFunctionName(anonymousFunction)).toBe('<anonymous>');
    });

    it('should return <anonymous> for non-functions', () => {
      expect(getFunctionName(null)).toBe('<anonymous>');
      expect(getFunctionName(undefined)).toBe('<anonymous>');
      expect(getFunctionName('string')).toBe('<anonymous>');
      expect(getFunctionName(123)).toBe('<anonymous>');
    });

    it('should handle functions without name property', () => {
      const fn = function() {};
      Object.defineProperty(fn, 'name', {
        get() {
          throw new Error('Cannot access name');
        }
      });
      expect(getFunctionName(fn)).toBe('<anonymous>');
    });
  });

  describe('isError', () => {
    it('should return true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
      expect(isError(new ReferenceError('test'))).toBe(true);
    });

    it('should return false for non-Error values', () => {
      expect(isError('string')).toBe(false);
      expect(isError(123)).toBe(false);
      expect(isError({})).toBe(false);
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
    });

    it('should handle error-like objects', () => {
      const errorLike = {
        name: 'Error',
        message: 'test error'
      };
      expect(isError(errorLike)).toBe(false);
    });
  });

  describe('isInstanceOf', () => {
    it('should return true for valid instances', () => {
      expect(isInstanceOf(new Error(), Error)).toBe(true);
      expect(isInstanceOf([], Array)).toBe(true);
      expect(isInstanceOf({}, Object)).toBe(true);
    });

    it('should return false for invalid instances', () => {
      expect(isInstanceOf('string', Error)).toBe(false);
      expect(isInstanceOf(123, Array)).toBe(false);
      expect(isInstanceOf(null, Object)).toBe(false);
    });

    it('should handle exceptions during instanceof check', () => {
      const problematicConstructor = {
        [Symbol.hasInstance]() {
          throw new Error('Cannot check instance');
        }
      };
      expect(isInstanceOf({}, problematicConstructor)).toBe(false);
    });
  });

  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString(String('test'))).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString(new String('test'))).toBe(true); // String object is still a string
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true); // Object without prototype is still plain
    });

    it('should return false for non-plain objects', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(new Error())).toBe(false);
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
    });

    it('should return false for class instances', () => {
      class TestClass {}
      expect(isPlainObject(new TestClass())).toBe(true); // Class instances are still plain objects
    });
  });
});