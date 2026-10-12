import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'vite';

/** 检查消费端最终产物，以及显式选用的集成仍能安装和清理。 */
export async function checkPackageTreeShaking(tempRoot, runNode) {
  for (const withPerformance of [false, true]) {
    const label = withPerformance ? 'performance' : 'basic';
    const entry = join(tempRoot, `tree-shaking-${label}.mjs`);
    await writeFile(
      entry,
      `import assert from 'node:assert/strict';
import { init, captureException, flush${withPerformance ? ', performanceIntegration' : ''} } from 'sentry-miniapp';
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
    const bytes = Buffer.byteLength(chunk.code);
    const budget = (withPerformance ? 240 : 235) * 1024;
    assert.ok(bytes <= budget, `${label} consumer exceeds ${budget} bytes: ${bytes}`);
    const destination = join(tempRoot, `tree-shaking-${label}-built.mjs`);
    await writeFile(destination, chunk.code);
    const execution = await runNode(destination, tempRoot);
    assert.equal(execution.stderr, '', execution.stderr);
    console.log(`Packaged ${label} ESM consumer: ${bytes} bytes (budget ${budget})`);
  }
}
