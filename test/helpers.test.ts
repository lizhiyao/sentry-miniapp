import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { wrap, fill } from '../src/helpers';

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
});