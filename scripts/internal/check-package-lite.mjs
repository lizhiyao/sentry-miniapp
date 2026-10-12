import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageEntryFiles } from './package-entry-files.mjs';

/** 精简入口须真正排除兼容库，并在入口混用时共享 client 和监听归属。 */
export async function checkPackageLite(tempRoot, packageRoot, runNode) {
  const failures = [
    'globalThis',
    'includes',
    'entries',
    'values',
    'fromEntries',
    'allSettled',
    'isWellFormed',
    'toWellFormed',
    'URLSearchParams',
    'partial-query',
  ];
  for (const format of ['esm', 'cjs']) {
    const extension = format === 'esm' ? 'mjs' : 'cjs.js';
    const closure = await packageEntryFiles(
      join(packageRoot, 'dist', `sentry-miniapp-lite.${extension}`),
    );
    for (const file of closure.keys()) {
      assert.ok(
        !/\/polyfills(?:-|\.)/.test(file),
        `Lite dependency contains compatibility chunk: ${file}`,
      );
      try {
        const map = JSON.parse(await readFile(`${file}.map`, 'utf8'));
        assert.ok(
          !map.sources.some((source) => /core-js|polyfills-bootstrap/.test(source)),
          `Lite map contains compatibility sources: ${file}`,
        );
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const load = format === 'esm' ? 'await import(name)' : 'require(name)';
    if (format === 'cjs') {
      const legacyConsumer = join(tempRoot, 'lite-legacy.cjs');
      await writeFile(
        legacyConsumer,
        `const assert = require('node:assert/strict');\nassert.equal(require(${JSON.stringify(join(packageRoot, 'lite.js'))}), require('sentry-miniapp/lite'));\n`,
      );
      await runNode(legacyConsumer, tempRoot);
    }
    const file = join(tempRoot, `lite-boundaries.${format === 'esm' ? 'mjs' : 'cjs'}`);
    await writeFile(
      file,
      `
${format === 'esm' ? "import assert from 'node:assert/strict';" : "const assert = require('node:assert/strict');"}
async function main() {
const load = async name => ${load};
const mode = process.argv[2];
const root = globalThis;
const carrier = root.__SENTRY__;
if (mode.startsWith('missing:')) {
  const key = mode.slice(8);
  if (key === 'globalThis') root.globalThis = undefined;
  else if (key === 'URLSearchParams') root.URLSearchParams = undefined;
  else if (key === 'partial-query') root.URLSearchParams = class {};
  else if (key === 'includes') Array.prototype.includes = undefined;
  else if (['entries', 'values', 'fromEntries'].includes(key)) Object[key] = undefined;
  else if (key === 'allSettled') Promise.allSettled = undefined;
  else String.prototype[key] = undefined;
  let failure;
  try { await load('sentry-miniapp/lite'); } catch (error) { failure = error; }
  assert.ok(failure);
  assert.match(failure.message, /\\[sentry-miniapp\\/lite\\] Missing runtime capabilities:/);
  assert.ok(failure.message.includes(key === 'partial-query' ? 'URLSearchParams' : key));
  assert.equal(root.__SENTRY__, carrier, 'Failed lite import evaluated Core');
  if (key !== 'globalThis') {
    const sdk = await load('sentry-miniapp');
    assert.equal(typeof sdk.init, 'function', 'Default import did not recover after lite failure');
  }
  return;
}
const requests = [];
let errorsInstalled = 0;
root.TextEncoder = undefined;
root.URL = undefined;
root.Reflect = undefined;
root.wx = {
  request(options) { requests.push(options.data); options.success?.({ statusCode: 200, data: {} }); return { abort() {} }; },
  onError() { errorsInstalled++; },
};
const first = await load(mode === 'lite-first' ? 'sentry-miniapp/lite' : 'sentry-miniapp');
const options = { dsn: 'https://key@example.com/1', enableAutoSessionTracking: false, enableOfflineCache: false, requireConsent: true };
const a = first.init(options);
assert.ok(a);
assert.equal(first.getConsent(), false);
const second = await load(mode === 'lite-first' ? 'sentry-miniapp' : 'sentry-miniapp/lite');
assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort());
for (const key of Object.keys(first)) assert.equal(first[key], second[key], 'Entry identity differs: ' + key);
assert.equal(second.getClient(), a);
second.setConsent(true);
assert.equal(first.getConsent(), true);
first.captureException(new Error('shared entry A'));
assert.equal(await second.flush(500), true);
const b = second.init(options);
assert.ok(b instanceof first.MiniappClient);
assert.notEqual(a, b);
assert.equal(first.getClient(), b);
assert.equal(errorsInstalled, 1, 'Missing offError accumulated host listeners');
second.setConsent(true);
first.captureException(new Error('shared entry B'));
second.logger.info('shared entry 中🙂\\ud800');
assert.equal(await first.flush(500), true);
assert.equal(requests.filter(data => typeof data === 'string' && data.includes('shared entry A')).length, 1);
assert.equal(requests.filter(data => typeof data === 'string' && data.includes('shared entry B')).length, 1);
assert.ok(requests.some(data => typeof data === 'string' && data.includes('shared entry 中🙂�')), 'Lite did not retain UTF-8 encoder fallback');
await second.close(500);
assert.equal(first.getClient(), second.getClient());
}
main().catch(error => { console.error(error); process.exitCode = 1; });
`,
    );
    for (const mode of [
      ...failures.map((name) => `missing:${name}`),
      'lite-first',
      'default-first',
    ]) {
      const result = await runNode(file, tempRoot, { scriptArgs: [mode] });
      assert.equal(result.stderr, '', result.stderr);
    }
    console.log(`Packaged ${format} lite preflight, encoder fallback and shared lifecycle passed.`);
  }
}
