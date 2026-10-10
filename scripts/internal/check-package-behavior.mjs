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
const boundaryScenarios = [
  'platform-global-getter',
  'platform-signal-getter',
  'network-off-getter',
  'page-zeroargs',
  'minigame-cancel-getter',
  'fps-cancel-getter',
  'init-integrations-scope',
  'init-initialScope-scope',
  'init-transport-scope',
  'error-infer-ip',
  'session-start-ownership',
  'ignored-http-parent-propagation',
  'async-stacktrace',
];
const scenarios = [
  'empty-session-timer',
  'empty-session-raf',
  'empty-session-request',
  'empty-session-wrap',
  'my-frozen',
  'dd-frozen',
  'my-readonly-request',
  'dd-unreadable-storage',
  ...boundaryScenarios,
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
  if (boundaryScenarios.includes(scenario)) return runBoundaryScenario(pkg);
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

async function runBoundaryScenario(pkg) {
  const declaredEntry = pkg.exports['.'][moduleKind === 'esm' ? 'import' : 'require'].default;
  const entry = path.resolve(packageDir, declaredEntry);
  const sdk = moduleKind === 'esm' ? await import(pathToFileURL(entry).href) : require(entry);
  assert.equal(sdk.SDK_VERSION, pkg.version);
  const observed = [];
  const transmitted = [];
  const frames = [];
  const shows = [];
  const hides = [];
  const evidence = { version: pkg.version, module: moduleKind, scenario };
  const originalDateNow = Date.now;
  const originalError = new Error(`public package probe ${scenario}`);
  const receiver = { route: 'pages/public-consumer' };
  const businessValue = { businessReturnIdentity: true };
  let clock = 1700000000000;
  let client;
  const host = {
    request(options) {
      assert.equal(this, host, 'default transport must call the selected native host');
      transmitted.push(options);
      options.success({ statusCode: 200, header: {} });
      return businessValue;
    },
    getSystemInfoSync() {
      assert.equal(this, host, 'platform information receiver must remain the native host');
      return { brand: 'consumer-host', system: 'iOS 18', appName: 'Douyin' };
    },
    onShow(callback) {
      assert.equal(this, host);
      shows.push(callback);
    },
    onHide(callback) {
      assert.equal(this, host);
      hides.push(callback);
    },
  };
  global.wx = host;
  const transport = () => ({
    send(envelope) {
      observed.push(envelope);
      return Promise.resolve({ statusCode: 200 });
    },
    flush() {
      return Promise.resolve(true);
    },
  });
  const common = {
    dsn: 'https://probe@example.invalid/0',
    release: `public-behavior@${pkg.version}`,
    sendClientReports: false,
    enableOfflineCache: false,
    enableAutoSessionTracking: false,
  };
  const payloads = (type) =>
    observed
      .flatMap((envelope) => envelope[1])
      .filter(([header]) => header.type === type)
      .map(([, payload]) => payload);
  const finishEvent = async (message) => {
    const id = client.captureMessage(message);
    assert.equal(await client.flush(1000), true);
    const event = payloads('event').find((value) => value.event_id === id);
    assert.ok(event, 'actual final event envelope must be delivered');
    assert.equal(event.message, message);
    assert.equal(event.sdk.version, pkg.version);
    return event;
  };
  try {
    if (scenario.startsWith('platform-')) {
      global.tt = host;
      if (scenario === 'platform-global-getter') {
        Object.defineProperty(global, 'wx', {
          configurable: true,
          get() {
            throw new Error('unavailable platform alias');
          },
        });
      } else {
        global.wx = {
          request() {
            assert.fail('ambiguous first candidate must not receive event');
          },
        };
        host.getEnvInfoSync = function () {
          assert.equal(this, host);
          return Object.defineProperty({}, 'microapp', {
            get() {
              throw new Error('unreadable platform signal');
            },
          });
        };
      }
      client = sdk.init(common);
      assert.ok(client, 'one unavailable candidate or signal must not block init');
      const id = client.captureException(originalError);
      assert.equal(await client.flush(1000), true);
      assert.equal(transmitted.length, 1);
      const event = JSON.parse(transmitted[0].data.split('\n')[2]);
      assert.equal(event.event_id, id);
      assert.equal(event.sdk.version, pkg.version);
      assert.equal(event.contexts.miniapp.platform, 'bytedance');
      assert.equal(event.contexts.device.brand, 'consumer-host');
      evidence.event = {
        id,
        platform: event.contexts.miniapp.platform,
        sdkVersion: event.sdk.version,
      };
      evidence.hostCalls = transmitted.length;
    } else if (scenario === 'session-start-ownership') {
      let app;
      global.App = (options) => (app = options);
      host.onAppShow = host.onShow;
      host.onAppHide = host.onHide;
      const sessionOptions = {
        ...common,
        defaultIntegrations: [sdk.sessionIntegration()],
        transport,
      };
      evidence.actions = [];
      for (const action of ['show', 'hide', 'hide-show', 'dispose', 'init', 'throw']) {
        client?.dispose();
        sdk.setUser(null);
        sdk.getIsolationScope().setSession();
        observed.length = 0;
        client = sdk.init(sessionOptions);
        assert.ok(client);
        const owner = client;
        let businessCalls = 0;
        global.App({ onLaunch: () => businessCalls++ });
        let firstRead = true;
        let replacement;
        sdk.setUser({
          get id() {
            if (firstRead) {
              firstRead = false;
              if (action === 'show') app.onShow();
              if (action === 'hide' || action === 'hide-show') app.onHide();
              if (action === 'hide-show') app.onShow();
              if (action === 'dispose') owner.dispose();
              if (action === 'init') replacement = sdk.init(sessionOptions);
              if (action === 'throw') throw new Error('user unavailable');
            }
            return `user-${action}`;
          },
        });
        app.onLaunch();
        assert.equal(businessCalls, 1, 'business lifecycle callback must still run once');
        if (action === 'init') {
          assert.equal(replacement, undefined, 'telemetry reentry must not replace runtime');
          assert.equal(sdk.getClient(), owner);
        }
        const cancelled = ['hide', 'dispose', 'throw'].includes(action);
        assert.equal(payloads('session').length, cancelled ? 0 : 1, action);
        if (cancelled) assert.equal(sdk.getIsolationScope().getSession(), undefined, action);
        app.onShow();
        assert.equal(payloads('session').length, action === 'dispose' ? 0 : 1, action);
        if (action !== 'dispose') {
          assert.equal(payloads('session')[0].did, `user-${action}`);
          app.onHide();
          assert.deepEqual(
            payloads('session').map(({ status }) => status),
            ['ok', 'exited'],
          );
        }
        assert.equal(sdk.getIsolationScope().getSession(), undefined, action);
        evidence.actions.push({ action, sessions: payloads('session').length });
      }
      for (const showAgain of [false, true]) {
        client.dispose();
        sdk.setUser(null);
        observed.length = 0;
        client = sdk.init(sessionOptions);
        global.App({});
        let armed = true;
        sdk.getIsolationScope().addScopeListener((scope) => {
          if (!armed || !scope.getSession()) return;
          armed = false;
          app.onHide();
          if (showAgain) app.onShow();
        });
        try {
          app.onLaunch();
          assert.deepEqual(
            payloads('session').map(({ status }) => status),
            showAgain ? ['exited', 'ok'] : ['exited'],
          );
          app.onShow();
          assert.equal(payloads('session').length, 2);
          assert.notEqual(payloads('session')[0].sid, payloads('session')[1].sid);
          assert.equal(sdk.getIsolationScope().getSession().sid, payloads('session')[1].sid);
          app.onHide();
          assert.deepEqual(
            payloads('session').map(({ status }) => status),
            ['exited', 'ok', 'exited'],
          );
          assert.equal(sdk.getIsolationScope().getSession(), undefined);
        } finally {
          armed = false;
        }
      }
      evidence.scopeListenerTerminalSentOnce = true;
      client.dispose();
      delete global.App;
      observed.length = 0;
      sdk.setUser({
        get id() {
          sdk.getClient().dispose();
          return 'retired-native-user';
        },
      });
      client = sdk.init(sessionOptions);
      assert.ok(client);
      assert.equal(shows.length, 1, 'native channel must be registered before initial session');
      shows[0]();
      hides[0]();
      assert.equal(payloads('session').length, 0);
      assert.equal(sdk.getIsolationScope().getSession(), undefined);
      sdk.setUser(null);
      client = sdk.init({ ...common, defaultIntegrations: false, transport });
      await finishEvent('session start boundary recovered');
      evidence.nativeInitialSessionDiscarded = true;
    } else if (scenario === 'error-infer-ip') {
      client = sdk.init({
        ...common,
        defaultIntegrations: false,
        dataCollection: { userInfo: false },
        transport,
      });
      assert.ok(client);
      const explicit = {
        id: 'business-id',
        email: 'explicit@example.test',
        username: 'explicit',
        ip_address: '203.0.113.9',
      };
      sdk.setUser(explicit);
      const explicitId = sdk.captureException(originalError);
      sdk.setUser(null);
      const anonymousError = new Error('anonymous error must also disable IP inference');
      const anonymousId = sdk.captureException(anonymousError);
      assert.equal(await client.flush(1000), true);
      const events = payloads('event').map((event) => JSON.parse(JSON.stringify(event)));
      evidence.events = events.map((event) => ({
        id: event.event_id,
        inferIp: event.sdk.settings?.infer_ip ?? null,
        user: event.user ?? null,
      }));
      assert.equal(events.length, 2, 'both actual error envelopes must be delivered');
      const explicitEvent = events.find((event) => event.event_id === explicitId);
      const anonymousEvent = events.find((event) => event.event_id === anonymousId);
      assert.ok(explicitEvent);
      assert.ok(anonymousEvent);
      assert.deepEqual(explicitEvent.user, explicit, 'explicit business user must be preserved');
      assert.equal(explicitEvent.exception.values[0].value, originalError.message);
      assert.equal(anonymousEvent.exception.values[0].value, anonymousError.message);
      assert.deepEqual(anonymousEvent.user ?? {}, {}, 'cleared user must not retain identity');
      for (const event of events) {
        assert.equal(event.sdk.version, pkg.version);
        assert.equal(
          event.sdk.settings?.infer_ip,
          'never',
          'error must disable Relay IP inference',
        );
      }
    } else if (scenario === 'ignored-http-parent-propagation') {
      const requestReceiver = {};
      const response = { statusCode: 200 };
      const task = { abort() {} };
      let businessCalls = 0;
      host.request = function (options) {
        assert.equal(this, requestReceiver, 'native request receiver must be preserved');
        transmitted.push(options);
        businessCalls += 1;
        assert.equal(options.success.call(receiver, response), businessValue);
        return task;
      };
      evidence.controls = [];
      for (const propagateTraceparent of [false, true]) {
        const envelopeStart = observed.length;
        const requestStart = transmitted.length;
        client = sdk.init({
          ...common,
          tracesSampleRate: 1,
          ignoreSpans: [{ op: 'http.client' }],
          tracePropagationTargets: ['https://business.example.test'],
          propagateTraceparent,
          enableMinigameLifecycle: false,
          enableMinigameFrameRate: false,
          transport,
        });
        assert.ok(client);
        const originalHeader = { 'x-business': 'preserved' };
        const originalOptions = {
          url: 'https://business.example.test/ignored-http',
          header: originalHeader,
          success(result) {
            assert.equal(this, receiver);
            assert.equal(result, response);
            return businessValue;
          },
        };
        let parentHeaders;
        const returned = sdk.startSpan({ name: 'business.parent', op: 'ui.action' }, () => {
          parentHeaders = sdk.getTraceData({ propagateTraceparent });
          return host.request.call(requestReceiver, originalOptions);
        });
        assert.equal(returned, task, 'native request task identity must be preserved');
        assert.equal(await client.flush(1000), true);
        const parentRequestHeaders = transmitted[requestStart].header;
        assert.equal(parentRequestHeaders['x-business'], 'preserved');
        assert.match(parentHeaders['sentry-trace'], /-1$/);
        for (const key of ['sentry-trace', 'baggage']) {
          assert.equal(
            parentRequestHeaders[key],
            parentHeaders[key],
            `must propagate parent ${key}`,
          );
        }
        if (propagateTraceparent) {
          assert.equal(parentRequestHeaders.traceparent, parentHeaders.traceparent);
          assert.match(parentRequestHeaders.traceparent, /-01$/);
        } else assert.equal('traceparent' in parentRequestHeaders, false);
        assert.equal(host.request.call(requestReceiver, originalOptions), task);
        assert.equal(await client.flush(1000), true);
        assert.equal(transmitted.length, requestStart + 2, 'both business requests must run once');
        const noParentHeaders = transmitted[requestStart + 1].header;
        assert.equal(noParentHeaders['x-business'], 'preserved');
        assert.match(noParentHeaders['sentry-trace'], /^[0-9a-f]{32}-[0-9a-f]{16}-0$/);
        if (propagateTraceparent) {
          const [traceId, spanId] = noParentHeaders['sentry-trace'].split('-');
          assert.equal(noParentHeaders.traceparent, `00-${traceId}-${spanId}-00`);
        } else assert.equal('traceparent' in noParentHeaders, false);
        assert.equal(originalOptions.header, originalHeader);
        assert.deepEqual(originalHeader, { 'x-business': 'preserved' });
        const spans = observed
          .slice(envelopeStart)
          .flatMap((envelope) => envelope[1])
          .filter(([header]) => header.type === 'span')
          .flatMap(([, container]) => container.items);
        assert.equal(spans.length, 1, 'ignored HTTP spans must not enter final envelopes');
        assert.equal(spans[0].name, 'business.parent');
        assert.equal(
          parentRequestHeaders['sentry-trace'],
          `${spans[0].trace_id}-${spans[0].span_id}-1`,
        );
        // Manual trace identity owns the entire propagation set, even when W3C propagation is off.
        const manualTrace = `${'a'.repeat(32)}-${'b'.repeat(16)}-1`;
        const manualParent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`;
        const field = propagateTraceparent ? 'headers' : 'header';
        for (const manualHeaders of [
          { 'Sentry-Trace': manualTrace, Baggage: 'tenant=demo' },
          { Traceparent: manualParent, baggage: 'tenant=demo' },
        ]) {
          const headers = Object.freeze(manualHeaders);
          const options = Object.freeze({
            ...originalOptions,
            header: undefined,
            [field]: headers,
          });
          assert.equal(host.request.call(requestReceiver, options), task);
          assert.equal(await client.flush(1000), true);
          assert.equal(transmitted.at(-1)[field], headers);
          assert.deepEqual(transmitted.at(-1)[field], manualHeaders);
          assert.equal(options[field], headers);
        }
        assert.equal(
          observed
            .slice(envelopeStart)
            .flatMap((envelope) => envelope[1])
            .filter(([header]) => header.type === 'span')
            .flatMap(([, container]) => container.items).length,
          1,
          'manual propagation must not re-enable ignored HTTP spans',
        );
        evidence.controls.push({
          propagateTraceparent,
          parent: 'sampled',
          noParent: 'unsampled',
          spans: 1,
        });
        client.dispose();
      }
      assert.equal(businessCalls, 8);
    } else if (scenario === 'async-stacktrace') {
      const sourceFilename = 'pages/index/index.js';
      const codeFile = `app:///${sourceFilename}`;
      const debugId = '11111111-2222-4333-8444-555555555555';
      global._sentryDebugIds = {
        [`Error\n    at buildDebugId (${sourceFilename}:1:1)`]: debugId,
      };
      delete global._debugIds;
      client = sdk.init({
        ...common,
        enableSystemInfo: false,
        defaultIntegrations: [sdk.rewriteFramesIntegration()],
        transport,
      });
      assert.ok(client);
      evidence.events = [];
      for (const header of [true, false]) {
        const error = new Error('async mapped error');
        error.stack = `${header ? 'Error: async mapped error\n' : ''}    at async ${sourceFilename}:42:13`;
        const eventId = sdk.captureException(error);
        assert.equal(await client.flush(1000), true);
        const event = payloads('event').find((value) => value.event_id === eventId);
        assert.ok(event, 'actual final async error envelope must be delivered');
        const stackFrames = event.exception?.values?.[0]?.stacktrace?.frames;
        evidence.events.push({
          header,
          eventId,
          frames: stackFrames,
          images: event.debug_meta?.images,
        });
        assert.equal(event.exception.values[0].value, error.message);
        assert.equal(event.sdk.version, pkg.version);
        assert.equal(stackFrames?.length, 1);
        assert.equal(stackFrames[0].filename, codeFile);
        assert.equal(stackFrames[0].lineno, 42);
        assert.equal(stackFrames[0].colno, 13);
        assert.equal(stackFrames[0].function, '?');
        assert.equal(stackFrames[0].debug_id, undefined);
        assert.deepEqual(event.debug_meta?.images, [
          { type: 'sourcemap', code_file: codeFile, debug_id: debugId },
        ]);
        assert.equal(event.sdkProcessingMetadata, undefined);
      }
      assert.equal(payloads('event').length, 2);
    } else if (scenario === 'network-off-getter') {
      let handler;
      host.onNetworkStatusChange = function (callback) {
        assert.equal(this, host);
        handler = callback;
      };
      Object.defineProperty(host, 'offNetworkStatusChange', {
        configurable: true,
        get() {
          throw new Error('optional off unavailable');
        },
      });
      client = sdk.init({
        ...common,
        defaultIntegrations: [sdk.networkStatusIntegration()],
        transport,
      });
      assert.equal(typeof handler, 'function', 'optional off failure must not block usable on');
      let reconnectFlushes = 0;
      client.on('flush', () => {
        reconnectFlushes += 1;
      });
      handler({ networkType: 'none', isConnected: false });
      handler({ networkType: 'wifi', isConnected: true });
      assert.equal(reconnectFlushes, 1);
      const event = await finishEvent('network callback delivered');
      assert.deepEqual(event.contexts.network, { type: 'wifi', isConnected: true });
      assert.equal(
        event.breadcrumbs.filter((value) => value.category === 'network.change').length,
        2,
      );
      client.dispose();
      let lateReads = 0;
      const late = new Proxy(
        {},
        {
          get() {
            lateReads += 1;
          },
        },
      );
      handler(late);
      assert.equal(lateReads, 0);
      let offCalls = 0;
      host.onNetworkStatusChange = function (callback) {
        assert.equal(this, host);
        sdk.getClient().dispose();
        handler = callback;
      };
      Object.defineProperty(host, 'offNetworkStatusChange', {
        configurable: true,
        get() {
          sdk.getClient().dispose();
          return function () {
            assert.equal(this, host);
            offCalls += 1;
          };
        },
      });
      client = sdk.init({
        ...common,
        defaultIntegrations: [sdk.networkStatusIntegration()],
        transport,
      });
      assert.equal(client.getOptions().enabled, false);
      assert.ok(offCalls > 0, 'a handler saved after registration disposal must be detached');
      handler(late);
      assert.equal(lateReads, 0, 'retired late handler must not read host payload');
      assert.equal(payloads('event').length, 1);
      evidence.controls = { reconnectFlushes: 1, partialRegistrationDisposal: true, lateReads };
    } else if (scenario === 'page-zeroargs') {
      global.Page = function (options) {
        assert.equal(this, global);
        return options;
      };
      let observerThrows = false;
      client = sdk.init({
        ...common,
        defaultIntegrations: [sdk.pageBreadcrumbsIntegration()],
        transport,
        beforeBreadcrumb(breadcrumb) {
          if (observerThrows) throw new Error('observation failure');
          return breadcrumb;
        },
      });
      let throwBusiness = false;
      let calls = 0;
      const page = global.Page({
        handleTap(...args) {
          calls += 1;
          assert.equal(this, receiver);
          assert.deepEqual(args, [], 'zero-argument business callback must stay zero-argument');
          if (throwBusiness) throw originalError;
          return businessValue;
        },
      });
      assert.equal(page.handleTap.call(receiver), businessValue);
      const event = await finishEvent('zeroargs interaction delivered');
      assert.ok(event.breadcrumbs.some((value) => value.category === 'user.interaction'));
      observerThrows = true;
      assert.equal(page.handleTap.call(receiver), businessValue);
      throwBusiness = true;
      for (let pass = 0; pass < 2; pass++) {
        let thrown;
        try {
          page.handleTap.call(receiver);
        } catch (error) {
          thrown = error;
        }
        assert.equal(
          thrown,
          originalError,
          'original Error identity must survive observer failure',
        );
        if (pass === 0) client.dispose();
      }
      throwBusiness = false;
      assert.equal(page.handleTap.call(receiver), businessValue);
      assert.equal(calls, 5);
      assert.equal(payloads('event').length, 1);
      evidence.controls = {
        zeroArgs: true,
        nativeReceiver: true,
        businessReturnIdentity: true,
        originalErrorIdentity: true,
        afterDisposeTransparent: true,
      };
    } else if (scenario.endsWith('-cancel-getter')) {
      Date.now = () => clock;
      const raf = function (callback) {
        assert.equal(this, global, 'native frame receiver must be global');
        frames.push(callback);
        return frames.length;
      };
      global.requestAnimationFrame = raf;
      Object.defineProperty(global, 'cancelAnimationFrame', {
        configurable: true,
        get() {
          throw new Error('optional cancel unavailable');
        },
      });
      const fps = scenario === 'fps-cancel-getter';
      const factory = fps ? sdk.minigameFrameRateIntegration : sdk.minigameIntegration;
      const options = {
        ...common,
        tracesSampleRate: 1,
        defaultIntegrations: [sdk.spanStreamingIntegration(), factory()],
        transport,
      };
      client = sdk.init(options);
      assert.equal(frames.length, 1, 'missing cancellation must not disable native sampling');
      clock += 20;
      frames[0]();
      if (fps) {
        clock += 20;
        frames[1]();
        hides.forEach((callback) => callback());
      }
      assert.equal(await client.flush(1000), true);
      const spanName = fps ? 'minigame.framerate.summary' : 'minigame.init_to_first_frame';
      const spans = payloads('span').flatMap((container) => container.items);
      assert.ok(
        spans.some((span) => span.name === spanName),
        'actual final span envelope must be delivered',
      );
      const frameCount = frames.length;
      const envelopeCount = observed.length;
      client.dispose();
      frames.forEach((callback) => callback());
      assert.equal(frames.length, frameCount);
      assert.equal(observed.length, envelopeCount);
      let cancelCalls = 0;
      const cancel = () => {
        cancelCalls += 1;
      };
      for (const field of ['requestAnimationFrame', 'cancelAnimationFrame']) {
        Object.defineProperty(global, 'requestAnimationFrame', {
          configurable: true,
          writable: true,
          value: raf,
        });
        Object.defineProperty(global, 'cancelAnimationFrame', {
          configurable: true,
          writable: true,
          value: cancel,
        });
        Object.defineProperty(global, field, {
          configurable: true,
          get() {
            sdk.getClient().dispose();
            return field === 'requestAnimationFrame' ? raf : cancel;
          },
        });
        const listeners = shows.length + hides.length;
        client = sdk.init({
          ...options,
          defaultIntegrations: [sdk.spanStreamingIntegration(), factory()],
        });
        assert.equal(client.getOptions().enabled, false);
        assert.equal(frames.length, frameCount, 'getter disposal must not schedule native frames');
        assert.equal(
          shows.length + hides.length,
          listeners,
          'getter disposal must not register lifecycle listeners',
        );
        assert.equal(cancelCalls, 0, 'getter disposal must not recreate a cancellation resource');
        assert.equal(observed.length, envelopeCount);
      }
      evidence.controls = {
        spanName,
        lateFramesInert: true,
        requestGetterDisposal: true,
        cancelGetterDisposal: true,
      };
    } else {
      const phase = scenario.slice('init-'.length, -'-scope'.length);
      const rootScope = sdk.getCurrentScope();
      const warningFailureControls = [];
      if (phase === 'transport') {
        for (const failureMode of ['getter', 'call']) {
          assert.equal(sdk.getClient(), undefined, 'warning control must be a first init');
          const warningDescriptor = Object.getOwnPropertyDescriptor(console, 'warn');
          const prototype = sdk.MiniappClient.prototype;
          const disposeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'dispose');
          const originalDispose = prototype.dispose;
          const disposed = [];
          let constructed = 0;
          let completeFirst;
          let pendingFirst;
          const firstCompletion = new Promise((resolve) => {
            completeFirst = resolve;
          });
          let attemptedFirst;
          let thrown;
          try {
            Object.defineProperty(prototype, 'dispose', {
              ...disposeDescriptor,
              value: function (...args) {
                disposed.push(this);
                return originalDispose.apply(this, args);
              },
            });
            const failWarning = () => {
              throw new Error(`diagnostic ${failureMode} unavailable`);
            };
            Object.defineProperty(console, 'warn', {
              configurable: true,
              ...(failureMode === 'getter'
                ? { get: failWarning }
                : { value: failWarning, writable: true }),
            });
            attemptedFirst = sdk.init({
              ...common,
              defaultIntegrations: false,
              transport() {
                constructed += 1;
                pendingFirst = sdk.startSpan(
                  { name: 'first transport scope' },
                  () => firstCompletion,
                );
                return transport();
              },
            });
          } catch (error) {
            thrown = error;
          } finally {
            if (warningDescriptor) Object.defineProperty(console, 'warn', warningDescriptor);
            else delete console.warn;
            if (disposeDescriptor) Object.defineProperty(prototype, 'dispose', disposeDescriptor);
            else delete prototype.dispose;
            completeFirst();
            await pendingFirst;
          }
          assert.equal(
            thrown === undefined,
            true,
            'diagnostic failure must not interrupt rejection cleanup',
          );
          assert.equal(
            attemptedFirst === undefined,
            true,
            'first transport scope must reject initialization',
          );
          assert.equal(constructed, 1);
          assert.equal(
            disposed.length,
            1,
            'unbound constructed client must be disposed exactly once',
          );
          const discarded = disposed[0];
          assert.ok(discarded instanceof sdk.MiniappClient);
          assert.equal(discarded.getOptions().enabled, false);
          assert.equal(sdk.getCurrentScope(), rootScope);
          assert.equal(
            sdk.getClient(),
            undefined,
            'failed first init must not bind its discarded client',
          );
          const beforeCapture = observed.length;
          discarded.captureMessage('discarded client must not capture');
          await discarded.flush(1000);
          await discarded
            .getTransport()
            .send([{}, [[{ type: 'event' }, { message: 'discarded send' }]]]);
          assert.equal(
            observed.length,
            beforeCapture,
            'discarded client must not deliver telemetry',
          );
          client = sdk.init({ ...common, defaultIntegrations: false, transport });
          assert.ok(client);
          await finishEvent(`safe root init after diagnostic ${failureMode} failure`);
          client.dispose();
          rootScope.setClient(undefined);
          client = undefined;
          warningFailureControls.push({
            failureMode,
            constructed,
            disposed: disposed.length,
            discardedCaptureBlocked: true,
            safeRootEventDelivered: true,
          });
        }
      }
      const priorEvents = payloads('event').length;
      client = sdk.init({ ...common, defaultIntegrations: false, tracesSampleRate: 1, transport });
      const originalClient = client;
      let complete;
      const completion = new Promise((resolve) => {
        complete = resolve;
      });
      let pending;
      const begin = () => {
        pending = sdk.startSpan({ name: 'configuration callback scope' }, () => completion);
      };
      let initialScopeCalls = 0;
      let transportCalls = 0;
      const attempted = sdk.init({
        ...common,
        defaultIntegrations: false,
        initialScope(scope) {
          initialScopeCalls += 1;
          if (phase === 'initialScope') begin();
          return scope;
        },
        transport() {
          transportCalls += 1;
          if (phase === 'transport') begin();
          return transport();
        },
        ...(phase === 'integrations' && {
          integrations(defaults) {
            begin();
            return defaults;
          },
        }),
      });
      complete();
      await pending;
      evidence.initializationPhase = phase;
      evidence.attemptedReturnedClient = attempted !== undefined;
      assert.equal(
        attempted === undefined,
        true,
        'configuration scope change must reject initialization',
      );
      assert.equal(sdk.getCurrentScope(), rootScope);
      if (phase === 'integrations') {
        assert.equal(initialScopeCalls, 0);
        assert.equal(transportCalls, 0);
        assert.equal(
          sdk.getClient(),
          originalClient,
          'early rejection must preserve the usable previous runtime',
        );
        await finishEvent('original runtime survived early rejection');
      } else {
        assert.equal(initialScopeCalls, 1);
        assert.equal(transportCalls, phase === 'transport' ? 1 : 0);
        assert.equal(
          sdk.getClient(),
          undefined,
          'later rejection must not resurrect retired runtime',
        );
      }
      // Positive control: setup starts its scope after root binding, so it remains supported.
      let finishSetup;
      const setupCompletion = new Promise((resolve) => {
        finishSetup = resolve;
      });
      let setupPending;
      client = sdk.init({
        ...common,
        defaultIntegrations: false,
        transport,
        integrations: [
          {
            name: 'PublicSetupScopeControl',
            setup() {
              setupPending = sdk.startSpan({ name: 'setup control' }, () => setupCompletion);
            },
          },
        ],
      });
      assert.ok(client);
      const nextClient = client;
      await finishEvent('before setup scope completion');
      finishSetup();
      await setupPending;
      assert.equal(sdk.getCurrentScope(), rootScope);
      assert.equal(
        sdk.getClient(),
        nextClient,
        'setup scope completion must preserve the newly bound runtime',
      );
      await finishEvent('after setup scope completion');
      assert.equal(payloads('event').length, priorEvents + (phase === 'integrations' ? 3 : 2));
      evidence.controls = {
        phase,
        rejectedInitialization: true,
        originalRuntimePreserved: phase === 'integrations',
        setupAfterRootBindingSupported: true,
        ...(warningFailureControls.length > 0 && { warningFailureControls }),
        finalEvents: payloads('event').length,
      };
    }
    return { ...evidence, passed: true };
  } catch (error) {
    error.evidence = evidence;
    throw error;
  } finally {
    client?.dispose();
    Date.now = originalDateNow;
  }
}
