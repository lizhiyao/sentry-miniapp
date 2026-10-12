#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { parseSync } from '@babel/core';

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('Usage: node scripts/internal/check-build-output.mjs <bundle.js> [...]');
  process.exit(1);
}

function inspectNode(node, problems) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (node.type === 'YieldExpression') {
    problems.add('yield expression');
  }

  if (node.generator === true) {
    problems.add('generator function');
  }

  if (
    (node.type === 'StringLiteral' || node.type === 'Literal') &&
    typeof node.value === 'string' &&
    node.value.startsWith('@babel/runtime')
  ) {
    problems.add(`external Babel runtime helper: ${node.value}`);
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        inspectNode(item, problems);
      }
    } else {
      inspectNode(value, problems);
    }
  }
}

let failed = false;

for (const file of files) {
  const code = await readFile(file, 'utf8');
  const ast = parseSync(code, {
    babelrc: false,
    configFile: false,
    filename: file,
    sourceType: 'unambiguous',
  });
  const problems = new Set();

  inspectNode(ast, problems);

  if (problems.size > 0) {
    failed = true;
    console.error(`${file}: ${Array.from(problems).join(', ')}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Build compatibility check passed for ${files.length} bundle(s).`);
