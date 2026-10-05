import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, getIsolationScope, type Envelope, type Event } from '@sentry/core';
import * as Sentry from '../src/index';
import { resetPlatformCache } from '../src/crossPlatform';
import { _resetAppLifecycle } from '../src/appLifecycle';
import { collectEnvelopePayloads, createCapturingTransport } from './support/envelopes';

describe('仓库示例的真实 init／生命周期契约', () => {
  let owner: Sentry.MiniappClient | undefined;
  let app: Record<string, (options?: unknown) => unknown>;
  let envelopes: Envelope[];

  beforeEach(() => {
    envelopes = [];
    getCurrentScope().clearBreadcrumbs();
    getCurrentScope().setUser(null);
    getIsolationScope().clearBreadcrumbs();
    getIsolationScope().setUser(null);
    resetPlatformCache();
    _resetAppLifecycle();
    vi.stubGlobal('wx', { request: vi.fn(), getSystemInfoSync: () => ({ platform: 'ios' }) });
    vi.stubGlobal('App', (options: typeof app) => {
      app = options;
    });
  });

  afterEach(() => {
    owner?.dispose();
    owner = undefined;
    vi.unstubAllGlobals();
    resetPlatformCache();
    _resetAppLifecycle();
    getCurrentScope().clearBreadcrumbs();
    getCurrentScope().setUser(null);
    getIsolationScope().clearBreadcrumbs();
    getIsolationScope().setUser(null);
  });

  function createFacade() {
    return {
      ...Sentry,
      init: (options: Sentry.MiniappOptions) => {
        owner = Sentry.init({
          ...options,
          dsn: 'https://key@example.com/1',
          enableOfflineCache: false,
          transport: createCapturingTransport(envelopes),
        });
        return owner;
      },
    };
  }

  it('执行微信 app.js，默认集成保留，launch／show query 白名单不泄漏且 span 使用 stream', async () => {
    // 执行原始示例选项；仅替换投递目标与传输，禁止测试发真实网络。
    const facade = createFacade();
    const source = readFileSync(new URL('../examples/wxapp/app.js', import.meta.url), 'utf8');
    runInNewContext(source, {
      require: (path: string) => {
        expect(path).toBe('./lib/sentry-miniapp.js');
        return facade;
      },
      App: (options: typeof app) =>
        (globalThis as unknown as { App: (o: typeof app) => void }).App(options),
      console,
    });
    expect(owner).toBeDefined();
    expect(owner?.getIntegrationByName('SpanStreaming')).toBeDefined();
    expect(owner?.getIntegrationByName('PageBreadcrumbs')).toBeDefined();
    expect(owner?.getIntegrationByName('PerformanceAPI')).toBeDefined();
    const input = {
      scene: 1001,
      path: 'pages/index/index',
      query: {
        entry: 'campaign',
        token: 'example-secret-canary',
        memberNo: 'example-secret-canary',
      },
    };
    app.onLaunch?.(input);
    app.onShow?.(input);
    owner?.captureException(new Error('example contract'));
    await owner?.flush(2000);
    const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.app_launch?.query).toEqual({ entry: 'campaign' });
    expect(events[0]?.contexts?.app_visibility?.query).toEqual({ entry: 'campaign' });
    expect(JSON.stringify(envelopes)).not.toContain('example-secret-canary');
    expect(input.query.token).toBe('example-secret-canary');
    expect(envelopes.some((envelope) => envelope[1].some((item) => item[0].type === 'span'))).toBe(
      true,
    );
    expect(
      envelopes.some((envelope) => envelope[1].some((item) => item[0].type === 'transaction')),
    ).toBe(false);
    app.onHide?.();
  });

  it.each(['taro', 'uniapp'] as const)(
    '%s 初始化模块使用当前入口，Logs 按调用采集',
    async (framework) => {
      const facade = createFacade();
      const extension = framework === 'taro' ? 'ts' : 'js';
      const source = readFileSync(
        new URL(`../examples/${framework}/src/utils/sentry.${extension}`, import.meta.url),
        'utf8',
      );
      const module = { exports: {} };
      const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      runInNewContext(compiled, {
        module,
        exports: module.exports,
        console,
        require: (name: string) => {
          expect(name).toBe('sentry-miniapp');
          return facade;
        },
      });
      expect(owner).toBeDefined();
      expect(owner?.getIntegrationByName('SpanStreaming')).toBeDefined();
      expect(Boolean(owner?.getIntegrationByName('PerformanceAPI'))).toBe(framework === 'uniapp');
      if (framework === 'uniapp') {
        const callbacks: Record<string, () => void> = {};
        const appSource = readFileSync(
          new URL('../examples/uniapp/src/App.vue', import.meta.url),
          'utf8',
        )
          .split('<script setup>')[1]
          ?.split('</script>')[0];
        expect(appSource).toBeDefined();
        runInNewContext(
          ts.transpileModule(appSource!, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
          }).outputText,
          {
            exports: {},
            console,
            require: (name: string) => {
              if (name === './utils/sentry') return module.exports;
              expect(name).toBe('@dcloudio/uni-app');
              return Object.fromEntries(
                ['onLaunch', 'onShow', 'onHide'].map((key) => [
                  key,
                  (callback: () => void) => {
                    callbacks[key] = callback;
                  },
                ]),
              );
            },
          },
        );
        callbacks.onLaunch?.();
        callbacks.onShow?.();
        callbacks.onHide?.();
      }
      facade.logger.info('framework explicit log');
      owner?.captureException(new Error('framework contract'));
      await owner?.flush(2000);
      const events = collectEnvelopePayloads<Event>(envelopes, ['event']);
      expect(events).toHaveLength(1);
      expect(events[0]?.tags?.['app.framework']).toBe(
        framework === 'taro' ? 'taro-react' : 'uni-app',
      );
      expect(envelopes.some((envelope) => envelope[1].some((item) => item[0].type === 'log'))).toBe(
        true,
      );
      if (framework === 'uniapp')
        expect(events[0]?.contexts?.app_launch?.framework).toBe('uni-app');
    },
  );
});
