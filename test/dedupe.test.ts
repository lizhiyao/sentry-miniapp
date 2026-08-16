import { describe, it, expect, beforeEach } from 'vitest';
import { Dedupe, dedupeIntegration } from '../src/integrations/index';
import type { Event } from '@sentry/core';

describe('Dedupe Integration', () => {
  let dedupe: Dedupe;

  beforeEach(() => {
    dedupe = new Dedupe();
  });

  describe('basic properties', () => {
    it('should have correct id and name', () => {
      expect(Dedupe.id).toBe('Dedupe');
      expect(dedupe.name).toBe('Dedupe');
    });

    it('should have setupOnce method', () => {
      expect(typeof dedupe.setupOnce).toBe('function');
      expect(() => dedupe.setupOnce()).not.toThrow();
    });
  });

  describe('processEvent', () => {
    it('should return event if it has a type (non-error events)', () => {
      const event: Event = {
        type: 'transaction',
        event_id: '1',
        timestamp: Date.now() / 1000,
      };

      const result = dedupe.processEvent(event);
      expect(result).toBe(event);
    });

    it('should process first error event normally', () => {
      const event: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error',
      };

      const result = dedupe.processEvent(event);
      expect(result).toBe(event);
    });

    it('should dedupe identical message events', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error',
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        message: 'Test error',
      };

      // Process first event
      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      // Process duplicate event
      const result2 = dedupe.processEvent(event2);
      expect(result2).toBeNull();
    });

    it('should not dedupe different message events', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error 1',
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        message: 'Test error 2',
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should dedupe identical exception events', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
              stacktrace: {
                frames: [
                  {
                    filename: 'test.js',
                    function: 'testFunction',
                    lineno: 10,
                    colno: 5,
                  },
                ],
              },
            },
          ],
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
              stacktrace: {
                frames: [
                  {
                    filename: 'test.js',
                    function: 'testFunction',
                    lineno: 10,
                    colno: 5,
                  },
                ],
              },
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBeNull();
    });

    it('should not dedupe exception events with different types', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
            },
          ],
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'TypeError',
              value: 'Test exception',
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should not dedupe exception events with different values', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception 1',
            },
          ],
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception 2',
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should handle events with different fingerprints', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error',
        fingerprint: ['custom', 'fingerprint', '1'],
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        message: 'Test error',
        fingerprint: ['custom', 'fingerprint', '2'],
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should handle events with same fingerprints', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error',
        fingerprint: ['custom', 'fingerprint'],
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        message: 'Test error',
        fingerprint: ['custom', 'fingerprint'],
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBeNull();
    });

    it('should handle events with different stacktraces', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
              stacktrace: {
                frames: [
                  {
                    filename: 'test1.js',
                    function: 'testFunction1',
                    lineno: 10,
                    colno: 5,
                  },
                ],
              },
            },
          ],
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
              stacktrace: {
                frames: [
                  {
                    filename: 'test2.js',
                    function: 'testFunction2',
                    lineno: 20,
                    colno: 10,
                  },
                ],
              },
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should handle events with different stacktrace lengths', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
              stacktrace: {
                frames: [
                  {
                    filename: 'test.js',
                    function: 'testFunction',
                    lineno: 10,
                    colno: 5,
                  },
                ],
              },
            },
          ],
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
              stacktrace: {
                frames: [
                  {
                    filename: 'test.js',
                    function: 'testFunction',
                    lineno: 10,
                    colno: 5,
                  },
                  {
                    filename: 'test2.js',
                    function: 'testFunction2',
                    lineno: 20,
                    colno: 10,
                  },
                ],
              },
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should handle events without stacktraces', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
            },
          ],
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBeNull();
    });

    it('should handle mixed message and exception events', () => {
      const messageEvent: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error',
      };

      const exceptionEvent: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(messageEvent);
      expect(result1).toBe(messageEvent);

      const result2 = dedupe.processEvent(exceptionEvent);
      expect(result2).toBe(exceptionEvent);
    });

    it('should handle events with malformed fingerprints', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error',
        fingerprint: null as any,
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        message: 'Test error',
        fingerprint: undefined as any,
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBeNull();
    });

    it('should handle events with malformed exceptions', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: null as any,
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: undefined as any,
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should handle events with malformed stacktraces', () => {
      const event1: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test exception',
              stacktrace: {
                frames: null as any,
              },
            },
          ],
        },
      };

      const event2: Event = {
        event_id: '2',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: 'DifferentError',
              value: 'Different exception',
              stacktrace: null as any,
            },
          ],
        },
      };

      const result1 = dedupe.processEvent(event1);
      expect(result1).toBe(event1);

      const result2 = dedupe.processEvent(event2);
      expect(result2).toBe(event2);
    });

    it('should handle errors during processing gracefully', () => {
      const event: Event = {
        event_id: '1',
        timestamp: Date.now() / 1000,
        message: 'Test error',
      };

      // Mock a method to throw an error
      const originalMethod = (dedupe as any)._shouldDropEvent;
      (dedupe as any)._shouldDropEvent = () => {
        throw new Error('Processing error');
      };

      const result = dedupe.processEvent(event);
      expect(result).toBe(event);

      // Restore original method
      (dedupe as any)._shouldDropEvent = originalMethod;
    });

    it('should fuzzy-match exception values with dynamic IDs', () => {
      const fuzzyDedupe = new Dedupe({ fuzzyMatch: true });
      const first: Event = {
        exception: { values: [{ type: 'Error', value: 'Request 1234567890 failed' }] },
      };
      const second: Event = {
        exception: { values: [{ type: 'Error', value: 'Request 9876543210 failed' }] },
      };

      expect(fuzzyDedupe.processEvent(first)).toBe(first);
      expect(fuzzyDedupe.processEvent(second)).toBeNull();
    });

    it('should not fuzzy-match when one exception value is absent', () => {
      const fuzzyDedupe = new Dedupe({ fuzzyMatch: true });
      const first: Event = { exception: { values: [{ type: 'Error' }] } };
      const second: Event = {
        exception: { values: [{ type: 'Error', value: 'Request failed' }] },
      };

      fuzzyDedupe.processEvent(first);

      expect(fuzzyDedupe.processEvent(second)).toBe(second);
    });

    it('should distinguish message events when only one has a stacktrace in either order', () => {
      const withStack: Event = {
        message: 'same message',
        exception: {
          values: [{ stacktrace: { frames: [{ filename: 'page.js', lineno: 1 }] } }],
        },
      };
      const withoutStack: Event = { message: 'same message' };

      dedupe.processEvent(withStack);
      expect(dedupe.processEvent(withoutStack)).toBe(withoutStack);

      const reverseDedupe = new Dedupe();
      reverseDedupe.processEvent(withoutStack);
      expect(reverseDedupe.processEvent(withStack)).toBe(withStack);
    });

    it('should distinguish exception events when only one has a fingerprint in either order', () => {
      const withFingerprint: Event = {
        fingerprint: ['custom'],
        exception: { values: [{ type: 'Error', value: 'same error' }] },
      };
      const withoutFingerprint: Event = {
        exception: { values: [{ type: 'Error', value: 'same error' }] },
      };

      dedupe.processEvent(withFingerprint);
      expect(dedupe.processEvent(withoutFingerprint)).toBe(withoutFingerprint);

      const reverseDedupe = new Dedupe();
      reverseDedupe.processEvent(withoutFingerprint);
      expect(reverseDedupe.processEvent(withFingerprint)).toBe(withFingerprint);
    });

    it('should treat a throwing fingerprint implementation as non-matching', () => {
      const first: Event = { message: 'same message', fingerprint: ['custom'] };
      const throwingFingerprint = ['custom'];
      throwingFingerprint.join = () => {
        throw new Error('join unavailable');
      };
      const second: Event = { message: 'same message', fingerprint: throwingFingerprint };

      dedupe.processEvent(first);

      expect(dedupe.processEvent(second)).toBe(second);
    });
  });

  describe('dedupeIntegration factory', () => {
    it('should create an official core Dedupe integration', () => {
      const integration = dedupeIntegration();
      expect(integration.name).toBe('Dedupe');
      expect(integration.processEvent).toEqual(expect.any(Function));
    });

    it('should create different instances on multiple calls', () => {
      const integration1 = dedupeIntegration();
      const integration2 = dedupeIntegration();
      expect(integration1).not.toBe(integration2);
      expect(integration1.name).toBe('Dedupe');
      expect(integration2.name).toBe('Dedupe');
    });
  });
});
