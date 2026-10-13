// @vitest-environment jsdom
import { Replayer } from '@rrweb/replay';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clickEvent, frameEvents, projectFrame } from '../../src/replay/frame';

const viewport = { width: 375, height: 700, scrollTop: 0 };
const box = (extra: Record<string, unknown> = {}) => ({
  left: 20,
  top: 40,
  width: 200,
  height: 48,
  dataset: { sentryReplayType: 'text', sentryReplayText: '手机号 13800000000' },
  backgroundColor: '#fff',
  color: '#222',
  ...extra,
});
describe('布局投影与官方 rrweb 播放', () => {
  let player: Replayer | undefined;
  const sandboxDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'sandbox');
  beforeAll(() => {
    // jsdom lacks the sandbox DOMTokenList; expose the iframe attribute to rrweb's guard.
    Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', {
      configurable: true,
      get(this: HTMLIFrameElement) {
        return (this.getAttribute('sandbox') ?? '').split(/\s+/).filter(Boolean);
      },
    });
  });
  afterAll(() => {
    if (sandboxDescriptor)
      Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', sandboxDescriptor);
    else Reflect.deleteProperty(HTMLIFrameElement.prototype, 'sandbox');
  });
  afterEach(() => {
    player?.destroy();
    player = undefined;
    document.body.innerHTML = '';
  });
  it('序列化前遮蔽文本，私有节点不读值，样式不加载资源', () => {
    const dataset = {
      sentryReplayType: 'input',
      sentryReplayUnmask: true,
      get sentryReplayText() {
        throw new Error('private');
      },
      get arbitrary() {
        throw new Error('arbitrary dataset');
      },
    };
    const frame = projectFrame(
      [
        viewport,
        [
          box(),
          box({ dataset, boxShadow: 'url(https://private.invalid)' }),
          box({
            dataset: { sentryReplayText: '确认订单', sentryReplayUnmask: 'true' },
            color: 'red;content:secret',
            borderRadius: '8px',
          }),
        ],
      ],
      'pages/order/index?secret#private',
      20,
    )!;
    expect(frame.nodes.map((node) => node.text)).toEqual([
      '*** ***********',
      '[input]',
      '确认订单',
    ]);
    expect(frame.href).toBe('app:///pages/order/index');
    const payload = JSON.stringify(frameEvents(frame, 1000));
    for (const secret of ['13800000000', 'secret', 'private.invalid', 'url('])
      expect(payload).not.toContain(secret);
    expect(payload).toContain('border-radius:8px');
  });
  it.each([
    undefined,
    [],
    [null, []],
    [{ width: 0, height: 700 }, []],
    [{ width: Infinity, height: 700 }, []],
    [viewport, {}],
    [viewport, [box(), box()]],
  ])('非法或超量结果跳过：%j', (results) =>
    expect(projectFrame(results, 'page', 1)).toBeUndefined(),
  );
  it('坏节点、零尺寸和屏幕外节点跳过，点击落在最后一个可见盒子', () => {
    const bad = {
      get dataset() {
        throw new Error('blocked');
      },
    };
    const frame = projectFrame(
      [
        viewport,
        [
          null,
          bad,
          box({ width: 0 }),
          box({ left: NaN }),
          box({ top: undefined }),
          box({ left: 1000 }),
          box({ dataset: {} }),
          box({ dataset: { sentryReplayType: 'video' } }),
        ],
      ],
      'page',
      20,
    )!;
    expect(frame.nodes.map((node) => node.text)).toEqual(['', '[video]']);
    for (const x of [NaN, -1, 376]) expect(clickEvent(frame, x, 0, 0)).toBeUndefined();
    expect(clickEvent(frame, 10, 10, 0)).toMatchObject({ data: { id: 5 } });
    expect(clickEvent(frame, 30, 50, 0)).toMatchObject({ data: { id: 12 } });
  });
  it('真实播放器重建初始界面、点击、文本变化、滚动位置和节点消失', async () => {
    vi.useFakeTimers();
    const first = projectFrame([viewport, [box()]], 'pages/replay/index', 20)!;
    const changed = projectFrame(
      [
        { ...viewport, scrollTop: 160 },
        [
          box({
            top: 12,
            dataset: {
              sentryReplayType: 'button',
              sentryReplayText: '已提交',
              sentryReplayUnmask: true,
            },
          }),
        ],
      ],
      'pages/replay/index',
      20,
    )!;
    const empty = projectFrame([viewport, []], 'pages/next/index', 20)!;
    player = new Replayer(
      [
        ...frameEvents(first, 1000),
        clickEvent(first, 30, 50, 1400)!,
        ...frameEvents(changed, 2000),
        ...frameEvents(empty, 3000),
      ],
      { root: document.body, showWarning: false, showDebug: false },
    );
    if (player.iframe.contentWindow) player.iframe.contentWindow.scrollTo = vi.fn();
    await vi.advanceTimersByTimeAsync(2);
    player.pause(0);
    const body = () => player!.iframe.contentDocument!.body;
    expect(body().textContent).toBe('*** ***********');
    expect(body().firstElementChild?.getAttribute('style')).toContain('top:40px');
    player.pause(1100);
    expect(body().textContent).toBe('已提交');
    expect(body().firstElementChild?.getAttribute('style')).toContain('top:12px');
    player.pause(2100);
    expect(body().textContent).toBe('');
  });
});
