import { describe, expect, expectTypeOf, it } from 'vitest';
import * as Sentry from '../src/index';
import type { MiniappOptions } from '../src/types';
import type { PerformanceIntegrationOptions } from '../src/integrations/performance';

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

  it('不导出 static 生命周期回调适配器', () => {
    expect('withStaticSpan' in Sentry).toBe(false);
    expect('withStreamedSpan' in Sentry).toBe(false);
  });
  it('2.0 的类型排除 static、旧 transaction 配置与 Performance 二次采样/聚合选项', () => {
    expectTypeOf<MiniappOptions>()
      .toHaveProperty('traceLifecycle')
      .toEqualTypeOf<'stream' | undefined>();
    expectTypeOf<MiniappOptions>().not.toHaveProperty('beforeSendTransaction');
    expectTypeOf<MiniappOptions>().not.toHaveProperty('ignoreTransactions');
    expectTypeOf<PerformanceIntegrationOptions>().not.toHaveProperty('sampleRate');
    expectTypeOf<PerformanceIntegrationOptions>().not.toHaveProperty('bufferSize');
    expectTypeOf<PerformanceIntegrationOptions>().not.toHaveProperty('reportInterval');
    expectTypeOf<PerformanceIntegrationOptions>().not.toHaveProperty('thresholds');
    expectTypeOf<PerformanceIntegrationOptions>().not.toHaveProperty('enableMemory');
  });
});
