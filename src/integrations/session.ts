import { startSession, endSession, captureSession, getCurrentScope } from '@sentry/core';
import type { Integration } from '@sentry/core';

/**
 * Session Integration
 * 自动管理小程序 Session 生命周期，为 Sentry Release Health 提供数据。
 *
 * - App.onLaunch/onShow → 开始新 Session
 * - App.onHide → 结束 Session
 * - 错误发生时自动标记 Session 为 crashed
 */
export class SessionIntegration implements Integration {
  public static id: string = 'Session';
  public name: string = SessionIntegration.id;

  private _originalApp: Function | null = null;
  private _isSessionActive: boolean = false;

  public setupOnce(): void {
    this._wrapApp();
  }

  /**
   * 拦截 App() 构造函数，注入 Session 管理逻辑
   */
  private _wrapApp(): void {
    const globalObj = getGlobalObject();
    if (!globalObj || typeof globalObj.App !== 'function') {
      return;
    }

    this._originalApp = globalObj.App;
    const startSession = this._startSession.bind(this);
    const endSession = this._endSession.bind(this);
    const markCrashed = this._markSessionCrashed.bind(this);
    const isActive = () => this._isSessionActive;
    const origApp = this._originalApp;

    globalObj.App = function (appOptions: Record<string, any> = {}) {
      const originalOnLaunch = appOptions['onLaunch'];
      const originalOnShow = appOptions['onShow'];
      const originalOnHide = appOptions['onHide'];
      const originalOnError = appOptions['onError'];

      appOptions['onLaunch'] = function (this: any, ...args: any[]) {
        startSession();
        if (typeof originalOnLaunch === 'function') {
          return originalOnLaunch.apply(this, args);
        }
      };

      appOptions['onShow'] = function (this: any, ...args: any[]) {
        if (!isActive()) {
          startSession();
        }
        if (typeof originalOnShow === 'function') {
          return originalOnShow.apply(this, args);
        }
      };

      appOptions['onHide'] = function (this: any, ...args: any[]) {
        endSession();
        if (typeof originalOnHide === 'function') {
          return originalOnHide.apply(this, args);
        }
      };

      appOptions['onError'] = function (this: any, ...args: any[]) {
        markCrashed();
        if (typeof originalOnError === 'function') {
          return originalOnError.apply(this, args);
        }
      };

      return origApp!.call(this, appOptions);
    };
  }

  private _startSession(): void {
    try {
      startSession({ ignoreDuration: true });
      captureSession();
      this._isSessionActive = true;
    } catch (_e) {
      // Session 管理不应影响 SDK 正常运行
    }
  }

  private _endSession(): void {
    try {
      endSession();
      captureSession();
      this._isSessionActive = false;
    } catch (_e) {
      // ignore
    }
  }

  private _markSessionCrashed(): void {
    try {
      const scope = getCurrentScope();
      const session = scope.getSession();
      if (session) {
        session.status = 'crashed';
      }
    } catch (_e) {
      // ignore
    }
  }

  public cleanup(): void {
    const globalObj = getGlobalObject();
    if (globalObj && this._originalApp) {
      globalObj.App = this._originalApp;
    }
    this._originalApp = null;
    this._isSessionActive = false;
  }
}

function getGlobalObject(): any {
  if (typeof wx !== 'undefined') return wx;
  if (typeof my !== 'undefined') return my;
  if (typeof tt !== 'undefined') return tt;
  if (typeof dd !== 'undefined') return dd;
  if (typeof qq !== 'undefined') return qq;
  if (typeof swan !== 'undefined') return swan;
  if (typeof globalThis !== 'undefined') return globalThis;
  return undefined;
}

// 平台全局声明
declare const wx: any;
declare const my: any;
declare const tt: any;
declare const dd: any;
declare const qq: any;
declare const swan: any;
