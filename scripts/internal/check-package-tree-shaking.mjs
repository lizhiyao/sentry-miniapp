import assert from 'node:assert/strict';
import { cp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';

/** 检查消费端最终产物，以及显式选用的集成仍能安装和清理。 */
export async function checkPackageTreeShaking(tempRoot, runNode) {
  const require = createRequire(import.meta.url);
  for (const dependency of ['core-js', 'core-js-pure']) {
    await cp(
      dirname(require.resolve(`${dependency}/package.json`)),
      join(tempRoot, 'node_modules', dependency),
      { recursive: true, dereference: true },
    );
  }
  await writeFile(
    join(tempRoot, 'application-polyfills.mjs'),
    `
import 'core-js/modules/es.global-this.js';
import 'core-js/modules/es.array.includes.js';
import 'core-js/modules/es.object.entries.js';
import 'core-js/modules/es.object.values.js';
import 'core-js/modules/es.object.from-entries.js';
import 'core-js/modules/es.promise.all-settled.js';
import 'core-js/modules/es.string.is-well-formed.js';
import 'core-js/modules/es.string.to-well-formed.js';
import URLSearchParams from 'core-js-pure/web/url-search-params.js';
globalThis.URLSearchParams = URLSearchParams;
`,
  );
  for (const { withPerformance, lite, applicationPolyfills } of [
    { withPerformance: false, lite: false },
    { withPerformance: true, lite: false },
    { withPerformance: false, lite: true },
    { withPerformance: false, lite: true, applicationPolyfills: true },
  ]) {
    const label = `${withPerformance ? 'performance' : 'basic'}${lite ? '-lite' : ''}${applicationPolyfills ? '-application-polyfills' : ''}`;
    const entry = join(tempRoot, `tree-shaking-${label}.mjs`);
    await writeFile(
      entry,
      `${applicationPolyfills ? "import './application-polyfills.mjs';\n" : ''}import assert from 'node:assert/strict';
import { init, captureException, flush${withPerformance ? ', performanceIntegration' : ''} } from '${lite ? 'sentry-miniapp/lite' : 'sentry-miniapp'}';
async function main() {
const envelopes = [];
let observed = 0;
let disconnected = 0;
globalThis.wx = {
  request(options) {
    envelopes.push(options.data);
    options.success?.({ statusCode: 200, data: {} });
    options.complete?.();
    return { abort() {} };
  },
  getPerformance() {
    return { createObserver() { return {
      observe() { observed++; },
      disconnect() { disconnected++; },
    }; } };
  },
};
const client = init({
  dsn: 'https://key@example.com/1',
  enableSession: false,
  integrations: ${withPerformance ? '[performanceIntegration()]' : '[]'},
});
assert.ok(client);
assert.equal(observed, ${withPerformance ? 1 : 0});
captureException(new Error('tree-shaking probe'));
assert.equal(await flush(500), true);
assert.equal(envelopes.length, 1);
assert.ok(envelopes[0].includes('tree-shaking probe'));
client.dispose();
assert.equal(disconnected, ${withPerformance ? 1 : 0});
}
main().catch(error => { console.error(error); process.exitCode = 1; });
`,
    );
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        target: 'es2015',
        write: false,
        minify: 'oxc',
        lib: { entry, formats: ['es'] },
        rolldownOptions: {
          external: ['node:assert/strict'],
          output: { minify: { codegen: true } },
        },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
    const chunk = outputs.find((item) => item.type === 'chunk' && item.isEntry);
    assert.ok(chunk, 'Consumer build did not produce an entry');
    assert.equal(chunk.code.includes('PerformanceAPI'), withPerformance);
    assert.equal(chunk.code.includes('HttpContext'), false);
    if (lite && !applicationPolyfills)
      assert.ok(
        !Object.keys(chunk.modules).some((file) => /internal\/polyfills|core-js/.test(file)),
      );
    const bytes = Buffer.byteLength(chunk.code);
    const budget = (applicationPolyfills ? 245 : lite ? 195 : withPerformance ? 240 : 235) * 1024;
    assert.ok(bytes <= budget, `${label} consumer exceeds ${budget} bytes: ${bytes}`);
    const destination = join(tempRoot, `tree-shaking-${label}-built.mjs`);
    await writeFile(destination, chunk.code);
    let execution;
    if (applicationPolyfills) {
      const launcher = join(tempRoot, 'application-polyfills-launcher.cjs');
      await writeFile(
        launcher,
        `
const target = process.argv[2];
globalThis.TextEncoder = undefined;
globalThis.URLSearchParams = undefined;
globalThis.URL = undefined;
Object.entries = Object.values = Object.fromEntries = undefined;
Array.prototype.includes = undefined;
Promise.allSettled = undefined;
String.prototype.isWellFormed = String.prototype.toWellFormed = undefined;
globalThis.globalThis = undefined;
import(target).catch(error => { console.error(error); process.exitCode = 1; });
`,
      );
      execution = await runNode(launcher, tempRoot, { scriptArgs: [destination] });
    } else execution = await runNode(destination, tempRoot);
    assert.equal(execution.stderr, '', execution.stderr);
    console.log(`Packaged ${label} ESM consumer: ${bytes} bytes (budget ${budget})`);
  }
}
