#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Only the installed package's declared public CJS/ESM entry is imported.
// Each scenario runs in a fresh process so Core scope and instrumentation do not leak between cases.
// Usage: node scripts/internal/check-package-behavior.mjs /absolute/node_modules/sentry-miniapp [cjs|esm]
const scriptPath = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);

const packageDir = path.resolve(process.argv[2] || '');
const moduleKind = process.argv[3] || 'cjs';
const scenario = process.argv[4];
const scenarios = [
  'empty-session-timer',
  'empty-session-raf',
  'empty-session-request',
  'empty-session-wrap',
  'my-frozen',
  'dd-frozen',
  'my-readonly-request',
  'dd-unreadable-storage',
];
if (!process.argv[2] || !['cjs', 'esm'].includes(moduleKind)) {
  process.stderr.write(
    'Usage: node check-package-behavior.mjs /absolute/node_modules/sentry-miniapp [cjs|esm]\n',
  );
  process.exit(2);
}

if (!scenario) {
  const results = scenarios.map((name) => {
    const child = spawnSync(process.execPath, [scriptPath, packageDir, moduleKind, name], {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    let result;
    try {
      result = JSON.parse(child.stdout.trim());
    } catch {
      result = {
        scenario: name,
        passed: false,
        error: String(child.error || child.stderr || 'missing JSON result'),
      };
    }
    if (child.error || child.status !== 0) result.passed = false;
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  });
  const passed = results.every((result) => result.passed);
  process.stdout.write(
    `${JSON.stringify({
      passed,
      module: moduleKind,
      scenarios: results.length,
      version: results.find((result) => result.version)?.version,
      failures: results.filter((result) => !result.passed).map((result) => result.scenario),
    })}\n`,
  );
  process.exitCode = passed ? 0 : 1;
} else {
  assert.ok(scenarios.includes(scenario));
  runScenario().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stdout.write(
        `${JSON.stringify({
          scenario,
          module: moduleKind,
          version: readPackage().version,
          passed: false,
          error: error.message,
          evidence: error.evidence,
        })}\n`,
      );
      process.exitCode = 1;
    },
  );
}

function readPackage() {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
}

