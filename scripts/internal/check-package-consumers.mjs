#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
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
const platformContracts = [
  { globalName: 'wx', platform: 'wechat', requestMethod: 'request', statusKey: 'statusCode' },
  { globalName: 'my', platform: 'alipay', requestMethod: 'httpRequest', statusKey: 'status' },
  { globalName: 'tt', platform: 'bytedance', requestMethod: 'request', statusKey: 'statusCode' },
  { globalName: 'dd', platform: 'dingtalk', requestMethod: 'httpRequest', statusKey: 'statusCode' },
  { globalName: 'qq', platform: 'qq', requestMethod: 'request', statusKey: 'statusCode' },
  { globalName: 'swan', platform: 'swan', requestMethod: 'request', statusKey: 'statusCode' },
  { globalName: 'ks', platform: 'kuaishou', requestMethod: 'request', statusKey: 'statusCode' },
];
const selfRequestRuntimeModes = ['missing-url', 'partial-url'];

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
  const platforms = JSON.stringify(platformContracts);
  const load =
    moduleSyntax === 'esm'
      ? `import assert from 'node:assert/strict';
const runtimeMode = process.argv[3] || 'standard';
const nativeURLSearchParams = globalThis.URLSearchParams;
assert.equal(Reflect.deleteProperty(globalThis, 'URLSearchParams'), true);
if (runtimeMode === 'missing-url') {
  assert.equal(Reflect.deleteProperty(globalThis, 'URL'), true);
} else if (runtimeMode === 'partial-url') {
  globalThis.URL = { createObjectURL() {}, revokeObjectURL() {} };
}
const sdk = await import('sentry-miniapp');`
      : `const assert = require('node:assert/strict');
const runtimeMode = process.argv[3] || 'standard';
const nativeURLSearchParams = globalThis.URLSearchParams;
assert.equal(Reflect.deleteProperty(globalThis, 'URLSearchParams'), true);
if (runtimeMode === 'missing-url') {
  assert.equal(Reflect.deleteProperty(globalThis, 'URL'), true);
} else if (runtimeMode === 'partial-url') {
  globalThis.URL = { createObjectURL() {}, revokeObjectURL() {} };
}
const sdk = require('sentry-miniapp');`;

  const runStart = moduleSyntax === 'esm' ? '' : 'async function main() {';
  const runEnd =
    moduleSyntax === 'esm'
      ? ''
      : `}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});`;

  return `${load}
${runStart}
const required = ${required};
for (const name of required) {
  assert.ok(name in sdk, \`Missing public export: \${name}\`);
}
assert.equal(
  typeof globalThis.URLSearchParams,
  'function',
  'Package entrypoint did not install the URLSearchParams polyfill',
);
assert.notEqual(
  globalThis.URLSearchParams,
  nativeURLSearchParams,
  'Package runtime probe unexpectedly kept the native URLSearchParams',
);

const platformName = process.argv[2] || 'wechat';
const contract = ${platforms}.find(candidate => candidate.platform === platformName);
assert.ok(contract, \`Unknown platform contract: \${platformName}\`);
assert.ok(
  runtimeMode === 'standard' || ${JSON.stringify(selfRequestRuntimeModes)}.includes(runtimeMode),
  \`Unknown runtime mode: \${runtimeMode}\`,
);

const envelopes = [];
const requestedUrls = [];
let rawRequestCalls = 0;
const rawRequest = function(options) {
    rawRequestCalls += 1;
    requestedUrls.push(options.url);
    const headers = { ...(options.headers || {}), ...(options.header || {}) };
    const contentType = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'content-type',
    )?.[1];
    if (contentType === 'application/x-sentry-envelope') envelopes.push(options.data);

    const response = {
      [contract.statusKey]: 200,
      data: { ok: true },
      header: {},
      headers: {},
    };
    options.success?.(response);
    options.complete?.(response);
    return { abort() {} };
};
const host = {
  [contract.requestMethod]: rawRequest,
  getSystemInfoSync() {
    return { platform: 'devtools', brand: 'package-smoke' };
  },
};
globalThis[contract.globalName] = host;

sdk.init({
  dsn: 'https://test@o0.ingest.sentry.io/0',
  platform: contract.platform,
  tracesSampleRate: runtimeMode === 'standard' ? undefined : 1,
  enableOfflineCache: false,
  enableAutoSessionTracking: false,
  enableMinigameLifecycle: false,
  enableMinigameFrameRate: false,
});

if (runtimeMode === 'standard') {
  sdk.captureMessage('package consumer runtime smoke');
} else {
  const sentryWrappedRequest = host[contract.requestMethod];
  let outerRequestCalls = 0;
  host[contract.requestMethod] = function(options) {
    outerRequestCalls += 1;
    // A broken self-request guard would recurse forever. Bypass instrumentation after a few calls
    // so the probe fails with a finite request list instead of hanging CI.
    if (outerRequestCalls > 6) return rawRequest.call(this, options);
    return sentryWrappedRequest.call(this, {
      ...options,
      ...(options.header && { header: { ...options.header } }),
      ...(options.headers && { headers: { ...options.headers } }),
    });
  };
  host[contract.requestMethod]({
    url: 'https://api.example.com/package-self-request-smoke',
    method: 'POST',
  });
}

assert.equal(await sdk.flush(2000), true, 'SDK flush failed');
assert.ok(envelopes.length > 0, 'SDK did not send an envelope through the mini program host');
if (runtimeMode !== 'standard') {
  assert.equal(
    requestedUrls.length,
    2,
    \`\${platformName} \${runtimeMode} recursively traced an SDK envelope\`,
  );
  assert.equal(
    requestedUrls[0],
    'https://api.example.com/package-self-request-smoke',
    \`\${platformName} \${runtimeMode} did not send the business request first\`,
  );
  assert.ok(
    requestedUrls[1].startsWith('https://o0.ingest.sentry.io/api/0/envelope/'),
    \`\${platformName} \${runtimeMode} used an unexpected envelope endpoint\`,
  );
  const envelopeQuery = requestedUrls[1].split('?')[1] || '';
  assert.ok(
    envelopeQuery.split('&').includes('sentry_key=test'),
    \`\${platformName} \${runtimeMode} envelope URL omitted sentry_key\`,
  );
  assert.equal(rawRequestCalls, 2, \`\${platformName} \${runtimeMode} used extra host requests\`);
  assert.equal(envelopes.length, 1, \`\${platformName} \${runtimeMode} sent extra envelopes\`);
}
await sdk.close(0);

process.stdout.write(JSON.stringify({
  keys: Object.keys(sdk).sort(),
  version: sdk.SDK_VERSION,
  envelopes: envelopes.length,
  platform: platformName,
  requests: requestedUrls.length,
  runtimeMode,
}));
${runEnd}
`;
}

