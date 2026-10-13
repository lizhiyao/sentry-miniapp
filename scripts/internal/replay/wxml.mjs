import { Parser } from 'htmlparser2';
import { parseExpression } from '@babel/parser';
import { decodeXML, escapeAttribute } from 'entities';

const HEADER = '<!-- sentry-miniapp replay metadata v1 -->';
const structural = new Set(['block', 'template', 'import', 'include', 'wxs', 'slot']);
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

// XML 解析保持原始位置；绑定中的比较运算与 WXS 源码不参与标签解析。
function shield(source) {
  const blank = (value) => value.replace(/[^\r\n]/g, ' ');
  let safe = source
    .replace(/<!--[\s\S]*?-->/g, (value) => '<!--' + blank(value.slice(4, -3)) + '-->')
    .replace(
      /(<wxs\b[^>]*>)([\s\S]*?)(<\/wxs\s*>)/g,
      (_value, open, body, close) => open + blank(body) + close,
    );
  for (let start = safe.indexOf('{{'); start >= 0; start = safe.indexOf('{{', start + 2)) {
    let end = safe.indexOf('}}', start + 2);
    for (; end >= 0; end = safe.indexOf('}}', end + 1)) {
      const expression = decodeXML(source.slice(start + 2, end));
      try {
        try {
          parseExpression(expression);
        } catch {
          parseExpression('({' + expression + '})');
        }
        break;
      } catch {
        /* 结束括号可能位于字符串中。 */
      }
    }
    if (end < 0) throw new Error('Unclosed or unsupported WXML binding at ' + start);
    safe =
      safe.slice(0, start) +
      safe.slice(start, end + 2).replace(/[^\r\n]/g, 'x') +
      safe.slice(end + 2);
  }
  return safe;
}

export function parseWxml(source) {
  const input = shield(source);
  const roots = [],
    stack = [];
  let attributes = [];
  const parser = new Parser(
    {
      onattribute(name, _value, quote) {
        let end = parser.startIndex + name.length;
        while (/\s/.test(input[end] || 'x')) end++;
        let value = '';
        if (input[end] === '=') {
          end++;
          while (/\s/.test(input[end] || 'x')) end++;
          const start = end + (quote ? 1 : 0);
          end = quote ? input.indexOf(quote, start) : start;
          if (!quote) while (end < input.length && !/[\s/>]/.test(input[end])) end++;
          value = source.slice(start, end);
          if (quote) end++;
        } else end = parser.startIndex + name.length;
        attributes.push({ name, value, start: parser.startIndex, end });
      },
      onopentag(name) {
        const node = {
          name,
          attrs: attributes,
          start: parser.startIndex,
          end: parser.endIndex + 1,
          parent: stack.at(-1),
          children: [],
          text: [],
        };
        attributes = [];
        (node.parent?.children ?? roots).push(node);
        stack.push(node);
      },
      ontext() {
        stack.at(-1)?.text.push(source.slice(parser.startIndex, parser.endIndex + 1));
      },
      onclosetag(name, implied) {
        const node = stack.pop();
        if (
          !node ||
          node.name !== name ||
          (implied && !source.slice(node.start, node.end).endsWith('/>'))
        )
          throw new Error('Malformed WXML near ' + parser.startIndex);
      },
    },
    { xmlMode: true, decodeEntities: false },
  );
  parser.end(input);
  return roots;
}

export function dependencies(source) {
  const files = [];
  const visit = (nodes) =>
    nodes.forEach((node) => {
      if (node.name === 'import' || node.name === 'include') {
        const path = node.attrs.find((attr) => attr.name === 'src')?.value;
        if (path) files.push(decodeXML(path));
      }
      visit(node.children);
    });
  visit(parseWxml(source));
  return files;
}

/** 只改 WXML 元数据与中性 capture handler；不改业务 JS、事件绑定或样式值。 */
export function instrumentWxml(source, { sourceId, components = {}, page = false }) {
  if (source.startsWith(HEADER)) return source;
  const roots = parseWxml(source),
    edits = [];
  let serial = 0;
  const put = (node, name, value, append = false) => {
    const attr = node.attrs.find((item) => item.name === name);
    if (attr && !append) return;
    const text =
      name +
      '="' +
      escapeAttribute((append && attr ? decodeXML(attr.value) + ' ' : '') + decodeXML(value)) +
      '"';
    if (attr) edits.push({ start: attr.start, end: attr.end, text });
    else {
      const end = source[node.end - 2] === '/' ? node.end - 2 : node.end - 1;
      edits.push({ start: end, end, text: ' ' + text });
    }
  };
  const visit = (nodes, renderParent) =>
    nodes.forEach((node) => {
      if (
        node.attrs.some((attr) =>
          /^data-sentry-replay-(node|parent|source|target|root)$|^mark:sr_/.test(attr.name),
        )
      )
        throw new Error('Reserved replay metadata in source; instrument a clean build');
      if (structural.has(node.name)) {
        visit(node.children, renderParent);
        return;
      }
      const own = 'sr_' + sourceId + '_' + serial++;
      node.replayNode = own;
      const loop = node.attrs.find((attr) => attr.name === 'wx:for');
      const index = node.attrs.find((attr) => attr.name === 'wx:for-index')?.value || 'index';
      if (loop && !/^[$\w]+$/.test(index)) throw new Error('Invalid wx:for-index');
      put(
        node,
        'class',
        'sentry-replay' + (page && !renderParent ? ' sentry-replay-root' : ''),
        true,
      );
      put(node, 'mark:' + own, loop ? '{{' + index + '}}' : 'true');
      put(node, 'data-sentry-replay-node', own);
      put(node, 'data-sentry-replay-parent', renderParent?.replayNode || '');
      put(node, 'data-sentry-replay-source', sourceId);
      put(node, 'data-sentry-replay-type', components[node.name] ? 'component' : node.name);
      if (components[node.name])
        put(node, 'data-sentry-replay-target', components[node.name].join(','));
      if (!renderParent) {
        if (page) put(node, 'data-sentry-replay-root', 'true');
        // 已有 capture 绑定不可覆盖，避免改变业务语义；记录诊断而非重试业务 handler。
        if (!node.attrs.some((attr) => /^capture-(bind|catch):?tap$/.test(attr.name)))
          put(node, 'capture-bind:tap', '__sentryReplayTap');
      }
      if (!privateKinds.has(node.name) && node.text.some((text) => text.trim()))
        put(node, 'data-sentry-replay-text', node.text.join('').trim());
      visit(node.children, node);
    });
  visit(roots, undefined);
  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits)
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return HEADER + '\n' + output;
}
