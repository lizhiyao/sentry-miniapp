#!/usr/bin/env node

import { basename } from 'node:path';
import { gzipSync } from 'node:zlib';
import { packageEntryFiles } from './package-entry-files.mjs';

// 只约束实际执行的 JS；Source Map、声明文件和 npm 总量不能代表小程序接入成本。
const budgets = {
  'sentry-miniapp.mjs': 260 * 1024,
  'sentry-miniapp.cjs.js': 255 * 1024,
  'sentry-miniapp-lite.mjs': 220 * 1024,
  'sentry-miniapp-lite.cjs.js': 225 * 1024,
  'sentry-miniapp.umd.js': 255 * 1024,
  'sentry-miniapp.js': 255 * 1024,
};
const files = process.argv.slice(2);
if (files.length === 0) throw new Error('Usage: check-bundle-size.mjs <bundle.js> [...]');

let failed = false;
for (const file of files) {
  const limit = budgets[basename(file)];
  if (limit === undefined) throw new Error(`No bundle size budget for ${file}`);
  const closure = await packageEntryFiles(file);
  const bytes = Buffer.from([...closure.values()].map(({ code }) => code).join(''));
  if (basename(file).includes('-lite.')) {
    for (const dependency of closure.keys()) {
      if (/^polyfills(?:-|\.)/.test(basename(dependency)))
        throw new Error(`Lite entry retained compatibility code: ${dependency}`);
    }
  }
  const gzip = gzipSync(bytes).byteLength;
  console.log(
    `${file}: ${bytes.byteLength} bytes (${closure.size} files), combined gzip ${gzip} bytes, budget ${limit} bytes`,
  );
  if (bytes.byteLength > limit) {
    console.error(`${file} exceeds its raw JS budget by ${bytes.byteLength - limit} bytes`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
