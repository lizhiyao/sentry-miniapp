export interface WechatPageReplayOptions {
  /** 自动完整录制采样率，默认 0；错误前缓冲采样率默认 1。 */
  sessionSampleRate?: number;
  errorSampleRate?: number;
  /** 未触发错误时仅保留此时间窗内的有界布局缓冲，默认 60s。 */
  bufferDurationMs?: number;
  /** 默认查询页面标记及所选页面的自定义组件内部标记。 */
  selector?: string;
  /** 布局采样间隔，默认 500ms，最小 100ms。 */
  intervalMs?: number;
  /** 分段发送间隔，默认 10s。 */
  flushIntervalMs?: number;
  /** 单帧最多 200 个标记节点。 */
  maxNodes?: number;
  /** 每段 UTF-8 字节上限，默认 128KiB。 */
  maxSegmentBytes?: number;
  /** 单次录制时长上限，默认 5 分钟。 */
  maxDurationMs?: number;
}

export interface WechatPageReplayDiagnostics {
  state: 'waiting' | 'recording' | 'stopped' | 'unsupported';
  reason: string | undefined;
  replayId: string | undefined;
  nodes: number;
  /** Submitted to transport; does not confirm backend processing. */
  segments: number;
  bufferedBytes: number;
}

export interface WechatPageReplay {
  /** 显式恢复录制；requireConsent 未获同意时不开始采集。 */
  start(): boolean;
  /** 停止采集并丢弃未发送内容；已发送内容由 Sentry 管理。 */
  stop(): void;
  /** 立即查询当前页面，结果通过实际宿主回调交付。 */
  capture(): Promise<boolean>;
  /** 排放当前分段；true 仅表示本次 transport 返回 2xx。 */
  flush(): Promise<boolean>;
  getReplayId(): string | undefined;
  getDiagnostics(): WechatPageReplayDiagnostics;
}

export interface ReplayFrame {
  instrumented?: boolean;
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
  href: string;
  nodes: ReplayBox[];
}

export interface ReplayBox {
  left: number;
  top: number;
  width: number;
  height: number;
  kind: string;
  blocked?: boolean;
  style: string;
  text: string;
  parent?: number;
  borderX?: number;
  borderY?: number;
  visible?: { left: number; top: number; right: number; bottom: number };
  clip?: { left: number; top: number; right: number; bottom: number };
}
