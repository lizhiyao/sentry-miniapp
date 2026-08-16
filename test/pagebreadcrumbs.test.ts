import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PageBreadcrumbs,
  pageBreadcrumbsIntegration,
} from '../src/integrations/pagebreadcrumbs';
import { _resetAppLifecycle } from '../src/appLifecycle';

vi.mock('@sentry/core', () => ({
  addBreadcrumb: vi.fn(),
  getClient: vi.fn(() => undefined),
  setContext: vi.fn(),
}));

import { addBreadcrumb, getClient, setContext } from '@sentry/core';

const activeIntegrations = new Set<PageBreadcrumbs>();

function setupIntegration(integration: PageBreadcrumbs): void {
  const client = { registerCleanup: vi.fn() } as any;
  vi.mocked(getClient).mockReturnValue(client);
  integration.setup(client);
  activeIntegrations.add(integration);
}

describe('PageBreadcrumbs Integration', () => {
  let originalPage: any;
  let originalApp: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockReturnValue(undefined);
    _resetAppLifecycle(); // 清共享 App 包装状态，避免用例间残留
    originalPage = (globalThis as any).Page;
    originalApp = (globalThis as any).App;
  });

  afterEach(() => {
    for (const integration of activeIntegrations) integration.cleanup();
    activeIntegrations.clear();
    (globalThis as any).Page = originalPage;
    (globalThis as any).App = originalApp;
    _resetAppLifecycle();
  });

  describe('Page lifecycle breadcrumbs', () => {
    it('should wrap Page() and record onShow breadcrumb', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const onShowFn = vi.fn();
      const pageOptions = {
        onShow: onShowFn,
        route: 'pages/index/index',
      };

      // Trigger Page() registration
      const wrapped = (globalThis as any).Page(pageOptions);

      // Simulate onShow call
      wrapped.onShow.call({ route: 'pages/index/index' });

      expect(onShowFn).toHaveBeenCalled();
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'page.lifecycle',
        message: 'onShow: pages/index/index',
        level: 'info',
        data: {
          action: 'onShow',
          page: 'pages/index/index',
        },
      });
    });

    it('should wrap Page() and record onHide breadcrumb', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const onHideFn = vi.fn();
      const pageOptions = { onHide: onHideFn };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped.onHide.call({ route: 'pages/detail/detail' });

      expect(onHideFn).toHaveBeenCalled();
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'page.lifecycle',
          data: expect.objectContaining({ action: 'onHide' }),
        }),
      );
    });

    it('uses an unknown route when lifecycle handlers have no page instance', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);
      const integration = new PageBreadcrumbs();
      setupIntegration(integration);
      const page = (globalThis as any).Page({ onShow: vi.fn() });

      page.onShow.call(null);

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'onShow: unknown' }),
      );
    });

    it('should wrap onLoad and onUnload', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const onLoadFn = vi.fn();
      const onUnloadFn = vi.fn();
      const pageOptions = { onLoad: onLoadFn, onUnload: onUnloadFn };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped.onLoad.call({ route: 'pages/index/index' }, { id: '123' });
      wrapped.onUnload.call({ route: 'pages/index/index' });

      expect(onLoadFn).toHaveBeenCalledWith({ id: '123' });
      expect(onUnloadFn).toHaveBeenCalled();
      expect(addBreadcrumb).toHaveBeenCalledTimes(2);
    });

    it('records cold-start duration on the first page ready only', () => {
      (globalThis as any).App = vi.fn((options: any) => options);
      (globalThis as any).Page = vi.fn((options: any) => options);
      vi.mocked(Date.now).mockReturnValueOnce(1000).mockReturnValueOnce(1250);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);
      const app = (globalThis as any).App({});
      const page = (globalThis as any).Page({ onReady: vi.fn() });

      app.onLaunch();
      page.onReady.call({ route: 'pages/home/index' });
      page.onReady.call({ route: 'pages/home/index' });

      expect(setContext).toHaveBeenCalledTimes(1);
      expect(setContext).toHaveBeenCalledWith('startup', {
        coldStartDuration: 250,
        firstPage: 'pages/home/index',
      });
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'page.lifecycle',
          data: expect.objectContaining({ coldStartDuration: 250 }),
        }),
      );
    });

    it('should not wrap lifecycle when enableLifecycle is false', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs({ enableLifecycle: false });
      setupIntegration(integration);

      const onShowFn = vi.fn();
      const pageOptions = { onShow: onShowFn };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped.onShow.call({ route: 'pages/index/index' });

      expect(onShowFn).toHaveBeenCalled();
      // addBreadcrumb should not be called for lifecycle
      expect(addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'page.lifecycle' }),
      );
    });
  });

  describe('User interaction breadcrumbs', () => {
    it('should wrap tap handler and record breadcrumb', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const onTapFn = vi.fn();
      const pageOptions = { onTap: onTapFn };

      const wrapped = (globalThis as any).Page(pageOptions);
      const mockEvent = {
        type: 'tap',
        target: { id: 'btn-submit', dataset: { action: 'submit' } },
      };
      wrapped.onTap.call({ route: 'pages/index/index' }, mockEvent);

      expect(onTapFn).toHaveBeenCalledWith(mockEvent);
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'user.interaction',
        message: 'onTap on pages/index/index',
        level: 'info',
        data: {
          handler: 'onTap',
          page: 'pages/index/index',
          targetId: 'btn-submit',
          dataset: { action: 'submit' },
          eventType: 'tap',
        },
      });
    });

    it('should wrap handleClick, bindChange, onSubmit handlers', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const clickSpy = vi.fn();
      const changeSpy = vi.fn();
      const submitSpy = vi.fn();
      const pageOptions = {
        handleClick: clickSpy,
        bindChange: changeSpy,
        onSubmit: submitSpy,
      };

      const wrapped = (globalThis as any).Page(pageOptions);

      wrapped.handleClick.call({ route: 'pages/form/form' }, { type: 'tap' });
      wrapped.bindChange.call({ route: 'pages/form/form' }, { type: 'change' });
      wrapped.onSubmit.call({ route: 'pages/form/form' }, { type: 'submit' });

      expect(addBreadcrumb).toHaveBeenCalledTimes(3);
      expect(clickSpy).toHaveBeenCalled();
      expect(changeSpy).toHaveBeenCalled();
      expect(submitSpy).toHaveBeenCalled();
    });

    it.each([
      'itemTap',
      'buttonClick',
      'valueChange',
      'formSubmit',
      'pageScroll',
      'textInput',
    ])('should recognize the %s suffix as an interaction handler', handlerName => {
      (globalThis as any).Page = vi.fn((options: any) => options);
      const handler = vi.fn();
      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const page = (globalThis as any).Page({ [handlerName]: handler });
      page[handlerName].call({}, null);

      expect(handler).toHaveBeenCalledWith(null);
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'user.interaction',
          message: `${handlerName} on unknown`,
        }),
      );
    });

    it('captures interaction coordinates and touch details', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);
      const integration = new PageBreadcrumbs();
      setupIntegration(integration);
      const onInput = vi.fn();
      const page = (globalThis as any).Page({ onInput });
      const event = {
        type: 'input',
        detail: { x: 12, y: 34 },
        touches: [{ pageX: 56, pageY: 78 }],
      };

      page.onInput.call({ __route__: 'pages/form/index' }, event, 'extra');

      expect(onInput).toHaveBeenCalledWith(event, 'extra');
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'user.interaction',
          data: expect.objectContaining({
            page: 'pages/form/index',
            x: 12,
            y: 34,
            touchX: 56,
            touchY: 78,
          }),
        }),
      );
    });

    it('should NOT wrap lifecycle methods as user interactions', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs({ enableLifecycle: false });
      setupIntegration(integration);

      const pageOptions = {
        onShow: vi.fn(),
        onHide: vi.fn(),
        onLoad: vi.fn(),
      };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped.onShow.call({ route: 'test' });
      wrapped.onHide.call({ route: 'test' });
      wrapped.onLoad.call({ route: 'test' });

      // These should not be recorded as user interactions
      expect(addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'user.interaction' }),
      );
    });

    it('should NOT wrap private methods starting with _', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const pageOptions = { _privateMethod: vi.fn() };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped._privateMethod.call({ route: 'test' });

      expect(addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'user.interaction' }),
      );
    });

    it('should not wrap interactions when enableUserInteraction is false', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs({ enableUserInteraction: false });
      setupIntegration(integration);

      const pageOptions = { onTap: vi.fn() };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped.onTap.call({ route: 'test' }, { type: 'tap' });

      expect(addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'user.interaction' }),
      );
    });
  });

  describe('App lifecycle breadcrumbs', () => {
    it('should wrap App() and record onLaunch breadcrumb', () => {
      (globalThis as any).App = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const onLaunchFn = vi.fn();
      const appOptions = { onLaunch: onLaunchFn };

      const wrapped = (globalThis as any).App(appOptions);
      wrapped.onLaunch.call({});

      expect(onLaunchFn).toHaveBeenCalled();
      expect(addBreadcrumb).toHaveBeenCalledWith({
        category: 'app.lifecycle',
        message: 'App.onLaunch',
        level: 'info',
        data: { action: 'onLaunch' },
      });
    });

    it('should wrap App onShow and onHide', () => {
      (globalThis as any).App = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      const showSpy = vi.fn();
      const hideSpy = vi.fn();
      const appOptions = {
        onShow: showSpy,
        onHide: hideSpy,
      };

      const wrapped = (globalThis as any).App(appOptions);
      wrapped.onShow.call({});
      wrapped.onHide.call({});

      expect(addBreadcrumb).toHaveBeenCalledTimes(2);
      expect(showSpy).toHaveBeenCalled();
      expect(hideSpy).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('manual cleanup drains client-specific subscriptions idempotently', () => {
      const basePage = vi.fn((options: any) => options);
      (globalThis as any).Page = basePage;
      (globalThis as any).App = vi.fn((options: any) => options);
      const registerCleanup = vi.fn();
      const client = { registerCleanup } as any;
      vi.mocked(getClient).mockReturnValue(client);
      const integration = new PageBreadcrumbs();

      integration.setup(client);
      const registeredCleanup = registerCleanup.mock.calls[0][0];
      integration.cleanup();
      registeredCleanup();
      registeredCleanup();

      expect((globalThis as any).Page).toBe(basePage);
    });

    it('should handle missing Page() gracefully', () => {
      delete (globalThis as any).Page;

      const integration = new PageBreadcrumbs();
      expect(() => integration.setupOnce()).not.toThrow();
    });

    it('should handle missing App() gracefully', () => {
      delete (globalThis as any).App;

      const integration = new PageBreadcrumbs();
      expect(() => setupIntegration(integration)).not.toThrow();
    });

    it('should handle Page() with no options', () => {
      (globalThis as any).Page = vi.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);

      expect(() => (globalThis as any).Page(null)).not.toThrow();
      expect(() => (globalThis as any).Page(undefined)).not.toThrow();
    });
  });

  describe('Page 包装幂等与安全还原', () => {
    it('二次 setupOnce 只保留一层中性包装', () => {
      const base = vi.fn((o: any) => o);
      (globalThis as any).Page = base;

      const integration = new PageBreadcrumbs();
      integration.setupOnce();
      const wrapped = (globalThis as any).Page;
      expect(wrapped).not.toBe(base);

      integration.setupOnce();
      expect((globalThis as any).Page).toBe(wrapped);

      const onShow = vi.fn();
      (globalThis as any).Page({ onShow }).onShow();
      expect(onShow).toHaveBeenCalledOnce();
      expect(addBreadcrumb).not.toHaveBeenCalled();
    });

    it('cleanup 不清掉他人在我们之后包装的 Page', () => {
      const base = vi.fn((o: any) => o);
      (globalThis as any).Page = base;

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);
      const ourWrapper = (globalThis as any).Page;

      // 第三方在我们之后再包一层
      const thirdParty = vi.fn((o: any) => ourWrapper(o));
      (globalThis as any).Page = thirdParty;

      integration.cleanup();
      // 当前 Page 已非本集成的包装 → 不还原，保留第三方包装（修复前会被无条件清成原始 Page）
      expect((globalThis as any).Page).toBe(thirdParty);
    });

    it('cleanup 在我们仍是顶层包装时正常还原原始 Page', () => {
      const base = vi.fn((o: any) => o);
      (globalThis as any).Page = base;

      const integration = new PageBreadcrumbs();
      setupIntegration(integration);
      expect((globalThis as any).Page).not.toBe(base);

      integration.cleanup();
      expect((globalThis as any).Page).toBe(base);
    });
  });

  it('creates an integration through the public factory', () => {
    expect(pageBreadcrumbsIntegration({ enableLifecycle: false })).toBeInstanceOf(
      PageBreadcrumbs,
    );
  });
});
