import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

// Mock @sentry/core
const mockStartSession = jest.fn();
const mockEndSession = jest.fn();
const mockCaptureSession = jest.fn();

jest.mock('@sentry/core', () => ({
  startSession: mockStartSession,
  endSession: mockEndSession,
  captureSession: mockCaptureSession,
}));

import { SessionIntegration } from '../src/integrations/session';
import { _resetAppLifecycle } from '../src/appLifecycle';

describe('SessionIntegration', () => {
  let originalApp: any;
  let capturedAppOptions: any;
  let savedApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetAppLifecycle(); // 清共享 App 包装状态，避免用例间残留
    capturedAppOptions = null;

    // 新模型经共享 appLifecycle 猴补全局 App（不再是 wx.App）
    savedApp = (globalThis as any).App;
    originalApp = jest.fn((options: any) => {
      capturedAppOptions = options;
    });
    (globalThis as any).App = originalApp;
  });

  afterEach(() => {
    (globalThis as any).App = savedApp;
    _resetAppLifecycle();
  });

  it('should wrap global App() on setup', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    expect((globalThis as any).App).not.toBe(originalApp);
  });

  it('should start session on onLaunch', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    (globalThis as any).App({ onLaunch: jest.fn() });
    capturedAppOptions.onLaunch();

    expect(mockStartSession).toHaveBeenCalledWith({ ignoreDuration: true });
    expect(mockCaptureSession).toHaveBeenCalled();
  });

  it('should start session on onShow when not active', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    (globalThis as any).App({ onShow: jest.fn() });
    capturedAppOptions.onShow();

    expect(mockStartSession).toHaveBeenCalled();
  });

  it('should not start duplicate session on onShow if already active', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    (globalThis as any).App({ onLaunch: jest.fn(), onShow: jest.fn() });

    capturedAppOptions.onLaunch();
    mockStartSession.mockClear();
    mockCaptureSession.mockClear();

    capturedAppOptions.onShow();
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it('should end session on onHide', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    (globalThis as any).App({ onLaunch: jest.fn(), onHide: jest.fn() });

    capturedAppOptions.onLaunch();
    capturedAppOptions.onHide();

    expect(mockEndSession).toHaveBeenCalled();
  });

  // 注：crashed 标记已不在本集成处理（删除了恒为 no-op 的 onError 钩子），改由
  // @sentry/core 在未处理错误时自动标记。真·端到端验证见 session.realcore.test.ts。

  it('should call original lifecycle methods', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    const originalOnLaunch = jest.fn();
    const originalOnShow = jest.fn();
    const originalOnHide = jest.fn();

    (globalThis as any).App({
      onLaunch: originalOnLaunch,
      onShow: originalOnShow,
      onHide: originalOnHide,
    });

    capturedAppOptions.onLaunch('arg1');
    capturedAppOptions.onShow('arg2');
    capturedAppOptions.onHide();

    expect(originalOnLaunch).toHaveBeenCalledWith('arg1');
    expect(originalOnShow).toHaveBeenCalledWith('arg2');
    expect(originalOnHide).toHaveBeenCalled();
  });

  it('should restart session after onHide + onShow', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    (globalThis as any).App({ onLaunch: jest.fn(), onHide: jest.fn(), onShow: jest.fn() });

    capturedAppOptions.onLaunch();
    mockStartSession.mockClear();

    capturedAppOptions.onHide();

    capturedAppOptions.onShow();
    expect(mockStartSession).toHaveBeenCalled();
  });

  it('should restore original App on cleanup', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    expect((globalThis as any).App).not.toBe(originalApp);

    integration.cleanup();
    expect((globalThis as any).App).toBe(originalApp);
  });
});
