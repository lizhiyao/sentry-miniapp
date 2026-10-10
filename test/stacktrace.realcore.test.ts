import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, type Envelope, type Event } from '@sentry/core';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
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

describe('async bare stack frame through real Core and source maps', () => {
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
      // A minimal real v3 map links generated line 42, column 13 to source line 7, column 3.
      const uploadedMaps = new Map([
        [
          codeFile,
          new TraceMap({
            version: 3,
            file: 'index.js',
            sources: ['src/pages/index.ts'],
            names: ['loadData'],
            mappings: `${';'.repeat(41)}YAMEA`,
          }),
        ],
      ]);
      const map = uploadedMaps.get(frame.filename!);
      expect(map).toBeDefined();
      expect(originalPositionFor(map!, { line: frame.lineno!, column: frame.colno! - 1 })).toEqual({
        source: 'src/pages/index.ts',
        line: 7,
        column: 2,
        name: 'loadData',
      });
    },
  );
});
