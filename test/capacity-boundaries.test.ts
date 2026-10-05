import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function exerciseCapacity(value: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./support/capacity-worker.mjs', import.meta.url), {
      workerData: { root: fileURLToPath(new URL('../', import.meta.url)), value },
    });
    let finished = false;
    let deadline = setTimeout(() => finish(new Error('worker 启动超时')), 5000);
    function finish(error?: Error, first?: string): void {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      void worker.terminate();
      if (error) reject(error);
      else resolve(first);
    }
    worker.on('error', (error) => finish(error));
    worker.on('exit', (code) => {
      if (!finished) finish(new Error(`worker 提前退出：${code}`));
    });
    worker.on('message', (message) => {
      if (message.ready) {
        clearTimeout(deadline);
        deadline = setTimeout(() => finish(new Error('容量配置阻塞了宿主回调')), 1000);
      }
      if (message.complete) finish(undefined, message.first);
    });
  });
}

describe('SDK 容量边界（独立 worker 外部 deadline）', () => {
  it.each([-1, NaN, Infinity, -Infinity, 1.5])('非法容量 %s 安全回落，不阻塞 observer/store', async (value) => {
    expect(await exerciseCapacity(value)).toBe('5');
  });
  it('0 禁止缓存，仍不阻塞宿主回调', async () => {
    expect(await exerciseCapacity(0)).toBeUndefined();
  });
});
