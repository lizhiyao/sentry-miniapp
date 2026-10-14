// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { Replayer } from '@rrweb/replay';
import { expect, it, vi } from 'vitest';
import { frameEvents, projectFrame } from '../../src/replay/frame';

it('实际导入和控件在分段精确边界还原新帧，错误文件保留上次有效录制', async () => {
  vi.useFakeTimers({
    toFake: [
      'Date',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  vi.spyOn(window.performance, 'now').mockImplementation(() => Date.now());
  const sandbox = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'sandbox');
  Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      return (this.getAttribute('sandbox') ?? '').split(/\s+/).filter(Boolean);
    },
  });
  Object.assign(window, { rrwebReplay: { Replayer } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status: 204 })),
  );
  const html = readFileSync('scripts/internal/replay-local/viewer.html', 'utf8');
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const frame = (text: string) =>
    projectFrame(
      [
        { width: 375, height: 700 },
        [
          {
            left: 10,
            top: 10,
            width: 100,
            height: 30,
            dataset: { sentryReplayText: text, sentryReplayUnmask: true },
          },
        ],
      ],
      'pages/local/index',
      20,
    )!;
  const replayId = 'a'.repeat(32),
    errorId = 'b'.repeat(32);
  const report = {
    schema: 'sentry-miniapp-local-replay',
    version: 1,
    mode: 'local',
    segments: [0, 1].map((segmentId) => ({
      replayId,
      segmentId,
      recording:
        JSON.stringify({ segment_id: segmentId }) +
        '\n' +
        JSON.stringify(
          frameEvents(frame(segmentId ? '已确认' : '待确认'), 1000 + segmentId * 1000),
        ),
      metadata: { errorIds: [errorId] },
    })),
    summary: { droppedSegments: 1 },
  };
  try {
    // @ts-expect-error 开发工具 JS 不属于 SDK 公共声明。
    await import('../../scripts/internal/replay-local/viewer.mjs');
    element<HTMLTextAreaElement>('input').value = JSON.stringify(report);
    element<HTMLButtonElement>('import').click();
    const iframeWindow = document.querySelector('iframe')!.contentWindow;
    if (iframeWindow) iframeWindow.scrollTo = vi.fn();
    await vi.advanceTimersByTimeAsync(2);
    const body = () => document.querySelector('iframe')!.contentDocument!.body.textContent;
    expect(body()).toBe('待确认');
    expect(element('status').textContent).toContain('已移除 1 段');
    expect(element('errors').textContent).toBe(errorId);
    (element('segments').lastElementChild as HTMLButtonElement).click();
    expect(body()).toBe('已确认');
    expect(element('time').textContent).toBe('00:01 / 00:01');
    expect(element('seek').getAttribute('aria-valuetext')).toBe('00:01 / 00:01');
    expect((element('segments').lastElementChild as HTMLElement).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(element<HTMLDetailsElement>('import-panel').open).toBe(false);
    expect(element<HTMLSelectElement>('sessions').selectedOptions[0].textContent).toBe(
      '录制 1 · 00:01',
    );
    // 官方播放器在末事件后延迟 50ms 完成，等待该状态转换后再重播。
    await vi.advanceTimersByTimeAsync(60);
    element<HTMLButtonElement>('start').click();
    expect(body()).toBe('待确认');
    element<HTMLButtonElement>('play').click();
    expect(element('play').textContent).toBe('暂停');
    await vi.advanceTimersByTimeAsync(1100);
    expect(body()).toBe('已确认');
    expect(element('play').textContent).toBe('播放');
    element<HTMLTextAreaElement>('input').value = '{';
    element<HTMLButtonElement>('import').click();
    expect(element('status').hasAttribute('data-error')).toBe(true);
    expect(body()).toBe('已确认');
    const damaged = frameEvents(frame('损坏文件'), 1000);
    const invalid = [...damaged, { type: 3, timestamp: 1001 }];
    element<HTMLTextAreaElement>('input').value = JSON.stringify(invalid);
    element<HTMLButtonElement>('import').click();
    expect(element('status').hasAttribute('data-error')).toBe(true);
    expect(body()).toBe('已确认');
    // 验证第三方构造失败也保留上次实例，随后仍可恢复导入。
    Object.assign(window, {
      rrwebReplay: {
        Replayer: class {
          constructor() {
            throw new Error('受控构造失败');
          }
        },
      },
    });
    element<HTMLTextAreaElement>('input').value = JSON.stringify(report);
    element<HTMLButtonElement>('import').click();
    expect(element('status').textContent).toBe('受控构造失败');
    expect(body()).toBe('已确认');
    Object.assign(window, { rrwebReplay: { Replayer } });
    element<HTMLButtonElement>('import').click();
    await vi.advanceTimersByTimeAsync(2);
    expect(element('status').hasAttribute('data-error')).toBe(false);
    expect(body()).toBe('待确认');
    const stage = element('stage');
    stage.style.padding = '20px';
    Object.defineProperties(stage, { clientWidth: { value: 500 }, clientHeight: { value: 480 } });
    window.dispatchEvent(new Event('resize'));
    expect(parseFloat(element('viewport').style.height)).toBeLessThan(480);
    expect(parseFloat(element('viewport').style.width)).toBeGreaterThan(0);
    element<HTMLSelectElement>('zoom').value = '1';
    element('zoom').dispatchEvent(new Event('change'));
    expect(element('viewport').style.width).toBe('375px');
    expect(element('viewport').style.height).toBe('700px');
    expect(stage.style.overflow).toBe('auto');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(body()).toBe('已确认');
    const input = element<HTMLTextAreaElement>('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(body()).toBe('已确认');
    const file = new File([JSON.stringify(report)], '录制.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(report) });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file] } });
    document.body.dispatchEvent(drop);
    expect(element<HTMLButtonElement>('import').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(element<HTMLButtonElement>('import').disabled).toBe(false);
    expect(body()).toBe('待确认');
  } finally {
    window.dispatchEvent(new Event('pagehide'));
    if (sandbox) Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', sandbox);
    else Reflect.deleteProperty(HTMLIFrameElement.prototype, 'sandbox');
    Reflect.deleteProperty(window, 'rrwebReplay');
    document.body.innerHTML = '';
    vi.useRealTimers();
  }
});
