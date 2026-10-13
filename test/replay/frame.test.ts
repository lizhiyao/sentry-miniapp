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
  it('跨组件重复实例、slot 和滚动裁剪维持树与隐私继承，未选页面不采集', () => {
    const compiled = (
      source: string,
      node: string,
      mark: Record<string, unknown>,
      extra: Record<string, unknown> = {},
      data: Record<string, unknown> = {},
    ) =>
      box({
        ...extra,
        mark: { ...mark, [node]: 'true' },
        dataset: {
          sentryReplaySource: source,
          sentryReplayNode: node,
          sentryReplayType: 'view',
          ...data,
        },
      });
    const raw = [
      compiled(
        'page',
        'root',
        {},
        { left: 0, top: 0, width: 375, height: 700 },
        { sentryReplayRoot: true, sentryReplayUnmask: true },
      ),
      compiled(
        'page',
        'host',
        { root: 'true' },
        {},
        {
          sentryReplayType: 'component',
          sentryReplayTarget: 'card,shared',
          sentryReplayMask: true,
        },
      ),
      compiled('card', 'cardRoot', {}, {}, { sentryReplayText: '私密卡片' }),
      compiled(
        'card',
        'scroll',
        { cardRoot: 'true' },
        { height: 40, overflow: 'hidden', borderTopWidth: '2px' },
      ),
      compiled(
        'card',
        'rowHost',
        { cardRoot: 'true', scroll: 'true' },
        { top: 60, height: 40 },
        { sentryReplayType: 'component', sentryReplayTarget: 'row' },
      ),
      compiled(
        'row',
        'rowRoot',
        {},
        { top: 60, height: 40 },
        { sentryReplayText: '私密行', sentryReplayUnmask: true },
      ),
      compiled(
        'row',
        'offscreen',
        { rowRoot: 'true' },
        { top: 120 },
        { sentryReplayText: '裁剪外' },
      ),
      compiled(
        'shared',
        'slot',
        { root: 'true', host: 'true' },
        { top: 85 },
        { sentryReplayText: '插槽仍归页面' },
      ),
      compiled(
        'page',
        'secondHost',
        { root: 'true' },
        { top: 150 },
        { sentryReplayType: 'component', sentryReplayTarget: 'card' },
      ),
      compiled('card', 'cardRoot', {}, { top: 150 }, { sentryReplayText: '第二个实例' }),
    ];
    const frame = projectFrame([viewport, raw], 'page', 20)!;
    expect(frame.nodes.map((node) => node.parent)).toEqual([-1, 0, 1, 2, 3, 4, 1, 0, 7]);
    expect(frame.nodes.map((node) => node.text)).toEqual([
      '',
      '',
      '****',
      '',
      '',
      '***',
      '******',
      '',
      '第二个实例',
    ]);
    expect(frame.nodes[4].style).toContain('top:18px');
    expect(frame.nodes[5].visible?.bottom).toBe(80);
    (raw[1]!.dataset as Record<string, unknown>)['sentryReplayParent'] = 'root';
    (raw[2]!.dataset as Record<string, unknown>)['sentryReplayParent'] = '';
    expect(projectFrame([viewport, raw], 'page', 20)?.nodes).toHaveLength(frame.nodes.length);
    (raw[1]!.dataset as Record<string, unknown>)['sentryReplayParent'] = 'missing';
    expect(
      projectFrame([viewport, raw], 'page', 20)?.nodes.some((node) => node.text.includes('私密')),
    ).toBe(false);
    expect(clickEvent(frame, 30, 70, 0)).toMatchObject({ data: { id: 20 } });
    expect(JSON.stringify(frameEvents(frame, 1))).not.toContain('裁剪外');
    const body = (frameEvents(frame, 1)[1] as any).data.node.childNodes[1].childNodes[1];
    expect(body.childNodes[0].childNodes).toHaveLength(3); // 文本 + 两个组件宿主。
    const unselected = raw.map((node) => ({
      ...node,
      dataset: { ...node.dataset, sentryReplayRoot: false },
    }));
    expect(projectFrame([viewport, unselected], 'other', 20)?.nodes).toEqual([]);
    expect(
      projectFrame(
        [
          viewport,
          [
            compiled('unknown', 'own', {}, {}, { sentryReplayRoot: false }),
            raw[0],
            compiled('other', 'missingMark', {}, { mark: {} }),
          ],
        ],
        'page',
        20,
      )?.nodes,
    ).toHaveLength(1);
  });
  it.each(['blocked', 'hidden', 'transparent', 'zero'] as const)(
    '父节点 %s 时不读取后代私密文本，组件边界也不泄漏',
    (mode) => {
      const data = {
        sentryReplaySource: 'p',
        sentryReplayNode: 'root',
        sentryReplayRoot: true,
        sentryReplayType: 'component',
        sentryReplayTarget: 'c',
        sentryReplayUnmask: true,
        ...(mode === 'blocked' ? { sentryReplayBlock: true } : {}),
      };
      const raw = [
        box({
          mark: { root: true },
          dataset: data,
          ...(mode === 'hidden'
            ? { display: 'none' }
            : mode === 'transparent'
              ? { opacity: '0' }
              : mode === 'zero'
                ? { width: 0 }
                : {}),
        }),
        box({
          mark: { inner: true },
          dataset: {
            sentryReplaySource: 'c',
            sentryReplayNode: 'inner',
            sentryReplayUnmask: true,
            get sentryReplayText() {
              throw new Error('must not read');
            },
          },
        }),
        box({
          mark: { inner: true, child: true },
          dataset: {
            sentryReplaySource: 'c',
            sentryReplayNode: 'child',
            sentryReplayType: 'component',
            sentryReplayTarget: 'deep',
          },
        }),
        box({
          mark: { leaf: true },
          dataset: {
            sentryReplaySource: 'deep',
            sentryReplayNode: 'leaf',
            get sentryReplayText() {
              throw new Error('must not read');
            },
          },
        }),
      ];
      const frame = projectFrame([viewport, raw], 'page', 20)!;
      expect(frame.nodes.map((node) => node.text)).toEqual(mode === 'blocked' ? ['[blocked]'] : []);
      if (mode === 'blocked') expect(clickEvent(frame, 30, 50, 0)).toBeUndefined();
    },
  );
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
    expect(frame.href).toBe('https://miniapp.invalid/pages/order/index');
    expect(new URL(frame.href).origin).toBe('https://miniapp.invalid');
    expect(projectFrame([viewport, []], '/pages/order/index?secret', 20)?.href).toBe(frame.href);
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
  it.each([
    { height: 20, nowrap: true },
    { height: 21, fontSize: '11px', paddingTop: '3px', paddingBottom: '3px', nowrap: true },
    { height: 31, paddingTop: '3px', paddingBottom: '3px', borderWidth: '2px', nowrap: true },
    { height: 24, borderWidth: '2px', borderTopWidth: '0px', borderBottomWidth: '0px', nowrap: false },
    { height: 48, paddingTop: '3px', paddingBottom: '3px', nowrap: false },
  ])('坏节点跳过，文字按内容高度保留换行：%j', ({ nowrap, ...metrics }) => {
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
          box({ fontSize: '14px', lineHeight: 'normal', ...metrics }),
        ],
      ],
      'page',
      20,
    )!;
    expect(frame.nodes.map((node) => node.text)).toEqual(['', '[video]', '*** ***********']);
    expect(frame.nodes[2]!.style.includes('white-space:pre;')).toBe(nowrap);
    for (const x of [NaN, -1, 376]) expect(clickEvent(frame, x, 0, 0)).toBeUndefined();
    expect(clickEvent(frame, 10, 10, 0)).toMatchObject({ data: { id: 5 } });
    expect(clickEvent(frame, 30, 50, 0)).toMatchObject({ data: { id: 14 } });
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
