(function(global2, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? factory(exports, require("@sentry/core")) : typeof define === "function" && define.amd ? define(["exports", "@sentry/core"], factory) : (global2 = typeof globalThis !== "undefined" ? globalThis : global2 || self, factory(global2.SentryMiniapp = {}, global2.SentryCore));
})(this, (function(exports2, core) {
  "use strict";var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __await = function(promise, isYieldStar) {
  this[0] = promise;
  this[1] = isYieldStar;
};
var __yieldStar = (value) => {
  var obj = value[__knownSymbol("asyncIterator")], isAwait = false, method, it = {};
  if (obj == null) {
    obj = value[__knownSymbol("iterator")]();
    method = (k) => it[k] = (x) => obj[k](x);
  } else {
    obj = obj.call(value);
    method = (k) => it[k] = (v) => {
      if (isAwait) {
        isAwait = false;
        if (k === "throw") throw v;
        return v;
      }
      isAwait = true;
      return {
        done: false,
        value: new __await(new Promise((resolve) => {
          var x = obj[k](v);
          if (!(x instanceof Object)) __typeError("Object expected");
          resolve(x);
        }), 1)
      };
    };
  }
  return it[__knownSymbol("iterator")] = () => it, method("next"), "throw" in obj ? method("throw") : it.throw = (x) => {
    throw x;
  }, "return" in obj && method("return"), it;
};

  class URLSearchParamsPolyfill {
    constructor(init2) {
      this.params = {};
      if (typeof init2 === "string") {
        this.parseString(init2);
      } else if (Array.isArray(init2)) {
        for (const pair of init2) {
          if (Array.isArray(pair) && pair.length >= 2) {
            this.append(pair[0] || "", pair[1] || "");
          }
        }
      } else if (init2 && typeof init2 === "object") {
        if (init2 instanceof URLSearchParamsPolyfill) {
          this.params = __spreadValues({}, init2.params);
        } else {
          this.params = __spreadValues({}, init2);
        }
      }
    }
    get size() {
      return Object.keys(this.params).length;
    }
    parseString(str) {
      if (str.startsWith("?")) {
        str = str.slice(1);
      }
      if (!str) {
        return;
      }
      const pairs = str.split("&");
      for (const pair of pairs) {
        const [key, value = ""] = pair.split("=");
        if (key) {
          this.params[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      }
    }
    append(name, value) {
      const existing = this.params[name];
      if (existing) {
        this.params[name] = existing + "," + value;
      } else {
        this.params[name] = value;
      }
    }
    delete(name) {
      delete this.params[name];
    }
    get(name) {
      var _a;
      return (_a = this.params[name]) != null ? _a : null;
    }
    getAll(name) {
      const value = this.params[name];
      return value ? [value] : [];
    }
    has(name) {
      return name in this.params;
    }
    set(name, value) {
      this.params[name] = String(value);
    }
    sort() {
      const sortedKeys = Object.keys(this.params).sort();
      const sortedParams = {};
      for (const key of sortedKeys) {
        sortedParams[key] = this.params[key] || "";
      }
      this.params = sortedParams;
    }
    toString() {
      const pairs = [];
      for (const [key, value] of Object.entries(this.params)) {
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
      return pairs.join("&");
    }
    forEach(callback) {
      for (const [key, value] of Object.entries(this.params)) {
        callback(value, key, this);
      }
    }
    *keys() {
      for (const key of Object.keys(this.params)) {
        yield key;
      }
    }
    *values() {
      for (const value of Object.values(this.params)) {
        yield value;
      }
    }
    *entries() {
      for (const [key, value] of Object.entries(this.params)) {
        yield [key, value];
      }
    }
    // Symbol.iterator to make it iterable
    *[Symbol.iterator]() {
      yield* __yieldStar(this.entries());
    }
  }
  function getGlobalObject() {
    const globalScope = Function("return this")();
    if (globalScope && typeof globalScope.wx !== "undefined" && globalScope.wx) {
      return globalScope.wx;
    }
    if (globalScope && typeof globalScope.my !== "undefined" && globalScope.my) {
      return globalScope.my;
    }
    if (globalScope && typeof globalScope.swan !== "undefined" && globalScope.swan) {
      return globalScope.swan;
    }
    if (globalScope && typeof globalScope.tt !== "undefined" && globalScope.tt) {
      return globalScope.tt;
    }
    if (globalScope && typeof globalScope.qq !== "undefined" && globalScope.qq) {
      return globalScope.qq;
    }
    if (typeof globalThis !== "undefined") {
      return globalThis;
    }
    if (typeof window !== "undefined") {
      return window;
    }
    if (typeof global !== "undefined") {
      return global;
    }
    if (typeof self !== "undefined") {
      return self;
    }
    return globalScope;
  }
  function installPolyfills() {
    try {
      const globalObj = getGlobalObject();
      if (!globalObj) {
        console.warn("[Sentry] Unable to detect global object, polyfills may not work correctly");
        return;
      }
      if (typeof globalObj.URLSearchParams === "undefined") {
        globalObj.URLSearchParams = URLSearchParamsPolyfill;
      }
      const globalScope = Function("return this")();
      if (globalScope && typeof globalScope.URLSearchParams === "undefined") {
        globalScope.URLSearchParams = URLSearchParamsPolyfill;
      }
      if (typeof globalThis !== "undefined" && typeof globalThis.URLSearchParams === "undefined") {
        globalThis.URLSearchParams = URLSearchParamsPolyfill;
      }
    } catch (error) {
      console.warn("[Sentry] Failed to install polyfills:", error);
    }
  }
  function ensurePolyfills() {
    installPolyfills();
  }
  ensurePolyfills();
  const SDK_VERSION = "1.0.0-beta.1";
  const SDK_NAME = "sentry.javascript.miniapp";
  const getSDK = () => {
    let currentSdk = {
      // tslint:disable-next-line: no-empty
      request: () => {
      },
      // tslint:disable-next-line: no-empty
      httpRequest: () => {
      },
      // tslint:disable-next-line: no-empty
      getSystemInfoSync: () => ({}),
      // tslint:disable-next-line: no-empty
      URLSearchParams: () => {
      }
    };
    if (typeof wx === "object" && wx !== null) {
      currentSdk = wx;
    } else if (typeof my === "object" && my !== null) {
      currentSdk = my;
    } else if (typeof tt === "object" && tt !== null) {
      currentSdk = tt;
    } else if (typeof dd === "object" && dd !== null) {
      currentSdk = dd;
    } else if (typeof qq === "object" && qq !== null) {
      currentSdk = qq;
    } else if (typeof swan === "object" && swan !== null) {
      currentSdk = swan;
    } else {
      throw new Error("sentry-miniapp 暂不支持此平台");
    }
    return currentSdk;
  };
  const getAppName = () => {
    let currentAppName = "unknown";
    if (typeof wx === "object" && wx !== null) {
      currentAppName = "wechat";
    } else if (typeof my === "object" && my !== null) {
      currentAppName = "alipay";
    } else if (typeof tt === "object" && tt !== null) {
      currentAppName = "bytedance";
    } else if (typeof dd === "object" && dd !== null) {
      currentAppName = "dingtalk";
    } else if (typeof qq === "object" && qq !== null) {
      currentAppName = "qq";
    } else if (typeof swan === "object" && swan !== null) {
      currentAppName = "swan";
    }
    return currentAppName;
  };
  const getSystemInfo = () => {
    try {
      const currentSdk = getSDK();
      if (currentSdk.getDeviceInfo && currentSdk.getWindowInfo && currentSdk.getAppBaseInfo) {
        const deviceInfo = currentSdk.getDeviceInfo();
        const windowInfo = currentSdk.getWindowInfo();
        const appBaseInfo = currentSdk.getAppBaseInfo();
        return {
          brand: deviceInfo.brand || "",
          model: deviceInfo.model || "",
          pixelRatio: windowInfo.pixelRatio || 1,
          screenWidth: windowInfo.screenWidth || 0,
          screenHeight: windowInfo.screenHeight || 0,
          windowWidth: windowInfo.windowWidth || 0,
          windowHeight: windowInfo.windowHeight || 0,
          statusBarHeight: windowInfo.statusBarHeight || 0,
          language: appBaseInfo.language || "",
          version: appBaseInfo.version || deviceInfo.system || "",
          system: deviceInfo.system || "",
          platform: deviceInfo.platform || "",
          fontSizeSetting: appBaseInfo.fontSizeSetting || 0,
          SDKVersion: appBaseInfo.SDKVersion || "",
          benchmarkLevel: deviceInfo.benchmarkLevel,
          albumAuthorized: deviceInfo.albumAuthorized,
          cameraAuthorized: deviceInfo.cameraAuthorized,
          locationAuthorized: deviceInfo.locationAuthorized,
          microphoneAuthorized: deviceInfo.microphoneAuthorized,
          notificationAuthorized: deviceInfo.notificationAuthorized,
          bluetoothEnabled: deviceInfo.bluetoothEnabled,
          locationEnabled: deviceInfo.locationEnabled,
          wifiEnabled: deviceInfo.wifiEnabled,
          safeArea: windowInfo.safeArea
        };
      }
      if (currentSdk.getSystemInfoSync) {
        console.warn("[Sentry] getSystemInfoSync is deprecated. Please update to use getDeviceInfo/getWindowInfo/getAppBaseInfo.");
        return currentSdk.getSystemInfoSync();
      }
    } catch (error) {
      console.warn("Failed to get system info:", error);
    }
    return null;
  };
  const isMiniappEnvironment = () => {
    try {
      getSDK();
      return true;
    } catch (e) {
      return false;
    }
  };
  let _sdk = null;
  let _appName = null;
  const sdk = () => {
    if (_sdk === null) {
      _sdk = getSDK();
    }
    return _sdk;
  };
  const appName = () => {
    if (_appName === null) {
      _appName = getAppName();
    }
    return _appName;
  };
  function createMiniappTransport(options) {
    const transportUrl = options.url;
    function makeRequest(request) {
      return new Promise((resolve, reject) => {
        var _a, _b, _c, _d;
        const requestOptions = {
          url: transportUrl,
          method: "POST",
          data: request.body,
          header: __spreadValues({
            "Content-Type": "application/json"
          }, request.headers),
          timeout: 1e4,
          success: (res) => {
            var _a2, _b2;
            const status = res.statusCode;
            resolve({
              statusCode: status,
              headers: {
                "x-sentry-rate-limits": (_a2 = res.header) == null ? void 0 : _a2["x-sentry-rate-limits"],
                "retry-after": (_b2 = res.header) == null ? void 0 : _b2["retry-after"]
              }
            });
          },
          fail: (error) => {
            reject(new Error(`Network request failed: ${error.errMsg || error.message || "Unknown error"}`));
          }
        };
        if (sdk().request) {
          (_b = (_a = sdk()).request) == null ? void 0 : _b.call(_a, requestOptions);
        } else if (sdk().httpRequest) {
          (_d = (_c = sdk()).httpRequest) == null ? void 0 : _d.call(_c, requestOptions);
        } else {
          reject(new Error("No request method available in current miniapp environment"));
        }
      });
    }
    return core.createTransport(options, makeRequest);
  }
  const index$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    createMiniappTransport
  }, Symbol.toStringTag, { value: "Module" }));
  class MiniappClient extends core.Client {
    /**
     * Creates a new Miniapp SDK instance.
     *
     * @param options Configuration options for this SDK.
     */
    constructor(options = {}) {
      super(__spreadProps(__spreadValues({}, options), {
        transport: options.transport || ((transportOptions) => {
          return createMiniappTransport(__spreadProps(__spreadValues({}, transportOptions), {
            headers: {}
          }));
        })
      }));
    }
    /**
     * @inheritDoc
     */
    eventFromException(exception) {
      return Promise.resolve({
        exception: {
          values: [{
            type: exception.name || "Error",
            value: exception.message || String(exception)
          }]
        },
        level: "error"
      });
    }
    eventFromMessage(message, level = "info") {
      return Promise.resolve({
        message,
        level
      });
    }
    _prepareEvent(event, hint, scope) {
      event.platform = event.platform || this.getOptions().platform || "javascript";
      event.sdk = __spreadProps(__spreadValues({}, event.sdk), {
        name: SDK_NAME,
        packages: [
          ...event.sdk && event.sdk.packages || [],
          {
            name: "npm:@sentry/miniapp",
            version: SDK_VERSION
          }
        ],
        version: SDK_VERSION
      });
      if (!event.contexts) {
        event.contexts = {};
      }
      event.contexts["miniapp"] = {
        platform: appName(),
        sdk_version: SDK_VERSION
      };
      const systemInfo = getSystemInfo();
      if (systemInfo) {
        event.contexts.device = {
          brand: systemInfo.brand,
          model: systemInfo.model,
          screen_resolution: `${systemInfo.screenWidth}x${systemInfo.screenHeight}`,
          language: systemInfo.language,
          version: systemInfo.version,
          system: systemInfo.system,
          platform: systemInfo.platform
        };
        event.contexts.os = {
          name: systemInfo.system,
          version: systemInfo.version
        };
        event.contexts.app = {
          app_version: systemInfo.SDKVersion
        };
      }
      try {
        const currentScope = scope || core.getCurrentScope();
        const isolationScope = core.getIsolationScope();
        return super._prepareEvent(event, hint || {}, currentScope, isolationScope);
      } catch (error) {
        return Promise.resolve(event);
      }
    }
    /**
     * Show a report dialog to the user to send feedback to a specific event.
     * 向用户显示报告对话框以将反馈发送到特定事件。
     * 注意：小程序环境使用模态对话框模拟此功能
     *
     * @param options Set individual options for the dialog
     */
    showReportDialog(options = {}) {
      const showModal = sdk().showModal;
      if (showModal) {
        showModal({
          title: options.title || "错误反馈",
          content: options.subtitle || "应用遇到了一个错误，是否要发送错误报告？",
          confirmText: "发送",
          cancelText: "取消",
          success: (res) => {
            if (res.confirm && options.onLoad) {
              options.onLoad();
            }
          }
        });
      } else {
        console.warn("sentry-miniapp: showModal is not available in current miniapp platform", options);
      }
    }
    /**
     * Capture feedback using the new feedback API.
     * 使用新的反馈 API 捕获反馈
     *
     * @param params Feedback parameters
     * @returns Event ID
     */
    captureFeedback(params) {
      const feedbackEvent = {
        contexts: {
          feedback: {
            contact_email: params.email,
            name: params.name,
            message: params.message,
            url: params.url,
            source: params.source,
            associated_event_id: params.associatedEventId
          }
        },
        type: "feedback",
        level: "info",
        tags: params.tags || {}
      };
      const scope = core.getCurrentScope();
      return scope.captureEvent(feedbackEvent);
    }
  }
  const _GlobalHandlers = class _GlobalHandlers {
    /** JSDoc */
    constructor(options) {
      this.name = _GlobalHandlers.id;
      this._onErrorHandlerInstalled = false;
      this._onUnhandledRejectionHandlerInstalled = false;
      this._onPageNotFoundHandlerInstalled = false;
      this._onMemoryWarningHandlerInstalled = false;
      this._options = __spreadValues({
        onerror: true,
        onunhandledrejection: true,
        onpagenotfound: true,
        onmemorywarning: true
      }, options);
    }
    /**
     * @inheritDoc
     */
    setupOnce() {
      Error.stackTraceLimit = 50;
      if (this._options.onerror) {
        this._installGlobalOnErrorHandler();
      }
      if (this._options.onunhandledrejection) {
        this._installGlobalOnUnhandledRejectionHandler();
      }
      if (this._options.onpagenotfound) {
        this._installGlobalOnPageNotFoundHandler();
      }
      if (this._options.onmemorywarning) {
        this._installGlobalOnMemoryWarningHandler();
      }
    }
    /** JSDoc */
    _installGlobalOnErrorHandler() {
      var _a, _b;
      if (this._onErrorHandlerInstalled) {
        return;
      }
      if (sdk().onError) {
        (_b = (_a = sdk()).onError) == null ? void 0 : _b.call(_a, (err) => {
          const error = typeof err === "string" ? new Error(err) : err;
          core.captureException(error, {
            mechanism: {
              type: "onerror",
              handled: false
            }
          });
        });
      }
      this._onErrorHandlerInstalled = true;
    }
    /** JSDoc */
    _installGlobalOnUnhandledRejectionHandler() {
      var _a, _b;
      if (this._onUnhandledRejectionHandlerInstalled) {
        return;
      }
      if (sdk().onUnhandledRejection) {
        (_b = (_a = sdk()).onUnhandledRejection) == null ? void 0 : _b.call(_a, ({ reason, promise }) => {
          const error = typeof reason === "string" ? new Error(reason) : reason;
          core.captureException(error, {
            mechanism: {
              type: "onunhandledrejection",
              handled: false
            },
            extra: {
              promise
            }
          });
        });
      }
      this._onUnhandledRejectionHandlerInstalled = true;
    }
    /** JSDoc */
    _installGlobalOnPageNotFoundHandler() {
      var _a, _b;
      if (this._onPageNotFoundHandlerInstalled) {
        return;
      }
      if (sdk().onPageNotFound) {
        (_b = (_a = sdk()).onPageNotFound) == null ? void 0 : _b.call(_a, (res) => {
          const scope = core.getCurrentScope();
          const url = res.path.split("?")[0];
          scope.setTag("pagenotfound", url);
          scope.setContext("page_not_found", {
            path: res.path,
            query: res.query,
            isEntryPage: res.isEntryPage
          });
          core.captureException(new Error(`页面无法找到: ${url}`), {
            level: "warning",
            mechanism: {
              type: "onpagenotfound",
              handled: true
            }
          });
        });
      }
      this._onPageNotFoundHandlerInstalled = true;
    }
    /** JSDoc */
    _installGlobalOnMemoryWarningHandler() {
      var _a, _b;
      if (this._onMemoryWarningHandlerInstalled) {
        return;
      }
      if (sdk().onMemoryWarning) {
        (_b = (_a = sdk()).onMemoryWarning) == null ? void 0 : _b.call(_a, ({ level = -1 }) => {
          let levelMessage = "没有获取到告警级别信息";
          switch (level) {
            case 5:
              levelMessage = "TRIM_MEMORY_RUNNING_MODERATE";
              break;
            case 10:
              levelMessage = "TRIM_MEMORY_RUNNING_LOW";
              break;
            case 15:
              levelMessage = "TRIM_MEMORY_RUNNING_CRITICAL";
              break;
            default:
              return;
          }
          const scope = core.getCurrentScope();
          scope.setTag("memory-warning", String(level));
          scope.setContext("memory_warning", {
            level,
            message: levelMessage
          });
          core.captureException(new Error("内存不足告警"), {
            level: "warning",
            mechanism: {
              type: "onmemorywarning",
              handled: true
            }
          });
        });
      }
      this._onMemoryWarningHandlerInstalled = true;
    }
  };
  _GlobalHandlers.id = "GlobalHandlers";
  let GlobalHandlers = _GlobalHandlers;
  const _TryCatch = class _TryCatch {
    constructor() {
      this.name = _TryCatch.id;
      this._ignoreOnError = 0;
    }
    /** JSDoc */
    _wrapTimeFunction(original) {
      return function(...args) {
        const originalCallback = args[0];
        args[0] = wrap$1(originalCallback, {
          mechanism: {
            data: { function: getFunctionName(original) },
            handled: true,
            type: "instrument"
          }
        });
        return original.apply(this, args);
      };
    }
    /** JSDoc */
    _wrapRAF(original) {
      return function(callback) {
        return original(
          wrap$1(callback, {
            mechanism: {
              data: {
                function: "requestAnimationFrame",
                handler: getFunctionName(original)
              },
              handled: true,
              type: "instrument"
            }
          })
        );
      };
    }
    /**
     * Wrap timer functions and event targets to catch errors
     * and provide better metadata.
     */
    setupOnce() {
      this._ignoreOnError = this._ignoreOnError;
      const global2 = globalThis;
      if (global2.setTimeout) {
        fill(global2, "setTimeout", this._wrapTimeFunction.bind(this));
      }
      if (global2.setInterval) {
        fill(global2, "setInterval", this._wrapTimeFunction.bind(this));
      }
      if (global2.requestAnimationFrame) {
        fill(global2, "requestAnimationFrame", this._wrapRAF.bind(this));
      }
    }
  };
  _TryCatch.id = "TryCatch";
  let TryCatch = _TryCatch;
  function wrap$1(fn, options = {}, before) {
    if (typeof fn !== "function") {
      return fn;
    }
    try {
      if (fn.__sentry__) {
        return fn;
      }
      if (fn.__sentry_wrapped__) {
        return fn.__sentry_wrapped__;
      }
    } catch (e) {
      return fn;
    }
    const sentryWrapped = function(...args) {
      try {
        const wrappedArguments = args.map((arg) => wrap$1(arg, options));
        if (fn.handleEvent) {
          return fn.handleEvent.apply(this, wrappedArguments);
        }
        return fn.apply(this, wrappedArguments);
      } catch (ex) {
        const scope = core.getCurrentScope();
        scope.addEventProcessor((event) => {
          const processedEvent = __spreadValues({}, event);
          if (options.mechanism) {
            processedEvent.exception = processedEvent.exception || {};
            processedEvent.exception.mechanism = options.mechanism;
          }
          processedEvent.extra = __spreadProps(__spreadValues({}, processedEvent.extra), {
            arguments: args
          });
          return processedEvent;
        });
        core.captureException(ex);
        throw ex;
      }
    };
    try {
      for (const property in fn) {
        if (Object.prototype.hasOwnProperty.call(fn, property)) {
          sentryWrapped[property] = fn[property];
        }
      }
    } catch (_oO) {
    }
    fn.prototype = fn.prototype || {};
    sentryWrapped.prototype = fn.prototype;
    Object.defineProperty(fn, "__sentry_wrapped__", {
      enumerable: false,
      value: sentryWrapped
    });
    Object.defineProperties(sentryWrapped, {
      __sentry__: {
        enumerable: false,
        value: true
      },
      __sentry_original__: {
        enumerable: false,
        value: fn
      }
    });
    try {
      const descriptor = Object.getOwnPropertyDescriptor(sentryWrapped, "name");
      if (descriptor.configurable) {
        Object.defineProperty(sentryWrapped, "name", {
          get() {
            return fn.name;
          }
        });
      }
    } catch (_oO) {
    }
    return sentryWrapped;
  }
  function fill(source, name, replacementFactory) {
    if (!(name in source)) {
      return;
    }
    const original = source[name];
    const wrapped = replacementFactory(original);
    if (typeof wrapped === "function") {
      try {
        wrapped.prototype = wrapped.prototype || {};
        wrapped.prototype.constructor = wrapped;
      } catch (_Oo) {
      }
    }
    source[name] = wrapped;
  }
  function getFunctionName(fn) {
    try {
      return fn && fn.name || "<anonymous>";
    } catch (e) {
      return "<anonymous>";
    }
  }
  const DEFAULT_KEY = "cause";
  const DEFAULT_LIMIT = 5;
  const _LinkedErrors = class _LinkedErrors {
    /**
     * @inheritDoc
     */
    constructor(options = {}) {
      this.name = _LinkedErrors.id;
      this._key = options.key || DEFAULT_KEY;
      this._limit = options.limit || DEFAULT_LIMIT;
    }
    /**
     * @inheritDoc
     */
    setupOnce() {
    }
    /**
     * @inheritDoc
     */
    processEvent(event, hint) {
      const client = core.getCurrentScope().getClient();
      if (!client) {
        return event;
      }
      return this._handler(event, hint);
    }
    /**
     * @inheritDoc
     */
    _handler(event, hint) {
      if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
        return event;
      }
      const linkedErrors = this._walkErrorTree(hint.originalException, this._key);
      event.exception.values = [...linkedErrors, ...event.exception.values];
      return event;
    }
    /**
     * @inheritDoc
     */
    _walkErrorTree(error, key, stack = []) {
      if (!isInstanceOf(error[key], Error) || stack.length + 1 >= this._limit) {
        return stack;
      }
      const exception = core.exceptionFromError(() => [], error[key]);
      return this._walkErrorTree(error[key], key, [exception, ...stack]);
    }
  };
  _LinkedErrors.id = "LinkedErrors";
  let LinkedErrors = _LinkedErrors;
  function isInstanceOf(wat, base) {
    try {
      return wat instanceof base;
    } catch (_e) {
      return false;
    }
  }
  const _HttpContext = class _HttpContext {
    constructor() {
      this.name = _HttpContext.id;
    }
    /**
     * @inheritDoc
     */
    setupOnce() {
    }
    /**
     * @inheritDoc
     */
    processEvent(event) {
      const scope = core.getCurrentScope();
      const context = {
        runtime: {
          name: "miniapp",
          version: this._getMiniappVersion()
        },
        app: {
          name: this._getAppName(),
          version: this._getAppVersion()
        },
        device: this._getDeviceInfo(),
        network: this._getNetworkInfo()
      };
      scope.setContext("runtime", context.runtime);
      scope.setContext("app", context.app);
      scope.setContext("device", context.device);
      scope.setContext("network", context.network);
      return event;
    }
    /**
     * Get miniapp version
     */
    _getMiniappVersion() {
      var _a;
      try {
        const currentSdk = sdk();
        if (currentSdk.getAppBaseInfo) {
          const appBaseInfo = currentSdk.getAppBaseInfo();
          return (appBaseInfo == null ? void 0 : appBaseInfo.version) || (appBaseInfo == null ? void 0 : appBaseInfo.SDKVersion) || "unknown";
        }
        if (currentSdk.getSystemInfoSync) {
          const systemInfo = (_a = currentSdk.getSystemInfoSync) == null ? void 0 : _a.call(currentSdk);
          return systemInfo.version || systemInfo.SDKVersion || "unknown";
        }
      } catch (e) {
      }
      return "unknown";
    }
    /**
     * Get app name
     */
    _getAppName() {
      var _a, _b, _c;
      try {
        if (sdk().getAccountInfoSync) {
          const accountInfo = (_b = (_a = sdk()).getAccountInfoSync) == null ? void 0 : _b.call(_a);
          return ((_c = accountInfo.miniProgram) == null ? void 0 : _c.appId) || "unknown";
        }
      } catch (e) {
      }
      return "unknown";
    }
    /**
     * Get app version
     */
    _getAppVersion() {
      var _a, _b, _c;
      try {
        if (sdk().getAccountInfoSync) {
          const accountInfo = (_b = (_a = sdk()).getAccountInfoSync) == null ? void 0 : _b.call(_a);
          return ((_c = accountInfo == null ? void 0 : accountInfo.miniProgram) == null ? void 0 : _c.version) || "unknown";
        }
      } catch (e) {
      }
      return "unknown";
    }
    /**
     * Get device information
     */
    _getDeviceInfo() {
      try {
        const currentSdk = sdk();
        if (currentSdk.getDeviceInfo && currentSdk.getWindowInfo) {
          const deviceInfo = currentSdk.getDeviceInfo();
          const windowInfo = currentSdk.getWindowInfo();
          return {
            brand: deviceInfo == null ? void 0 : deviceInfo.brand,
            model: deviceInfo == null ? void 0 : deviceInfo.model,
            system: deviceInfo == null ? void 0 : deviceInfo.system,
            platform: deviceInfo == null ? void 0 : deviceInfo.platform,
            screenWidth: windowInfo == null ? void 0 : windowInfo.screenWidth,
            screenHeight: windowInfo == null ? void 0 : windowInfo.screenHeight,
            windowWidth: windowInfo == null ? void 0 : windowInfo.windowWidth,
            windowHeight: windowInfo == null ? void 0 : windowInfo.windowHeight
          };
        }
        if (currentSdk.getSystemInfoSync) {
          const systemInfo = currentSdk.getSystemInfoSync();
          return {
            brand: systemInfo == null ? void 0 : systemInfo.brand,
            model: systemInfo == null ? void 0 : systemInfo.model,
            system: systemInfo == null ? void 0 : systemInfo.system,
            platform: systemInfo == null ? void 0 : systemInfo.platform,
            screenWidth: systemInfo == null ? void 0 : systemInfo.screenWidth,
            screenHeight: systemInfo == null ? void 0 : systemInfo.screenHeight,
            pixelRatio: systemInfo == null ? void 0 : systemInfo.pixelRatio,
            language: systemInfo == null ? void 0 : systemInfo.language
          };
        }
      } catch (e) {
      }
      return {};
    }
    /**
     * Get network information
     */
    _getNetworkInfo() {
      try {
        if (sdk().getNetworkType) {
          sdk().getNetworkType({
            success: (res) => {
              const scope = core.getCurrentScope();
              scope.setTag("network.type", res.networkType);
              scope.setContext("network", {
                type: res.networkType
              });
            }
          });
        }
      } catch (e) {
      }
      return {};
    }
  };
  _HttpContext.id = "HttpContext";
  let HttpContext = _HttpContext;
  const _Dedupe = class _Dedupe {
    constructor() {
      this.name = _Dedupe.id;
    }
    /**
     * @inheritDoc
     */
    setupOnce() {
    }
    /**
     * @inheritDoc
     */
    processEvent(currentEvent, _hint) {
      if (currentEvent.type) {
        return currentEvent;
      }
      try {
        if (this._shouldDropEvent(currentEvent, this._previousEvent)) {
          return null;
        }
      } catch (_oO) {
        return this._previousEvent = currentEvent;
      }
      return this._previousEvent = currentEvent;
    }
    /** JSDoc */
    _shouldDropEvent(currentEvent, previousEvent) {
      if (!previousEvent) {
        return false;
      }
      if (this._isSameMessageEvent(currentEvent, previousEvent)) {
        return true;
      }
      if (this._isSameExceptionEvent(currentEvent, previousEvent)) {
        return true;
      }
      return false;
    }
    /** JSDoc */
    _isSameMessageEvent(currentEvent, previousEvent) {
      const currentMessage = currentEvent.message;
      const previousMessage = previousEvent.message;
      if (!currentMessage && !previousMessage) {
        return false;
      }
      if (currentMessage && !previousMessage || !currentMessage && previousMessage) {
        return false;
      }
      if (currentMessage !== previousMessage) {
        return false;
      }
      if (!this._isSameFingerprint(currentEvent, previousEvent)) {
        return false;
      }
      if (!this._isSameStacktrace(currentEvent, previousEvent)) {
        return false;
      }
      return true;
    }
    /** JSDoc */
    _isSameExceptionEvent(currentEvent, previousEvent) {
      const currentException = this._getExceptionFromEvent(currentEvent);
      const previousException = this._getExceptionFromEvent(previousEvent);
      if (!currentException || !previousException) {
        return false;
      }
      if (currentException.type !== previousException.type || currentException.value !== previousException.value) {
        return false;
      }
      if (!this._isSameFingerprint(currentEvent, previousEvent)) {
        return false;
      }
      if (!this._isSameStacktrace(currentEvent, previousEvent)) {
        return false;
      }
      return true;
    }
    /** JSDoc */
    _isSameStacktrace(currentEvent, previousEvent) {
      let currentFrames = this._getFramesFromEvent(currentEvent);
      let previousFrames = this._getFramesFromEvent(previousEvent);
      if (!currentFrames && !previousFrames) {
        return true;
      }
      if (currentFrames && !previousFrames || !currentFrames && previousFrames) {
        return false;
      }
      currentFrames = currentFrames;
      previousFrames = previousFrames;
      if (previousFrames.length !== currentFrames.length) {
        return false;
      }
      for (let i = 0; i < previousFrames.length; i++) {
        const frameA = previousFrames[i];
        const frameB = currentFrames[i];
        if (frameA.filename !== frameB.filename || frameA.lineno !== frameB.lineno || frameA.colno !== frameB.colno || frameA.function !== frameB.function) {
          return false;
        }
      }
      return true;
    }
    /** JSDoc */
    _isSameFingerprint(currentEvent, previousEvent) {
      let currentFingerprint = currentEvent.fingerprint;
      let previousFingerprint = previousEvent.fingerprint;
      if (!currentFingerprint && !previousFingerprint) {
        return true;
      }
      if (currentFingerprint && !previousFingerprint || !currentFingerprint && previousFingerprint) {
        return false;
      }
      currentFingerprint = currentFingerprint;
      previousFingerprint = previousFingerprint;
      try {
        return !!(currentFingerprint.join("") === previousFingerprint.join(""));
      } catch (_oO) {
        return false;
      }
    }
    /** JSDoc */
    _getExceptionFromEvent(event) {
      return event.exception && event.exception.values && event.exception.values[0];
    }
    /** JSDoc */
    _getFramesFromEvent(event) {
      const exception = event.exception;
      if (exception) {
        try {
          return exception.values[0].stacktrace.frames;
        } catch (_oO) {
        }
      }
      return void 0;
    }
  };
  _Dedupe.id = "Dedupe";
  let Dedupe = _Dedupe;
  const _System = class _System {
    constructor() {
      this.name = _System.id;
    }
    /**
     * @inheritDoc
     */
    setupOnce() {
      this._addSystemContext();
      this._addNetworkContext();
      this._addLocationContext();
    }
    /**
     * Add system information to context
     */
    _addSystemContext() {
      var _a, _b, _c, _d;
      try {
        const systemInfo = getSystemInfo();
        if (systemInfo) {
          const scope = core.getCurrentScope();
          scope.setContext("device", {
            name: systemInfo.model,
            model: systemInfo.model,
            brand: systemInfo.brand,
            family: systemInfo.platform,
            arch: systemInfo.platform
          });
          scope.setContext("os", {
            name: ((_a = systemInfo.system) == null ? void 0 : _a.split(" ")[0]) || "unknown",
            version: ((_b = systemInfo.system) == null ? void 0 : _b.split(" ")[1]) || "unknown",
            kernel_version: systemInfo.version
          });
          scope.setContext("app", {
            app_name: systemInfo.appName || "unknown",
            app_version: systemInfo.version
          });
          scope.setContext("screen", {
            screen_width: systemInfo.screenWidth,
            screen_height: systemInfo.screenHeight,
            screen_density: systemInfo.pixelRatio
          });
          scope.setTag("device.model", systemInfo.model);
          scope.setTag("device.brand", systemInfo.brand);
          scope.setTag("os.name", ((_c = systemInfo.system) == null ? void 0 : _c.split(" ")[0]) || "unknown");
          scope.setTag("os.version", ((_d = systemInfo.system) == null ? void 0 : _d.split(" ")[1]) || "unknown");
          scope.setTag("app.version", systemInfo.version);
          scope.setTag("language", systemInfo.language);
        }
      } catch (e) {
      }
    }
    /**
     * Add network information to context
     */
    _addNetworkContext() {
      try {
        if (sdk().getNetworkType) {
          sdk().getNetworkType({
            success: (res) => {
              const scope = core.getCurrentScope();
              scope.setContext("network", {
                type: res.networkType,
                connected: res.isConnected !== false
              });
              scope.setTag("network.type", res.networkType);
            },
            fail: () => {
            }
          });
        }
      } catch (e) {
      }
    }
    /**
     * Add location information to context (if available)
     */
    _addLocationContext() {
      try {
        if (sdk().getLocation) {
          sdk().getLocation({
            type: "gcj02",
            success: (res) => {
              const scope = core.getCurrentScope();
              scope.setContext("location", {
                latitude: res.latitude,
                longitude: res.longitude,
                accuracy: res.accuracy
              });
            },
            fail: () => {
            }
          });
        }
      } catch (e) {
      }
    }
  };
  _System.id = "System";
  let System = _System;
  const _Router = class _Router {
    constructor() {
      this.name = _Router.id;
      this._lastRoute = "";
    }
    /**
     * @inheritDoc
     */
    setupOnce() {
      this._instrumentNavigation();
      this._startRouteMonitoring();
    }
    /**
     * Instrument navigation functions
     */
    _instrumentNavigation() {
      const global2 = globalThis;
      if (global2.wx && global2.wx.navigateTo) {
        const originalNavigateTo = global2.wx.navigateTo;
        global2.wx.navigateTo = (options) => {
          this._recordNavigation("navigateTo", options.url, this._getCurrentRoute());
          return originalNavigateTo.call(global2.wx, options);
        };
      }
      if (global2.wx && global2.wx.redirectTo) {
        const originalRedirectTo = global2.wx.redirectTo;
        global2.wx.redirectTo = (options) => {
          this._recordNavigation("redirectTo", options.url, this._getCurrentRoute());
          return originalRedirectTo.call(global2.wx, options);
        };
      }
      if (global2.wx && global2.wx.switchTab) {
        const originalSwitchTab = global2.wx.switchTab;
        global2.wx.switchTab = (options) => {
          this._recordNavigation("switchTab", options.url, this._getCurrentRoute());
          return originalSwitchTab.call(global2.wx, options);
        };
      }
      if (global2.wx && global2.wx.navigateBack) {
        const originalNavigateBack = global2.wx.navigateBack;
        global2.wx.navigateBack = (options = {}) => {
          this._recordNavigation("navigateBack", "back", this._getCurrentRoute(), options.delta);
          return originalNavigateBack.call(global2.wx, options);
        };
      }
      if (global2.wx && global2.wx.reLaunch) {
        const originalReLaunch = global2.wx.reLaunch;
        global2.wx.reLaunch = (options) => {
          this._recordNavigation("reLaunch", options.url, this._getCurrentRoute());
          return originalReLaunch.call(global2.wx, options);
        };
      }
    }
    /**
     * Start monitoring route changes
     */
    _startRouteMonitoring() {
      setInterval(() => {
        const currentRoute = this._getCurrentRoute();
        if (currentRoute && currentRoute !== this._lastRoute) {
          this._recordRouteChange(this._lastRoute, currentRoute);
          this._lastRoute = currentRoute;
        }
      }, 1e3);
    }
    /**
     * Get current route
     */
    _getCurrentRoute() {
      try {
        const global2 = globalThis;
        if (global2.getCurrentPages) {
          const pages = global2.getCurrentPages();
          if (pages && pages.length > 0) {
            const currentPage = pages[pages.length - 1];
            return currentPage.route || currentPage.__route__ || "";
          }
        }
      } catch (e) {
      }
      return "";
    }
    /**
     * Record navigation action
     */
    _recordNavigation(action, to, from, delta) {
      const scope = core.getCurrentScope();
      core.addBreadcrumb({
        category: "navigation",
        data: {
          action,
          from,
          to,
          delta
        },
        message: `Navigation ${action}: ${from} -> ${to}`,
        type: "navigation"
      });
      scope.setTag("route", to === "back" ? from : to);
      scope.setContext("navigation", {
        action,
        from,
        to,
        delta,
        timestamp: Date.now()
      });
    }
    /**
     * Record route change
     */
    _recordRouteChange(from, to) {
      const scope = core.getCurrentScope();
      core.addBreadcrumb({
        category: "navigation",
        data: {
          from,
          to
        },
        message: `Route changed: ${from} -> ${to}`,
        type: "navigation"
      });
      scope.setTag("route", to);
      scope.setContext("route", {
        current: to,
        previous: from,
        timestamp: Date.now()
      });
    }
  };
  _Router.id = "Router";
  let Router = _Router;
  const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    Dedupe,
    GlobalHandlers,
    HttpContext,
    LinkedErrors,
    Router,
    System,
    TryCatch
  }, Symbol.toStringTag, { value: "Module" }));
  const defaultIntegrations = [
    // Core integrations
    new HttpContext(),
    new Dedupe(),
    new GlobalHandlers(),
    new TryCatch(),
    new LinkedErrors()
  ];
  function getDefaultIntegrations() {
    return [...defaultIntegrations];
  }
  function init(options = {}) {
    if (!isMiniappEnvironment()) {
      console.warn("sentry-miniapp: Not running in a supported miniapp environment");
      return void 0;
    }
    const opts = __spreadProps(__spreadValues({}, options), {
      integrations: options.integrations || defaultIntegrations,
      stackParser: () => [],
      transport: options.transport
    });
    core.setContext("miniapp", {
      platform: appName,
      environment: "miniapp"
    });
    const systemInfo = getSystemInfo();
    if (systemInfo) {
      core.setContext("device", {
        brand: systemInfo.brand,
        model: systemInfo.model,
        language: systemInfo.language,
        system: systemInfo.system,
        platform: systemInfo.platform,
        screen_resolution: `${systemInfo.screenWidth}x${systemInfo.screenHeight}`
      });
      core.setContext("app", {
        sdk_version: systemInfo.SDKVersion,
        version: systemInfo.version
      });
    }
    core.initAndBind(MiniappClient, opts);
    return core.getCurrentScope().getClient();
  }
  function showReportDialog(options = {}) {
    const client = core.getCurrentScope().getClient();
    if (client) {
      client.showReportDialog(options);
    } else {
      console.warn("sentry-miniapp: No client available for showReportDialog");
    }
  }
  function wrap(fn) {
    return (function(...args) {
      return core.withScope(() => {
        try {
          return fn.apply(this, args);
        } catch (error) {
          core.getCurrentScope().captureException(error);
          throw error;
        }
      });
    });
  }
  function captureFeedback(params) {
    const client = core.getCurrentScope().getClient();
    if (client) {
      return client.captureFeedback(params);
    } else {
      console.warn("sentry-miniapp: No client available for captureFeedback");
      return "";
    }
  }
  ensurePolyfills();
  Object.defineProperty(exports2, "addBreadcrumb", {
    enumerable: true,
    get: () => core.addBreadcrumb
  });
  Object.defineProperty(exports2, "addEventProcessor", {
    enumerable: true,
    get: () => core.addEventProcessor
  });
  Object.defineProperty(exports2, "addIntegration", {
    enumerable: true,
    get: () => core.addIntegration
  });
  Object.defineProperty(exports2, "captureEvent", {
    enumerable: true,
    get: () => core.captureEvent
  });
  Object.defineProperty(exports2, "captureException", {
    enumerable: true,
    get: () => core.captureException
  });
  Object.defineProperty(exports2, "captureMessage", {
    enumerable: true,
    get: () => core.captureMessage
  });
  Object.defineProperty(exports2, "captureSession", {
    enumerable: true,
    get: () => core.captureSession
  });
  Object.defineProperty(exports2, "close", {
    enumerable: true,
    get: () => core.close
  });
  Object.defineProperty(exports2, "closeSession", {
    enumerable: true,
    get: () => core.closeSession
  });
  Object.defineProperty(exports2, "endSession", {
    enumerable: true,
    get: () => core.endSession
  });
  Object.defineProperty(exports2, "flush", {
    enumerable: true,
    get: () => core.flush
  });
  Object.defineProperty(exports2, "getCurrentScope", {
    enumerable: true,
    get: () => core.getCurrentScope
  });
  Object.defineProperty(exports2, "getIsolationScope", {
    enumerable: true,
    get: () => core.getIsolationScope
  });
  Object.defineProperty(exports2, "isEnabled", {
    enumerable: true,
    get: () => core.isEnabled
  });
  Object.defineProperty(exports2, "lastEventId", {
    enumerable: true,
    get: () => core.lastEventId
  });
  Object.defineProperty(exports2, "makeSession", {
    enumerable: true,
    get: () => core.makeSession
  });
  Object.defineProperty(exports2, "setContext", {
    enumerable: true,
    get: () => core.setContext
  });
  Object.defineProperty(exports2, "setExtra", {
    enumerable: true,
    get: () => core.setExtra
  });
  Object.defineProperty(exports2, "setExtras", {
    enumerable: true,
    get: () => core.setExtras
  });
  Object.defineProperty(exports2, "setTag", {
    enumerable: true,
    get: () => core.setTag
  });
  Object.defineProperty(exports2, "setTags", {
    enumerable: true,
    get: () => core.setTags
  });
  Object.defineProperty(exports2, "setUser", {
    enumerable: true,
    get: () => core.setUser
  });
  Object.defineProperty(exports2, "startSession", {
    enumerable: true,
    get: () => core.startSession
  });
  Object.defineProperty(exports2, "startSpan", {
    enumerable: true,
    get: () => core.startSpan
  });
  Object.defineProperty(exports2, "updateSession", {
    enumerable: true,
    get: () => core.updateSession
  });
  Object.defineProperty(exports2, "withScope", {
    enumerable: true,
    get: () => core.withScope
  });
  exports2.Integrations = index;
  exports2.MiniappClient = MiniappClient;
  exports2.SDK_NAME = SDK_NAME;
  exports2.SDK_VERSION = SDK_VERSION;
  exports2.Transports = index$1;
  exports2.captureFeedback = captureFeedback;
  exports2.defaultIntegrations = defaultIntegrations;
  exports2.getDefaultIntegrations = getDefaultIntegrations;
  exports2.init = init;
  exports2.showReportDialog = showReportDialog;
  exports2.wrap = wrap;
  Object.defineProperty(exports2, Symbol.toStringTag, { value: "Module" });
}));
//# sourceMappingURL=sentry-miniapp.umd.js.map
