import { describe, expect, it, vi, beforeEach } from 'vitest';

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
  });

  it('按 OTel 语义补稳定环境，不在结束时补页面或网络', () => {
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
    });
    expect(span.attributes).not.toHaveProperty('route');
    expect(span.attributes).not.toHaveProperty('network.type');
  });

  it('不覆盖 core 已合并的显式 RawAttribute，包括单位', () => {
    const client = createFakeClient({});
    registerClientSpanDimensions(client as any);
    const raw = { value: 42, unit: 'byte' };
    const span: ProbeSpan = { name: 'probe', attributes: { 'device.model': raw } };
    client.emitSpan(span);
    expect(span.attributes['device.model']).toBe(raw);
    expect(span.attributes['os.name']).toBe('iOS');
  });

  it('enableSystemInfo=false 只按该 client 关闭', () => {
    const collecting = createFakeClient({ miniappPlatform: 'wechat' });
    const quiet = createFakeClient({ miniappPlatform: 'bytedance', enableSystemInfo: false });
    registerClientSpanDimensions(collecting as any);
    registerClientSpanDimensions(quiet as any);
    const spanA: ProbeSpan = { name: 'a', attributes: {} };
    const spanB: ProbeSpan = { name: 'b', attributes: {} };
    collecting.emitSpan(spanA);
    quiet.emitSpan(spanB);
    expect(spanA.attributes['device.model']).toBe('iPhone 15');
    expect(spanB.attributes).toEqual({ 'miniapp.platform': 'bytedance' });
    expect(mockGetSystemInfo).toHaveBeenCalledTimes(1);
    expect(mockGetAccountInfo).toHaveBeenCalledTimes(1);
  });

  it('稳定能力只影响所属 client，宿主快照不在 span 结束时重读', () => {
    const first = createFakeClient({});
    const second = createFakeClient({});
    registerClientSpanDimensions(first as any);
    registerClientSpanDimensions(second as any);
    setClientSpanDimension(first as any, 'performance.api.available', true);
    setClientSpanDimension(undefined, 'performance.api.available', true);
    mockGetSystemInfo.mockReturnValue({ model: 'different-host' });
    const a: ProbeSpan = { name: 'a', attributes: {} };
    const b: ProbeSpan = { name: 'b', attributes: {} };
    first.emitSpan(a);
    second.emitSpan(b);
    expect(a.attributes['performance.api.available']).toBe(true);
    expect(b.attributes['performance.api.available']).toBeUndefined();
    expect(a.attributes['device.model']).toBe('iPhone 15');
    expect(mockGetSystemInfo).toHaveBeenCalledTimes(2);
  });

  it('摘掉监听后不再填充维度', () => {
    const client = createFakeClient({});
    const unsubscribe = registerClientSpanDimensions(
      client as unknown as Parameters<typeof registerClientSpanDimensions>[0],
    );
    unsubscribe();

    const span: ProbeSpan = { name: 'a', attributes: {} };
    client.emitSpan(span);

    expect(span.attributes).toEqual({});
    expect(client.listenerCount()).toBe(0);
  });
});
