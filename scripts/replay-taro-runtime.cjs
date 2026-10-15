// 构建插件仅在 Taro 微信项目注入；这里使用 Taro 虚拟节点，不访问渲染层 DOM。
const { document, MutationObserver } = require('sentry-miniapp-taro-host');
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
const limit = 2000;
function update(node) {
  if (!node || node.nodeType !== 1) return;
  let text = '';
  if (!privateKinds.has(node.nodeName.toLowerCase())) {
    const children = node.childNodes;
    for (let index = 0; index < children.length && index < 256 && text.length < 256; index++)
      if (children[index].nodeType === 3) text += children[index].textContent;
  }
  const values = { srReplayText: text.slice(0, 256) };
  for (const name of ['block', 'mask', 'unmask']) {
    const value = node.getAttribute('data-sentry-replay-' + name);
    values['srReplay' + name] = value === true || value === 'true';
  }
  for (const key of Object.keys(values)) {
    const value = values[key];
    if (node.getAttribute(key) !== value && String(node.getAttribute(key)) !== String(value))
      node.setAttribute(key, value);
  }
}
function touch(node, budget) {
  if (!node || budget.remaining <= 0 || budget.seen.has(node)) return false;
  budget.remaining--;
  budget.seen.add(node);
  update(node);
  return true;
}
function visit(node, budget) {
  if (!touch(node, budget)) return;
  for (const child of node.childNodes || []) {
    if (budget.remaining <= 0) break;
    visit(child, budget);
  }
}
const budget = () => ({ remaining: limit, seen: new Set() });
try {
  const observer = new MutationObserver((records) => {
    const work = budget();
    const targets = new Set(),
      roots = new Set();
    for (const record of records) {
      if (targets.size + roots.size >= limit) break;
      if (record.type === 'characterData') targets.add(record.target.parentNode);
      else if (record.type === 'childList') {
        targets.add(record.target);
        for (const node of record.addedNodes || []) {
          if (targets.size + roots.size >= limit) break;
          roots.add(node);
        }
      } else if (
        record.type === 'attributes' &&
        /^data-sentry-replay-(block|mask|unmask)$/.test(record.attributeName)
      )
        targets.add(record.target);
    }
    for (const node of roots) {
      try {
        visit(node, work);
      } catch (_) {
        /* 不阻断框架更新。 */
      }
    }
    for (const node of targets) {
      try {
        touch(node, work);
      } catch (_) {
        /* 不阻断框架更新。 */
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    attributes: true,
    subtree: true,
  });
  visit(document.body, budget());
} catch (_) {
  /* 缺少观测能力时保留布局与遮蔽，不干扰业务。 */
}
