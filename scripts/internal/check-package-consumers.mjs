#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { pack, unpack } from '@publint/pack';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requiredExports = [
  'Integrations',
  'SDK_VERSION',
  'Transports',
  'addBreadcrumb',
  'captureException',
  'captureMessage',
  'init',
  'logger',
  'miniappStackParser',
  'setUser',
  'startSpan',
];

async function writeConsumer(file, source) {
  await writeFile(file, source, 'utf8');
}

async function runNode(file, cwd, { nodeArgs = [], scriptArgs = [] } = {}) {
  return execFileAsync(process.execPath, [...nodeArgs, file, ...scriptArgs], {
    cwd,
    encoding: 'utf8',
  });
}

async function unpackPackage(tarball, packageRoot) {
  const { files, rootDir } = await unpack(await readFile(tarball));
  const rootPrefix = `${rootDir}/`;

  for (const file of files) {
    assert(file.name.startsWith(rootPrefix), `Unexpected tarball entry: ${file.name}`);
    const relativeName = file.name.slice(rootPrefix.length);
    if (!relativeName) continue;

    const destination = join(packageRoot, relativeName);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.data);
  }
}

function runtimeProbe(moduleSyntax) {
  const required = JSON.stringify(requiredExports);
  const load =
    moduleSyntax === 'esm'
      ? "import * as sdk from 'sentry-miniapp';\nimport assert from 'node:assert/strict';"
      : "const sdk = require('sentry-miniapp');\nconst assert = require('node:assert/strict');";

  return `${load}
const required = ${required};
for (const name of required) {
  assert.ok(name in sdk, \`Missing public export: \${name}\`);
}
process.stdout.write(JSON.stringify({
  keys: Object.keys(sdk).sort(),
  version: sdk.SDK_VERSION,
}));
`;
}

const typeProbe = `
import {
  Integrations,
  Transports,
  captureException,
  init,
  logger,
  miniappStackParser,
  type MiniappOptions,
  type PerformanceIntegrationOptions,
} from 'sentry-miniapp';

declare const options: MiniappOptions;
const performanceOptions: PerformanceIntegrationOptions = {};

init(options);
captureException(new Error('consumer type probe'));
logger.info('consumer type probe');
Integrations.performanceIntegration(performanceOptions);
Transports.createMiniappTransport;
miniappStackParser;
`;

const tempRoot = await mkdtemp(join(tmpdir(), 'sentry-miniapp-package-consumers-'));

try {
  const tarball = await pack(repoRoot, {
    destination: tempRoot,
    packageManager: 'yarn',
  });
  const nodeModules = join(tempRoot, 'node_modules');
  const packageRoot = join(nodeModules, 'sentry-miniapp');

  await mkdir(packageRoot, { recursive: true });
  await unpackPackage(tarball, packageRoot);
  await cp(join(repoRoot, 'node_modules/@sentry'), join(nodeModules, '@sentry'), {
    dereference: true,
    recursive: true,
  });

  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  await Promise.all([
    access(join(packageRoot, packageJson.exports['.'].import.types)),
    access(join(packageRoot, packageJson.exports['.'].require.types)),
  ]);
  await writeConsumer(
    join(tempRoot, 'package.json'),
    JSON.stringify({ name: 'sentry-miniapp-consumer-smoke', private: true, type: 'module' }),
  );

  const cjsConsumer = join(tempRoot, 'consumer.cjs');
  const esmConsumer = join(tempRoot, 'consumer.mjs');
  await writeConsumer(cjsConsumer, runtimeProbe('cjs'));
  await writeConsumer(esmConsumer, runtimeProbe('esm'));

  const cjsExecution = await runNode(cjsConsumer, tempRoot);
  const esmExecution = await runNode(esmConsumer, tempRoot);
  assert.equal(cjsExecution.stderr, '', `CJS import emitted stderr:\n${cjsExecution.stderr}`);
  assert.equal(esmExecution.stderr, '', `ESM import emitted stderr:\n${esmExecution.stderr}`);

  const cjsResult = JSON.parse(cjsExecution.stdout);
  const esmResult = JSON.parse(esmExecution.stdout);
  assert.deepEqual(esmResult.keys, cjsResult.keys, 'ESM and CJS exports differ');
  assert.equal(
    cjsResult.version,
    packageJson.version,
    'CJS SDK_VERSION differs from package version',
  );
  assert.equal(
    esmResult.version,
    packageJson.version,
    'ESM SDK_VERSION differs from package version',
  );

  await writeConsumer(join(tempRoot, 'consumer.mts'), typeProbe);
  await writeConsumer(join(tempRoot, 'consumer.cts'), typeProbe);
  await writeConsumer(
    join(tempRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: 'ES2020',
      },
      include: ['consumer.mts', 'consumer.cts'],
    }),
  );

  await runNode(join(repoRoot, 'node_modules/typescript/bin/tsc'), tempRoot, {
    scriptArgs: ['--project', join(tempRoot, 'tsconfig.json')],
  });

  console.log(
    `Package consumer checks passed for CJS, ESM and TypeScript (${cjsResult.keys.length} exports).`,
  );
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}
