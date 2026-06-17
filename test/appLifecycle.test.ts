import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { subscribeAppLifecycle, _resetAppLifecycle } from '../src/appLifecycle';

describe('appLifecycle（单一 App 包装）', () => {
  let savedApp: any;
  let realApp: any;
  let captured: any;

  beforeEach(() => {
    _resetAppLifecycle();
    savedApp = (globalThis as any).App;
    captured = null;
    realApp = jest.fn((options: any) => {
      captured = options;
      return options;
    });
    (globalThis as any).App = realApp;
  });

  afterEach(() => {
    (globalThis as any).App = savedApp;
    _resetAppLifecycle();
  });

  it('首个订阅者包装 App，且只包装一次', () => {
    subscribeAppLifecycle({});
    const afterFirst = (globalThis as any).App;
    expect(afterFirst).not.toBe(realApp);

    subscribeAppLifecycle({});
    expect((globalThis as any).App).toBe(afterFirst); // 第二次不重复包装
  });

  it('生命周期广播给所有订阅者，并在业务原回调前触发', () => {
    const order: string[] = [];
    subscribeAppLifecycle({ onShow: () => order.push('subA') });
    subscribeAppLifecycle({ onShow: () => order.push('subB') });

    const userOnShow = jest.fn(() => order.push('user'));
    (globalThis as any).App({ onShow: userOnShow });
    captured.onShow();

    expect(order).toEqual(['subA', 'subB', 'user']);
    expect(userOnShow).toHaveBeenCalled();
  });

  it('未定义的生命周期回调也会被注入并广播', () => {
    const onHide = jest.fn();
    subscribeAppLifecycle({ onHide });

    (globalThis as any).App({}); // 业务没写 onHide
    expect(typeof captured.onHide).toBe('function');
    captured.onHide();
    expect(onHide).toHaveBeenCalled();
  });

  it('引用计数：退订最后一个才还原 App', () => {
    const un1 = subscribeAppLifecycle({});
    const un2 = subscribeAppLifecycle({});
    const wrapper = (globalThis as any).App;

    un1();
    expect((globalThis as any).App).toBe(wrapper); // 还有订阅者，保持包装

    un2();
    expect((globalThis as any).App).toBe(realApp); // 无订阅者，还原
  });

  it('安全还原：他人后续替换了 App 时，退订不覆盖', () => {
    const un = subscribeAppLifecycle({});
    const someoneElse = jest.fn();
    (globalThis as any).App = someoneElse; // 第三方又包了一层

    un();
    expect((globalThis as any).App).toBe(someoneElse); // 不被还原回 realApp
  });

  it('外部保存的 wrapper 在退订还原后仍能安全调用', () => {
    const un = subscribeAppLifecycle({});
    const wrapper = (globalThis as any).App;

    un();
    expect((globalThis as any).App).toBe(realApp);

    expect(() => wrapper({ onShow: jest.fn() })).not.toThrow();
    expect(realApp).toHaveBeenCalled();
  });

  it('App 不存在时安全降级：不抛、不注册（避免订阅者泄漏）', () => {
    delete (globalThis as any).App;

    const orphan = jest.fn();
    const unsub = subscribeAppLifecycle({ onShow: orphan });
    expect(typeof unsub).toBe('function');
    expect((globalThis as any).App).toBeUndefined();

    // App 之后才出现：新订阅者正常工作，但此前「无 App」时的订阅不应被注册 / 广播。
    (globalThis as any).App = realApp;
    const live = jest.fn();
    subscribeAppLifecycle({ onShow: live });
    (globalThis as any).App({ onShow: jest.fn() });
    captured.onShow();

    expect(live).toHaveBeenCalled();
    expect(orphan).not.toHaveBeenCalled(); // 未注册 → 不会被广播
    expect(() => unsub()).not.toThrow();
  });

  it('单个订阅者异常不影响其他订阅者与业务回调', () => {
    const good = jest.fn();
    const user = jest.fn();
    subscribeAppLifecycle({
      onLaunch: () => {
        throw new Error('boom');
      },
    });
    subscribeAppLifecycle({ onLaunch: good });

    (globalThis as any).App({ onLaunch: user });
    expect(() => captured.onLaunch()).not.toThrow();
    expect(good).toHaveBeenCalled();
    expect(user).toHaveBeenCalled();
  });
});
