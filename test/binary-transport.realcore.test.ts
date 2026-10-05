import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeEnvelope, getCurrentScope, type Envelope } from '@sentry/core';
import { resetPlatformCache } from '../src/crossPlatform';
import { createMiniappTransport, UnsupportedBinaryRequestError } from '../src/transports/xhr';
import { init } from '../src/sdk';
import { getDiagnostics } from '../src/diagnostics';
import type { MiniappClient } from '../src/client';
import { createEventEnvelope } from './support/envelopes';

const globals = ['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks'] as const;
const clients: MiniappClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  getCurrentScope().setClient(undefined);
  vi.unstubAllGlobals();
  resetPlatformCache();
});
function host(name: (typeof globals)[number]) {
  globals.forEach((global) => vi.stubGlobal(global, undefined));
  const request = vi.fn((options) => {
    options.success({ statusCode: 200 });
    return {};
  });
  vi.stubGlobal(name, name === 'my' || name === 'dd' ? { httpRequest: request } : { request });
  resetPlatformCache();
  return request;
}
function binary(bytes: Uint8Array): Envelope {
  const event = createEventEnvelope('binary');
  event[1].push([{ type: 'attachment', filename: 'raw.bin', length: bytes.byteLength }, bytes]);
  return event;
}
const options = { url: 'https://example.com/envelope/', recordDroppedEvent: () => {} };

it('request option construction failure settles and clears the SDK timeout before any host call', async () => {
  vi.useFakeTimers();
  try {
    const request = host('wx');
    const headers = {};
    Object.defineProperty(headers, 'x-test', {
      enumerable: true,
      get: () => {
        throw new Error('header failure');
      },
    });
    const transport = createMiniappTransport({ ...options, headers });
    await expect(transport.send(binary(new Uint8Array([0])))).rejects.toThrow('header failure');
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('rechecks consent after a host request getter synchronously revokes it', async () => {
  const request = host('wx');
  let granted = true;
  let sending = false;
  vi.stubGlobal('wx', {
    get request() {
      if (sending) granted = false;
      return request;
    },
  });
  resetPlatformCache();
  const transport = createMiniappTransport(
    options,
    () => true,
    () => granted,
  );
  sending = true;
  await expect(transport.send(createEventEnvelope('revoked-in-getter'))).rejects.toThrow(
    'blocked by consent',
  );
  expect(request).not.toHaveBeenCalled();
});

it('rechecks consent when an occupied host slot releases before a queued request starts', async () => {
  const request = host('wx');
  request.mockImplementation(() => ({}));
  let granted = true;
  const transport = createMiniappTransport(
    { ...options, maxConcurrentRequests: 1 },
    () => true,
    () => granted,
  );
  const first = transport.send(createEventEnvelope('first'));
  const second = transport.send(createEventEnvelope('queued'));
  const rejected = expect(second).rejects.toThrow('blocked by consent');
  granted = false;
  request.mock.calls[0]![0].success({ statusCode: 200 });
  await first;
  await rejected;
  expect(request).toHaveBeenCalledOnce();
});

describe.each(globals)('%s binary capability fixture', (name) => {
  it('uses a precise ArrayBuffer only on verified defaults and explicitly rejects other defaults', async () => {
    const request = host(name);
    const envelope = binary(new Uint8Array([99, 0, 128, 255, 99]).subarray(1, 4));
    const transport = createMiniappTransport(options);
    if (name === 'wx' || name === 'tt') {
      await transport.send(envelope);
      const sent: unknown = request.mock.calls[0]![0].data;
      expect(sent).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(sent as ArrayBuffer)).toEqual(serializeEnvelope(envelope));
    } else {
      await expect(transport.send(envelope)).rejects.toBeInstanceOf(UnsupportedBinaryRequestError);
      expect(request).not.toHaveBeenCalled();
    }
  });
  it('allows an explicitly verified host capability, including empty attachments', async () => {
    const request = host(name);
    const envelope = binary(new Uint8Array(0));
    await createMiniappTransport({ ...options, binaryRequestBody: 'arraybuffer' }).send(envelope);
    expect(new Uint8Array(request.mock.calls[0]![0].data)).toEqual(serializeEnvelope(envelope));
  });
  it('keeps text envelopes as strings regardless of binary capability', async () => {
    const request = host(name);
    const envelope = createEventEnvelope('text');
    await createMiniappTransport(options).send(envelope);
    expect(request.mock.calls[0]![0].data).toBe(serializeEnvelope(envelope));
  });
});

it('reports unsupported binary through public client diagnostics and does not cache a permanent failure', async () => {
  const request = host('my');
  const disk = new Map<string, string>();
  vi.stubGlobal('my', {
    request,
    getStorageSync: (key: string) => disk.get(key),
    setStorageSync: (key: string, value: string) => disk.set(key, value),
    removeStorageSync: (key: string) => disk.delete(key),
  });
  resetPlatformCache();
  const client = init({ dsn: 'https://key@example.com/1', defaultIntegrations: false })!;
  clients.push(client);
  await expect(client.getTransport()!.send(binary(new Uint8Array([255])))).rejects.toBeInstanceOf(
    UnsupportedBinaryRequestError,
  );
  expect(request).not.toHaveBeenCalled();
  expect([...disk.values()]).toEqual([]);
  expect(getDiagnostics().warnings.map((warning) => warning.code)).toContain(
    'binary_request_unsupported',
  );
});

it('explicit unsupported overrides verified defaults without attempting a network request', async () => {
  const request = host('wx');
  await expect(
    createMiniappTransport({ ...options, binaryRequestBody: 'unsupported' }).send(
      binary(new Uint8Array([0])),
    ),
  ).rejects.toBeInstanceOf(UnsupportedBinaryRequestError);
  expect(request).not.toHaveBeenCalled();
});
