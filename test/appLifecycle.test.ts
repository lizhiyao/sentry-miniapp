import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { subscribeAppLifecycle, _resetAppLifecycle } from '../src/appLifecycle';

describe('appLifecycle（单一 App 包装）', () => {
  let savedApp: any;
  let realApp: any;
  let captured: any;

  beforeEach(() => {
    _resetAppLifecycle();
    savedApp = (globalThis as any).App;
    captured = null;
    realApp = vi.fn((options: any) => {
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

    const userOnShow = vi.fn(() => order.push('user'));
    (globalThis as any).App({ onShow: userOnShow });
    captured.onShow();

    expect(order).toEqual(['subA', 'subB', 'user']);
    expect(userOnShow).toHaveBeenCalled();
  });

  it('未定义的生命周期回调也会被注入并广播', () => {
    const onHide = vi.fn();
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

  it('重复退订同一个订阅者是幂等操作', () => {
    const unsubscribe = subscribeAppLifecycle({});

    unsubscribe();
    expect((globalThis as any).App).toBe(realApp);
    expect(() => unsubscribe()).not.toThrow();
    expect((globalThis as any).App).toBe(realApp);
  });

  it('安全还原：他人后续替换了 App 时，退订不覆盖', () => {
    const un = subscribeAppLifecycle({});
    const someoneElse = vi.fn();
    (globalThis as any).App = someoneElse; // 第三方又包了一层

    un();
    expect((globalThis as any).App).toBe(someoneElse); // 不被还原回 realApp
  });

  it('外部保存的 wrapper 在退订还原后仍能安全调用', () => {
    const un = subscribeAppLifecycle({});
    const wrapper = (globalThis as any).App;

    un();
    expect((globalThis as any).App).toBe(realApp);

    expect(() => wrapper({ onShow: vi.fn() })).not.toThrow();
    expect(realApp).toHaveBeenCalled();
  });

  it('App 不存在时安全降级：不抛、不注册（避免订阅者泄漏）', () => {
    delete (globalThis as any).App;

    const orphan = vi.fn();
    const unsub = subscribeAppLifecycle({ onShow: orphan });
    expect(typeof unsub).toBe('function');
    expect((globalThis as any).App).toBeUndefined();

    // App 之后才出现：新订阅者正常工作，但此前「无 App」时的订阅不应被注册 / 广播。
    (globalThis as any).App = realApp;
    const live = vi.fn();
    subscribeAppLifecycle({ onShow: live });
    (globalThis as any).App({ onShow: vi.fn() });
    captured.onShow();

    expect(live).toHaveBeenCalled();
    expect(orphan).not.toHaveBeenCalled(); // 未注册 → 不会被广播
    expect(() => unsub()).not.toThrow();
  });

  it('单个订阅者异常不影响其他订阅者与业务回调', () => {
    const good = vi.fn();
    const user = vi.fn();
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
  it('after 在业务同步 handler 后运行，保留 this、参数与 Promise 返回值', () => {
    const order: string[] = [];
    const context = { app: true };
    const arg = { scene: 1001 };
    const promise = Promise.resolve('later');
    subscribeAppLifecycle({ onHide: () => order.push('before') });
    subscribeAppLifecycle({ onHide: () => order.push('after') }, 'after');
    (globalThis as any).App({
      onHide(this: unknown, value: unknown) {
        expect(this).toBe(context);
        expect(value).toBe(arg);
        order.push('business');
        return promise;
      },
    });
    expect(captured.onHide.call(context, arg)).toBe(promise);
    expect(order).toEqual(['before', 'business', 'after']);
  });

  it('业务异常仍执行 after，收尾异常不能替换业务异常', () => {
    const error = new Error('business failed');
    const good = vi.fn();
    subscribeAppLifecycle(
      {
        onHide: () => {
          throw new Error('cleanup failed');
        },
      },
      'after',
    );
    subscribeAppLifecycle({ onHide: good }, 'after');
    (globalThis as any).App({
      onHide: () => {
        throw error;
      },
    });
    expect(() => captured.onHide()).toThrow(error);
    expect(good).toHaveBeenCalledOnce();
  });

  it('缺少业务 handler 时 after 仍执行；旧事件不交给业务中新订阅者', () => {
    const after = vi.fn();
    subscribeAppLifecycle({ onHide: after }, 'after');
    (globalThis as any).App({});
    captured.onHide();
    expect(after).toHaveBeenCalledOnce();

    const next = vi.fn();
    (globalThis as any).App({ onHide: () => subscribeAppLifecycle({ onHide: next }, 'after') });
    captured.onHide();
    expect(next).not.toHaveBeenCalled();
    captured.onHide();
    expect(next).toHaveBeenCalledOnce();
  });

  it('业务中退订的 owner 不接收 after', () => {
    const oldOwner = vi.fn();
    const unsubscribe = subscribeAppLifecycle({ onHide: oldOwner }, 'after');
    (globalThis as any).App({ onHide: unsubscribe });
    captured.onHide();
    expect(oldOwner).not.toHaveBeenCalled();
  });

  it('第三方保存旧 wrapper 后重装，不重复广播或覆盖第三方层', () => {
    const unsubscribe = subscribeAppLifecycle({});
    const oldWrapper = (globalThis as any).App;
    const thirdParty = vi.fn((options: unknown) => oldWrapper(options));
    (globalThis as any).App = thirdParty;
    unsubscribe();
    const before = vi.fn();
    const after = vi.fn();
    const business = vi.fn();
    const stopBefore = subscribeAppLifecycle({ onHide: before });
    const stopAfter = subscribeAppLifecycle({ onHide: after }, 'after');
    (globalThis as any).App({ onHide: business });
    captured.onHide();
    expect(before).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
    expect(business).toHaveBeenCalledOnce();
    expect(thirdParty).toHaveBeenCalledOnce();
    stopBefore();
    stopAfter();
    expect((globalThis as any).App).toBe(thirdParty);
  });
  it.each(['throw', 'ignore', 'getter'] as const)(
    'App 安装 %s 失败回滚订阅，恢复能力后只广播新订阅',
    (mode) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'App')!;
      const old = vi.fn(),
        live = vi.fn();
      try {
        Object.defineProperty(globalThis, 'App', {
          configurable: true,
          get() {
            if (mode === 'getter') throw new Error('App getter');
            return realApp;
          },
          set() {
            if (mode === 'throw') throw new Error('App setter');
          },
        });
        expect(() => subscribeAppLifecycle({ onShow: old })).not.toThrow();
        Object.defineProperty(globalThis, 'App', descriptor);
        const stop = subscribeAppLifecycle({ onShow: live });
        (globalThis as any).App({});
        captured.onShow();
        expect(old).not.toHaveBeenCalled();
        expect(live).toHaveBeenCalledOnce();
        stop();
      } finally {
        Object.defineProperty(globalThis, 'App', descriptor);
      }
    },
  );

  it('App 入口被改为只读后退订仍释放状态，保留失效透明 wrapper', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'App')!;
    const observer = vi.fn();
    const stop = subscribeAppLifecycle({ onShow: observer });
    const wrapper = (globalThis as any).App;
    try {
      Object.defineProperty(globalThis, 'App', {
        configurable: true,
        writable: false,
        value: wrapper,
      });
      expect(stop).not.toThrow();
      (globalThis as any).App({});
      expect(captured.onShow).toBeUndefined();
      expect(observer).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'App', descriptor);
    }
  });

  it('冻结 App 定义保留业务原回调和注册返回值', () => {
    const stop = subscribeAppLifecycle({ onHide: vi.fn() });
    const business = vi.fn(() => 42);
    const frozen = Object.freeze({ onHide: business });
    expect((globalThis as any).App(frozen)).toBe(frozen);
    expect(frozen.onHide()).toBe(42);
    expect(business).toHaveBeenCalledOnce();
    stop();
  });
});
