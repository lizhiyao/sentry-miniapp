import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const ts = require('typescript');
process.env.NODE_ENV = 'production';
// 仅在独立 worker 内装载生产 TS；父线程可在业务死循环时强制结束它。
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

let observer;
let stored;
globalThis.wx = {
  request() {},
  getStorageSync() {
    return stored;
  },
  setStorageSync(_key, value) {
    stored = value;
  },
  getPerformance() {
    return {
      getEntries() {
        return [];
      },
      createObserver(callback) {
        observer = callback;
        return { observe() {}, disconnect() {} };
      },
    };
  },
};
const { init } = require(`${workerData.root}/src/index.ts`);
const { performanceIntegration } = require(`${workerData.root}/src/integrations/performance.ts`);
const { createMiniappOfflineStore } = require(`${workerData.root}/src/transports/offlineStore.ts`);
const client = init({
  dsn: 'https://test@o0.ingest.sentry.io/0',
  defaultIntegrations: false,
  enableSystemInfo: false,
  transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
  integrations: [performanceIntegration({ bufferSize: workerData.value, reportInterval: 0 })],
});
parentPort.postMessage({ ready: true });
observer([{ name: '/resource', entryType: 'resource', startTime: Date.now(), duration: 1 }]);
const store = createMiniappOfflineStore({ offlineCacheLimit: workerData.value });
for (let index = 0; index < 35; index++) {
  await store.push([{ event_id: String(index) }, []]);
}
const first = await store.shift();
await client.close();
parentPort.postMessage({ complete: true, first: first?.[0]?.event_id });
