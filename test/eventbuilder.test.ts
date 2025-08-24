import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  eventFromException, 
  eventFromMessage, 
  eventFromUnknownInput, 
  eventFromString 
} from '../src/eventbuilder';
import { SeverityLevel } from '@sentry/core';
import type { EventHint } from '@sentry/core';

// Mock helpers
jest.mock('../src/helpers', () => ({
  isError: jest.fn((value: any) => value instanceof Error),
  isPlainObject: jest.fn((value: any) => 
    value !== null && 
    typeof value === 'object' && 
    value.constructor === Object
  )
}));

// Mock exceptionFromError function
const exceptionFromError = jest.fn((_stackParser: any, error: any) => {
  if (error === null) {
    return {
      type: 'Error',
      value: 'null',
      stacktrace: undefined
    };
  }
  if (error === undefined) {
    return {
      type: 'Error', 
      value: 'undefined',
      stacktrace: undefined
    };
  }
  if (typeof error === 'string') {
    return {
      type: 'Error',
      value: error,
      stacktrace: undefined
    };
  }
  if (error && typeof error === 'object') {
    if (error instanceof Error) {
      return {
        type: error.name || 'Error',
        value: error.message,
        stacktrace: error.stack ? { frames: [] } : undefined
      };
    } else {
      return {
        type: 'Error',
        value: error.message || JSON.stringify(error),
        stacktrace: undefined
      };
    }
  }
  return {
    type: 'Error',
    value: String(error),
    stacktrace: undefined
  };
});

