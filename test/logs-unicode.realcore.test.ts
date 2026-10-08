import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, withScope, type Envelope, type SerializedLogContainer } from '@sentry/core';
import { init } from '../src/sdk';
import { MiniappClient } from '../src/client';
import { installPolyfills } from '../src/polyfills';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

const methodNames = ['isWellFormed', 'toWellFormed'] as const;
const descriptors = methodNames.map((name) =>
  Object.getOwnPropertyDescriptor(String.prototype, name),
);
function removeMethods() {
  for (const name of methodNames) Reflect.deleteProperty(String.prototype, name);
}
function restoreMethods() {
  methodNames.forEach((name, index) => {
    const descriptor = descriptors[index];
    if (descriptor) Object.defineProperty(String.prototype, name, descriptor);
    else Reflect.deleteProperty(String.prototype, name);
  });
}

describe('旧宿主 String 能力与真实 core 日志最终 payload', () => {
  let client: MiniappClient | undefined;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    client?.dispose();
    client = undefined;
    vi.restoreAllMocks();
    restoreMethods();
    vi.useRealTimers();
  });

  it.each([false, true])(
    '缺 String 方法=%s：body、template、scope 与 callback attributes 等价',
    async (missing) => {
      if (missing) removeMethods();
      installPolyfills();
      const envelopes: Envelope[] = [];
      client = init({
        dsn: 'https://key@example.com/1',
        defaultIntegrations: false,
        transport: createCapturingTransport(envelopes),
        beforeSendLog: (log) => ({
          ...log,
          message: `callback ${String(log.message)}\ud800`,
          attributes: { ...log.attributes, ['callback\udc00']: '\ud800pair😀\udc00' },
        }),
      })!;
      let flushing!: PromiseLike<boolean>;
      withScope((scope) => {
        scope.setClient(client);
        scope.setAttribute('scope\ud800', 'value\udc00😀');
        logger.info(logger.fmt`template\ud800\n ${'param\udc00😀'}`);
        flushing = client!.flush();
      });
      await vi.advanceTimersByTimeAsync(1);
      expect(await flushing).toBe(true);
      const log = collectEnvelopePayloads<SerializedLogContainer>(envelopes, ['log'])[0]!.items[0]!;
      expect(log.body).toBe('callback template�\n param�😀�');
      expect(log.attributes).toMatchObject({
        'scope�': { type: 'string', value: 'value�😀' },
        'callback�': { type: 'string', value: '�pair😀�' },
        'sentry.message.template': { type: 'string', value: 'template�\n %s' },
        'sentry.message.parameter.0': { type: 'string', value: 'param�😀' },
      });
    },
  );

  it('已有业务／原生方法保持身份，缺失方法不可枚举且可写、可配置', () => {
    const existing = vi.fn(() => true);
    Object.defineProperty(String.prototype, 'isWellFormed', {
      value: existing,
      configurable: true,
    });
    Reflect.deleteProperty(String.prototype, 'toWellFormed');
    installPolyfills();
    expect(Object.getOwnPropertyDescriptor(String.prototype, 'isWellFormed')!.value).toBe(existing);
    expect(Object.getOwnPropertyDescriptor(String.prototype, 'toWellFormed')).toMatchObject({
      enumerable: false,
      writable: true,
      configurable: true,
    });
  });

  it('安装受限时诊断并安全返回，不覆盖已有方法', () => {
    removeMethods();
    const define = Object.defineProperty;
    vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
      if (target === String.prototype) throw new TypeError('not extensible');
      return define(target, key, descriptor);
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => installPolyfills()).not.toThrow();
    expect(warning).toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(String.prototype, 'toWellFormed')).toBeUndefined();
  });
  it('polyfill 保留合法 surrogate pair，替换连续孤立字符，并遵循接收者类型语义', () => {
    removeMethods();
    installPolyfills();
    const prototype = String.prototype as unknown as Record<string, (this: unknown) => unknown>;
    const wellFormed = prototype['isWellFormed']!;
    const repair = prototype['toWellFormed']!;
    expect(wellFormed.call('😀中文')).toBe(true);
    expect(wellFormed.call('')).toBe(true);
    expect(wellFormed.call('\ud800\ud800\udc00\udc00')).toBe(false);
    expect(repair.call('\ud800\ud800\udc00\udc00')).toBe('�𐀀�');
    expect(repair.call(123)).toBe('123');
    for (const value of [null, undefined, Symbol('invalid')]) {
      expect(() => wellFormed.call(value)).toThrow(TypeError);
      expect(() => repair.call(value)).toThrow(TypeError);
    }
  });
});
