import { getClient } from '@sentry/core';
import type { Client, Integration } from '@sentry/core';
import { subscribeMiniappLifecycle } from '../appLifecycle';
import { getClientLifetime } from '../lifecycle';

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
      const adopt = (stop: () => void): void => {
        if (active()) cleanups.push(stop);
        else stop();
      };
      const lifecycle = subscribeMiniappLifecycle(client, {
        onLaunch: show,
        onShow: show,
        onHide: hide,
      });
      adopt(lifecycle.stop);
      let installed = lifecycle.available;
      if (lifecycle.lateInit) lifetime?.warnings.add('late_init');
      if (active()) {
        // 所有 after summary/session 都先执行，用户 callback 的同步 telemetry 也纳入。
        const flusher = subscribeMiniappLifecycle(
          client,
          { onShow: flush, onHide: flush },
          'flush',
        );
        adopt(flusher.stop);
        installed ||= flusher.available;
      }
      if (!installed) lifetime?.warnings.add('lifecycle_unavailable');
    },
  };
}
