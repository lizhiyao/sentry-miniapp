import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockSetAttributes } = vi.hoisted(() => ({ mockSetAttributes: vi.fn() }));

vi.mock('@sentry/core', () => ({
  setAttributes: mockSetAttributes,
}));

import { applyAutoSpanDimensions } from '../src/spanDimensions';
import { resetPlatformCache } from '../src/crossPlatform';

describe('applyAutoSpanDimensions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPlatformCache();
    (global as any).wx = {
      getSystemInfoSync: vi.fn(() => ({
        brand: 'Apple',
        model: 'iPhone 15',
        system: 'iOS 17.4',
        version: '8.0.40',
        language: 'zh_CN',
        platform: 'ios',
      })),
      getAccountInfoSync: vi.fn(() => ({ miniProgram: { appId: 'wx-id', version: '1.4.2' } })),
    };
  });

  afterEach(() => {
    delete (global as any).wx;
    resetPlatformCache();
  });

  it('默认按 OTel 语义拆分宿主与系统版本', () => {
    applyAutoSpanDimensions({ platform: 'wechat' });

    expect(mockSetAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'miniapp.platform': 'wechat',
        'device.manufacturer': 'Apple',
        'device.model': 'iPhone 15',
        'os.name': 'iOS',
        'os.version': '17.4',
        'os.type': 'ios',
        'miniapp.host_version': '8.0.40',
        'app.app_version': '1.4.2',
      }),
    );
  });

  it('enableSystemInfo=false 时只写平台标记', () => {
    applyAutoSpanDimensions({ platform: 'wechat', enableSystemInfo: false });

    const payload = mockSetAttributes.mock.calls[0]?.[0];

    expect(payload).toEqual({ 'miniapp.platform': 'wechat' });
  });

  it('宿主 API 抛错时不影响 init，只降级为无维度', () => {
    (global as any).wx.getSystemInfoSync = vi.fn(() => {
      throw new Error('host unavailable');
    });

    expect(() => applyAutoSpanDimensions({ platform: 'wechat' })).not.toThrow();
  });

  it('写入属性失败时静默降级，debug 打开才提示', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSetAttributes.mockImplementation(() => {
      throw new Error('scope unavailable');
    });

    expect(() => applyAutoSpanDimensions({ platform: 'wechat' })).not.toThrow();
    expect(warn).not.toHaveBeenCalled();

    applyAutoSpanDimensions({ platform: 'wechat', debug: true });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    mockSetAttributes.mockReset();
  });
});
