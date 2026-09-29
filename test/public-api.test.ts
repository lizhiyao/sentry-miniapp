import { describe, expect, it } from 'vitest';
import * as Sentry from '../src/index';
import type { SpanJSON } from '@sentry/core';

/**
 * 文档承诺的公开 API 必须真的能从 sentry-miniapp 入口拿到。
 * 这里守的是「文档写了、出口没有」的漂移——用户不应为了装配 span 生命周期去直接依赖
 * 未声明的传递依赖 @sentry/core。
 */
describe('公开 API 出口', () => {
  const requiredFunctions = [
    'init',
    'captureException',
    'setTag',
    'setAttribute',
    'setAttributes',
    'getGlobalScope',
    'getCurrentScope',
    'getIsolationScope',
    'spanStreamingIntegration',
    'withStaticSpan',
    'withStreamedSpan',
    'startSpan',
    'startInactiveSpan',
    'getDiagnostics',
  ] as const;

  it.each(requiredFunctions)('导出 %s', (name) => {
    expect(typeof (Sentry as Record<string, unknown>)[name]).toBe('function');
  });

  it('入口导出的 spanStreamingIntegration 就是 core 的同名集成', () => {
    const integration = Sentry.spanStreamingIntegration();

    expect(integration.name).toBe('SpanStreaming');
    expect(typeof integration.setup).toBe('function');
  });

  it('withStaticSpan 就地标记回调并返回同一引用，供 static 生命周期识别', () => {
    const callback = (span: SpanJSON) => span;

    expect(Sentry.withStaticSpan(callback)).toBe(callback);
  });
});
