import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock @sentry/core
const mockStartSession = jest.fn();
const mockEndSession = jest.fn();
const mockCaptureSession = jest.fn();
const mockGetCurrentScope = jest.fn();

jest.mock('@sentry/core', () => ({
  startSession: mockStartSession,
  endSession: mockEndSession,
  captureSession: mockCaptureSession,
  getCurrentScope: mockGetCurrentScope,
}));

import { SessionIntegration } from '../src/integrations/session';

describe('SessionIntegration', () => {
  let originalApp: any;
  let capturedAppOptions: any;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedAppOptions = null;

    // SessionIntegration uses getGlobalObject which checks wx first
    originalApp = jest.fn((options: any) => {
      capturedAppOptions = options;
    });
    (global as any).wx = (global as any).wx || {};
    (global as any).wx.App = originalApp;

    mockGetCurrentScope.mockReturnValue({
      getSession: jest.fn().mockReturnValue({ status: 'ok' }),
    });
  });

  it('should wrap App constructor on wx global', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    expect((global as any).wx.App).not.toBe(originalApp);
  });

  it('should start session on onLaunch', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    const appConfig = { onLaunch: jest.fn() };
    (global as any).wx.App(appConfig);

    capturedAppOptions.onLaunch();

    expect(mockStartSession).toHaveBeenCalledWith({ ignoreDuration: true });
    expect(mockCaptureSession).toHaveBeenCalled();
  });

  it('should start session on onShow when not active', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    const appConfig = { onShow: jest.fn() };
    (global as any).wx.App(appConfig);

    capturedAppOptions.onShow();

    expect(mockStartSession).toHaveBeenCalled();
  });

  it('should not start duplicate session on onShow if already active', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    const appConfig = { onLaunch: jest.fn(), onShow: jest.fn() };
    (global as any).wx.App(appConfig);

    // onLaunch starts session
    capturedAppOptions.onLaunch();
    mockStartSession.mockClear();
    mockCaptureSession.mockClear();

    // onShow should not start another
    capturedAppOptions.onShow();
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it('should end session on onHide', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    const appConfig = { onLaunch: jest.fn(), onHide: jest.fn() };
    (global as any).wx.App(appConfig);

    capturedAppOptions.onLaunch();
    capturedAppOptions.onHide();

    expect(mockEndSession).toHaveBeenCalled();
  });

  it('should mark session as crashed on onError', () => {
    const mockSession = { status: 'ok' };
    mockGetCurrentScope.mockReturnValue({
      getSession: jest.fn().mockReturnValue(mockSession),
    });

    const integration = new SessionIntegration();
    integration.setupOnce();

    const appConfig = { onError: jest.fn() };
    (global as any).wx.App(appConfig);

    capturedAppOptions.onError('some error');

    expect(mockSession.status).toBe('crashed');
  });

  it('should call original lifecycle methods', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    const originalOnLaunch = jest.fn();
    const originalOnShow = jest.fn();
    const originalOnHide = jest.fn();

    (global as any).wx.App({
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

    const appConfig = { onLaunch: jest.fn(), onHide: jest.fn(), onShow: jest.fn() };
    (global as any).wx.App(appConfig);

    capturedAppOptions.onLaunch();
    mockStartSession.mockClear();

    capturedAppOptions.onHide();

    capturedAppOptions.onShow();
    expect(mockStartSession).toHaveBeenCalled();
  });

  it('should restore original App on cleanup', () => {
    const integration = new SessionIntegration();
    integration.setupOnce();

    expect((global as any).wx.App).not.toBe(originalApp);

    integration.cleanup();
    expect((global as any).wx.App).toBe(originalApp);
  });
});