async function runUmdProbe(packageRoot, expectedVersion) {
  const envelopes = [];
  const sandbox = {
    clearTimeout,
    console,
    setTimeout,
    wx: {
      request(options) {
        const headers = { ...(options.headers || {}), ...(options.header || {}) };
        const contentType = Object.entries(headers).find(
          ([name]) => name.toLowerCase() === 'content-type',
        )?.[1];
        if (contentType === 'application/x-sentry-envelope') envelopes.push(options.data);

        const response = { statusCode: 200, data: { ok: true }, header: {} };
        options.success?.(response);
        options.complete?.(response);
        return { abort() {} };
      },
      getSystemInfoSync() {
        return { platform: 'devtools', brand: 'package-smoke' };
      },
    },
  };
  const umdPath = join(packageRoot, 'dist/sentry-miniapp.umd.js');
  const code = await readFile(umdPath, 'utf8');
  runInNewContext(code, sandbox, { filename: umdPath });

  const sdk = sandbox.SentryMiniapp;
  assert.ok(sdk, 'UMD bundle did not expose globalThis.SentryMiniapp');
  assert.equal(
    typeof sandbox.URLSearchParams,
    'function',
    'UMD bundle did not install the URLSearchParams polyfill',
  );
  assert.equal(sandbox.URL, undefined, 'UMD runtime probe unexpectedly received URL');
  assert.equal(
    sandbox.TextEncoder,
    undefined,
    'UMD runtime probe unexpectedly received TextEncoder',
  );
  assert.equal(
    sandbox.TextDecoder,
    undefined,
    'UMD runtime probe unexpectedly received TextDecoder',
  );
  for (const name of requiredExports) {
    assert.ok(name in sdk, `UMD bundle is missing public export: ${name}`);
  }
  assert.equal(sdk.SDK_VERSION, expectedVersion, 'UMD SDK_VERSION differs from package version');

  sdk.init({
    dsn: 'https://test@o0.ingest.sentry.io/0',
    platform: 'wechat',
    enableOfflineCache: false,
    enableAutoSessionTracking: false,
    enableMinigameLifecycle: false,
    enableMinigameFrameRate: false,
  });
  sdk.captureMessage('UMD package consumer runtime smoke');
  assert.equal(await sdk.flush(2000), true, 'UMD SDK flush failed');
  assert.ok(envelopes.length > 0, 'UMD SDK did not send an envelope through the host');
  await sdk.close(0);

  return Object.keys(sdk).sort();
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
  type MiniappPlatform,
  type PerformanceIntegrationOptions,
} from 'sentry-miniapp';

