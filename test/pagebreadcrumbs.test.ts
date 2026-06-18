import { PageBreadcrumbs } from '../src/integrations/pagebreadcrumbs';
import { _resetAppLifecycle } from '../src/appLifecycle';

jest.mock('@sentry/core', () => ({
  addBreadcrumb: jest.fn(),
}));

import { addBreadcrumb } from '@sentry/core';

describe('PageBreadcrumbs Integration', () => {
  let originalPage: any;
  let originalApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetAppLifecycle(); // 清共享 App 包装状态，避免用例间残留
    originalPage = (globalThis as any).Page;
    originalApp = (globalThis as any).App;
  });

  afterEach(() => {
    (globalThis as any).Page = originalPage;
    (globalThis as any).App = originalApp;
    _resetAppLifecycle();
  });

  describe('Page lifecycle breadcrumbs', () => {
    it('should wrap Page() and record onShow breadcrumb', () => {
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const onShowFn = jest.fn();
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
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const onHideFn = jest.fn();
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

    it('should wrap onLoad and onUnload', () => {
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const onLoadFn = jest.fn();
      const onUnloadFn = jest.fn();
      const pageOptions = { onLoad: onLoadFn, onUnload: onUnloadFn };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped.onLoad.call({ route: 'pages/index/index' }, { id: '123' });
      wrapped.onUnload.call({ route: 'pages/index/index' });

      expect(onLoadFn).toHaveBeenCalledWith({ id: '123' });
      expect(onUnloadFn).toHaveBeenCalled();
      expect(addBreadcrumb).toHaveBeenCalledTimes(2);
    });

    it('should not wrap lifecycle when enableLifecycle is false', () => {
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs({ enableLifecycle: false });
      integration.setupOnce();

      const onShowFn = jest.fn();
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
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const onTapFn = jest.fn();
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
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const clickSpy = jest.fn();
      const changeSpy = jest.fn();
      const submitSpy = jest.fn();
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

    it('should NOT wrap lifecycle methods as user interactions', () => {
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs({ enableLifecycle: false });
      integration.setupOnce();

      const pageOptions = {
        onShow: jest.fn(),
        onHide: jest.fn(),
        onLoad: jest.fn(),
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
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const pageOptions = { _privateMethod: jest.fn() };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped._privateMethod.call({ route: 'test' });

      expect(addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'user.interaction' }),
      );
    });

    it('should not wrap interactions when enableUserInteraction is false', () => {
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs({ enableUserInteraction: false });
      integration.setupOnce();

      const pageOptions = { onTap: jest.fn() };

      const wrapped = (globalThis as any).Page(pageOptions);
      wrapped.onTap.call({ route: 'test' }, { type: 'tap' });

      expect(addBreadcrumb).not.toHaveBeenCalledWith(
        expect.objectContaining({ category: 'user.interaction' }),
      );
    });
  });

  describe('App lifecycle breadcrumbs', () => {
    it('should wrap App() and record onLaunch breadcrumb', () => {
      (globalThis as any).App = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const onLaunchFn = jest.fn();
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
      (globalThis as any).App = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      const showSpy = jest.fn();
      const hideSpy = jest.fn();
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
    it('should handle missing Page() gracefully', () => {
      delete (globalThis as any).Page;

      const integration = new PageBreadcrumbs();
      expect(() => integration.setupOnce()).not.toThrow();
    });

    it('should handle missing App() gracefully', () => {
      delete (globalThis as any).App;

      const integration = new PageBreadcrumbs();
      expect(() => integration.setupOnce()).not.toThrow();
    });

    it('should handle Page() with no options', () => {
      (globalThis as any).Page = jest.fn((options: any) => options);

      const integration = new PageBreadcrumbs();
      integration.setupOnce();

      expect(() => (globalThis as any).Page(null)).not.toThrow();
      expect(() => (globalThis as any).Page(undefined)).not.toThrow();
    });
  });

  describe('Page 包装幂等与安全还原', () => {
    it('二次 setupOnce 不重复包装 Page（幂等守卫）', () => {
      const base = jest.fn((o: any) => o);
      (globalThis as any).Page = base;

      const integration = new PageBreadcrumbs();
      integration.setupOnce();
      const wrapped = (globalThis as any).Page;
      expect(wrapped).not.toBe(base);
      expect((wrapped as any).__sentryPageWrapper).toBe(true);
      expect(Object.prototype.propertyIsEnumerable.call(wrapped, '__sentryPageWrapper')).toBe(
        false,
      );

      // 再次 setupOnce 不应在包装之上再套一层（否则 _originalPage 会指向上一层包装）
      integration.setupOnce();
      expect((globalThis as any).Page).toBe(wrapped);

      integration.cleanup();
    });

    it('cleanup 不清掉他人在我们之后包装的 Page', () => {
      const base = jest.fn((o: any) => o);
      (globalThis as any).Page = base;

      const integration = new PageBreadcrumbs();
      integration.setupOnce();
      const ourWrapper = (globalThis as any).Page;

      // 第三方在我们之后再包一层
      const thirdParty = jest.fn((o: any) => ourWrapper(o));
      (globalThis as any).Page = thirdParty;

      integration.cleanup();
      // 当前 Page 已非本集成的包装 → 不还原，保留第三方包装（修复前会被无条件清成原始 Page）
      expect((globalThis as any).Page).toBe(thirdParty);
    });

    it('cleanup 不被第三方复制的 __sentryPageWrapper 标记误导', () => {
      const base = jest.fn((o: any) => o);
      (globalThis as any).Page = base;

      const integration = new PageBreadcrumbs();
      integration.setupOnce();
      const ourWrapper = (globalThis as any).Page;

      const thirdParty = jest.fn((o: any) => ourWrapper(o));
      // 模拟第三方包装器复制了当前 Page 上的属性；cleanup 必须按 wrapper 身份判断，
      // 不能只看布尔标记，否则会把第三方包装误清掉。
      (thirdParty as any).__sentryPageWrapper = (ourWrapper as any).__sentryPageWrapper;
      (globalThis as any).Page = thirdParty;

      integration.cleanup();
      expect((globalThis as any).Page).toBe(thirdParty);
    });

    it('cleanup 在我们仍是顶层包装时正常还原原始 Page', () => {
      const base = jest.fn((o: any) => o);
      (globalThis as any).Page = base;

      const integration = new PageBreadcrumbs();
      integration.setupOnce();
      expect((globalThis as any).Page).not.toBe(base);

      integration.cleanup();
      expect((globalThis as any).Page).toBe(base);
    });
  });
});
