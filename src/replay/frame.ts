import type { eventWithTime, serializedNodeWithId } from '@rrweb/types';
import type { ReplayBox, ReplayFrame } from './types';

export const REPLAY_STYLES = [
  'backgroundColor',
  'color',
  'fontSize',
  'fontWeight',
  'fontFamily',
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
  'overflow',
  'overflowX',
  'overflowY',
  'visibility',
  'display',
  'zIndex',
  'borderLeftWidth',
  'borderTopWidth',
  'borderBottomWidth',
] as const;
const PRIVATE_KINDS = new Set([
  'input',
  'textarea',
  'image',
  'canvas',
  'video',
  'map',
  'web-view',
  'camera',
  'live-player',
  'live-pusher',
]);
const truth = (value: unknown): boolean => value === true || value === 'true';
function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000
    ? value
    : fallback;
}
interface Scope {
  sources: Set<string>;
  parent: number;
  nodes: Map<string, { value: unknown; index: number }>;
  slotText?: string | undefined;
}
interface Projection {
  box: ReplayBox;
  mask: boolean;
  unmask: boolean;
  block: boolean;
  hiddenTree: boolean;
  depth: number;
}

/** mark 只表示组件内祖先；编译元数据及查询前序共同确定跨组件归属。 */
export function projectFrame(
  results: unknown,
  route: string,
  maxNodes: number,
): ReplayFrame | undefined {
  if (!Array.isArray(results) || !Array.isArray(results[1])) return undefined;
  const viewport = results[0] as Record<string, unknown> | undefined;
  if (!viewport) return undefined;
  const width = number(viewport['width']),
    height = number(viewport['height']);
  if (width <= 0 || height <= 0 || results[1].length > maxNodes) return undefined;
  const rawNodes = results[1] as Record<string, unknown>[];
  const hasRoot = rawNodes.some((raw) => {
    try {
      return truth((raw?.['dataset'] as Record<string, unknown>)?.['sentryReplayRoot']);
    } catch {
      return false;
    }
  });
  const projected: Projection[] = [];
  const scopes: Scope[] = [];
  let pending: Scope | undefined;
  for (const raw of rawNodes) {
    try {
      if (!raw || typeof raw !== 'object') continue;
      const data = raw['dataset'] as Record<string, unknown> | undefined;
      if (!data || typeof data !== 'object') continue;
      const source = data['sentryReplaySource'],
        own = data['sentryReplayNode'];
      const compiled = typeof source === 'string' && typeof own === 'string';
      if (compiled && !hasRoot) continue;
      let parent = -1,
        scope: Scope | undefined;
      const mark = raw['mark'] as Record<string, unknown> | undefined;
      if (compiled) {
        if (!mark || !Object.prototype.hasOwnProperty.call(mark, own)) continue;
        if (pending?.sources.has(source)) {
          scope = pending;
          scopes.push(scope);
        }
        pending = undefined;
        const ordered = [...scopes].reverse();
        scope ??=
          ordered.find((candidate) =>
            [...candidate.nodes].some(([key, entry]) => key !== own && mark[key] === entry.value),
          ) ?? ordered.find((candidate) => candidate.sources.has(source));
        if (!scope) {
          if (!truth(data['sentryReplayRoot'])) continue;
          scope = { sources: new Set([source]), parent: -1, nodes: new Map() };
          scopes.push(scope);
        }
        scope.sources.add(source);
        const expected = data['sentryReplayParent'];
        if (typeof expected === 'string' && expected) {
          const entry = scope.nodes.get(expected);
          if (!entry || mark[expected] !== entry.value) continue;
        }
        parent = scope.parent;
        for (const [key, entry] of scope.nodes) {
          if (
            key !== own &&
            mark[key] === entry.value &&
            (parent < 0 || projected[entry.index]!.depth > projected[parent]!.depth)
          )
            parent = entry.index;
        }
      }
      const ancestor = projected[parent];
      // 插槽文字已继承宿主遮蔽；进入实际容器后再次应用组件内部隐私规则。
      const slotText = compiled && truth(data['sentryReplaySlot']) ? scope?.slotText : undefined;
      if (slotText !== undefined && scope) scope.slotText = undefined;
      if (ancestor?.block) {
        // 屏蔽组件可能只有零面积宿主；只合并可见后代的布局作占位和点击拒绝区域。
        // display:none／透明祖先的整棵树不可见，不从后代扩大占位。
        if (
          !ancestor.hiddenTree &&
          raw['display'] !== 'none' &&
          raw['visibility'] !== 'hidden' &&
          raw['opacity'] !== '0'
        ) {
          const left = number(raw['left'], NaN),
            top = number(raw['top'], NaN);
          const width = number(raw['width']),
            height = number(raw['height']);
          const box = ancestor.box,
            clip = box.clip!;
          const next = {
            left: Math.max(left, clip.left),
            top: Math.max(top, clip.top),
            right: Math.min(left + width, clip.right),
            bottom: Math.min(top + height, clip.bottom),
          };
          if (
            Number.isFinite(left) &&
            Number.isFinite(top) &&
            width > 0 &&
            height > 0 &&
            next.right > next.left &&
            next.bottom > next.top
          ) {
            const own = box.visible!;
            const visible =
              own.right > own.left && own.bottom > own.top
                ? {
                    left: Math.min(own.left, next.left),
                    top: Math.min(own.top, next.top),
                    right: Math.max(own.right, next.right),
                    bottom: Math.max(own.bottom, next.bottom),
                  }
                : next;
            box.visible = visible;
            box.left = visible.left;
            box.top = visible.top;
            box.width = visible.right - visible.left;
            box.height = visible.bottom - visible.top;
            box.text = '[blocked]';
            const origin = projected[box.parent ?? -1]?.box;
            box.style =
              'position:absolute;box-sizing:border-box;overflow:hidden;left:' +
              (box.left - (origin?.left ?? 0) - (origin?.borderX ?? 0)) +
              'px;top:' +
              (box.top - (origin?.top ?? 0) - (origin?.borderY ?? 0)) +
              'px;width:' +
              box.width +
              'px;height:' +
              box.height +
              'px;';
          }
        }
        if (scope && compiled) {
          scope.nodes.set(own, { value: mark![own], index: parent });
          if (typeof data['sentryReplayTarget'] === 'string')
            pending = {
              sources: new Set(data['sentryReplayTarget'].split(',')),
              parent,
              nodes: new Map(),
            };
        }
        continue;
      }
      const w = number(raw['width']),
        h = number(raw['height']);
      const left = number(raw['left'], NaN),
        top = number(raw['top'], NaN);
      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
      const hidden =
        w <= 0 ||
        h <= 0 ||
        raw['display'] === 'none' ||
        raw['visibility'] === 'hidden' ||
        raw['opacity'] === '0';
      const mask = !!ancestor?.mask || truth(data['sentryReplayMask']);
      const unmask = !mask && (!!ancestor?.unmask || truth(data['sentryReplayUnmask']));
      // 零面积或 visibility:hidden 只描述当前盒子，后代仍可能可见。
      const hiddenTree = raw['display'] === 'none' || raw['opacity'] === '0';
      const block = hiddenTree || truth(data['sentryReplayBlock']);
      const kind =
        typeof data['sentryReplayType'] === 'string'
          ? (data['sentryReplayType'] as string)
          : 'view';
      const slotHost =
        compiled && kind === 'component' && data['sentryReplayTextFormat'] === 'wxml';
      let text = '';
      if ((hidden && !slotHost) || block) text = hidden ? '' : '[blocked]';
      else if (PRIVATE_KINDS.has(kind)) text = '[' + kind + ']';
      else {
        const content = data['sentryReplayText'] ?? slotText;
        if (typeof content === 'string') {
          const value =
            data['sentryReplayTextFormat'] === 'wxml' && content.charAt(0) === '\u200b'
              ? content.slice(1)
              : content;
          text = unmask ? value.slice(0, 256) : value.slice(0, 256).replace(/\S/g, '*');
        }
      }
      const origin = ancestor?.box;
      const borderX = origin?.borderX ?? 0,
        borderY = origin?.borderY ?? 0;
      let style =
        'position:absolute;box-sizing:border-box;white-space:pre-wrap;overflow:visible;left:' +
        (left - (origin?.left ?? 0) - borderX) +
        'px;top:' +
        (top - (origin?.top ?? 0) - borderY) +
        'px;width:' +
        w +
        'px;height:' +
        h +
        'px;';
      for (const key of REPLAY_STYLES) {
        const value = raw[key];
        if (
          typeof value === 'string' &&
          value.length <= 128 &&
          !/[;{}<>\\]|url\s*\(|expression\s*\(/i.test(value)
        )
          style +=
            key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()) + ':' + value + ';';
      }
      // 内联 text 的测量宽度可能正好等于字形总宽；浏览器字体差异不能多造一行。
      const fontSize = parseFloat(String(raw['fontSize']));
      const lineHeight = parseFloat(String(raw['lineHeight'])) || fontSize * 1.6;
      const inset = (key: string, fallback = 0): number => {
        const value = parseFloat(String(raw[key]));
        return Math.max(0, Number.isFinite(value) ? value : fallback);
      };
      const textHeight =
        h -
        inset('paddingTop') -
        inset('paddingBottom') -
        inset('borderTopWidth', inset('borderWidth')) -
        inset('borderBottomWidth', inset('borderWidth'));
      if (kind === 'text' && !text.includes('\n') && textHeight <= lineHeight)
        style += 'white-space:pre;';
      const clip = ancestor?.box.clip ?? { left: 0, top: 0, right: width, bottom: height };
      const visible = {
        left: Math.max(left, clip.left),
        top: Math.max(top, clip.top),
        right: Math.min(left + w, clip.right),
        bottom: Math.min(top + h, clip.bottom),
      };
      if (hidden) visible.right = visible.left;
      const overflowX = raw['overflowX'] ?? raw['overflow'],
        overflowY = raw['overflowY'] ?? raw['overflow'];
      const clips = (value: unknown): boolean =>
        ['hidden', 'clip', 'scroll', 'auto'].includes(String(value));
      const box: ReplayBox = {
        left,
        top,
        width: w,
        height: h,
        kind,
        blocked: hidden || block,
        text: slotHost && !block ? '' : text,
        style,
        parent,
        borderX: Math.max(0, parseFloat(String(raw['borderLeftWidth'])) || 0),
        borderY: Math.max(0, parseFloat(String(raw['borderTopWidth'])) || 0),
        visible,
        clip: {
          left: clips(overflowX) ? visible.left : clip.left,
          right: clips(overflowX) ? visible.right : clip.right,
          top: clips(overflowY) ? visible.top : clip.top,
          bottom: clips(overflowY) ? visible.bottom : clip.bottom,
        },
      };
      const index = projected.length;
      projected.push({ box, mask, unmask, block, hiddenTree, depth: (ancestor?.depth ?? -1) + 1 });
      if (scope && compiled) scope.nodes.set(own, { value: mark![own], index });
      if (compiled && kind === 'component' && typeof data['sentryReplayTarget'] === 'string')
        pending = {
          sources: new Set(data['sentryReplayTarget'].split(',')),
          parent: index,
          nodes: new Map(),
          slotText: slotHost && !block ? text : undefined,
        };
    } catch {
      /* 不可读节点安全跳过，不保留原始结果。 */
    }
  }
  // 保留可见节点及其祖先；裁剪掉的子节点不进入录制或点击命中范围。
  const retained = new Set<number>();
  projected.forEach(({ box }, index) => {
    if (box.visible!.right <= box.visible!.left || box.visible!.bottom <= box.visible!.top) return;
    for (
      let cursor = index;
      cursor >= 0 && !retained.has(cursor);
      cursor = projected[cursor]!.box.parent!
    )
      retained.add(cursor);
  });
  const mapping = new Map<number, number>();
  const nodes: ReplayBox[] = [];
  projected.forEach(({ box }, index) => {
    if (!retained.has(index)) return;
    mapping.set(index, nodes.length);
    nodes.push({ ...box, parent: mapping.get(box.parent!) ?? -1 });
  });
  return {
    instrumented: hasRoot,
    width,
    height,
    nodes,
    scrollLeft: number(viewport['scrollLeft']),
    scrollTop: number(viewport['scrollTop']),
    href: 'https://miniapp.invalid/' + route.split(/[?#]/)[0]!.replace(/^\/+/, '').slice(0, 256),
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
/** 使用 rrweb 标准快照；子盒子按实际宿主父节点定位和裁剪。 */
export function frameEvents(frame: ReplayFrame, timestamp: number): eventWithTime[] {
  const boxes = frame.nodes.map((box, index) =>
    element(10 + index * 2, 'div', box.style, [
      { type: 3, id: 11 + index * 2, textContent: box.text },
    ]),
  );
  const roots: serializedNodeWithId[] = [];
  boxes.forEach((node, index) => {
    const parent = frame.nodes[index]!.parent ?? -1;
    const target =
      parent < 0 ? roots : (boxes[parent] as { childNodes: serializedNodeWithId[] }).childNodes;
    target.push(node);
  });
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
          'margin:0;position:relative;overflow:hidden;background:white;font-family:sans-serif;width:' +
            frame.width +
            'px;height:' +
            frame.height +
            'px;',
          roots,
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
  const hit = (box: ReplayBox): boolean => {
    const rect = box.visible ?? {
      left: box.left,
      top: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
    };
    return (
      rect.right > rect.left &&
      rect.bottom > rect.top &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  };
  // 近似层叠不能证明后来查询的节点盖住了屏蔽区域；命中任何屏蔽盒子都不记录坐标。
  if (frame.nodes.some((box) => box.blocked && hit(box))) return undefined;
  let index = frame.nodes.length - 1;
  for (; index >= 0; index--) {
    const box = frame.nodes[index]!;
    if (hit(box)) break;
  }
  if (index >= 0 && frame.nodes[index]!.blocked) return undefined;
  return {
    type: 3,
    timestamp,
    data: { source: 2, type: 2, id: index < 0 ? 5 : 10 + index * 2, x, y },
  };
}
