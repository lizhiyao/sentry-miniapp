import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';
import { parseSync } from '@babel/core';

// 这些模块导出可变的注册表、计数器或配置，不能在两种模式间共享实例。
const separateState = new Set(['hidden-keys.js', 'iterators.js', 'uid.js', 'is-forced.js']);
const reviewedVersion = '3.50.0';

function dependencies(code) {
  const ast = parseSync(code, { babelrc: false, configFile: false, sourceType: 'script' });
  const result = [];
  let safe = true;
  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier' && node.name === 'require') {
      if (
        parent?.type !== 'CallExpression' ||
        parent.callee !== node ||
        parent.arguments.length !== 1 ||
        parent.arguments[0].type !== 'StringLiteral' ||
        !parent.arguments[0].value.startsWith('.')
      )
        safe = false;
      else result.push(parent.arguments[0].value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else if (value && typeof value === 'object') visit(value, node);
    }
  }
  visit(ast, null);
  return safe ? result : null;
}

/** 只共享已审查版本中源码及完整依赖闭包一致的基础模块。 */
export function shareCorejsHelpers() {
  const require = createRequire(import.meta.url);
  const roots = ['core-js', 'core-js-pure'].map((name) =>
    dirname(require.resolve(`${name}/package.json`)),
  );
  for (const root of roots) {
    const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    if (version !== reviewedVersion) {
      throw new Error(
        `Review core-js helper sharing before upgrading ${version} (expected ${reviewedVersion})`,
      );
    }
  }
  const edges = new Map();
  for (const name of readdirSync(resolve(roots[0], 'internals'))) {
    if (!name.endsWith('.js') || separateState.has(name)) continue;
    const paths = roots.map((root) => resolve(root, 'internals', name));
    let code;
    try {
      code = readFileSync(paths[0], 'utf8');
      if (code !== readFileSync(paths[1], 'utf8')) continue;
    } catch (_error) {
      continue;
    }
    const imports = dependencies(code);
    if (!imports) continue;
    const targets = imports.map((source) => {
      const path = resolve(dirname(paths[0]), source);
      return relative(roots[0], path.endsWith('.js') ? path : `${path}.js`)
        .split(sep)
        .join('/');
    });
    edges.set(`internals/${name}`, targets);
  }
  // 源码相同还不够：间接依赖模式标记、path/export 或独立状态的模块也必须分开。
  let changed;
  do {
    changed = false;
    for (const [name, targets] of edges) {
      if (targets.some((target) => !edges.has(target))) {
        edges.delete(name);
        changed = true;
      }
    }
  } while (changed);
  const shared = new Map(
    [...edges.keys()].map((name) => [resolve(roots[1], name), resolve(roots[0], name)]),
  );
  return {
    name: 'sentry-miniapp-share-corejs-helpers',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return;
      const path = resolve(dirname(importer), source);
      return shared.get(path) ?? shared.get(`${path}.js`);
    },
  };
}
