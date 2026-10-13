import type { eventWithTime, serializedNodeWithId } from '@rrweb/types';
import type { ReplayBox, ReplayFrame } from './types';

export const REPLAY_STYLES = [
  'backgroundColor',
  'color',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'borderRadius',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'opacity',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'boxShadow',
] as const;

const BOX_KINDS = new Set(['view', 'text', 'button', 'image', 'input', 'canvas', 'video', 'map']);
const PRIVATE_KINDS = new Set(['input', 'image', 'canvas', 'video', 'map']);

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000
    ? value
    : fallback;
}

/** 只读取明确标记的文本，不读 input 的值、图片地址或任意 dataset 字段。 */
function readBox(raw: Record<string, unknown>): ReplayBox | undefined {
  const dataset = raw['dataset'];
  if (!dataset || typeof dataset !== 'object') return undefined;
  const data = dataset as Record<string, unknown>;
  const markedKind = data['sentryReplayType'];
  const kind = typeof markedKind === 'string' && BOX_KINDS.has(markedKind) ? markedKind : 'view';
  const width = finiteNumber(raw['width']);
  const height = finiteNumber(raw['height']);
  if (width <= 0 || height <= 0) return undefined;
  const left = finiteNumber(raw['left'], NaN);
  const top = finiteNumber(raw['top'], NaN);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return undefined;
  let text = '';
  if (PRIVATE_KINDS.has(kind)) {
    text = '[' + kind + ']';
  } else {
    const content = data['sentryReplayText'];
    if (typeof content === 'string') {
      text = content.slice(0, 256);
      const unmask = data['sentryReplayUnmask'];
      if (unmask !== true && unmask !== 'true') text = text.replace(/\S/g, '*');
    }
  }
  let style =
    'position:absolute;box-sizing:border-box;overflow:hidden;white-space:pre-wrap;' +
    'left:' +
    left +
    'px;top:' +
    top +
    'px;width:' +
    width +
    'px;height:' +
    height +
    'px;';
  for (const key of REPLAY_STYLES) {
    const value = raw[key];
    if (
      typeof value === 'string' &&
      value.length <= 128 &&
      !/[;{}<>\\]|url\s*\(|expression\s*\(/i.test(value)
    ) {
      const cssKey = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      style += cssKey + ':' + value + ';';
    }
  }
  return { left, top, width, height, kind, style, text };
}

export function projectFrame(
  results: unknown,
  route: string,
  maxNodes: number,
): ReplayFrame | undefined {
  if (!Array.isArray(results) || !Array.isArray(results[1])) return undefined;
  const viewport = results[0] as Record<string, unknown> | undefined;
  if (!viewport) return undefined;
  const width = finiteNumber(viewport['width']);
  const height = finiteNumber(viewport['height']);
  if (width <= 0 || height <= 0) return undefined;
  if (results[1].length > maxNodes) return undefined;
  const nodes: ReplayBox[] = [];
  for (const raw of results[1]) {
    if (!raw || typeof raw !== 'object') continue;
    try {
      const box = readBox(raw as Record<string, unknown>);
      if (
        box &&
        box.left < width &&
        box.top < height &&
        box.left + box.width > 0 &&
        box.top + box.height > 0
      )
        nodes.push(box);
    } catch (_error) {
      // 一个不可读节点不影响页面业务，也不保留其原始数据。
    }
  }
  return {
    width,
    height,
    nodes,
    scrollLeft: finiteNumber(viewport['scrollLeft']),
    scrollTop: finiteNumber(viewport['scrollTop']),
    href: 'app:///' + route.split(/[?#]/)[0]!.slice(0, 256),
  };
}

function element(
  id: number,
  tagName: string,
  style: string,
  childNodes: serializedNodeWithId[] = [],
): serializedNodeWithId {
  return { type: 2, id, tagName, attributes: { style }, childNodes };
}

/** 布局投影使用 rrweb 的标准 FullSnapshot；播放器仍由 rrweb 提供。 */
export function frameEvents(frame: ReplayFrame, timestamp: number): eventWithTime[] {
  const boxes = frame.nodes.map((box, index) =>
    element(10 + index * 2, 'div', box.style, [
      { type: 3, id: 11 + index * 2, textContent: box.text },
    ]),
  );
  const document: serializedNodeWithId = {
    type: 0,
    id: 1,
    childNodes: [
      { type: 1, id: 2, name: 'html', publicId: '', systemId: '' },
      element(3, 'html', 'width:100%;height:100%;', [
        element(4, 'head', ''),
        element(
          5,
          'body',
          'margin:0;position:relative;overflow:hidden;background:white;font-family:sans-serif;' +
            'width:' +
            frame.width +
            'px;height:' +
            frame.height +
            'px;',
          boxes,
        ),
      ]),
    ],
  };
  return [
    { type: 4, timestamp, data: { href: frame.href, width: frame.width, height: frame.height } },
    { type: 2, timestamp, data: { node: document, initialOffset: { left: 0, top: 0 } } },
  ];
}

export function clickEvent(
  frame: ReplayFrame,
  x: number,
  y: number,
  timestamp: number,
): eventWithTime | undefined {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x > frame.width ||
    y > frame.height
  )
    return undefined;
  let index = frame.nodes.length - 1;
  for (; index >= 0; index--) {
    const box = frame.nodes[index]!;
    if (x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height)
      break;
  }
  return {
    type: 3,
    timestamp,
    data: {
      source: 2,
      type: 2,
      id: index < 0 ? 5 : 10 + index * 2,
      x,
      y,
    },
  };
}
