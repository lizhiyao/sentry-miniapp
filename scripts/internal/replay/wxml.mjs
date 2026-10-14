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

function binding(source, start) {
  for (let end = source.indexOf('}}', start + 2); end >= 0; end = source.indexOf('}}', end + 1)) {
    const expression = source.slice(start + 2, end);
    try {
      try {
        parseExpression(expression);
      } catch {
        parseExpression('({' + expression + '})');
      }
      return { expression, end: end + 2 };
    } catch {
      /* 结束括号可能位于字符串中。 */
    }
  }
  throw new Error('Unclosed or unsupported WXML binding at ' + start);
}

function constant(value, context) {
  let index = context.literals.indexOf(value);
  if (index < 0) {
    index = context.literals.length;
    context.literals.push(value);
  }
  return context.name + '.s[' + index + ']';
}
function expression(source, context) {
  const tree = parseExpression(source),
    edits = [];
  const visit = (node, parent, key) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression')
      throw new Error(
        'Automatic replay text cannot call functions; provide explicit data-sentry-replay-text',
      );
    if (node.type === 'StringLiteral') {
      if (node.extra?.raw?.includes('\\'))
        throw new Error('Escaped WXML text literals need explicit data-sentry-replay-text');
      if (parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed) {
        if (!/^[$A-Z_a-z][$\w]*$/.test(node.value))
          throw new Error('Unsupported quoted WXML object key');
        edits.push({ start: node.start, end: node.end, text: node.value });
      } else edits.push({ start: node.start, end: node.end, text: constant(node.value, context) });
      return;
    }
    for (const [field, value] of Object.entries(node)) {
      if (Array.isArray(value)) value.forEach((child) => visit(child, node, field));
      else if (value && typeof value === 'object') visit(value, node, field);
    }
  };
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
export function textModules(modules) {
  // WXS 会把转义引号／反斜杠变成字面量 \x22／\x27／\x5c，按原字符拼接。
  // 拆开 <，防止常量中的 </wxs> 提前结束脚本块。
  const literal = (value) =>
    "'" +
    value.replace(/[\\'<\r\n]/g, (character) => {
      if (character === '\\') return "'+'\\\\'.charAt(0)+'";
      if (character === "'") return "'+\"'\"+'";
      if (character === '<') return "'+'<'+'";
      return character === '\r' ? '\\r' : '\\n';
    }) +
    "'";
  return [...modules.values()]
    .filter((context) => context?.literals.length)
    .map(
      (context) =>
        '<wxs module="' +
        context.name +
        '">' +
        'var s=' +
        '[' +
        context.literals.map(literal).join(',') +
        ']' +
        ';module.exports={s:s};</wxs>\n',
    )
    .join('');
}
function wxmlAttribute(value) {
  let result = '',
    cursor = 0;
  for (let start = value.indexOf('{{'); start >= 0; start = value.indexOf('{{', cursor)) {
    result += escapeAttribute(value.slice(cursor, start));
    const current = binding(value, start);
    result += value.slice(start, current.end);
    cursor = current.end;
  }
  return result + escapeAttribute(value.slice(cursor));
}

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
    const { end } = binding(source, start);
    safe = safe.slice(0, start) + safe.slice(start, end).replace(/[^\r\n]/g, 'x') + safe.slice(end);
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
        attributes.push({ name, value, quote, start: parser.startIndex, end });
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
          content: [],
        };
        attributes = [];
        (node.parent?.children ?? roots).push(node);
        node.parent?.content.push(node);
        stack.push(node);
      },
      ontext() {
        const text = source.slice(parser.startIndex, parser.endIndex + 1);
        stack.at(-1)?.text.push(text);
        stack.at(-1)?.content.push(text);
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

function condition(attr, context) {
  if (attr.value.startsWith('{{')) {
    const result = binding(attr.value, 0);
    if (result.end === attr.value.length) return '(' + expression(result.expression, context) + ')';
  } else if (!attr.value.includes('{{')) return constant(attr.value, context);
  throw new Error('Replay conditional text needs one WXML binding: ' + attr.name);
}

function guardedText(value, guard, context) {
  let result = '',
    cursor = 0;
  const emit = (text) =>
    '{{ ' + (guard ? '(' + guard + ') ? ' : '') + text + (guard ? " : ''" : '') + ' }}';
  const literal = (text) => (text ? emit(constant(text, context)) : '');
  for (let start = value.indexOf('{{'); start >= 0; start = value.indexOf('{{', cursor)) {
    result += literal(value.slice(cursor, start));
    const current = binding(value, start);
    result += emit(expression(current.expression, context));
    cursor = current.end;
  }
  return result + literal(value.slice(cursor));
}

// block 没有布局盒子；文字留在现有容器，用宿主的插值与条件转换，不另造 DOM。
function hasInlineText(node) {
  return node.content.some((part) =>
    typeof part === 'string' ? !!part.trim() : part.name === 'block' && hasInlineText(part),
  );
}

function defaultSlotBoundary(node, components) {
  const slot = node.children[0];
  return (
    !structural.has(node.name) &&
    !components[node.name] &&
    !privateKinds.has(node.name) &&
    node.children.length === 1 &&
    slot.name === 'slot' &&
    slot.attrs.length === 0 &&
    slot.children.length === 0 &&
    !slot.text.join('').trim() &&
    !hasInlineText(node) &&
    !node.attrs.some((attr) => attr.name === 'data-sentry-replay-text')
  );
}

function slotKey(node, attribute) {
  const attr = node.attrs.find((item) => item.name === attribute);
  if (!attr) return 'd';
  const name = decodeXML(attr.value);
  if (!name || name.includes('{{'))
    throw new Error(
      'Replay slot names need a static non-empty name: ' +
        node.name +
        '。默认插槽请省略名称属性；具名插槽使用静态非空 name/slot，动态名称暂不支持。',
    );
  const key = 'n' + encodeURIComponent(name);
  if (key.length > 256) throw new Error('Replay slot name exceeds metadata budget');
  return key;
}

function slotContainers(roots, components) {
  const containers = new Map(),
    links = new Map();
  const visit = (nodes, parent) =>
    nodes.forEach((node) => {
      if (node.name === 'slot') {
        if (!parent || privateKinds.has(parent.name))
          throw new Error(
            'Replay slot needs a rendered container or static component forwarding boundary',
          );
        if (components[parent.name]) {
          const routes = links.get(parent) || new Set();
          routes.add(slotKey(node, 'name') + '>' + slotKey(node, 'slot'));
          if ([...routes].join(',').length > 1024)
            throw new Error('Replay slot forwarding exceeds metadata budget');
          links.set(parent, routes);
          return;
        }
        const keys = containers.get(parent) || new Set();
        keys.add(slotKey(node, 'name'));
        if ([...keys].join(',').length > 1024)
          throw new Error('Replay slot container exceeds metadata budget');
        containers.set(parent, keys);
      } else visit(node.children, structural.has(node.name) ? parent : node);
    });
  visit(roots);
  return { containers, links };
}

/** 裸插槽文字没有可查询节点，只接受唯一且具备实际布局边界的默认插槽。 */
export function defaultSlotLayout(source, components = {}) {
  let slots = 0,
    boundaries = 0;
  const visit = (nodes, parent, repeated = false) =>
    nodes.forEach((node) => {
      const loop = repeated || node.attrs.some((attr) => attr.name === 'wx:for');
      if (node.name === 'slot' && !node.attrs.some((attr) => attr.name === 'name')) {
        slots++;
        if (!loop && parent && defaultSlotBoundary(parent, components)) boundaries++;
      }
      visit(node.children, node, loop);
    });
  visit(parseWxml(source));
  return { slots, boundaries };
}

function inlineText(node, context, outer = '') {
  let result = '',
    branches = [];
  for (const part of node.content) {
    if (typeof part === 'string') {
      if (part.trim() || !part.includes('\n')) result += guardedText(part, outer, context);
      continue;
    }
    const first = part.attrs.find((attr) => attr.name === 'wx:if');
    const next = part.attrs.find((attr) => attr.name === 'wx:elif');
    const last = part.attrs.some((attr) => attr.name === 'wx:else');
    let own = '';
    if (first) {
      own = condition(first, context);
      branches = [own];
    } else if (next || last) {
      if (!branches.length) throw new Error('Replay conditional text has an unmatched else');
      own = '!(' + branches.join(' || ') + ')';
      if (next) {
        const value = condition(next, context);
        own += ' && ' + value;
        branches.push(value);
      } else branches = [];
    } else branches = [];
    if (part.name !== 'block' || !hasInlineText(part)) continue;
    const text = inlineText(
      part,
      context,
      [outer, own]
        .filter(Boolean)
        .map((value) => '(' + value + ')')
        .join(' && '),
    );
    if (part.attrs.some((attr) => attr.name === 'wx:for'))
      throw new Error('Replay text inside wx:for block needs a rendered text/view boundary');
    result += text;
  }
  return result;
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
export function instrumentWxml(
  source,
  { sourceId, components = {}, slotLayouts, page = false, modules },
) {
  if (source.startsWith(HEADER)) {
    if (modules) throw new Error('Replay project input must be a clean build');
    return source;
  }
  const context = { name: 'sr_replay_' + sourceId.replace(/[^$\w]/g, '_'), literals: [] };
  if (source.includes(context.name)) throw new Error('Reserved replay WXS module: ' + context.name);
  const roots = parseWxml(source),
    edits = [];
  const slots = slotContainers(roots, components);
  let serial = 0;
  const put = (node, name, value, append = false, decoded = false) => {
    const attr = node.attrs.find((item) => item.name === name);
    if (attr && !append) return;
    // 追加 class 保留原引号和绑定源码；绑定内部不是 XML 转义文本。
    const quote = append && attr?.quote ? attr.quote : '"';
    const text =
      name +
      '=' +
      quote +
      (append && attr
        ? attr.value + ' ' + escapeAttribute(value)
        : decoded
          ? wxmlAttribute(value)
          : escapeAttribute(decodeXML(value))) +
      quote;
    if (attr) edits.push({ start: attr.start, end: attr.end, text });
    else {
      const end = source[node.end - 2] === '/' ? node.end - 2 : node.end - 1;
      edits.push({ start: end, end, text: ' ' + text });
    }
  };
  const visit = (nodes, renderParent, assignment) =>
    nodes.forEach((node) => {
      if (
        node.attrs.some((attr) =>
          /^data-sentry-replay-(node|parent|source|target|root|text-format|slot|slots|assigned)$|^mark:sr_/.test(
            attr.name,
          ),
        )
      )
        throw new Error('Reserved replay metadata in source; instrument a clean build');
      if (structural.has(node.name)) {
        if (node.attrs.some((attr) => /^data-sentry-replay-(mask|block|unmask)$/.test(attr.name)))
          throw new Error(
            'Replay privacy controls need a rendered view/text/component, not ' + node.name,
          );
        const assigned = node.attrs.some((attr) => attr.name === 'slot')
          ? slotKey(node, 'slot')
          : assignment;
        if (assigned && (node.name === 'import' || node.name === 'include'))
          throw new Error('Replay named slot include needs an existing rendered boundary');
        visit(node.children, renderParent, assigned);
        return;
      }
      const explicitType = node.attrs.find((attr) => attr.name === 'data-sentry-replay-type');
      if (
        privateKinds.has(node.name) &&
        explicitType &&
        decodeXML(explicitType.value) !== node.name
      )
        throw new Error(
          'Replay private node type conflicts with ' +
            node.name +
            '；请删除冲突的 data-sentry-replay-type，由构建工具生成实际节点类型。',
        );
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
      const entries = slots.containers.get(node) || slots.links.get(node);
      if (entries) put(node, 'data-sentry-replay-slots', [...entries].join(','));
      const assigned = node.attrs.some((attr) => attr.name === 'slot')
        ? slotKey(node, 'slot')
        : assignment;
      if (assigned) put(node, 'data-sentry-replay-assigned', assigned);
      if (defaultSlotBoundary(node, components)) put(node, 'data-sentry-replay-slot', 'true');
      if (!renderParent) {
        if (page) put(node, 'data-sentry-replay-root', 'true');
        // 已有 capture 绑定不可覆盖，避免改变业务语义；记录诊断而非重试业务 handler。
        if (!node.attrs.some((attr) => /^capture-(bind|catch):?tap$/.test(attr.name)))
          put(node, 'capture-bind:tap', '__sentryReplayTap');
      }
      if (
        !privateKinds.has(node.name) &&
        !node.attrs.some((attr) => attr.name === 'data-sentry-replay-text')
      ) {
        const decode = node.attrs.find((attr) => attr.name === 'decode');
        if (node.name === 'text' && decode && decode.value !== '{{false}}')
          throw new Error('Decoded text needs an explicit data-sentry-replay-text value');
        const text = hasInlineText(node) ? inlineText(node, context).trim() : '';
        if (text) {
          if (components[node.name] && slotLayouts?.[node.name] === false)
            throw new Error(
              'Replay component bare text needs one default slot with a direct rendered boundary: ' +
                node.name +
                '。无法确定裸文字的实际插槽位置；请在调用处使用已有布局的 text/view，' +
                '或改选其它页面。不会把文字画在组件宿主或添加包装节点。',
            );
          // 非空常量前缀强制 data 属性走微信文字插值；保留 0、false 和空值的宿主语义。
          put(node, 'data-sentry-replay-text', '\u200b' + text, false, true);
          put(node, 'data-sentry-replay-text-format', 'wxml');
        }
      }
      visit(node.children, node);
    });
  visit(roots, undefined);
  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits)
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  if (modules) modules.set(sourceId, context);
  return HEADER + '\n' + (modules ? '' : textModules(new Map([[sourceId, context]]))) + output;
}
