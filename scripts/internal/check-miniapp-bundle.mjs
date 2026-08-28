#!/usr/bin/env node

import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

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

console.log(`Mini program bundle smoke test passed: ${bundleArgument}`);
