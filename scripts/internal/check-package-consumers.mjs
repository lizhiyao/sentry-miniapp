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
const hostRuntimeModes = [
  'native-builtins',
  'native-query-only',
  'native-query-readonly',
  'core-query-readonly',
  'writable-query-nonconfigurable',
  'missing-url',
  'partial-url',
  'partial-url-search-params',
  'partial-query-methods',
  'frozen-request',
  'unreadable-browser',
  'missing-reflect',
  'partial-reflect',
  'missing-builtins',
  'partial-encoder',
];

async function writeConsumer(file, source) {
  await writeFile(file, source, 'utf8');
}

async function runNode(file, cwd, { nodeArgs = [], scriptArgs = [] } = {}) {
  return execFileAsync(process.execPath, [...nodeArgs, file, ...scriptArgs], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    killSignal: 'SIGKILL',
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
  const load = `${moduleSyntax === 'esm' ? "import assert from 'node:assert/strict';" : "const assert = require('node:assert/strict');"}
const runtimeMode = process.argv[3] || 'standard';
const nativePromise = Promise;
const nativeFetch = globalThis.fetch;
const nativeRequest = globalThis.Request;
const nativeRequestConstructor = globalThis.Request?.prototype.constructor;
const browserNames = ['fetch', 'Request', 'Headers', 'URL'];
const browserDescriptors = browserNames.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
let browserReads = 0;
const nativeStringMethods = [String.prototype.isWellFormed, String.prototype.toWellFormed];
const compatibilityMode = ['missing-builtins', 'partial-encoder'].includes(runtimeMode);
const nativeURLSearchParams = globalThis.URLSearchParams;
let hostQueryConstructor = nativeURLSearchParams;
const coreQueryOnly = runtimeMode === 'core-query-readonly';
const preserveNativeQuery = ['native-builtins', 'native-query-only', 'native-query-readonly', 'core-query-readonly'].includes(runtimeMode);
if (!preserveNativeQuery) assert.equal(Reflect.deleteProperty(globalThis, 'URLSearchParams'), true);
if (runtimeMode === 'native-query-only') {
  assert.equal(Reflect.deleteProperty(globalThis, 'URL'), true);
} else if (runtimeMode === 'native-query-readonly') {
  globalThis.URL = { createObjectURL() {}, revokeObjectURL() {} };
  Object.defineProperty(globalThis, 'URLSearchParams', { value: nativeURLSearchParams, writable: false, configurable: false });
} else if (coreQueryOnly) {
  hostQueryConstructor = class URLSearchParams extends nativeURLSearchParams {
    constructor(init) {
      if (Array.isArray(init)) throw new Error('Pair inputs are unavailable');
      super(init);
    }
  };
  Object.defineProperty(hostQueryConstructor.prototype, 'get', { get() {
    throw new Error('Unused method must not be probed');
  }});
  Object.defineProperty(globalThis, 'URLSearchParams', { value: hostQueryConstructor, writable: false, configurable: false });
} else if (runtimeMode === 'writable-query-nonconfigurable') {
  Object.defineProperty(globalThis, 'URLSearchParams', { value: class URLSearchParams {}, writable: true, configurable: false });
} else if (runtimeMode === 'missing-url') {
  assert.equal(Reflect.deleteProperty(globalThis, 'URL'), true);
} else if (runtimeMode === 'partial-url') {
  globalThis.URL = { createObjectURL() {}, revokeObjectURL() {} };
} else if (runtimeMode === 'partial-url-search-params') {
  globalThis.URLSearchParams = class URLSearchParams {};
} else if (runtimeMode === 'partial-query-methods') {
  globalThis.URLSearchParams = class URLSearchParams extends nativeURLSearchParams {};
  globalThis.URLSearchParams.prototype.keys = undefined;
} else if (runtimeMode === 'frozen-request') {
  Object.freeze(globalThis.Request.prototype);
} else if (runtimeMode === 'unreadable-browser') {
  for (const name of browserNames) Object.defineProperty(globalThis, name, { configurable: true, get() {
    browserReads++;
    throw new Error('Browser capability is unavailable');
  }});
  Object.defineProperty(globalThis, 'URLSearchParams', { configurable: true, get() {
    throw new Error('Query capability is unavailable');
  }});
} else if (runtimeMode === 'missing-reflect') {
  globalThis.Reflect = undefined;
} else if (runtimeMode === 'partial-reflect') {
  globalThis.Reflect = {};
} else if (runtimeMode === 'missing-builtins') {
  for (const key of ['entries', 'values', 'fromEntries']) Object[key] = undefined;
  Promise.allSettled = undefined;
  Promise.prototype.finally = undefined;
  String.prototype.isWellFormed = String.prototype.toWellFormed = undefined;
  globalThis.TextEncoder = undefined;
  Array.prototype.includes = undefined;
  globalThis.globalThis = undefined;
} else if (runtimeMode === 'partial-encoder') {
  globalThis.TextEncoder = class TextEncoder {};
}
const sdk = ${moduleSyntax === 'esm' ? "await import('sentry-miniapp')" : "require('sentry-miniapp')"};
if (runtimeMode === 'unreadable-browser') {
  assert.equal(browserReads, 0, 'SDK inspected unrelated browser transports');
  for (const [index, name] of browserNames.entries()) Object.defineProperty(globalThis, name, browserDescriptors[index]);
}`;

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
assert.equal(Promise, nativePromise, 'SDK replaced the host Promise constructor');
assert.equal(globalThis.fetch, nativeFetch, 'SDK replaced the host fetch');
assert.equal(globalThis.Request, nativeRequest, 'SDK replaced the host Request');
assert.equal(globalThis.Request?.prototype.constructor, nativeRequestConstructor, 'SDK changed the host Request prototype');
if (runtimeMode !== 'missing-builtins') {
  for (const [index, name] of ['isWellFormed', 'toWellFormed'].entries()) {
    if (typeof nativeStringMethods[index] === 'function') assert.equal(String.prototype[name], nativeStringMethods[index]);
    else assert.equal(typeof String.prototype[name], 'function');
  }
} else {
  for (const name of ['isWellFormed', 'toWellFormed']) {
    assert.equal(typeof String.prototype[name], 'function');
    assert.equal(Object.getOwnPropertyDescriptor(String.prototype, name).enumerable, false);
  }
  assert.equal('中🙂\\ud800'.toWellFormed(), '中🙂�');
  assert.equal('中🙂\\ud800'.isWellFormed(), false);
}
if (runtimeMode === 'missing-builtins') assert.equal(Promise.prototype.finally, undefined);
const required = ${required};
for (const name of required) {
  assert.ok(name in sdk, \`Missing public export: \${name}\`);
}
assert.equal(
  sdk.Integrations.normalizeMiniappFrameFilename('WAService/pages/index.js'),
  'app:///pages/index.js',
  'Package entrypoint lost the existing frame filename utility',
);
assert.equal(
  typeof globalThis.URLSearchParams,
  'function',
  'Package entrypoint did not install the URLSearchParams polyfill',
);
if (preserveNativeQuery) {
  assert.equal(globalThis.URLSearchParams, hostQueryConstructor, 'SDK replaced a working host URLSearchParams');
} else {
  assert.notEqual(globalThis.URLSearchParams, nativeURLSearchParams);
}
if (runtimeMode === 'writable-query-nonconfigurable') {
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams').configurable, false);
}
if (!coreQueryOnly) {
  const params = new URLSearchParams('a=one&b=two&c=three');
  const iterator = params.entries();
  assert.deepEqual(iterator.next().value, ['a', 'one']);
  params.delete('b');
  params.set('c', 'updated');
  assert.deepEqual(iterator.next().value, ['c', 'updated'], 'URLSearchParams iterator used stale entries');
  const context = {};
  params.forEach(function(value, key, owner) {
    assert.equal(this, context);
    assert.equal(owner, params);
  }, context);
  assert.throws(() => new URLSearchParams([['incomplete']]), TypeError);
  assert.throws(() => new URLSearchParams({ key: Symbol('invalid') }), TypeError);
  for (const input of ['a=x+y&=empty&dup=1&dup=2', 'bad=%FF%E4%B8%41%C2%C2%A9%ED%A0%80%F4%90%80%80', 'raw=中🙂&symbols=~!()*&surrogate=\\ud800']) {
    assert.equal(new URLSearchParams(input).toString(), new nativeURLSearchParams(input).toString());
    assert.deepEqual([...new URLSearchParams(input)], [...new nativeURLSearchParams(input)]);
  }
  const unicodeParams = new URLSearchParams({ ['\\ud800']: '\\udc00' });
  unicodeParams.append('added', '\\ud800');
  unicodeParams.set('set', '\\udc00');
  assert.equal(unicodeParams.get('�'), '�');
  assert.equal(unicodeParams.get('\\ud800'), '�');
  assert.equal(unicodeParams.get('added'), '�');
  assert.equal(unicodeParams.get('set'), '�');

  // 回退实现的额外输入一致性；这些重载不作为宿主启动条件。
  for (const input of [undefined, { empty: null, absent: undefined, numeric: 123 }, [['key', null], ['absent', undefined]]]) {
    const actual = new URLSearchParams(input);
    const expected = new nativeURLSearchParams(input);
    assert.deepEqual([...actual], [...expected]);
    assert.equal(actual.toString(), expected.toString());
  }
}


const platformName = process.argv[2] || 'wechat';
const contract = ${platforms}.find(candidate => candidate.platform === platformName);
assert.ok(contract, \`Unknown platform contract: \${platformName}\`);
assert.ok(
  runtimeMode === 'standard' || ${JSON.stringify(hostRuntimeModes)}.includes(runtimeMode),
  \`Unknown runtime mode: \${runtimeMode}\`,
);

const envelopes = [];
const requestedUrls = [];
let rawRequestCalls = 0;
let completedRequests = 0;
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
    const complete = () => {
      completedRequests += 1;
      options.success?.(response);
      options.complete?.(response);
    };
    if (compatibilityMode && contentType === 'application/x-sentry-envelope') setTimeout(complete, 25);
    else complete();
    return { abort() {} };
};
const host = {
  [contract.requestMethod]: rawRequest,
  getSystemInfoSync() {
    return { platform: 'devtools', brand: 'package-smoke' };
  },
};
globalThis[contract.globalName] = host;

const client = sdk.init({
  dsn: 'https://test@o0.ingest.sentry.io/0',
  platform: contract.platform,
  tracesSampleRate: runtimeMode === 'standard' ? undefined : 1,
  enableOfflineCache: false,
  enableAutoSessionTracking: false,
  enableMinigameLifecycle: false,
  enableMinigameFrameRate: false,
  transportOptions: compatibilityMode ? { binaryRequestBody: 'arraybuffer' } : {},
});
const businessUrl = 'https://api.example.com/package-self-request-smoke' +
  (coreQueryOnly ? '?space+name=ok&token=secret' : '');
for (const key of ['sendDefaultPii', 'enableLogs']) {
  assert.throws(() => sdk.init({ [key]: false }), new RegExp(key + '.*removed'));
  assert.equal(sdk.getClient(), client, 'Rejected options replaced the active package client');
}

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
    url: businessUrl,
    method: 'POST',
  });
}

if (compatibilityMode) {
  sdk.withScope(scope => {
    scope.addAttachment({ filename: 'unicode.txt', data: '中文🙂' });
    scope.addAttachment({ filename: 'binary.bin', data: new Uint8Array([0, 255]) });
    sdk.captureMessage('package binary runtime smoke');
  });
}
assert.equal(await sdk.flush(2000), true, 'SDK flush failed');
assert.equal(completedRequests, rawRequestCalls, 'flush returned before pending host requests settled');
if (compatibilityMode) {
  assert.ok(envelopes.some(data => data instanceof ArrayBuffer), 'Binary envelope was not sent');
  const bytes = envelopes.find(data => data instanceof ArrayBuffer);
  assert.ok(Buffer.from(bytes).includes(Buffer.from('中文🙂')), 'UTF-8 attachment bytes changed');
}
assert.ok(envelopes.length > 0, 'SDK did not send an envelope through the mini program host');
if (runtimeMode !== 'standard') {
  assert.equal(
    requestedUrls.length,
    compatibilityMode ? 3 : 2,
    \`\${platformName} \${runtimeMode} recursively traced an SDK envelope\`,
  );
  assert.equal(
    requestedUrls[0],
    businessUrl,
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
  assert.equal(rawRequestCalls, compatibilityMode ? 3 : 2, \`\${platformName} \${runtimeMode} used extra host requests\`);
  assert.equal(envelopes.length, compatibilityMode ? 2 : 1, \`\${platformName} \${runtimeMode} sent extra envelopes\`);
}
if (coreQueryOnly) {
  assert.equal(typeof envelopes[0], 'string');
  const spanPayload = JSON.parse(envelopes[0].split('\\n')[2]);
  assert.equal(spanPayload.items.length, 1);
  assert.equal(spanPayload.items[0].attributes['url.query'].value, 'space+name=ok&token=[Filtered]');
  assert.ok(!envelopes[0].includes('secret'), 'Core-only query host leaked a sensitive query value');
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
    Reflect: undefined,
    wx: {
      request(options) {
        const headers = { ...(options.headers || {}), ...(options.header || {}) };
        const contentType = Object.entries(headers).find(
          ([name]) => name.toLowerCase() === 'content-type',
        )?.[1];
        if (contentType === 'application/x-sentry-envelope') envelopes.push(options.data);

        const response = { statusCode: 200, data: { ok: true }, header: {} };
        setTimeout(() => {
          options.success?.(response);
          options.complete?.(response);
        }, 25);
        return { abort() {} };
      },
      getSystemInfoSync() {
        return { platform: 'devtools', brand: 'package-smoke' };
      },
    },
  };
  const umdPath = join(packageRoot, 'dist/sentry-miniapp.umd.js');
  const code = await readFile(umdPath, 'utf8');
  runInNewContext(
    `Object.entries = Object.values = Object.fromEntries = undefined; Promise.allSettled = undefined; Promise.prototype.finally = undefined; String.prototype.isWellFormed = String.prototype.toWellFormed = undefined; Array.prototype.includes = undefined; globalThis.globalThis = undefined; ${code}`,
    sandbox,
    { filename: umdPath },
  );

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
  sdk.logger.info('UMD 中🙂\ud800');
  assert.equal(await sdk.flush(2000), true, 'UMD SDK flush failed');
  assert.ok(envelopes.length > 0, 'UMD SDK did not send an envelope through the host');
  const logEnvelope = envelopes.find(
    (data) => typeof data === 'string' && data.includes('"type":"log"'),
  );
  assert.ok(logEnvelope, 'UMD SDK did not send a log without native String methods');
  assert.equal(JSON.parse(logEnvelope.split('\n')[2]).items[0].body, 'UMD 中🙂�');
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
const frameFilename: string = Integrations.normalizeMiniappFrameFilename('WAService/pages/index.js');
frameFilename;
Transports.createMiniappTransport;
miniappStackParser;
`;

const suppliedTarball = process.argv[2] ? resolve(process.argv[2]) : undefined;
const tempRoot = await mkdtemp(join(tmpdir(), 'sentry-miniapp-package-consumers-'));
const expectedBehaviorScenarios = 20;

try {
  const tarball =
    suppliedTarball ||
    (await pack(repoRoot, {
      destination: tempRoot,
      packageManager: 'yarn',
    }));
  const nodeModules = join(tempRoot, 'node_modules');
  const packageRoot = join(nodeModules, 'sentry-miniapp');
  console.log(`Checking installed package in temporary consumer: ${packageRoot}`);

  if (suppliedTarball) {
    await writeConsumer(join(tempRoot, 'package.json'), JSON.stringify({ private: true }));
    const installed = await execFileAsync(
      'npm',
      [
        'install',
        tarball,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--registry=https://registry.npmjs.org',
      ],
      {
        cwd: tempRoot,
        encoding: 'utf8',
        timeout: 120_000,
        killSignal: 'SIGKILL',
        env: { ...process.env, NODE_PATH: '', npm_config_cache: join(tempRoot, '.npm-cache') },
      },
    );
    console.log(installed.stdout);
  } else {
    await mkdir(packageRoot, { recursive: true });
    await unpackPackage(tarball, packageRoot);
    await cp(join(repoRoot, 'node_modules/@sentry'), join(nodeModules, '@sentry'), {
      dereference: true,
      recursive: true,
    });
  }

  const notices = await readFile(join(packageRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  for (const dependency of ['@sentry/core', 'core-js', 'core-js-pure', '@babel/helpers']) {
    const license = (
      await readFile(join(repoRoot, 'node_modules', dependency, 'LICENSE'), 'utf8')
    ).trim();
    assert.ok(notices.includes(license), `Missing bundled license: ${dependency}`);
  }
  for (const bundle of ['sentry-miniapp.cjs.js', 'sentry-miniapp.mjs', 'sentry-miniapp.umd.js']) {
    assert.ok(
      (await readFile(join(packageRoot, 'dist', bundle), 'utf8')).includes(notices.trim()),
      `Standalone bundle omitted notices: ${bundle}`,
    );
  }

  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const expected = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.name, expected.name);
  assert.equal(packageJson.version, expected.version);
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

  const cjsExecutions = [];
  for (const runtimeMode of [
    'native-builtins',
    'native-query-only',
    'native-query-readonly',
    'core-query-readonly',
    'writable-query-nonconfigurable',
    'partial-url-search-params',
    'partial-query-methods',
    'frozen-request',
    'unreadable-browser',
    'missing-url',
    'missing-reflect',
    'partial-reflect',
    'missing-builtins',
    'partial-encoder',
  ]) {
    cjsExecutions.push(
      await runNode(cjsConsumer, tempRoot, {
        scriptArgs: ['wechat', runtimeMode],
      }),
    );
  }
  const cjsExecution = cjsExecutions[0];
  const esmScenarios = platformContracts.flatMap((contract) =>
    hostRuntimeModes.map((runtimeMode) => ({ contract, runtimeMode })),
  );
  const esmExecutions = [];
  for (const { contract, runtimeMode } of esmScenarios) {
    console.log(`Checking ESM ${contract.platform} ${runtimeMode}`);
    esmExecutions.push(
      await runNode(esmConsumer, tempRoot, {
        scriptArgs: [contract.platform, runtimeMode],
      }),
    );
  }
  for (const execution of cjsExecutions) {
    assert.equal(execution.stderr, '', `CJS import emitted stderr:\n${execution.stderr}`);
    const result = JSON.parse(execution.stdout);
    assert.equal(
      result.envelopes,
      ['missing-builtins', 'partial-encoder'].includes(result.runtimeMode) ? 2 : 1,
      `CJS ${result.runtimeMode} sent unexpected envelopes`,
    );
    assert.equal(
      result.requests,
      ['missing-builtins', 'partial-encoder'].includes(result.runtimeMode) ? 3 : 2,
      `CJS ${result.runtimeMode} used unexpected host requests`,
    );
  }
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
      ['missing-builtins', 'partial-encoder'].includes(runtimeMode) ? 2 : 1,
      `ESM ${contract.platform} ${runtimeMode} sent unexpected envelopes through ${contract.globalName}.${contract.requestMethod}`,
    );
    assert.equal(
      result.requests,
      ['missing-builtins', 'partial-encoder'].includes(runtimeMode) ? 3 : 2,
      `ESM ${contract.platform} ${runtimeMode} used unexpected host requests`,
    );
  }
  const umdKeys = await runUmdProbe(packageRoot, packageJson.version);
  assert.deepEqual(umdKeys, cjsResult.keys, 'UMD and CJS exports differ');

  // CJS and ESM differ in strictness around readonly native APIs; test both actual installed entries.
  for (const moduleSyntax of ['cjs', 'esm']) {
    console.log(`Checking packaged ${moduleSyntax.toUpperCase()} lifecycle and host behavior`);
    const execution = await runNode(
      join(repoRoot, 'scripts/internal/check-package-behavior.mjs'),
      tempRoot,
      { scriptArgs: [packageRoot, moduleSyntax] },
    );
    await writeConsumer(join(tempRoot, `behavior-${moduleSyntax}.ndjson`), execution.stdout);
    const results = execution.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const summary = results.pop();
    assert.equal(summary.passed, true, `${moduleSyntax} packaged behavior failed`);
    assert.equal(summary.module, moduleSyntax);
    assert.equal(summary.version, packageJson.version);
    assert.equal(summary.scenarios, expectedBehaviorScenarios);
    assert.equal(results.length, summary.scenarios);
    assert.ok(results.every((result) => result.passed && result.version === packageJson.version));
  }

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
    `Package consumer checks passed for CJS, ESM (${platformContracts.length} platforms × ${hostRuntimeModes.length} host runtime modes), UMD, TypeScript (${cjsResult.keys.length} exports), and ${expectedBehaviorScenarios} behavior scenarios for each CJS/ESM entry.`,
  );
} finally {
  if (suppliedTarball && process.env.DIAGNOSTICS_DIR) {
    const evidenceRoot = resolve(process.env.DIAGNOSTICS_DIR, 'package');
    await mkdir(evidenceRoot, { recursive: true });
    for (const name of [
      'package-lock.json',
      'package.json',
      'consumer.mts',
      'consumer.cts',
      'tsconfig.json',
      'behavior-cjs.ndjson',
      'behavior-esm.ndjson',
    ]) {
      try {
        await cp(join(tempRoot, name), join(evidenceRoot, name));
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn(`Could not save ${name}: ${error.message}`);
      }
    }
  }
  await rm(tempRoot, { force: true, recursive: true });
}
