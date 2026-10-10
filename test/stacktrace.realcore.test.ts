import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, type Envelope, type Event } from '@sentry/core';
import { init } from '../src/sdk';
import type { MiniappClient } from '../src/client';
import { rewriteFramesIntegration } from '../src/integrations/rewriteframes';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

let client: MiniappClient | undefined;
afterEach(() => {
  client?.dispose();
  client = undefined;
  getCurrentScope().setClient(undefined);
  vi.unstubAllGlobals();
});

describe('async bare stack frame through real Core and Debug ID matching', () => {
  it.each([false, true])(
    'keeps the original event when optional Debug ID sync and warning fail (debug=%s)',
    async (debug) => {
      vi.stubGlobal('wx', { request: vi.fn() });
      vi.stubGlobal('window', {
        get _sentryDebugIds() {
          throw new Error('alias inaccessible');
        },
      });
      const envelopes: Envelope[] = [];
      client = init({
        dsn: 'https://key@example.test/1',
        debug,
        enableSystemInfo: false,
        sendClientReports: false,
        defaultIntegrations: false,
        transport: createCapturingTransport(envelopes),
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
        throw new Error('console unavailable');
      });
      try {
        const eventId = client!.captureMessage('optional bridge failure');
        await expect(client!.flush(1000)).resolves.toBe(true);
        expect(collectEnvelopePayloads<Event>(envelopes, ['event'])).toEqual([
          expect.objectContaining({ event_id: eventId, message: 'optional bridge failure' }),
        ]);
        expect(warn).toHaveBeenCalledTimes(debug ? 1 : 0);
      } finally {
        warn.mockRestore();
      }
    },
  );

  it.each([true, false])(
    'preserves the artifact and Debug ID (Error header=%s)',
    async (header) => {
      const sourceFilename = 'pages/index/index.js';
      const codeFile = `app:///${sourceFilename}`;
      const debugId = '11111111-2222-4333-8444-555555555555';
      vi.stubGlobal('wx', { request: vi.fn() });
      // The injected build stack is synchronous; the same file can later fail after an await.
      vi.stubGlobal('_sentryDebugIds', {
        [`Error\n    at buildDebugId (${sourceFilename}:1:1)`]: debugId,
      });
      vi.stubGlobal('_debugIds', undefined);
      const envelopes: Envelope[] = [];
      client = init({
        dsn: 'https://key@example.test/1',
        release: 'async-frame-map-test',
        enableSystemInfo: false,
        sendClientReports: false,
        defaultIntegrations: [rewriteFramesIntegration()],
        transport: createCapturingTransport(envelopes),
      });
      expect(client).toBeDefined();
      const error = new Error('async mapped error');
      error.stack = `${header ? 'Error: async mapped error\n' : ''}    at async ${sourceFilename}:42:13`;
      const eventId = client!.captureException(error);
      await expect(client!.flush(1000)).resolves.toBe(true);
      const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event).toMatchObject({
        event_id: eventId,
        exception: {
          values: [{ stacktrace: { frames: [{ filename: codeFile, lineno: 42, colno: 13 }] } }],
        },
        debug_meta: { images: [{ type: 'sourcemap', code_file: codeFile, debug_id: debugId }] },
      });
      const frames = event.exception!.values![0]!.stacktrace!.frames!;
      expect(frames).toHaveLength(1);
      const frame = frames[0]!;
      expect(frame.function).toBe('?');
      expect(frame.debug_id).toBeUndefined();
      expect(event.sdkProcessingMetadata).toBeUndefined();
    },
  );
});
