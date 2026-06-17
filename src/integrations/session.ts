import { startSession, endSession, captureSession } from '@sentry/core';
import type { Integration } from '@sentry/core';
import { subscribeAppLifecycle } from '../appLifecycle';

/**
 * Session Integration
 * 自动管理小程序 Session 生命周期，为 Sentry Release Health 提供数据。
 *
 * - App.onLaunch / onShow → 开始新 Session
 * - App.onHide → 结束 Session
 *
 * crashed 标记不在本集成处理：@sentry/core 捕获未处理错误（mechanism.handled=false）时，
 * 会自动把当前 Session 标记为 crashed 并补发（client._updateSessionFromEvent）。早期此处曾用
 * App.onError 钩子手动标记，但它读 currentScope、而 Session 挂在 isolationScope 上——恒为
 * no-op，已删除，避免与 core 的自动标记重复或误导后人。
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

  public cleanup(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._isSessionActive = false;
  }
}
