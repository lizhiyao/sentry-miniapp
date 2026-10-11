/** 宿主监听属于事件源；client 仅持有可删除的订阅。 */
interface Subscriber {
  handler?: ((...args: any[]) => void) | undefined;
  isActive?: (() => boolean) | undefined;
}
interface NativeEventChannel {
  host: object;
  onKey: string;
  offKey: string;
  subscribers: Set<Subscriber>;
  listener?: ((...args: any[]) => void) | undefined;
  installing: boolean;
  detaching: boolean;
  registered: boolean;
  startedAt: number;
  lastDelivery: number;
}

function subscriberActive(subscriber: Subscriber): boolean {
  try {
    return subscriber.isActive?.() ?? false;
  } catch (_error) {
    return false;
  }
}

const channels = new WeakMap<object, Map<string, NativeEventChannel>>();
let deliverySequence = 0;

/** 只信任所有方向持续监听期间的最近事件，不保留或回放旧 payload。 */
export function getLastNativeEvent(
  host: object | undefined,
  keys: readonly string[],
): string | undefined {
  const source = host && channels.get(host);
  if (!source || !keys.length) return;
  let startedAt = 0;
  let lastDelivery = 0;
  let latest: string | undefined;
  for (const key of keys) {
    const channel = source.get(key);
    if (!channel?.listener) return;
    startedAt = Math.max(startedAt, channel.startedAt);
    if (channel.lastDelivery > lastDelivery) {
      lastDelivery = channel.lastDelivery;
      latest = key;
    }
  }
  return lastDelivery > startedAt ? latest : undefined;
}

function releaseIdleChannel(channel: NativeEventChannel): void {
  if (channel.subscribers.size || channel.installing || channel.detaching || !channel.listener)
    return;
  channel.detaching = true;
  let removed = false;
  try {
    const off = (channel.host as Record<string, unknown>)[channel.offKey];
    // getter 可以同步安装新的订阅；此时原监听仍须保留。
    if (!channel.subscribers.size && typeof off === 'function') {
      Function.prototype.apply.call(off, channel.host, [channel.listener]);
      removed = true;
    }
  } catch (_error) {
    /* 无法确认移除时保留同一 dispatcher，不反复注册。 */
  } finally {
    channel.detaching = false;
  }
  if (!removed) return;
  channel.listener = undefined;
  channel.registered = false;
  if (channel.subscribers.size) installChannel(channel);
  else channels.get(channel.host)?.delete(channel.onKey);
}

// 不在 client 的 setup 闭包中创建原生 callback，宿主不持有 client／scope。
function installChannel(channel: NativeEventChannel): void {
  if (channel.listener || channel.installing || !channel.subscribers.size) return;
  channel.installing = true;
  try {
    const on = (channel.host as Record<string, unknown>)[channel.onKey];
    if (typeof on !== 'function' || !channel.subscribers.size) return;
    const listener = (...args: any[]): void => {
      if (channel.listener !== listener) return;
      // 空通道也观察方向；client 退休或暂停采集不代表宿主已回到前台。
      channel.lastDelivery = ++deliverySequence;
      if (channel.detaching) return;
      // 分发中退出的订阅不再调用，新加入的订阅不接管本次事件。
      const snapshot = [...channel.subscribers].filter(subscriberActive);
      for (const subscriber of snapshot) {
        try {
          if (subscriberActive(subscriber)) subscriber.handler?.(...args);
        } catch (_error) {
          /* 一个处理器失败不影响其他订阅者或宿主业务。 */
        }
      }
    };
    channel.startedAt = deliverySequence;
    channel.lastDelivery = 0;
    channel.listener = listener;
    Function.prototype.apply.call(on, channel.host, [listener]);
    channel.registered = true;
  } catch (_error) {
    // on 可能先保存 callback 再抛错；无法解除时不重试，能力按失败降级。
  } finally {
    channel.installing = false;
    releaseIdleChannel(channel);
    if (!channel.listener && !channel.subscribers.size)
      channels.get(channel.host)?.delete(channel.onKey);
  }
}

function createStop(channel: NativeEventChannel, subscriber: Subscriber): () => void {
  return () => {
    if (!channel.subscribers.delete(subscriber)) return;
    subscriber.handler = undefined;
    subscriber.isActive = undefined;
    releaseIdleChannel(channel);
  };
}

/** 注册前交付 stop，使宿主 getter／同步回调触发 dispose 时也能立即退订。 */
export function subscribeNativeEvent(
  host: object | null | undefined,
  onKey: string,
  offKey: string,
  handler: (...args: any[]) => void,
  isActive: () => boolean,
  retainStop: (stop: () => void) => void,
): boolean {
  const subscriber = { handler, isActive };
  if (!host || !subscriberActive(subscriber)) return false;
  let sourceChannels = channels.get(host);
  if (!sourceChannels) channels.set(host, (sourceChannels = new Map()));
  let channel = sourceChannels.get(onKey);
  if (!channel) {
    channel = {
      host,
      onKey,
      offKey,
      subscribers: new Set(),
      installing: false,
      detaching: false,
      registered: false,
      startedAt: 0,
      lastDelivery: 0,
    };
    sourceChannels.set(onKey, channel);
  }
  channel.subscribers.add(subscriber);
  const stop = createStop(channel, subscriber);
  retainStop(stop);
  if (!subscriberActive(subscriber)) stop();
  else installChannel(channel);
  if (!channel.listener || !subscriberActive(subscriber)) {
    stop();
    return false;
  }
  return channel.registered;
}
