/**
 * 隐私合规「同意门禁」的状态单一来源。
 *
 * `requireConsent` 模式下，事件在用户同意隐私协议前先入本地缓冲、**不发网络**，
 * `setConsent(true)` 后补发并恢复正常上报。
 *
 * 采用模块级单例（对齐 `crossPlatform.ts` 的缓存 + `resetPlatformCache` 范式）：门禁状态
 * 要同时被 transport 的 `shouldSend` 钩子（在 `MiniappClient` 构造时建立）读取、被公开的
 * `setConsent` API 写入，二者跨文件，需共享同一处状态。这也是它放在 `src/` 顶层而非
 * `integrations/` 的原因——门禁挂在 transport 上、早于集成 setupOnce，集成来不及提供状态。
 */

/** `onConsentCacheDrop` 回调的丢弃原因。 */
export type ConsentDropReason = 'count' | 'bytes' | 'age';

/**
 * 同意前缓存的上限与可观测配置。
 * 可选字段显式带 `| undefined`：本配置常由 `MiniappOptions` 的同名选项**透传**，调用方会直接
 * 把 `number | undefined` 塞进来，故在 `exactOptionalPropertyTypes` 下需允许 undefined 值。
 */
export interface ConsentConfig {
  /** 是否启用同意门禁。false 时整套 consent 逻辑空转（行为与未引入本特性一致）。 */
  required: boolean;
  /** 同意前缓存的最大事件数。 */
  cacheLimit?: number | undefined;
  /** 同意前缓存的最大字节数（受平台单 key Storage 上限约束，微信约 900KB）。 */
  cacheMaxBytes?: number | undefined;
  /** 同意前缓存的过期时间（ms）。 */
  cacheMaxAge?: number | undefined;
  /** 缓存因超限/过期丢弃「同意前」事件时的回调，便于接入方评估上限是否合理。 */
  onDrop?: ((info: { reason: ConsentDropReason; dropped: number }) => void) | undefined;
}

let _config: ConsentConfig = { required: false };
let _granted = false;

/**
 * 配置同意门禁。在 `init` / `MiniappClient` 构造阶段调用。
 * `required` 为 true 时初始视为「未同意」（闸断），直到 `setConsentGranted(true)`。
 */
export function configureConsent(config: ConsentConfig): void {
  _config = { ...config };
  // required 开启 → 初始未同意；未开启 → 视为已同意（不闸断任何上报）。
  _granted = !config.required;
}

/** 设置同意状态。 */
export function setConsentGranted(granted: boolean): void {
  _granted = granted;
}

/**
 * 当前是否允许上报。
 * 未启用门禁（`required=false`）时恒为 true；启用时取决于用户是否已同意。
 */
export function isConsentGranted(): boolean {
  return !_config.required || _granted;
}

/** 是否启用了同意门禁。 */
export function isConsentRequired(): boolean {
  return _config.required;
}

/** 读取当前 consent 配置（供 transport / store 取上限）。 */
export function getConsentConfig(): ConsentConfig {
  return _config;
}

/**
 * 通知一次缓存丢弃，转发给接入方的 `onConsentCacheDrop` 回调。
 * 仅在门禁开启时上报。requireConsent 模式下 consent 缓冲与后续重试复用同一个 store，
 * 所以即使用户同意后 flush 才发现过期 / 超限，也仍属于这条 consent 缓冲通道的可观测范围。
 */
export function notifyConsentDrop(reason: ConsentDropReason, dropped: number): void {
  if (dropped > 0 && _config.required && typeof _config.onDrop === 'function') {
    try {
      _config.onDrop({ reason, dropped });
    } catch (_e) {
      // 接入方回调里抛错不应影响 SDK 主流程。
    }
  }
}

/** 测试钩子：重置门禁状态与配置。对齐 `resetPlatformCache`。 */
export function resetConsentState(): void {
  _config = { required: false };
  _granted = false;
}
