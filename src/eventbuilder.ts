// Note: eventFromException and eventFromMessage are now handled by the client
import type { Event, EventHint, SeverityLevel } from '@sentry/core';

// 为小程序环境定义 ErrorEvent 接口
interface ErrorEvent {
  error: Error;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  constructor: { name: string };
}

// Simple implementations for compatibility
export function eventFromException(existingEvent: any, exception: any, _hint?: EventHint): Event {
  return {
    ...existingEvent,
    exception: {
      values: [{
        type: (exception && exception.name) || 'Error',
        value: (exception && exception.message) || String(exception),
      }]
    },
    level: 'error',
  } as Event;
}

export function eventFromMessage(existingEvent: any, message: string, level: any = 'info', _hint?: EventHint): Event {
  return {
    ...existingEvent,
    message: message,
    level,
  } as Event;
}

import { isError, isPlainObject } from './helpers';

/**
 * Builds and Event from a Exception
 * @hidden
 */
export function eventFromUnknownInput(
  stackParser: any,
  exception: unknown,
  hint?: EventHint,
): Event {
  let event: Event;

  if (isErrorEvent(exception) && (exception as ErrorEvent).error) {
    // If it is an ErrorEvent with `error` property, extract it to get actual Error
    const errorEvent = exception as ErrorEvent;
    return eventFromException(stackParser, errorEvent.error, hint);
  }

  // If it is a `DOMError` (which is a legacy API, but still supported in some browsers) or `DOMException`
  if (isDOMError(exception) || isDOMException(exception)) {
    const domException = exception as DOMException;

    if ('stack' in exception) {
      event = eventFromException(stackParser, exception as Error, hint);
    } else {
      const name = domException.name || (isDOMError(domException) ? 'DOMError' : 'DOMException');
      const message = domException.message ? `${name}: ${domException.message}` : name;
      event = eventFromMessage(stackParser, message, 'error', hint);
      event.exception = {
        values: [
          {
            type: name,
            value: domException.message,
          },
        ],
      };
    }
    return event;
  }

  if (isError(exception)) {
    // we have a real Error object, do nothing
    return eventFromException(stackParser, exception, hint);
  }

  if (isPlainObject(exception) && hint && hint.syntheticException) {
    // If it is plain Object, serialize it manually and extract options
    // This will allow us to group events based on top-level keys
    // which is much better than creating new group when any key/value change
    const message = `Non-Error exception captured with keys: ${extractExceptionKeysForMessage(exception)}`;
    const syntheticException = hint.syntheticException;
    event = eventFromException(stackParser, syntheticException, hint);
    event.message = message;
    event.exception!.values![0] = {
      ...event.exception!.values![0],
      type: 'Object',
      value: message,
    };
    event.extra = {
      ...event.extra,
      __serialized__: normalizeToSize(exception),
    };

    return event;
  }

  // If none of previous checks were valid, then it means that it's not:
  // - an instance of DOMError
  // - an instance of DOMException
  // - an instance of Event
  // - an instance of Error
  // - a valid ErrorEvent (one with an error property)
  // - a plain Object
  //
  // So bail out and capture it as a simple message:
  const stringException = exception as string;
  event = eventFromMessage(stackParser, stringException, undefined, hint);
  event.exception = {
    values: [
      {
        type: 'UnhandledException',
        value: `Non-Error exception captured: ${stringException}`,
      },
    ],
  };

  return event;
}

/**
 * @hidden
 */
export function eventFromString(
  stackParser: any,
  input: string,
  level: SeverityLevel = 'info',
  hint?: EventHint,
): Event {
  const event = eventFromMessage(stackParser, input, level, hint);
  event.level = level;
  return event;
}

/**
 * Checks whether given value's type is ErrorEvent
 * {@link isErrorEvent}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
function isErrorEvent(wat: any): wat is ErrorEvent {
  return wat && wat.constructor && wat.constructor.name === 'ErrorEvent';
}

/**
 * Checks whether given value's type is DOMError
 * {@link isDOMError}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
function isDOMError(wat: any): wat is Error {
  return wat && wat.constructor && wat.constructor.name === 'DOMError';
}

/**
 * Checks whether given value's type is DOMException
 * {@link isDOMException}.
 *
 * @param wat A value to be checked.
 * @returns A boolean representing the result.
 */
function isDOMException(wat: any): wat is DOMException {
  return wat && wat.constructor && wat.constructor.name === 'DOMException';
}

/**
 * @hidden
 */
function extractExceptionKeysForMessage(exception: Record<string, unknown>, maxLength: number = 40): string {
  const keys = Object.keys(exception);
  keys.sort();

  if (!keys.length) {
    return '[object has no keys]';
  }

  if (keys[0] && keys[0].length >= maxLength) {
    return keys[0];
  }

  for (let includedKeys = keys.length; includedKeys > 0; includedKeys--) {
    const serialized = keys.slice(0, includedKeys).join(', ');
    if (serialized.length > maxLength) {
      continue;
    }
    if (includedKeys === keys.length) {
      return serialized;
    }
    return `${serialized}\u2026`;
  }

  return '';
}

/**
 * Normalize any value to a reasonable size for serialization
 */
function normalizeToSize(object: any, depth: number = 3, maxProperties: number = 1000): any {
  const normalized = normalizeValue(object, depth, maxProperties);

  // truncate the object
  if (normalized && typeof normalized === 'object' && Object.keys(normalized).length > maxProperties) {
    return '[Object too large]';
  }

  return normalized;
}

/**
 * Normalize a value
 */
function normalizeValue(value: any, depth: number, maxProperties: number): any {
  if (depth === 0) {
    return '[Object]';
  }

  if (value === null || (['number', 'boolean', 'string'].includes(typeof value) && !isNaN(value))) {
    return value;
  }

  const stringified = stringifyValue(value);
  if (!stringified.startsWith('[object ')) {
    return stringified;
  }

  if (value['__sentry_skip_normalization__']) {
    return value;
  }

  if (typeof value === 'function') {
    return `[Function: ${value.name || '<anonymous>'}]`;
  }

  if (typeof value === 'symbol') {
    return `[${String(value)}]`;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (isError(value)) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((v) => normalizeValue(v, depth - 1, maxProperties));
  }

  const normalized: Record<string, any> = {};
  let numAdded = 0;

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    if (numAdded >= maxProperties) {
      normalized['[...]'] = '[Object too large]';
      break;
    }

    const normalizedKey = typeof key === 'symbol' ? `[${String(key)}]` : key;
    normalized[normalizedKey] = normalizeValue(value[key], depth - 1, maxProperties);
    numAdded += 1;
  }

  return normalized;
}

/**
 * Stringify a value
 */
function stringifyValue(value: any): string {
  try {
    return JSON.stringify(value);
  } catch (_oO) {
    return '[Object]';
  }
}