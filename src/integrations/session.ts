import { startSession, endSession, captureSession, getCurrentScope } from '@sentry/core';
import type { Integration } from '@sentry/core';
import { subscribeAppLifecycle } from '../appLifecycle';

/**
 * Session Integration
 * 自动管理小程序 Session 生命周期，为 Sentry Release Health 提供数据。
 *
 * - App.onLaunch / onShow → 开始新 Session
 * - App.onHide → 结束 Session
 * - 错误发生时（App.onError）自动标记 Session 为 crashed
 *
 * 通过共享的 appLifecycle 订阅全局 App 生命周期（不再自行猴补 App，见架构 review P2-c）。
 */
export class SessionIntegration implements Integration {
  public static id: string = 'Session';
  public name: string = SessionIntegration.id;

  private _isSessionActive: boolean = false;
  private _unsubscribe: (() => void) | null = null;

  public setupOnce(): void {
    this._unsubscribe = subscribeAppLifecycle({
      onLaunch: () => this._startSession(),
      onShow: () => {
        if (!this._isSessionActive) {
          this._startSession();
        }
      },
      onHide: () => this._endSession(),
      onError: () => this._markSessionCrashed(),
    });
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
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._isSessionActive = false;
  }
}
