#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { TraceMap, allGeneratedPositionsFor, originalPositionFor } from '@jridgewell/trace-mapping';

const [sourceArgument, javascriptArgument, mapArgument] = process.argv.slice(2);
assert.ok(
  sourceArgument && javascriptArgument && mapArgument,
  'Usage: check-framework-sourcemaps.mjs <business-source> <generated-js> <map>',
);

const source = await readFile(resolve(sourceArgument), 'utf8');
const javascript = await readFile(resolve(javascriptArgument), 'utf8');
const raw = JSON.parse(await readFile(resolve(mapArgument), 'utf8'));
assert.equal(raw.version, 3, 'source map must use version 3');
assert.equal(basename(raw.file), basename(javascriptArgument), 'map must target the generated JS');

// 框架可能同时给业务文件和生成的 Page 包装器使用相近名称；按原始内容识别业务来源。
const sourceIndex = raw.sourcesContent?.findIndex((content) => content === source) ?? -1;
assert.ok(sourceIndex >= 0, 'map must retain the exact original business source');
const traceMap = new TraceMap(raw);
const sourceLines = source.split('\n');
const javascriptLines = javascript.split('\n');
let verified = 0;

for (const [index, line] of sourceLines.entries()) {
  const column = line.indexOf('new Error(');
  if (column < 0) continue;

  const generatedPositions = allGeneratedPositionsFor(traceMap, {
    source: raw.sources[sourceIndex],
    line: index + 1,
    column,
  });
  const exact = generatedPositions.find((position) => {
    const original = originalPositionFor(traceMap, position);
    return (
      original.source === raw.sources[sourceIndex] &&
      original.line === index + 1 &&
      original.column === column &&
      javascriptLines[position.line - 1]?.slice(position.column).startsWith('new Error(')
    );
  });
  assert.ok(exact, `business Error at ${sourceArgument}:${index + 1} must round-trip from the JS`);
  verified++;
}

assert.ok(verified > 0, 'business source must contain an Error fixture');
console.log(`Verified ${verified} business Error mappings: ${sourceArgument}`);
