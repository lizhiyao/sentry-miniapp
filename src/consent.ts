/** 同意状态与缓存配置属于 client；构造其他实例不改变此控制器。 */
/** `onConsentCacheDrop` 回调的丢弃原因。 */
export type ConsentDropReason =
  'count' | 'bytes' | 'age' | 'target_changed' | 'policy_changed' | 'migration_drop';

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
  /** 同意前缓存的配置字节数；实际整容器按宿主预算裁剪，见 offlineStore。 */
  cacheMaxBytes?: number | undefined;
  /** 同意前缓存的过期时间（ms）。 */
  cacheMaxAge?: number | undefined;
  /** 缓存因超限/过期丢弃「同意前」事件时的回调，便于接入方评估上限是否合理。 */
  onDrop?: ((info: { reason: ConsentDropReason; dropped: number }) => void) | undefined;
}

export class ConsentController {
  public readonly config: Readonly<ConsentConfig>;
  private _granted: boolean;

  public constructor(config: ConsentConfig) {
    this.config = Object.freeze({ ...config });
    this._granted = !config.required;
  }

  public setGranted(granted: boolean): void {
    this._granted = granted;
  }

  public isGranted(): boolean {
    return !this.config.required || this._granted;
  }

  /** 同意后发现的过期/容量丢弃仍属于同一 consent 缓冲通道。 */
  public readonly notifyDrop = (reason: ConsentDropReason, dropped: number): void => {
    if (dropped <= 0 || !this.config.required || !this.config.onDrop) return;
    try {
      this.config.onDrop({ reason, dropped });
    } catch (_error) {
      /* 观察回调失败不阻断 SDK。 */
    }
  };
}
