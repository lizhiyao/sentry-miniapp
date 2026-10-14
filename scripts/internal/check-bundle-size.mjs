#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { gzipSync } from 'node:zlib';

// 只约束实际执行的 JS；Source Map、声明文件和 npm 总量不能代表小程序接入成本。
const budgets = {
  // 组件树、裁剪、隐私继承与错误前缓冲的可选执行入口；主文件预算不变。
  'sentry-miniapp-replay.mjs': 26.5 * 1024,
  'sentry-miniapp-replay.cjs.js': 26.5 * 1024,
  'sentry-miniapp-replay.js': 26.5 * 1024,
  'sentry-miniapp.mjs': 260 * 1024,
  'sentry-miniapp.cjs.js': 255 * 1024,
  'sentry-miniapp.umd.js': 255 * 1024,
  'sentry-miniapp.js': 255 * 1024,
};
const files = process.argv.slice(2);
if (files.length === 0) throw new Error('Usage: check-bundle-size.mjs <bundle.js> [...]');

let failed = false;
for (const file of files) {
  const limit = budgets[basename(file)];
  if (limit === undefined) throw new Error(`No bundle size budget for ${file}`);
  const bytes = await readFile(file);
  const gzip = gzipSync(bytes).byteLength;
  console.log(`${file}: ${bytes.byteLength} bytes, gzip ${gzip} bytes, budget ${limit} bytes`);
  if (bytes.byteLength > limit) {
    console.error(`${file} exceeds its raw JS budget by ${bytes.byteLength - limit} bytes`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