async function runScenario() {
  const pkg = readPackage();
  assert.equal(pkg.name, 'sentry-miniapp');
  for (const name of ['wx', 'my', 'tt', 'dd', 'qq', 'swan', 'ks', 'App', 'Page', 'GameGlobal']) {
    delete global[name];
  }
  const originalTimeout = global.setTimeout;
  const tasks = [];
  const task = { nativeTaskIdentity: scenario, abort() {} };
  const receiver = { callbackReceiver: true };
  const argument = { callbackArgument: true };
  const originalError = new Error(`public package probe ${scenario}`);
  let requestOptions;
  let sdk;
  let client;
  const observed = [];
  const transmitted = [];
  let notifyDelivery;
  const delivered = new Promise((resolve) => {
    notifyDelivery = resolve;
  });
  const disk = new Map();
  const businessValue = { nativeBusinessValue: true };
  const businessReadResult = { data: businessValue };
  const businessWriteResult = { success: true };
  const storage = {
    getStorageSync({ key }) {
      if (key === 'business') {
        assert.equal(this, receiver);
        return businessReadResult;
      }
      assert.equal(this, host, 'SDK storage receiver must be native host');
      return { data: disk.get(key) };
    },
    setStorageSync({ key, data }) {
      if (key === 'business') {
        assert.equal(this, receiver);
        assert.equal(data, businessValue);
        return businessWriteResult;
      }
      assert.equal(this, host, 'SDK storage receiver must be native host');
      disk.set(key, data);
      return { success: true };
    },
    removeStorageSync({ key }) {
      if (key === 'business') {
        assert.equal(this, receiver);
        return businessWriteResult;
      }
      assert.equal(this, host, 'SDK storage receiver must be native host');
      disk.delete(key);
      return { success: true };
    },
  };
  const host = scenario.startsWith('empty-session')
    ? {
        request(options) {
          assert.equal(this, host);
          requestOptions = options;
          return task;
        },
      }
    : {
        httpRequest(options) {
          assert.equal(this, host, 'native HTTP receiver must be preserved');
          if (options.url.startsWith('https://business.example.test/')) {
            assert.equal(
              options.success.call(receiver, argument),
              businessValue,
              'business success callback result must be preserved',
            );
          } else {
            transmitted.push(options);
            options.success({ status: 200, headers: {} });
            notifyDelivery();
          }
          return task;
        },
        ...storage,
      };

  const frozen = scenario.endsWith('-frozen');
  if (frozen) Object.freeze(host);
  if (scenario === 'my-readonly-request') {
    Object.defineProperty(host, 'request', {
      value: undefined,
      writable: false,
      configurable: false,
    });
  }
  if (scenario === 'dd-unreadable-storage') {
    Object.defineProperty(host, 'getStorageSync', {
      configurable: false,
      get() {
        throw new Error('optional storage getter unavailable');
      },
    });
  }
  global[scenario.startsWith('my-') ? 'my' : scenario.startsWith('dd-') ? 'dd' : 'wx'] = host;
  if (scenario === 'empty-session-timer') {
    global.setTimeout = function (callback, delay, ...args) {
      if (delay === 77) {
        tasks.push(() => callback.call(receiver, ...args));
        return task;
      }
      return originalTimeout(callback, delay, ...args);
    };
  }
  if (scenario === 'empty-session-raf') {
    global.requestAnimationFrame = function (callback) {
      tasks.push(() => callback.call(receiver, argument));
      return task;
    };
    global.cancelAnimationFrame = function () {};
  }

  const declaredEntry = pkg.exports['.'][moduleKind === 'esm' ? 'import' : 'require'].default;
  const entry = path.resolve(packageDir, declaredEntry);
  sdk = moduleKind === 'esm' ? await import(pathToFileURL(entry).href) : require(entry);
  assert.equal(sdk.SDK_VERSION, pkg.version, 'SDK_VERSION must match package metadata');
  const common = {
    dsn: 'https://probe@example.invalid/0',
    release: `public-behavior@${pkg.version}`,
    sendClientReports: false,
  };
  const evidence = { version: pkg.version, module: moduleKind, scenario };
  try {
    if (scenario.startsWith('empty-session')) {
      let captureScope;
      client = sdk.init({
        ...common,
        defaultIntegrations: false,
        integrations: [
          sdk.tryCatchIntegration(),
          sdk.networkBreadcrumbsIntegration(),
          sdk.spanStreamingIntegration(),
        ],
        tracesSampleRate: 1,
        beforeSend(event) {
          captureScope = {
            current: sdk.getCurrentScope().getSession()?.sid ?? null,
            isolation: sdk.getIsolationScope().getSession()?.sid ?? null,
          };
          return event;
        },
        beforeBreadcrumb(breadcrumb) {
          if (scenario === 'empty-session-request' && breadcrumb.category === 'xhr') {
            sdk.captureException(originalError);
          }
          return breadcrumb;
        },
        transport: () => ({
          send(envelope) {
            observed.push(envelope);
            return Promise.resolve({ statusCode: 200 });
          },
          flush() {
            return Promise.resolve(true);
          },
        }),
      });
      assert.ok(client);
      assert.equal(sdk.getIsolationScope().getSession(), undefined);
      let later;
      const throwOriginal = function (arg) {
        assert.equal(this, receiver, 'business callback receiver must be preserved');
        assert.equal(arg, argument, 'business callback argument must be preserved');
        throw originalError;
      };
      if (scenario === 'empty-session-timer')
        assert.equal(setTimeout(throwOriginal, 77, argument), task);
      if (scenario === 'empty-session-raf')
        assert.equal(requestAnimationFrame(throwOriginal), task);
      if (scenario === 'empty-session-request') {
        assert.equal(
          host.request({
            url: 'https://business.example.test/async',
            success(response) {
              assert.equal(this, receiver);
              assert.equal(response, argument);
              return businessValue;
            },
          }),
          task,
          'native request task identity must be preserved',
        );
      }
      let callback = tasks[0];
      if (scenario === 'empty-session-wrap') {
        assert.equal(
          sdk.wrap(() => businessValue)(),
          businessValue,
          'wrap must preserve business return identity',
        );
        const promise = Promise.resolve(businessValue);
        assert.equal(
          sdk.wrap(() => promise)(),
          promise,
          'wrap must preserve business Promise identity',
        );
        callback = sdk.wrap(function (arg) {
          later = sdk.startSession();
          sdk.captureSession();
          return throwOriginal.call(this, arg);
        });
      } else {
        later = sdk.startSession();
        sdk.captureSession();
      }
      let thrown;
      if (scenario === 'empty-session-request') {
        assert.equal(
          requestOptions.success.call(receiver, argument),
          businessValue,
          'wrapped request success result identity must be preserved',
        );
      } else {
        try {
          callback.call(receiver, argument);
        } catch (error) {
          thrown = error;
        }
        assert.equal(thrown, originalError, 'original business Error identity must be preserved');
      }
      assert.equal(await client.flush(1000), true);
      const payloads = observed.flatMap((envelope) => envelope[1]);
      evidence.captureScope = captureScope;
      evidence.later = { sid: later.sid, status: later.status, errors: later.errors };
      evidence.events = payloads
        .filter(([header]) => header.type === 'event')
        .map(([, event]) => ({
          eventId: event.event_id,
          message: event.exception?.values?.[0]?.value,
        }));
      evidence.originalErrorPreserved =
        scenario === 'empty-session-request' ? null : thrown === originalError;
      assert.equal(evidence.events.length, 1, 'actual error event must be delivered once');
      assert.equal(evidence.events[0].message, originalError.message);
      assert.equal(
        later.errors,
        0,
        'late operation without a Session must not increment later Session B',
      );
      assert.equal(later.status, 'ok', 'late operation must not mark later Session unhandled');
      sdk.endSession();
      assert.equal(await client.flush(1000), true);
      evidence.finalSession = observed
        .flatMap((envelope) => envelope[1])
        .filter(([header, session]) => header.type === 'session' && session.sid === later.sid)
        .map(([, session]) => ({
          sid: session.sid,
          status: session.status,
          errors: session.errors,
        }))
        .at(-1);
      assert.deepEqual(evidence.finalSession, { sid: later.sid, status: 'exited', errors: 0 });
      // Positive control: avoiding wrong attribution must not disable normal Core Session updates.
      const directSession = sdk.startSession();
      sdk.captureSession();
      const controlMessage = 'ordinary public capture belongs to current Session';
      const controlId = sdk.captureException(new Error(controlMessage));
      assert.equal(await client.flush(1000), true);
      assert.equal(directSession.status, 'ok');
      assert.equal(
        directSession.errors,
        1,
        'ordinary public capture must update current isolation Session',
      );
      const controlEvents = observed
        .flatMap((envelope) => envelope[1])
        .filter(([header]) => header.type === 'event')
        .map(([, event]) => event);
      assert.equal(controlEvents.length, 2, 'ownership fix must preserve both real error events');
      assert.equal(controlEvents[1].event_id, controlId);
      assert.equal(controlEvents[1].exception.values[0].value, controlMessage);
      sdk.endSession();
      assert.equal(await client.flush(1000), true);
      evidence.directCaptureControl = observed
        .flatMap((envelope) => envelope[1])
        .filter(
          ([header, session]) => header.type === 'session' && session.sid === directSession.sid,
        )
        .map(([, session]) => ({ status: session.status, errors: session.errors }))
        .at(-1);
      assert.deepEqual(evidence.directCaptureControl, { status: 'exited', errors: 1 });
      const seen = new WeakSet();
      const inspect = (value) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        assert.notEqual(value, later, 'Session reference must not escape into any envelope');
        assert.notEqual(
          value,
          directSession,
          'control Session reference must not escape into any envelope',
        );
        assert.equal(
          Reflect.ownKeys(value).some((key) => typeof key === 'symbol'),
          false,
          'SDK ownership Symbols must not escape into any envelope',
        );
        assert.equal(
          'sdkProcessingMetadata' in value,
          false,
          'SDK processing metadata must not escape into any envelope',
        );
        Object.values(value).forEach(inspect);
      };
      observed.forEach(inspect);
      evidence.envelopeTypes = [
        ...new Set(observed.flatMap((envelope) => envelope[1].map(([header]) => header.type))),
      ];
    } else {
      client = sdk.init({ ...common, enableOfflineCache: false, requireConsent: frozen });
      assert.ok(client, 'default init must work with readonly/frozen host capabilities');
      assert.equal(
        '__sentryStorageAdapted' in host,
        false,
        'SDK must not add a storage adaptation marker',
      );
      if (frozen) {
        for (const name of ['getStorageSync', 'setStorageSync', 'removeStorageSync']) {
          assert.equal(host[name], storage[name], `SDK must not replace ${name}`);
        }
        assert.equal(host.getStorageSync.call(receiver, { key: 'business' }), businessReadResult);
        assert.equal(
          host.setStorageSync.call(receiver, { key: 'business', data: businessValue }),
          businessWriteResult,
        );
        assert.equal(
          host.removeStorageSync.call(receiver, { key: 'business' }),
          businessWriteResult,
        );
        assert.equal(
          'request' in host,
          false,
          'SDK must not add request alias to native httpRequest host',
        );
      }
      assert.equal(
        host.httpRequest({
          url: 'https://business.example.test/native',
          success(response) {
            assert.equal(this, receiver);
            assert.equal(response, argument);
            return businessValue;
          },
        }),
        task,
        'native task identity must be preserved',
      );
      const id = client.captureException(originalError);
      assert.equal(await client.flush(1000), true);
      if (frozen) {
        assert.equal(transmitted.length, 0, 'consent gate must suppress network transmission');
        assert.equal(client.getOfflineStoreDiagnostics().mode, 'persistent');
        assert.ok(
          [...disk.values()].some((value) => typeof value === 'string' && value.includes(id)),
          'pending event must persist through native object-shaped storage',
        );
        client.setConsent(true);
        let replayDeadline;
        try {
          await Promise.race([
            delivered,
            new Promise((_resolve, reject) => {
              replayDeadline = originalTimeout(
                () => reject(new Error('consent replay did not deliver the stored event')),
                2000,
              );
            }),
          ]);
        } finally {
          clearTimeout(replayDeadline);
        }
        assert.equal(await client.flush(1000), true);
      }
      assert.equal(
        transmitted.length,
        1,
        'default transport must deliver exactly one actual event',
      );
      const lines = transmitted[0].data.split('\n');
      assert.equal(JSON.parse(lines[1]).type, 'event');
      const event = JSON.parse(lines[2]);
      assert.equal(event.event_id, id);
      assert.equal(event.exception.values[0].value, originalError.message);
      assert.equal(event.sdk.version, pkg.version);
      evidence.event = {
        id,
        message: event.exception.values[0].value,
        sdkVersion: event.sdk.version,
      };
      evidence.nativeStorageMethodsChecked = frozen;
      evidence.consentReplay = frozen;
      evidence.hostCalls = transmitted.length;
      evidence.offlineMode = client.getOfflineStoreDiagnostics()?.mode ?? null;
    }
    return { ...evidence, passed: true };
  } catch (error) {
    error.evidence = evidence;
    throw error;
  } finally {
    client?.dispose();
    global.setTimeout = originalTimeout;
  }
}
