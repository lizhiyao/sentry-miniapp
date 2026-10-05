import { getClient } from '@sentry/core';
import type { Client, Integration } from '@sentry/core';
import { subscribeAppLifecycle, isAppLifecycleAvailable } from '../appLifecycle';
import { sdk, isMinigame } from '../crossPlatform';
import { getClientLifetime } from '../lifecycle';

function hasRegisteredApp(): boolean {
  try {
    const getApp = (globalThis as { getApp?: () => unknown }).getApp;
    return !!getApp?.();
  } catch (_error) {
    return false;
  }
}

function listener(
  host: ReturnType<typeof sdk>,
  key: keyof ReturnType<typeof sdk>,
): Function | undefined {
  try {
    const api = host[key];
    return typeof api === 'function' ? api : undefined;
  } catch (_error) {
    return undefined;
  }
}

/** 一个 runtime 的前后台协调，不依赖可选 Page/Session/FPS producer。 */
export function miniappLifecycleIntegration(): Integration {
  return {
    name: 'MiniappLifecycle',
    setup(client) {
      let owner: Client | undefined = client;
      const lifetime = getClientLifetime(client);
      if (lifetime && !lifetime.canCollectAutomatic()) return;
      const active = (): boolean =>
        !!owner &&
        getClient() === owner &&
        owner.getOptions().enabled !== false &&
        (!lifetime || lifetime.canCollectAutomatic());
      const show = (): void => {
        if (active() && lifetime) lifetime.visibility = 'foreground';
      };
      const hide = (): void => {
        if (active() && lifetime) lifetime.visibility = 'background';
      };
      const flush = (): void => {
        if (!active() || !owner) return;
        try {
          void Promise.resolve(owner.flush()).catch(() => {});
        } catch (_error) {
          /* 不遮蔽业务异常。 */
        }
      };
      const cleanups: Array<() => void> = [];
      let installed = false;
      const cleanup = (): void => {
        owner = undefined;
        for (const release of cleanups.splice(0)) {
          try {
            release();
          } catch (_error) {
            /* 继续解除其余资源。 */
          }
        }
      };
      const detach = lifetime?.registerStop(cleanup);
      client.registerCleanup(() => {
        detach?.();
        cleanup();
      });
      let hasApp = false;
      try {
        hasApp = typeof (globalThis as { App?: unknown }).App === 'function';
      } catch (_error) {
        /* 不可读 App 使用 native 能力降级。 */
      }
      const registeredApp = hasApp && hasRegisteredApp();
      if (registeredApp) lifetime?.warnings.add('late_init');
      if (hasApp && !registeredApp) {
        cleanups.push(subscribeAppLifecycle({ onLaunch: show, onShow: show, onHide: hide }));
        // 所有 after summary/session 都先执行，用户 callback 的同步 telemetry 也纳入。
        cleanups.push(subscribeAppLifecycle({ onShow: flush, onHide: flush }, 'flush'));
        installed = isAppLifecycleAvailable();
      }
      if (!installed) {
        // 原生监听顺序由宿主控制；late init 不冒称包装了已注册的业务 App。
        const host = sdk();
        const game = isMinigame();
        const onShow = listener(host, game ? 'onShow' : 'onAppShow');
        const offShow = listener(host, game ? 'offShow' : 'offAppShow');
        const onHide = listener(host, game ? 'onHide' : 'onAppHide');
        const offHide = listener(host, game ? 'offHide' : 'offAppHide');
        const nativeShow = (): void => {
          show();
          flush();
        };
        const nativeHide = (): void => {
          hide();
          flush();
        };
        for (const [on, off, handler] of [
          [onShow, offShow, nativeShow],
          [onHide, offHide, nativeHide],
        ] as const) {
          if (typeof on !== 'function' || !active()) continue;
          const release = (): void => {
            if (typeof off === 'function') off.call(host, handler);
          };
          cleanups.push(release);
          try {
            on.call(host, handler);
            installed = true;
            if (!active()) release();
          } catch (_error) {
            /* 无监听能力的平台保留显式 flush 路径。 */
          }
        }
      }
      if (!installed) lifetime?.warnings.add('lifecycle_unavailable');
    },
  };
}
