import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { init, captureException, captureMessage, addBreadcrumb } from '../src/index';
import { getClient, getCurrentScope, flush, installedIntegrations } from '@sentry/core';
import { MiniappClient } from '../src/client';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';

/**
 * 端到端集成测试（真 @sentry/core + 捕获型 transport）。
 *
 * 重写自一批「init() 后只 expect(true).toBe(true) / expect(fn).toBeDefined()」的伪覆盖用例：
 * 它们搭好了真实场景（init、captureException、beforeSend 过滤）却不断言任何真实产物，且多数
 * 因没清平台缓存而让内部 mock 断言根本不执行。这里改用捕获 transport 取到实际上报的 envelope，
 * 断言其内容。保留原本就真实的两个用例（tracesSampler 透传、sampleRate=0 采样丢弃）。
 */
describe('Integration（真 @sentry/core 端到端）', () => {
  let captured: any[];

  function initWithCapture(extra: Record<string, any> = {}): MiniappClient | undefined {
    return init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      transport: () => ({
        send: (env: any) => {
          captured.push(env);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
      ...extra,
    } as any);
  }

  function capturedEvents(): any[] {
    const events: any[] = [];
    for (const env of captured) {
      const items = env[1];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const header = item[0];
        if (header && header.type === 'event') events.push(item[1]);
      }
    }
    return events;
  }

  beforeEach(() => {
    captured = [];
    resetPlatformCache();
    _resetAppLifecycle();
    installedIntegrations.length = 0;
  });

  afterEach(async () => {
    const c = getClient();
    if (c) await c.close(0);
    installedIntegrations.length = 0;
    _resetAppLifecycle();
    resetPlatformCache();
  });

  it('init 绑定 MiniappClient 并设为当前 client', () => {
    const client = initWithCapture();
    expect(client).toBeInstanceOf(MiniappClient);
    expect(getClient()).toBe(client);
  });

  it('captureException 端到端：上报的 envelope 真带该异常', async () => {
    initWithCapture();
    captureException(new Error('e2e boom'));
    await flush(2000);

    const ev = capturedEvents().find((e) =>
      e.exception?.values?.some((v: any) => v.value?.includes('e2e boom')),
    );
    expect(ev).toBeDefined();
    expect(ev.platform).toBeTruthy();
  });

  it('captureMessage 端到端：上报的 envelope 真带该消息与级别', async () => {
    initWithCapture();
    captureMessage('hello e2e', 'warning');
    await flush(2000);

    const ev = capturedEvents().find((e) => e.message === 'hello e2e');
    expect(ev).toBeDefined();
    expect(ev.level).toBe('warning');
  });

  it('transportOptions.headers 端到端：透传到默认小程序 transport 请求头', async () => {
    const mockRequest = jest.fn().mockImplementation((options) => {
      (options as any).success({
        statusCode: 200,
        data: 'OK',
        header: {},
      });
    });
    (global as any).wx.request = mockRequest;
    resetPlatformCache();

    init({
      dsn: 'https://test@o0.ingest.sentry.io/0',
      enableAutoSessionTracking: false,
      enableOfflineCache: false,
      integrations: [],
      transportOptions: {
        headers: {
          'Content-Type': 'application/x-sentry-envelope; charset=utf-8',
          'X-Gateway-Token': 'miniapp-token',
        },
      },
    });

    captureMessage('transport headers e2e');
    await flush(2000);

    expect(mockRequest).toHaveBeenCalled();
    const callArgs = mockRequest.mock.calls[0]![0] as any;
    expect(callArgs.header).toMatchObject({
      'Content-Type': 'application/x-sentry-envelope; charset=utf-8',
      'X-Gateway-Token': 'miniapp-token',
    });
    expect(callArgs.headers).toMatchObject({
      'Content-Type': 'application/x-sentry-envelope; charset=utf-8',
      'X-Gateway-Token': 'miniapp-token',
    });
  });

  it('breadcrumb 真挂到随后上报的事件上', async () => {
    initWithCapture();
    addBreadcrumb({ category: 'navigation', message: 'go page', level: 'info' });
    captureException(new Error('with crumb'));
    await flush(2000);

    const ev = capturedEvents().find((e) =>
      e.exception?.values?.some((v: any) => v.value?.includes('with crumb')),
    );
    expect(ev?.breadcrumbs?.some((b: any) => b.message === 'go page')).toBe(true);
  });

  it('beforeSend 真能过滤敏感字段，其它字段保留', async () => {
    initWithCapture({
      beforeSend: (event: any) => {
        if (event.extra) delete event.extra.password;
        return event;
      },
    });
    const scope = getCurrentScope();
    scope.setExtra('password', 'secret123');
    scope.setExtra('userId', '12345');
    captureException(new Error('sensitive'));
    await flush(2000);

    const ev = capturedEvents().find((e) =>
      e.exception?.values?.some((v: any) => v.value?.includes('sensitive')),
    );
    expect(ev).toBeDefined();
    expect(ev.extra?.password).toBeUndefined(); // 被 beforeSend 删除
    expect(ev.extra?.userId).toBe('12345'); // 其它字段保留

    scope.setExtra('password', null);
    scope.setExtra('userId', null);
  });

  it('sampleRate=0：错误事件被采样丢弃，transport 收不到', async () => {
    initWithCapture({ sampleRate: 0 });
    captureException(new Error('sampled out'));
    await flush(2000);
    expect(capturedEvents().length).toBe(0);
  });

  it('tracesSampler 透传到 client 选项', () => {
    const tracesSampler = jest.fn<() => number>().mockReturnValue(0.5);
    const client = initWithCapture({ tracesSampler, integrations: [] });
    expect(client?.getOptions().tracesSampler).toBe(tracesSampler);
  });

  it('非法 DSN：不抛错但记录错误日志', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => init({ dsn: 'invalid-dsn', debug: true } as any)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
