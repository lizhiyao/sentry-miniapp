#!/usr/bin/env node

import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const [bundleArgument] = process.argv.slice(2);

if (!bundleArgument) {
  console.error('Usage: node scripts/internal/check-miniapp-bundle.mjs <bundle.js>');
  process.exit(1);
}

const bundlePath = resolve(bundleArgument);
const sourceMapPath = `${bundlePath}.map`;
const code = await readFile(bundlePath, 'utf8');
const sourceMap = JSON.parse(await readFile(sourceMapPath, 'utf8'));

assert.equal(sourceMap.version, 3, 'source map must use version 3');
assert.ok(sourceMap.sources?.length > 0, 'source map must contain sources');
assert.ok(
  code.includes(`sourceMappingURL=${basename(sourceMapPath)}`),
  'bundle must reference its adjacent source map',
);

const tempDirectory = await mkdtemp(join(tmpdir(), 'sentry-miniapp-bundle-'));
const isolatedBundlePath = join(tempDirectory, 'sentry-miniapp.cjs');

try {
  await copyFile(bundlePath, isolatedBundlePath);

  // Loading outside the repository catches accidental runtime dependencies.
  const require = createRequire(import.meta.url);
  const sdk = require(isolatedBundlePath);

  for (const exportName of ['init', 'captureException', 'startSpan', 'getDiagnostics']) {
    assert.equal(typeof sdk[exportName], 'function', `missing function export: ${exportName}`);
  }

  assert.equal(typeof sdk.logger, 'object', 'missing logger export');
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}

// 在无 DOM 的 VM 中执行实际产物，验证产生的事件与上传路径／source map 一致。
const envelopes = [];
const moduleObject = { exports: {} };
const sandbox = {
  module: moduleObject,
  exports: moduleObject.exports,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  wx: { request() {} },
  window: {},
};
sandbox.window.Error = runInNewContext('Error', sandbox);
// CLI 注入优先使用 window；core 使用 globalThis，二者故意分离以检查 SDK 桥接。
const filename = basename(bundlePath);
const sdk = runInNewContext(`${code}\n;module.exports`, sandbox, {
  filename: `appservice/${filename}`,
});
const owner = sdk.init({
  dsn: 'https://key@example.com/1',
  release: 'symbolication-smoke@2.0',
  defaultIntegrations: [sdk.rewriteFramesIntegration()],
  transport: () => ({
    send: (envelope) => {
      envelopes.push(envelope);
      return Promise.resolve({});
    },
    flush: () => Promise.resolve(true),
  }),
});
try {
  let failure;
  try {
    sdk.init({ traceLifecycle: 'static' });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'bundled init must enforce stream-only before retiring owner');
  owner.captureException(failure);
  await owner.flush();
  const event = envelopes
    .flatMap((envelope) => envelope[1])
    .find((item) => item[0].type === 'event')?.[1];
  assert.ok(event, 'actual bundled error must reach the owner transport');
  const frame = event.exception.values[0].stacktrace.frames
    .filter((frame) => frame.filename === `app:///${filename}`)
    .at(-1);
  assert.ok(frame, 'final filename must match upload artifact');
  // core 可以从 filename 形成 debug_meta，不为没有证据的 abs_path 增加兼容层。
  assert.equal(frame.abs_path, undefined);
  const original = originalPositionFor(new TraceMap(sourceMap), {
    line: frame.lineno,
    column: frame.colno - 1,
  });
  assert.ok(original.source?.endsWith('/src/client.ts'), JSON.stringify(original));
  const source = sourceMap.sourcesContent[sourceMap.sources.indexOf(original.source)];
  assert.ok(
    source.split('\n')[original.line - 1].includes('Error'),
    'map must resolve the actual throw',
  );
  if (sourceMap.debugId) {
    assert.deepEqual(JSON.parse(JSON.stringify(event.debug_meta.images)), [
      { type: 'sourcemap', code_file: frame.filename, debug_id: sourceMap.debugId },
    ]);
    assert.ok(
      Object.keys(sandbox.window._sentryDebugIds).length,
      'window Debug ID must be bridged to core',
    );
  }
  console.log(
    JSON.stringify({
      symbolication: 'pass',
      filename: frame.filename,
      generated: { line: frame.lineno, column: frame.colno },
      original,
      debugId: sourceMap.debugId ?? null,
      debugMeta: event.debug_meta ?? null,
    }),
  );
} finally {
  owner.dispose();
}

console.log(`Mini program bundle smoke and symbolication checks passed: ${bundleArgument}`);
