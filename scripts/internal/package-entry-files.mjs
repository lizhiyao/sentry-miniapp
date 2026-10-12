import { readFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { parseSync } from '@babel/core';

/** 沿发布文件的静态本地依赖计算完整入口，不能只测小型 facade。 */
export async function packageEntryFiles(entry) {
  const root = dirname(resolve(entry));
  const files = new Map();
  async function visit(file) {
    if (files.has(file)) return;
    const code = await readFile(file, 'utf8');
    const ast = parseSync(code, { babelrc: false, configFile: false, sourceType: 'unambiguous' });
    files.set(file, { code, ast });
    const imports = new Set();
    function inspect(node) {
      if (!node || typeof node !== 'object') return;
      if (
        ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)
      ) {
        if (node.source) imports.add(node.source.value);
      }
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require'
      ) {
        if (node.arguments.length !== 1 || node.arguments[0].type !== 'StringLiteral')
          throw new Error(`Non-static require in ${file}`);
        imports.add(node.arguments[0].value);
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue;
        if (Array.isArray(value)) value.forEach(inspect);
        else if (value && typeof value === 'object') inspect(value);
      }
    }
    inspect(ast);
    for (const source of imports) {
      if (!source.startsWith('.'))
        throw new Error(`External runtime dependency in ${file}: ${source}`);
      const target = resolve(dirname(file), source);
      if (relative(root, target).startsWith('..'))
        throw new Error(`Dependency escapes package output: ${source}`);
      await visit(target);
    }
  }
  await visit(resolve(entry));
  return files;
}
