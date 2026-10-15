import { escapeAttribute } from 'entities';
import { parseWxml } from './wxml.mjs';

const structural = new Set(['template', 'block', 'import', 'include', 'wxs', 'slot']);
const privateKinds = new Set([
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
const header = '<!-- sentry-miniapp replay metadata v1 -->';
const value = (node, name) => node.attrs.find((attr) => attr.name === name)?.value;

export function isTaroBase(source) {
  return parseWxml(source).some((node) => value(node, 'name') === 'taro_tmpl');
}

/** Taro 的模板实例以 sid 区分；模板编号只用作微信祖先 mark 的静态键。 */
export function instrumentTaroBase(source, { sourceId, components }) {
  if (source.startsWith(header)) throw new Error('Replay project input must be a clean build');
  const roots = parseWxml(source);
  const plain = roots.find(
    (node) =>
      /^tmpl_0_\w+$/.test(value(node, 'name') || '') &&
      node.children.length === 1 &&
      node.children[0].name === 'block' &&
      node.children[0].text.join('').trim() === '{{i.v}}',
  );
  if (!plain) throw new Error('Unsupported Taro text template; use the standard WeChat compiler');
  const module = 'sr_taro_' + sourceId;
  if (/sr_replay_root|mark:sr_|data-sentry-replay-/.test(source) || source.includes(module))
    throw new Error('Reserved replay metadata in Taro source');
  const edits = [];
  let serial = 0;
  const put = (node, name, text, append = false) => {
    const attr = node.attrs.find((item) => item.name === name);
    const quote = attr?.quote || '"';
    const content =
      name + '=' + quote + (attr && append ? attr.value + ' ' : '') + escapeAttribute(text) + quote;
    if (attr) edits.push({ start: attr.start, end: attr.end, text: content });
    else {
      const end = source[node.end - 2] === '/' ? node.end - 2 : node.end - 1;
      edits.push({ start: end, end, text: ' ' + content });
    }
  };
  const visit = (nodes, template) => {
    for (const node of nodes) {
      const definition = value(node, 'name');
      if (node.name === 'template' && definition) template = definition;
      if (!structural.has(node.name)) {
        if (
          value(node, 'data-sid') !== '{{i.sid}}' &&
          !(node.name === 'comp' && value(node, 'i') === '{{i}}')
        )
          throw new Error('Unsupported Taro rendered node: ' + node.name);
        const own = 'sr_' + sourceId + '_' + serial++;
        put(node, 'class', 'sentry-replay sentry-replay-root', true);
        put(node, 'mark:' + own, '{{i.sid}}');
        put(node, 'data-sentry-replay-node', own);
        put(node, 'data-sentry-replay-source', sourceId);
        put(node, 'data-sentry-replay-root', '{{sr_replay_root}}');
        put(node, 'data-sentry-replay-type', components[node.name] ? 'component' : node.name);
        if (components[node.name])
          put(node, 'data-sentry-replay-target', components[node.name].join(','));
        for (const privacy of ['block', 'mask', 'unmask'])
          put(
            node,
            'data-sentry-replay-' + privacy,
            '{{i.srReplay' + privacy + '||' + module + ".c(i.cl,'sentry-" + privacy + "')}}",
          );
        if (!privateKinds.has(node.name)) {
          put(node, 'data-sentry-replay-text', '\u200b{{i.srReplayText}}');
          put(node, 'data-sentry-replay-text-format', 'wxml');
        }
        if (!node.attrs.some((attr) => /^capture-(bind|catch):?tap$/.test(attr.name)))
          put(node, 'capture-bind:tap', '__sentryReplayTap');
      }
      // 只把入口身份传给页面第一层；后续模板不继承 root 标记。
      if (template === 'taro_tmpl' && node.name === 'template' && value(node, 'is')) {
        const data = value(node, 'data');
        if (!data?.startsWith('{{i:item,') || !data.endsWith('}}'))
          throw new Error('Unsupported Taro page template data');
        put(node, 'data', data.slice(0, -2) + ',sr_replay_root:sr_replay_root}}');
      }
      visit(node.children, template);
    }
  };
  visit(roots);
  if (!serial) throw new Error('Empty Taro template');
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const helper =
    '<wxs module="' +
    module +
    '">module.exports={' +
    'c:function(s,n){return (" "+(s||"").replace(getRegExp("[\\t\\r\\n ]+","g")," ")+" ").indexOf(" "+n+" ")>=0}};</wxs>\n';
  return header + '\n' + helper + source;
}

export function instrumentTaroPage(source) {
  const roots = parseWxml(source);
  const calls = roots.filter(
    (node) => node.name === 'template' && value(node, 'is') === 'taro_tmpl',
  );
  if (calls.length !== 1 || value(calls[0], 'data') !== '{{root:root}}')
    throw new Error('Unsupported Taro page entry; use the standard WeChat compiler');
  const attr = calls[0].attrs.find((item) => item.name === 'data');
  return (
    source.slice(0, attr.start) +
    'data="{{root:root,sr_replay_root:true}}"' +
    source.slice(attr.end)
  );
}