declare const options: MiniappOptions;
const miniappPlatform: MiniappPlatform = 'wechat';
const performanceOptions: PerformanceIntegrationOptions = {};

init(options);
init({ miniappPlatform });
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
  const wechatMain = packageJson.main || 'index.js';
  const wechatEntry = /\.(?:js|json)$/.test(wechatMain) ? wechatMain : `${wechatMain}.js`;
  await Promise.all([
    // miniprogram-ci 2.x appends .js when main does not already end in .js or .json.
    access(join(packageRoot, wechatEntry)),
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

  const cjsExecution = await runNode(cjsConsumer, tempRoot, {
    scriptArgs: ['wechat', 'missing-url'],
  });
  const esmScenarios = platformContracts.flatMap((contract) =>
    selfRequestRuntimeModes.map((runtimeMode) => ({ contract, runtimeMode })),
  );
  const esmExecutions = await Promise.all(
    esmScenarios.map(({ contract, runtimeMode }) =>
      runNode(esmConsumer, tempRoot, {
        scriptArgs: [contract.platform, runtimeMode],
      }),
    ),
  );
  assert.equal(cjsExecution.stderr, '', `CJS import emitted stderr:\n${cjsExecution.stderr}`);
  for (const [index, execution] of esmExecutions.entries()) {
    assert.equal(
      execution.stderr,
      '',
      `ESM ${esmScenarios[index].contract.platform} ${esmScenarios[index].runtimeMode} probe emitted stderr:\n${execution.stderr}`,
    );
  }

  const cjsResult = JSON.parse(cjsExecution.stdout);
  const esmResults = esmExecutions.map(({ stdout }) => JSON.parse(stdout));
  const esmResult = esmResults.find(
    ({ platform, runtimeMode }) => platform === 'wechat' && runtimeMode === 'missing-url',
  );
  assert.ok(esmResult, 'ESM WeChat probe did not produce a result');
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
  assert.equal(cjsResult.envelopes, 1, 'CJS runtime probe sent unexpected envelopes');
  assert.equal(cjsResult.requests, 2, 'CJS runtime probe used unexpected host requests');
  for (const { contract, runtimeMode } of esmScenarios) {
    const result = esmResults.find(
      (candidate) =>
        candidate.platform === contract.platform && candidate.runtimeMode === runtimeMode,
    );
    assert.ok(result, `Missing ESM runtime result for ${contract.platform} ${runtimeMode}`);
    assert.equal(
      result.envelopes,
      1,
      `ESM ${contract.platform} ${runtimeMode} sent unexpected envelopes through ${contract.globalName}.${contract.requestMethod}`,
    );
    assert.equal(
      result.requests,
      2,
      `ESM ${contract.platform} ${runtimeMode} used unexpected host requests`,
    );
  }
  const umdKeys = await runUmdProbe(packageRoot, packageJson.version);
  assert.deepEqual(umdKeys, cjsResult.keys, 'UMD and CJS exports differ');

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
    `Package consumer checks passed for CJS, ESM (${platformContracts.length} platforms × ${selfRequestRuntimeModes.length} URL modes), UMD and TypeScript (${cjsResult.keys.length} exports).`,
  );
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}
