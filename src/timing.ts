import { sdk } from './crossPlatform';

/**
 * 取当前时间戳，优先使用平台 Performance.now()（单调时钟，不受系统时间回拨影响），
 * 回退 Date.now()。供小游戏冷启动 / 帧率监控等需要高精度计时的场景复用。
 */
export const now = (): number => {
  try {
    const perf = sdk().getPerformance?.();
    if (perf && typeof perf.now === 'function') {
      return perf.now();
    }
  } catch (_e) {
    // ignore，回退 Date.now
  }
  return Date.now();
};
