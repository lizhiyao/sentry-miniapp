import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope, getIsolationScope, installedIntegrations } from '@sentry/core';
import type { Envelope, Event } from '@sentry/core';
import { init, consoleBreadcrumbsIntegration, globalHandlersIntegration } from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('可选宿主能力失败时保留独立采集（真实 Core）', () => {
  let captured: Envelope[];
  const restores: Array<() => void> = [];

  function unreadable(source: object, name: string): void {
    const previous = Object.getOwnPropertyDescriptor(source, name);
    Object.defineProperty(source, name, {
      configurable: true,
      get() {
        throw new Error(`${name} unavailable`);
      },
    });
    restores.push(() => {
      if (previous) Object.defineProperty(source, name, previous);
      else Reflect.deleteProperty(source, name);
    });
  }

  beforeEach(() => {
    captured = [];
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
    getCurrentScope().clearBreadcrumbs();
    getIsolationScope().clearBreadcrumbs();
  });

  afterEach(() => {
    getClient()?.dispose();
    for (const restore of restores.splice(0).reverse()) restore();
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
  });

  it('Page getter 不可读时默认 init 仍可采集独立事件', async () => {
    unreadable(globalThis, 'Page');
    const owner = init({
      dsn: 'https://test@example.com/1',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    })!;
    owner.captureMessage('page fallback');
    await owner.flush();
    expect(collectEnvelopePayloads<Event>(captured, ['event'])[0]?.message).toBe('page fallback');
  });

  it('宿主显式关闭的导航能力不被改成伪造函数', async () => {
    const host = (globalThis as typeof globalThis & { wx: Record<string, unknown> }).wx;
    host['navigateTo'] = null;
    const owner = init({
      dsn: 'https://test@example.com/1',
      enableAutoSessionTracking: false,
      transport: createCapturingTransport(captured),
    })!;
    expect(host['navigateTo']).toBeNull();
    owner.captureMessage('navigation fallback');
    await owner.flush();
    expect(collectEnvelopePayloads<Event>(captured, ['event'])[0]?.message).toBe(
      'navigation fallback',
    );
  });

  it('一个 console getter 不可读时其余级别仍透明调用并采集', async () => {
    unreadable(console, 'debug');
    const original = vi.fn(() => 'business result');
    vi.spyOn(console, 'log').mockImplementation(original);
    const owner = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [consoleBreadcrumbsIntegration({ levels: ['debug', 'log'] })],
      transport: createCapturingTransport(captured),
    })!;
    expect(console.log('available log')).toBe('business result');
    expect(original).toHaveBeenCalledExactlyOnceWith('available log');
    owner.captureMessage('console fallback');
    await owner.flush();
    expect(collectEnvelopePayloads<Event>(captured, ['event'])[0]?.breadcrumbs).toContainEqual(
      expect.objectContaining({ category: 'console', message: 'available log' }),
    );
  });

  it('offError getter 不可读时仍注册可用 onError，关闭后迟到报告失效', async () => {
    const host = (globalThis as typeof globalThis & { wx: Record<string, unknown> }).wx;
    let handler: ((error: Error) => void) | undefined;
    host['onError'] = (callback: (error: Error) => void) => {
      handler = callback;
    };
    unreadable(host, 'offError');
    const owner = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [globalHandlersIntegration()],
      transport: createCapturingTransport(captured),
    })!;
    expect(handler).toBeTypeOf('function');
    handler!(new Error('available onError'));
    await owner.flush();
    expect(collectEnvelopePayloads<Event>(captured, ['event'])[0]?.exception?.values?.[0]?.value).toBe(
      'available onError',
    );
    owner.dispose();
    handler!(new Error('late report'));
    expect(collectEnvelopePayloads<Event>(captured, ['event'])).toHaveLength(1);
  });

  it('只读 Error.stackTraceLimit 不阻断宿主异常监听', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit');
    Object.defineProperty(Error, 'stackTraceLimit', {
      configurable: true,
      value: 10,
      writable: false,
    });
    restores.push(() => {
      if (descriptor) Object.defineProperty(Error, 'stackTraceLimit', descriptor);
      else Reflect.deleteProperty(Error, 'stackTraceLimit');
    });
    const host = (globalThis as typeof globalThis & { wx: Record<string, unknown> }).wx;
    let handler: ((error: Error) => void) | undefined;
    host['onError'] = (callback: (error: Error) => void) => {
      handler = callback;
    };
    const owner = init({
      dsn: 'https://test@example.com/1',
      defaultIntegrations: [globalHandlersIntegration()],
      transport: createCapturingTransport(captured),
    })!;
    expect(handler).toBeTypeOf('function');
    handler!(new Error('readonly stack limit'));
    await owner.flush();
    expect(collectEnvelopePayloads<Event>(captured, ['event'])[0]?.exception?.values?.[0]?.value).toBe(
      'readonly stack limit',
    );
  });
});
