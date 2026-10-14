// @vitest-environment jsdom
import { Replayer } from '@rrweb/replay';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clickEvent, frameEvents, projectFrame } from '../../src/replay/frame';
// @ts-expect-error 本地导入器是开发工具 JS，不进入 SDK 声明。
import { parseRecording } from '../../scripts/internal/replay-local/recording.mjs';

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
  it.each(['public', 'host-mask', 'slot-mask', 'slot-block', 'zero-host', 'missing-slot'])(
    '组件裸默认插槽文字归属实际布局，%s 不越过隐私边界',
    (mode) => {
      const raw = [
        box({
          left: 0,
          top: 0,
          width: 375,
          height: 700,
          mark: { root: true },
          dataset: {
            sentryReplaySource: 'page',
            sentryReplayNode: 'root',
            sentryReplayRoot: true,
            sentryReplayUnmask: true,
          },
        }),
        box({
          width: mode === 'zero-host' ? 0 : 60,
          height: 30,
          mark: { root: true, host: true },
          dataset: {
            sentryReplaySource: 'page',
            sentryReplayNode: 'host',
            sentryReplayParent: 'root',
            sentryReplayType: 'component',
            sentryReplayTarget: 'button',
            sentryReplayTextFormat: 'wxml',
            sentryReplayText: '\u200b确认',
            sentryReplayMask: mode === 'host-mask',
          },
        }),
        box({
          width: 60,
          height: 30,
          backgroundColor: '#07c160',
          mark: { button: true },
          dataset: { sentryReplaySource: 'button', sentryReplayNode: 'button' },
        }),
        box({
          left: 38,
          top: 45,
          width: 24,
          height: 20,
          color: '#fff',
          backgroundColor: 'transparent',
          mark: { button: true, slot: true },
          dataset: {
            sentryReplaySource: 'button',
            sentryReplayNode: 'slot',
            sentryReplayParent: 'button',
            sentryReplaySlot: mode !== 'missing-slot',
            sentryReplayUnmask: true,
            sentryReplayMask: mode === 'slot-mask',
            sentryReplayBlock: mode === 'slot-block',
          },
        }),
      ];
      raw.push(
        { ...raw[1]!, top: 90, dataset: { ...raw[1]!.dataset, sentryReplayText: '\u200b再确认' } },
        { ...raw[2]!, top: 90 },
        { ...raw[3]!, top: 95 },
      );
      const frame = projectFrame([viewport, raw], 'page', 10)!;
      expect(frame.nodes[1].text).toBe('');
      const text = frame.nodes[3].text;
      expect(text).toBe(
        mode === 'public' || mode === 'zero-host'
          ? '确认'
          : mode === 'host-mask' || mode === 'slot-mask'
            ? '**'
            : mode === 'slot-block'
              ? '[blocked]'
              : '',
      );
      expect(frame.nodes[4].text).toBe('');
      expect(frame.nodes[6].text).toBe(text === '确认' ? '再确认' : text === '**' ? '***' : text);
      const events = frameEvents(frame, 1);
      const body = (events[1] as any).data.node.childNodes[1].childNodes[1];
      const host = body.childNodes[0].childNodes[1];
      expect(host.childNodes[0].textContent).toBe('');
      expect(host.childNodes[1].childNodes[1].childNodes[0].textContent).toBe(text);
      if (mode === 'slot-mask' || mode === 'host-mask' || mode === 'slot-block')
        expect(JSON.stringify(events)).not.toContain('确认');
    },
  );
  it.each([
    'public',
    'mask',
    'block',
    'ancestor-block',
    'named-public',
    'named-mask',
    'forwarded-mask',
    'forwarded-block',
    'missing',
    'oversized',
    'invalid-name',
  ])('显式插槽节点采用渲染容器的隐私与位置：%s', (mode) => {
    const forwarded = mode.startsWith('forwarded');
    const named = mode.startsWith('named') || forwarded;
    const key = named ? 'nlabel' : 'd';
    let reads = 0;
    const raw = [
      box({
        mark: { root: true },
        dataset: {
          sentryReplaySource: 'page',
          sentryReplayNode: 'root',
          sentryReplayRoot: true,
          sentryReplayUnmask: true,
        },
      }),
      box({
        mark: { root: true, host: true },
        dataset: {
          sentryReplaySource: 'page',
          sentryReplayNode: 'host',
          sentryReplayParent: 'root',
          sentryReplayType: 'component',
          sentryReplayTarget: 'button',
        },
      }),
      box({
        mark: { button: true },
        dataset: {
          sentryReplaySource: 'button',
          sentryReplayNode: 'button',
          sentryReplayBlock: mode === 'ancestor-block',
        },
      }),
      box({
        left: 24,
        top: 42,
        mark: { button: true, slot: true },
        dataset: {
          sentryReplaySource: 'button',
          sentryReplayNode: 'slot',
          sentryReplayParent: 'button',
          sentryReplaySlots:
            mode === 'missing'
              ? undefined
              : mode === 'oversized'
                ? 'x'.repeat(1025)
                : forwarded
                  ? 'ntitle'
                  : key,
          sentryReplayMask: mode === 'mask' || mode === 'named-mask' || mode === 'forwarded-mask',
          sentryReplayBlock: mode === 'block' || mode === 'forwarded-block',
        },
      }),
      box({
        left: 28,
        top: 45,
        mark: { root: true, host: true, child: true },
        dataset: {
          sentryReplaySource: 'page',
          sentryReplayNode: 'child',
          sentryReplayParent: 'host',
          sentryReplayUnmask: true,
          sentryReplayAssigned: mode === 'invalid-name' ? {} : named ? key : undefined,
          sentryReplayText: 'PRIVATE_SLOT_533',
        },
      }),
      box({
        left: 30,
        top: 48,
        mark: { root: true, host: true, child: true, leaf: true },
        dataset: {
          sentryReplaySource: 'page',
          sentryReplayNode: 'leaf',
          sentryReplayParent: 'child',
          sentryReplayUnmask: true,
          sentryReplayText: 'PRIVATE_SLOT_CHILD_533',
        },
      }),
    ];
    if (forwarded) {
      (raw[1]!.dataset as Record<string, unknown>)['sentryReplayTarget'] = 'outer';
      raw.splice(
        2,
        0,
        box({
          mark: { forward: true },
          dataset: {
            sentryReplaySource: 'outer',
            sentryReplayNode: 'forward',
            sentryReplayType: 'component',
            sentryReplayTarget: 'button',
            sentryReplaySlots: 'nlabel>ntitle',
          },
        }),
      );
    }
    const child = forwarded ? 5 : 4;
    for (const node of raw.slice(child)) {
      const value = node.dataset.sentryReplayText;
      Object.defineProperty(node.dataset, 'sentryReplayText', {
        get() {
          reads++;
          return value;
        },
      });
    }
    const frame = projectFrame([viewport, raw], 'page', 20)!;
    const events = JSON.stringify(frameEvents(frame, 1));
    if (mode === 'public' || mode === 'named-public') {
      expect(frame.nodes[4].parent).toBe(3);
      expect(frame.nodes[4].style).toContain('left:4px');
      expect(events).toContain('PRIVATE_SLOT_533');
      expect(events).toContain('PRIVATE_SLOT_CHILD_533');
    } else {
      expect(events).not.toContain('PRIVATE_SLOT');
      if (mode === 'mask' || mode === 'named-mask' || mode === 'forwarded-mask') {
        expect(frame.nodes[child].parent).toBe(child - 1);
        expect(frame.nodes[child].text).toBe('****************');
      } else {
        expect(reads).toBe(0);
        expect(events).toContain('[blocked]');
        expect(clickEvent(frame, 30, 50, 0)).toBeUndefined();
      }
    }
  });
  it.each(['view', 'scroll-view'])('%s 跨组件重复实例、slot 和裁剪维持树与隐私继承', (kind) => {
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
      compiled(
        'card',
        'cardRoot',
        {},
        {},
        { sentryReplayText: '私密卡片', sentryReplaySlots: 'd' },
      ),
      compiled(
        'card',
        'scroll',
        { cardRoot: 'true' },
        { height: 40, overflow: kind === 'view' ? 'hidden' : 'visible', borderTopWidth: '2px' },
        { sentryReplayType: kind },
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
    expect(frame.nodes.map((node) => node.parent)).toEqual([-1, 0, 1, 2, 3, 4, 2, 0, 7]);
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
    '屏蔽或实际隐藏的 %s 节点不读取私密文本，组件边界也不泄漏',
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
          ...(mode === 'zero' ? { width: 0 } : {}),
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
          ...(mode === 'zero' ? { width: 0 } : {}),
          mark: { inner: true, child: true },
          dataset: {
            sentryReplaySource: 'c',
            sentryReplayNode: 'child',
            sentryReplayType: 'component',
            sentryReplayTarget: 'deep',
          },
        }),
        box({
          ...(mode === 'zero' ? { width: 0 } : {}),
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
  it.each(['public', 'mask', 'block'] as const)(
    '零宽组件宿主下的可见浮层保留布局，%s 隐私规则仍继承',
    (mode) => {
      const raw = [
        box({
          left: 0,
          top: 0,
          width: 375,
          height: 700,
          mark: { root: true },
          dataset: {
            sentryReplaySource: 'p',
            sentryReplayNode: 'root',
            sentryReplayRoot: true,
            sentryReplayUnmask: true,
            sentryReplayType: 'view',
          },
        }),
        box({
          left: 256,
          top: 249,
          width: 0,
          height: 18,
          mark: { root: true, host: true },
          dataset: {
            sentryReplaySource: 'p',
            sentryReplayNode: 'host',
            sentryReplayParent: 'root',
            sentryReplayType: 'component',
            sentryReplayTarget: 'popup',
            ...(mode === 'mask'
              ? { sentryReplayMask: true }
              : mode === 'block'
                ? { sentryReplayBlock: true }
                : {}),
          },
        }),
        box({
          left: 109,
          top: 330,
          width: 172,
          height: 92,
          mark: { panel: true },
          dataset: {
            sentryReplaySource: 'popup',
            sentryReplayNode: 'panel',
            sentryReplayType: 'view',
            sentryReplaySlots: 'd',
          },
        }),
        box({
          left: 133,
          top: 365,
          width: 64,
          height: 18,
          mark: { root: true, host: true, content: true },
          dataset: {
            sentryReplaySource: 'p',
            sentryReplayNode: 'content',
            sentryReplayParent: 'host',
            sentryReplayText: '验收弹窗',
            sentryReplayUnmask: true,
            sentryReplayType: 'text',
          },
        }),
      ];
      const frame = projectFrame([viewport, raw], 'page', 20)!;
      const texts = frame.nodes.map((node) => node.text).filter(Boolean);
      expect(texts).toEqual(
        mode === 'public' ? ['验收弹窗'] : mode === 'mask' ? ['****'] : ['[blocked]'],
      );
      if (mode !== 'block') {
        expect(frame.nodes.map((node) => node.parent)).toEqual([-1, 0, 1, 2]);
        expect(frame.nodes[2].style).toContain('left:-147px');
        expect(frame.nodes[3].visible).toMatchObject({
          left: 133,
          top: 365,
          right: 197,
          bottom: 383,
        });
        expect(clickEvent(frame, 140, 370, 0)).toBeDefined();
      } else {
        expect(clickEvent(frame, 140, 370, 0)).toBeUndefined();
        raw.push(
          box({
            left: 130,
            top: 360,
            width: 100,
            height: 40,
            mark: { root: true, cover: true },
            dataset: {
              sentryReplaySource: 'p',
              sentryReplayNode: 'cover',
              sentryReplayParent: 'root',
              sentryReplayText: 'public overlap',
              sentryReplayType: 'text',
            },
          }),
        );
        expect(clickEvent(projectFrame([viewport, raw], 'page', 20)!, 140, 370, 0)).toBeUndefined();
      }
      const serialized = JSON.stringify(frameEvents(frame, 1));
      if (mode !== 'public') expect(serialized).not.toContain('验收弹窗');
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
          box({
            dataset: {
              sentryReplayText: '\u200b0',
              sentryReplayTextFormat: 'wxml',
              sentryReplayUnmask: true,
            },
          }),
          box({ dataset: { sentryReplayText: '\u200bfalse', sentryReplayTextFormat: 'wxml' } }),
          box({ dataset: { sentryReplayText: '\u200b', sentryReplayTextFormat: 'wxml' } }),
        ],
      ],
      'pages/order/index?secret#private',
      20,
    )!;
    expect(frame.nodes.map((node) => node.text)).toEqual([
      '*** ***********',
      '[input]',
      '确认订单',
      '0',
      '*****',
      '',
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
    { height: 20, kind: 'view', nowrap: true },
    { height: 20, kind: 'button', nowrap: true },
    { height: 21, fontSize: '11px', paddingTop: '3px', paddingBottom: '3px', nowrap: true },
    { height: 31, paddingTop: '3px', paddingBottom: '3px', borderWidth: '2px', nowrap: true },
    {
      height: 24,
      borderWidth: '2px',
      borderTopWidth: '0px',
      borderBottomWidth: '0px',
      nowrap: false,
    },
    { height: 48, paddingTop: '3px', paddingBottom: '3px', nowrap: false },
  ])('坏节点跳过，文字按内容高度保留换行：%j', ({ nowrap, kind = 'text', ...metrics }) => {
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
          box({
            fontSize: '14px',
            lineHeight: 'normal',
            dataset: { sentryReplayType: kind, sentryReplayText: '手机号 13800000000' },
            ...metrics,
          }),
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
    const recording = JSON.stringify({
      events: [
        ...frameEvents(first, 1000),
        clickEvent(first, 30, 50, 1400)!,
        ...frameEvents(changed, 2000),
        ...frameEvents(empty, 3000),
      ],
    });
    player = new Replayer(parseRecording(recording).replays[0].events, {
      root: document.body,
      showWarning: false,
      showDebug: false,
    });
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
