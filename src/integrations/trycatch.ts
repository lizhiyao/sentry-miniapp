import type { Client, Integration, IntegrationFn } from '@sentry/core';
import { wrap, getFunctionName } from '../helpers';
import { addFunctionInstrumentationHandler } from '../instrumentation';
import { getClientLifetime } from '../lifecycle';
import { OwnerToken } from '../owner';

/** 每次异步调度单独持有归属，业务回调不在 SDK scope 内运行。 */
export class TryCatch implements Integration {
  public static id = 'TryCatch';
  public name = TryCatch.id;
  private readonly _clients = new WeakSet<Client>();

  public setup(client: Client): void {
    const lifetime = getClientLifetime(client);
    if ((lifetime && !lifetime.canCollectAutomatic()) || this._clients.has(client)) return;
    this._clients.add(client);
    const source = globalThis as unknown as Record<string, unknown>;
    // 只登记仍在执行/等待的宿主任务；完成、取消和 owner 退休均删除。
    const timers = new Map<unknown, OwnerToken>();
    const frames = new Map<unknown, OwnerToken>();
    const unsubscribers: Array<() => void> = [];
    const available = (name: string): boolean => {
      try {
        return typeof source[name] === 'function';
      } catch (_error) {
        return false;
      }
    };
    for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame']) {
      if (!available(name)) continue;
      const records = name === 'requestAnimationFrame' ? frames : timers;
      const once = name !== 'setInterval';
      unsubscribers.push(
        addFunctionInstrumentationHandler(source, name, client, (original, receiver, args) => {
          if (typeof args[0] !== 'function') return original.apply(receiver, args);
          const owner = new OwnerToken(client);
          if (!owner.isActive()) {
            owner.release();
            return original.apply(receiver, args);
          }
          let id: unknown;
          let pending = true;
          owner.onRelease(() => {
            pending = false;
            if (records.get(id) === owner) records.delete(id);
          });
          const forwarded = [...args];
          forwarded[0] = wrap(
            args[0],
            {
              mechanism: {
                data: { function: name, handler: getFunctionName(original) },
                handled: false,
                type: 'instrument',
              },
            },
            owner,
            once ? () => owner.release() : undefined,
          );
          try {
            id = original.apply(receiver, forwarded);
            // 同步调用 callback 的宿主 shim 已经完成，不重新登记失效 owner。
            if (pending && owner.isActive()) records.set(id, owner);
            return id;
          } catch (error) {
            owner.release();
            throw error;
          }
        }),
      );
    }
    for (const name of ['clearTimeout', 'clearInterval', 'cancelAnimationFrame']) {
      if (!available(name)) continue;
      const records = name === 'cancelAnimationFrame' ? frames : timers;
      unsubscribers.push(
        addFunctionInstrumentationHandler(source, name, client, (original, receiver, args) => {
          const result = original.apply(receiver, args);
          records.get(args[0])?.release();
          return result;
        }),
      );
    }
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      for (const owner of [...timers.values(), ...frames.values()]) owner.release();
      timers.clear();
      frames.clear();
      for (const unsubscribe of unsubscribers.splice(0).reverse()) {
        try {
          unsubscribe();
        } catch (_error) {
          /* 继续解除其余订阅。 */
        }
      }
      this._clients.delete(client);
    };
    const detachStop = lifetime?.registerStop(cleanup);
    client.registerCleanup(() => {
      detachStop?.();
      cleanup();
    });
  }
}

export const tryCatchIntegration: IntegrationFn = () => new TryCatch();