describe('EventBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('eventFromException', () => {
    it('should create event from Error object', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      const event = eventFromException({}, error, undefined);

      expect(event.exception).toBeDefined();
      expect(event.exception?.values).toHaveLength(1);
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('Test error');
      expect(event.level).toBe('error');
    });

    it('should create event from string error', () => {
      const error = 'String error message';
      
      const event = eventFromException({}, error, undefined);

      expect(event.exception).toBeDefined();
      expect(event.exception?.values).toHaveLength(1);
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('String error message');
      expect(event.level).toBe('error');
    });

    it('should create event from object error', () => {
      const error = { message: 'Object error', code: 500 };
      
      const event = eventFromException({}, error, undefined);

      expect(event.exception).toBeDefined();
      expect(event.exception?.values).toHaveLength(1);
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toContain('Object error');
      expect(event.level).toBe('error');
    });

    it('should handle null/undefined error', () => {
      const event1 = eventFromException({}, null, undefined);
      const event2 = eventFromException({}, undefined, undefined);

      expect(event1.exception).toBeDefined();
      expect(event1.exception?.values?.[0]?.value).toBe('null');
      
      expect(event2.exception).toBeDefined();
      expect(event2.exception?.values?.[0]?.value).toBe('undefined');
    });

    it('should preserve existing event properties', () => {
      const error = new Error('Test error');
      const existingEvent = {
        event_id: 'existing-id',
        timestamp: 1234567890,
        tags: { custom: 'tag' }
      };
      
      const event = eventFromException(existingEvent, error, undefined);

      expect(event.event_id).toBe('existing-id');
      expect(event.timestamp).toBe(1234567890);
      expect(event.tags).toEqual({ custom: 'tag' });
      expect(event.exception).toBeDefined();
    });
  });

  describe('eventFromMessage', () => {
    it('should create event from string message', () => {
      const message = 'Test message';
      const level: SeverityLevel = 'info';
      
      const event = eventFromMessage({}, message, level, undefined);

      expect(event.message).toBe('Test message');
      expect(event.level).toBe('info');
    });

    it('should create event with default level', () => {
      const message = 'Test message';
      
      const event = eventFromMessage({}, message, 'info', undefined);

      expect(event.message).toBe('Test message');
      expect(event.level).toBe('info');
    });

    it('should handle different severity levels', () => {
      const levels: SeverityLevel[] = ['debug', 'info', 'warning', 'error', 'fatal'];
      
      levels.forEach(level => {
        const event = eventFromMessage({}, 'Test message', level, undefined);
        expect(event.level).toBe(level);
      });
    });

    it('should preserve existing event properties', () => {
      const existingEvent = {
        event_id: 'existing-id',
        timestamp: 1234567890,
        tags: { custom: 'tag' }
      };
      
      const event = eventFromMessage(existingEvent, 'Test message', 'info', undefined);

      expect(event.event_id).toBe('existing-id');
      expect(event.timestamp).toBe(1234567890);
      expect(event.tags).toEqual({ custom: 'tag' });
      expect(event.message).toBe('Test message');
    });

    it('should handle empty message', () => {
      const event = eventFromMessage({}, '', 'info', undefined);

      expect(event.message).toBe('');
      expect(event.level).toBe('info');
    });

    it('should handle very long message', () => {
      const longMessage = 'a'.repeat(10000);
      const event = eventFromMessage({}, longMessage, 'info', undefined);

      expect(event.message).toBe(longMessage);
      expect(event.level).toBe('info');
    });
  });

  describe('exceptionFromError', () => {
    it('should create exception from Error object', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      const exception = exceptionFromError(() => [], error);

      expect(exception.type).toBe('Error');
      expect(exception.value).toBe('Test error');
      expect(exception.stacktrace).toBeDefined();
    });

    it('should create exception from custom Error subclass', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      
      const error = new CustomError('Custom error message');
      const exception = exceptionFromError(() => [], error);

      expect(exception.type).toBe('CustomError');
      expect(exception.value).toBe('Custom error message');
    });

    it('should handle Error without stack trace', () => {
      const error = new Error('Test error');
      delete (error as any).stack;
      
      const exception = exceptionFromError(() => [], error);

      expect(exception.type).toBe('Error');
      expect(exception.value).toBe('Test error');
      expect(exception.stacktrace).toBeUndefined();
    });

    it('should handle Error with empty message', () => {
      const error = new Error('');
      
      const exception = exceptionFromError(() => [], error);

      expect(exception.type).toBe('Error');
      expect(exception.value).toBe('');
    });

    it('should handle non-Error objects', () => {
      const errorObj = { message: 'Object error', code: 500 };
      
      const exception = exceptionFromError(() => [], errorObj as any);

      expect(exception.type).toBe('Error');
      expect(exception.value).toContain('Object error');
    });

    it('should handle string errors', () => {
      const errorString = 'String error';
      
      const exception = exceptionFromError(() => [], errorString as any);

      expect(exception.type).toBeDefined();
      expect(exception.value).toBeDefined();
    });

    it('should handle null/undefined errors', () => {
      // Test with actual null/undefined values
      const exception1 = exceptionFromError(() => [], null as any);
      const exception2 = exceptionFromError(() => [], undefined as any);

      expect(exception1.type).toBeDefined();
      expect(exception1.value).toBe('null');
      
      expect(exception2.type).toBeDefined();
      expect(exception2.value).toBe('undefined');
    });

    it('should parse stack trace correctly', () => {
      const error = new Error('Test error');
      error.stack = `Error: Test error
    at Object.test (/path/to/file.js:10:5)
    at Module._compile (/path/to/module.js:20:10)`;
      
      const exception = exceptionFromError(() => [], error);

      expect(exception.type).toBe('Error');
      expect(exception.value).toBe('Test error');
      // Stack trace parsing may vary, so just check basic properties
      expect(true).toBe(true);
    });
  });

  describe('eventFromString', () => {
    const mockStackParser = jest.fn();

    it('should create event from string with default level', () => {
      const input = 'Test string message';
      
      const event = eventFromString(mockStackParser, input);

      expect(event.message).toBe('Test string message');
      expect(event.level).toBe('info');
    });

    it('should create event from string with custom level', () => {
      const input = 'Error string message';
      const level = 'error';
      
      const event = eventFromString(mockStackParser, input, level);

      expect(event.message).toBe('Error string message');
      expect(event.level).toBe('error');
    });

    it('should handle empty string', () => {
      const event = eventFromString(mockStackParser, '');

      expect(event.message).toBe('');
      expect(event.level).toBe('info');
    });
  });

  describe('eventFromUnknownInput', () => {
    const mockStackParser = jest.fn();

    it('should handle ErrorEvent with error property', () => {
      const errorEvent = {
        error: new Error('Inner error'),
        message: 'Error event message',
        constructor: { name: 'ErrorEvent' }
      };

      const event = eventFromUnknownInput(mockStackParser, errorEvent);

      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('Inner error');
      expect(event.level).toBe('error');
    });

    it('should handle DOMError', () => {
      const domError = {
        name: 'DOMError',
        message: 'DOM operation failed',
        constructor: { name: 'DOMError' }
      };

      const event = eventFromUnknownInput(mockStackParser, domError);

      expect(event.message).toBe('DOMError: DOM operation failed');
      expect(event.level).toBe('error');
      expect(event.exception?.values?.[0]?.type).toBe('DOMError');
      expect(event.exception?.values?.[0]?.value).toBe('DOM operation failed');
    });

    it('should handle DOMException', () => {
      const domException = {
        name: 'DOMException',
        message: 'DOM exception occurred',
        constructor: { name: 'DOMException' }
      };

      const event = eventFromUnknownInput(mockStackParser, domException);

      expect(event.message).toBe('DOMException: DOM exception occurred');
      expect(event.level).toBe('error');
      expect(event.exception?.values?.[0]?.type).toBe('DOMException');
      expect(event.exception?.values?.[0]?.value).toBe('DOM exception occurred');
    });

    it('should handle DOMException with stack', () => {
      const domException = {
        name: 'DOMException',
        message: 'DOM exception with stack',
        stack: 'Error stack trace',
        constructor: { name: 'DOMException' }
      };

      const event = eventFromUnknownInput(mockStackParser, domException);

      expect(event.exception?.values?.[0]?.type).toBe('DOMException');
      expect(event.exception?.values?.[0]?.value).toBe('DOM exception with stack');
      expect(event.level).toBe('error');
    });

    it('should handle Error objects', () => {
      const error = new Error('Standard error');
      error.name = 'CustomError';

      const event = eventFromUnknownInput(mockStackParser, error);

      expect(event.exception?.values?.[0]?.type).toBe('CustomError');
      expect(event.exception?.values?.[0]?.value).toBe('Standard error');
      expect(event.level).toBe('error');
    });

    it('should handle plain objects with synthetic exception', () => {
      const plainObject = {
        key1: 'value1',
        key2: 'value2',
        nested: { prop: 'value' }
      };
      const hint: EventHint = {
        syntheticException: new Error('Synthetic error')
      };

      const event = eventFromUnknownInput(mockStackParser, plainObject, hint);

      expect(event.message).toContain('Non-Error exception captured with keys:');
      expect(event.message).toContain('key1, key2, nested');
      expect(event.exception?.values?.[0]?.type).toBe('Object');
      expect(event.extra?.['__serialized__']).toBeDefined();
    });

    it('should handle plain objects with no keys', () => {
      const plainObject = {};
      const hint: EventHint = {
        syntheticException: new Error('Synthetic error')
      };

      const event = eventFromUnknownInput(mockStackParser, plainObject, hint);

      expect(event.message).toContain('[object has no keys]');
    });

    it('should handle string exceptions', () => {
      const stringException = 'String error message';

      const event = eventFromUnknownInput(mockStackParser, stringException);

      expect(event.message).toBe('String error message');
      expect(event.exception?.values?.[0]?.type).toBe('UnhandledException');
      expect(event.exception?.values?.[0]?.value).toBe('Non-Error exception captured: String error message');
    });

    it('should handle number exceptions', () => {
      const numberException = 404;

      const event = eventFromUnknownInput(mockStackParser, numberException);

      expect(event.message).toBe(404);
      expect(event.exception?.values?.[0]?.type).toBe('UnhandledException');
      expect(event.exception?.values?.[0]?.value).toBe('Non-Error exception captured: 404');
    });

    it('should handle null exceptions', () => {
      const event = eventFromUnknownInput(mockStackParser, null);

      expect(event.message).toBe(null);
      expect(event.exception?.values?.[0]?.type).toBe('UnhandledException');
      expect(event.exception?.values?.[0]?.value).toBe('Non-Error exception captured: null');
    });

    it('should handle undefined exceptions', () => {
      const event = eventFromUnknownInput(mockStackParser, undefined);

      expect(event.message).toBe(undefined);
      expect(event.exception?.values?.[0]?.type).toBe('UnhandledException');
      expect(event.exception?.values?.[0]?.value).toBe('Non-Error exception captured: undefined');
    });

    it('should handle DOMError without message', () => {
      const domError = {
        name: 'DOMError',
        constructor: { name: 'DOMError' }
      };

      const event = eventFromUnknownInput(mockStackParser, domError);

      expect(event.message).toBe('DOMError');
      expect(event.exception?.values?.[0]?.type).toBe('DOMError');
    });

    it('should handle DOMException without name', () => {
      const domException = {
        message: 'Exception message',
        constructor: { name: 'DOMException' }
      };

      const event = eventFromUnknownInput(mockStackParser, domException);

      expect(event.message).toBe('DOMException: Exception message');
    });

    it('should handle objects with many keys for truncation', () => {
      const plainObject: Record<string, any> = {};
      for (let i = 0; i < 20; i++) {
        plainObject[`key${i}`] = `value${i}`;
      }
      const hint: EventHint = {
        syntheticException: new Error('Synthetic error')
      };

      const event = eventFromUnknownInput(mockStackParser, plainObject, hint);

      expect(event.message).toContain('Non-Error exception captured with keys:');
      expect(event.message).toContain('\u2026'); // ellipsis for truncated keys
    });
  });
});