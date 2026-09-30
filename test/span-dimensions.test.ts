import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockGetSystemInfo, mockGetAccountInfo, mockResolvePlatform } = vi.hoisted(() => ({
  mockGetSystemInfo: vi.fn(),
  mockGetAccountInfo: vi.fn(),
  mockResolvePlatform: vi.fn(() => 'wechat'),
}));

vi.mock('../src/crossPlatform', () => ({
  getSystemInfo: mockGetSystemInfo,
  getAccountInfo: mockGetAccountInfo,
  resolveMiniappPlatform: mockResolvePlatform,
}));

import { registerClientSpanDimensions, setClientSpanDimension } from '../src/spanDimensions';

interface ProbeSpan {
  name: string;
  attributes: Record<string, unknown>;
}

interface FakeClient {
  getOptions(): Record<string, unknown>;
  on(hook: string, callback: (span: any) => void): () => void;
  emitSpan(span: ProbeSpan): void;
  listenerCount(): number;
}

function createFakeClient(options: Record<string, unknown> = {}): FakeClient {
  const handlers = new Set<(span: any) => void>();

  return {
    getOptions: () => options,
    on(_hook, callback) {
      handlers.add(callback);
      return () => handlers.delete(callback);
    },
    emitSpan(span) {
      handlers.forEach((handler) => handler(span));
    },
    listenerCount: () => handlers.size,
  };
}

describe('span 维度按 client 填充', () => {
  const g = globalThis as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemInfo.mockReturnValue({
      brand: 'Apple',
      model: 'iPhone 15',
      system: 'iOS 17.4',
      version: '8.0.40',
      platform: 'ios',
    });
    mockGetAccountInfo.mockReturnValue({ appId: 'wx-id', version: '1.4.2' });
    mockResolvePlatform.mockImplementation((options?: { miniappPlatform?: string }) => {
      return options?.miniappPlatform ?? 'wechat';
    });
    g.getCurrentPages = vi.fn(() => [{ route: 'pages/home' }]);
  });

  afterEach(() => {
    delete g.getCurrentPages;
  });

  it('按 OTel 语义拆分宿主版本与系统版本，并补当前 route', () => {
    const client = createFakeClient({});
    registerClientSpanDimensions(client as any);
    const span: ProbeSpan = { name: 'probe', attributes: {} };

    client.emitSpan(span);

    expect(span.attributes).toMatchObject({
      'miniapp.platform': 'wechat',
      'device.manufacturer': 'Apple',
      'device.model': 'iPhone 15',
      'os.name': 'iOS',
      'os.version': '17.4',
      'os.type': 'ios',
      'miniapp.host_version': '8.0.40',
      'app.app_version': '1.4.2',
      route: 'pages/home',
    });
  });

  it('不覆盖 span 上已有的属性', () => {
    const client = createFakeClient({});
    registerClientSpanDimensions(client as any);
    const span: ProbeSpan = { name: 'probe', attributes: { 'device.model': 'Pixel 8' } };

    client.emitSpan(span);

    expect(span.attributes['device.model']).toBe('Pixel 8');
    expect(span.attributes['os.name']).toBe('iOS');
  });

  it('enableSystemInfo=false 只按该 client 关，不受其他 client 影响', () => {
    const collecting = createFakeClient({ miniappPlatform: 'wechat' });
    const quiet = createFakeClient({ miniappPlatform: 'bytedance', enableSystemInfo: false });
    registerClientSpanDimensions(collecting as any);
    registerClientSpanDimensions(quiet as any);

    const spanA: ProbeSpan = { name: 'a', attributes: {} };
    const spanB: ProbeSpan = { name: 'b', attributes: {} };
    collecting.emitSpan(spanA);
    quiet.emitSpan(spanB);

    expect(spanA.attributes['device.model']).toBe('iPhone 15');
    expect(spanA.attributes['miniapp.platform']).toBe('wechat');
    expect(spanB.attributes['device.model']).toBeUndefined();
    expect(spanB.attributes['miniapp.platform']).toBe('bytedance');
  });

  it('集成登记的动态维度只影响所属 client', () => {
    const first = createFakeClient({});
    const second = createFakeClient({});
    registerClientSpanDimensions(first as any);
    registerClientSpanDimensions(second as any);

    setClientSpanDimension(first as any, 'network.type', 'wifi');
    setClientSpanDimension(undefined, 'network.type', '4g');

    const spanFirst: ProbeSpan = { name: 'a', attributes: {} };
    const spanSecond: ProbeSpan = { name: 'b', attributes: {} };
    first.emitSpan(spanFirst);
    second.emitSpan(spanSecond);

    expect(spanFirst.attributes['network.type']).toBe('wifi');
    expect(spanSecond.attributes['network.type']).toBeUndefined();
  });

  it('route 取页面栈栈顶，返回上一页后随栈变化', () => {
    const client = createFakeClient({});
    registerClientSpanDimensions(client as any);

    g.getCurrentPages.mockReturnValue([{ route: 'pages/a' }, { route: 'pages/b' }]);
    const forward: ProbeSpan = { name: 'on-b', attributes: {} };
    client.emitSpan(forward);
    expect(forward.attributes['route']).toBe('pages/b');

    // navigateBack 后栈顶回到 A，route 必须跟着变，不依赖业务是否定义了 onShow。
    g.getCurrentPages.mockReturnValue([{ route: 'pages/a' }]);
    const back: ProbeSpan = { name: 'back-on-a', attributes: {} };
    client.emitSpan(back);
    expect(back.attributes['route']).toBe('pages/a');
  });

  it('小游戏没有 getCurrentPages 时不写 route', () => {
    delete g.getCurrentPages;
    const client = createFakeClient({});
    registerClientSpanDimensions(client as any);
    const span: ProbeSpan = { name: 'a', attributes: {} };

    client.emitSpan(span);

    expect('route' in span.attributes).toBe(false);
  });

  it('页面栈抛错或取不到信息时不冒泡，debug 打开才提示', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    g.getCurrentPages = vi.fn(() => {
      throw new Error('page stack unavailable');
    });
    mockGetSystemInfo.mockImplementation(() => {
      throw new Error('system info unavailable');
    });

    const silent = createFakeClient({});
    registerClientSpanDimensions(silent as any);
    expect(() => silent.emitSpan({ name: 'a', attributes: {} } as ProbeSpan)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();

    const verbose = createFakeClient({ debug: true });
    registerClientSpanDimensions(verbose as any);
    expect(() => verbose.emitSpan({ name: 'b', attributes: {} } as ProbeSpan)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it('摘掉监听后不再填充维度', () => {
    const client = createFakeClient({});
    const unsubscribe = registerClientSpanDimensions(client as unknown as Parameters<
      typeof registerClientSpanDimensions
    >[0]);
    unsubscribe();

    const span: ProbeSpan = { name: 'a', attributes: {} };
    client.emitSpan(span);

    expect(span.attributes).toEqual({});
    expect(client.listenerCount()).toBe(0);
  });
});
