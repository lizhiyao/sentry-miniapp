// sentry-miniapp v0.12.1
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
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
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/polyfills/urlsearchparams.ts
var GLOBAL_OBJ = (
  // eslint-disable-next-line no-undef
  typeof globalThis !== "undefined" && globalThis || // eslint-disable-next-line no-undef
  typeof self !== "undefined" && self || // eslint-disable-next-line no-undef
  typeof window !== "undefined" && window || // eslint-disable-next-line no-undef
  typeof global !== "undefined" && global || {}
);
var MiniappURLSearchParams = class {
  constructor(init2) {
    this._entries = [];
    if (!init2) {
      return;
    }
    if (typeof init2 === "string") {
      const query = init2.startsWith("?") ? init2.slice(1) : init2;
      if (query.length > 0) {
        query.split("&").forEach((pair) => {
          if (!pair) {
            return;
          }
          const [key, value = ""] = pair.split("=");
          this.append(decodeURIComponent(key), decodeURIComponent(value));
        });
      }
      return;
    }
    if (Array.isArray(init2)) {
      init2.forEach(([key, value]) => this.append(key, value));
      return;
    }
    Object.keys(init2).forEach((key) => {
      const value = init2[key];
      if (value === void 0 || value === null) {
        return;
      }
      this.append(key, String(value));
    });
  }
  append(key, value) {
    this._entries.push([key, value]);
  }
  toString() {
    return this._entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  }
};
if (!GLOBAL_OBJ.URLSearchParams) {
  GLOBAL_OBJ.URLSearchParams = MiniappURLSearchParams;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/debug-build.js
var DEBUG_BUILD = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/version.js
var SDK_VERSION = "8.55.0";

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/worldwide.js
var GLOBAL_OBJ2 = globalThis;
function getGlobalSingleton(name, creator, obj) {
  const gbl = GLOBAL_OBJ2;
  const __SENTRY__ = gbl.__SENTRY__ = gbl.__SENTRY__ || {};
  const versionedCarrier = __SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {};
  return versionedCarrier[name] || (versionedCarrier[name] = creator());
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/debug-build.js
var DEBUG_BUILD2 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/logger.js
var PREFIX = "Sentry Logger ";
var CONSOLE_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "log",
  "assert",
  "trace"
];
var originalConsoleMethods = {};
function consoleSandbox(callback) {
  if (!("console" in GLOBAL_OBJ2)) {
    return callback();
  }
  const console2 = GLOBAL_OBJ2.console;
  const wrappedFuncs = {};
  const wrappedLevels = Object.keys(originalConsoleMethods);
  wrappedLevels.forEach((level) => {
    const originalConsoleMethod = originalConsoleMethods[level];
    wrappedFuncs[level] = console2[level];
    console2[level] = originalConsoleMethod;
  });
  try {
    return callback();
  } finally {
    wrappedLevels.forEach((level) => {
      console2[level] = wrappedFuncs[level];
    });
  }
}
function makeLogger() {
  let enabled = false;
  const logger3 = {
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
    },
    isEnabled: () => enabled
  };
  if (DEBUG_BUILD2) {
    CONSOLE_LEVELS.forEach((name) => {
      logger3[name] = (...args) => {
        if (enabled) {
          consoleSandbox(() => {
            GLOBAL_OBJ2.console[name](`${PREFIX}[${name}]:`, ...args);
          });
        }
      };
    });
  } else {
    CONSOLE_LEVELS.forEach((name) => {
      logger3[name] = () => void 0;
    });
  }
  return logger3;
}
var logger = getGlobalSingleton("logger", makeLogger);

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/stacktrace.js
var defaultFunctionName = "<anonymous>";
function getFunctionName(fn) {
  try {
    if (!fn || typeof fn !== "function") {
      return defaultFunctionName;
    }
    return fn.name || defaultFunctionName;
  } catch (e) {
    return defaultFunctionName;
  }
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/carrier.js
function getMainCarrier() {
  getSentryCarrier(GLOBAL_OBJ2);
  return GLOBAL_OBJ2;
}
function getSentryCarrier(carrier) {
  const __SENTRY__ = carrier.__SENTRY__ = carrier.__SENTRY__ || {};
  __SENTRY__.version = __SENTRY__.version || SDK_VERSION;
  return __SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {};
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/is.js
var objectToString = Object.prototype.toString;
function isError(wat) {
  switch (objectToString.call(wat)) {
    case "[object Error]":
    case "[object Exception]":
    case "[object DOMException]":
    case "[object WebAssembly.Exception]":
      return true;
    default:
      return isInstanceOf(wat, Error);
  }
}
function isBuiltin(wat, className) {
  return objectToString.call(wat) === `[object ${className}]`;
}
function isErrorEvent(wat) {
  return isBuiltin(wat, "ErrorEvent");
}
function isDOMError(wat) {
  return isBuiltin(wat, "DOMError");
}
function isDOMException(wat) {
  return isBuiltin(wat, "DOMException");
}
function isString(wat) {
  return isBuiltin(wat, "String");
}
function isParameterizedString(wat) {
  return typeof wat === "object" && wat !== null && "__sentry_template_string__" in wat && "__sentry_template_values__" in wat;
}
function isPrimitive(wat) {
  return wat === null || isParameterizedString(wat) || typeof wat !== "object" && typeof wat !== "function";
}
function isPlainObject(wat) {
  return isBuiltin(wat, "Object");
}
function isEvent(wat) {
  return typeof Event !== "undefined" && isInstanceOf(wat, Event);
}
function isElement(wat) {
  return typeof Element !== "undefined" && isInstanceOf(wat, Element);
}
function isRegExp(wat) {
  return isBuiltin(wat, "RegExp");
}
function isThenable(wat) {
  return Boolean(wat && wat.then && typeof wat.then === "function");
}
function isSyntheticEvent(wat) {
  return isPlainObject(wat) && "nativeEvent" in wat && "preventDefault" in wat && "stopPropagation" in wat;
}
function isInstanceOf(wat, base) {
  try {
    return wat instanceof base;
  } catch (_e) {
    return false;
  }
}
function isVueViewModel(wat) {
  return !!(typeof wat === "object" && wat !== null && (wat.__isVue || wat._isVue));
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/browser.js
var WINDOW = GLOBAL_OBJ2;
var DEFAULT_MAX_STRING_LENGTH = 80;
function htmlTreeAsString(elem, options = {}) {
  if (!elem) {
    return "<unknown>";
  }
  try {
    let currentElem = elem;
    const MAX_TRAVERSE_HEIGHT = 5;
    const out = [];
    let height = 0;
    let len = 0;
    const separator = " > ";
    const sepLength = separator.length;
    let nextStr;
    const keyAttrs = Array.isArray(options) ? options : options.keyAttrs;
    const maxStringLength = !Array.isArray(options) && options.maxStringLength || DEFAULT_MAX_STRING_LENGTH;
    while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
      nextStr = _htmlElementAsString(currentElem, keyAttrs);
      if (nextStr === "html" || height > 1 && len + out.length * sepLength + nextStr.length >= maxStringLength) {
        break;
      }
      out.push(nextStr);
      len += nextStr.length;
      currentElem = currentElem.parentNode;
    }
    return out.reverse().join(separator);
  } catch (_oO) {
    return "<unknown>";
  }
}
function _htmlElementAsString(el, keyAttrs) {
  const elem = el;
  const out = [];
  if (!elem || !elem.tagName) {
    return "";
  }
  if (WINDOW.HTMLElement) {
    if (elem instanceof HTMLElement && elem.dataset) {
      if (elem.dataset["sentryComponent"]) {
        return elem.dataset["sentryComponent"];
      }
      if (elem.dataset["sentryElement"]) {
        return elem.dataset["sentryElement"];
      }
    }
  }
  out.push(elem.tagName.toLowerCase());
  const keyAttrPairs = keyAttrs && keyAttrs.length ? keyAttrs.filter((keyAttr) => elem.getAttribute(keyAttr)).map((keyAttr) => [keyAttr, elem.getAttribute(keyAttr)]) : null;
  if (keyAttrPairs && keyAttrPairs.length) {
    keyAttrPairs.forEach((keyAttrPair) => {
      out.push(`[${keyAttrPair[0]}="${keyAttrPair[1]}"]`);
    });
  } else {
    if (elem.id) {
      out.push(`#${elem.id}`);
    }
    const className = elem.className;
    if (className && isString(className)) {
      const classes = className.split(/\s+/);
      for (const c of classes) {
        out.push(`.${c}`);
      }
    }
  }
  const allowedAttrs = ["aria-label", "type", "name", "title", "alt"];
  for (const k of allowedAttrs) {
    const attr = elem.getAttribute(k);
    if (attr) {
      out.push(`[${k}="${attr}"]`);
    }
  }
  return out.join("");
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/string.js
function truncate(str, max = 0) {
  if (typeof str !== "string" || max === 0) {
    return str;
  }
  return str.length <= max ? str : `${str.slice(0, max)}...`;
}
function isMatchingPattern(value, pattern, requireExactStringMatch = false) {
  if (!isString(value)) {
    return false;
  }
  if (isRegExp(pattern)) {
    return pattern.test(value);
  }
  if (isString(pattern)) {
    return requireExactStringMatch ? value === pattern : value.includes(pattern);
  }
  return false;
}
function stringMatchesSomePattern(testString, patterns = [], requireExactStringMatch = false) {
  return patterns.some((pattern) => isMatchingPattern(testString, pattern, requireExactStringMatch));
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/object.js
function fill(source, name, replacementFactory) {
  if (!(name in source)) {
    return;
  }
  const original = source[name];
  const wrapped = replacementFactory(original);
  if (typeof wrapped === "function") {
    markFunctionWrapped(wrapped, original);
  }
  try {
    source[name] = wrapped;
  } catch (e) {
    DEBUG_BUILD2 && logger.log(`Failed to replace method "${name}" in object`, source);
  }
}
function addNonEnumerableProperty(obj, name, value) {
  try {
    Object.defineProperty(obj, name, {
      // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
      value,
      writable: true,
      configurable: true
    });
  } catch (o_O) {
    DEBUG_BUILD2 && logger.log(`Failed to add non-enumerable property "${name}" to object`, obj);
  }
}
function markFunctionWrapped(wrapped, original) {
  try {
    const proto = original.prototype || {};
    wrapped.prototype = original.prototype = proto;
    addNonEnumerableProperty(wrapped, "__sentry_original__", original);
  } catch (o_O) {
  }
}
function getOriginalFunction(func) {
  return func.__sentry_original__;
}
function convertToPlainObject(value) {
  if (isError(value)) {
    return __spreadValues({
      message: value.message,
      name: value.name,
      stack: value.stack
    }, getOwnProperties(value));
  } else if (isEvent(value)) {
    const newObj = __spreadValues({
      type: value.type,
      target: serializeEventTarget(value.target),
      currentTarget: serializeEventTarget(value.currentTarget)
    }, getOwnProperties(value));
    if (typeof CustomEvent !== "undefined" && isInstanceOf(value, CustomEvent)) {
      newObj.detail = value.detail;
    }
    return newObj;
  } else {
    return value;
  }
}
function serializeEventTarget(target) {
  try {
    return isElement(target) ? htmlTreeAsString(target) : Object.prototype.toString.call(target);
  } catch (_oO) {
    return "<unknown>";
  }
}
function getOwnProperties(obj) {
  if (typeof obj === "object" && obj !== null) {
    const extractedProps = {};
    for (const property in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, property)) {
        extractedProps[property] = obj[property];
      }
    }
    return extractedProps;
  } else {
    return {};
  }
}
function extractExceptionKeysForMessage(exception, maxLength = 40) {
  const keys = Object.keys(convertToPlainObject(exception));
  keys.sort();
  const firstKey = keys[0];
  if (!firstKey) {
    return "[object has no keys]";
  }
  if (firstKey.length >= maxLength) {
    return truncate(firstKey, maxLength);
  }
  for (let includedKeys = keys.length; includedKeys > 0; includedKeys--) {
    const serialized = keys.slice(0, includedKeys).join(", ");
    if (serialized.length > maxLength) {
      continue;
    }
    if (includedKeys === keys.length) {
      return serialized;
    }
    return truncate(serialized, maxLength);
  }
  return "";
}
function dropUndefinedKeys(inputValue) {
  const memoizationMap = /* @__PURE__ */ new Map();
  return _dropUndefinedKeys(inputValue, memoizationMap);
}
function _dropUndefinedKeys(inputValue, memoizationMap) {
  if (isPojo(inputValue)) {
    const memoVal = memoizationMap.get(inputValue);
    if (memoVal !== void 0) {
      return memoVal;
    }
    const returnValue = {};
    memoizationMap.set(inputValue, returnValue);
    for (const key of Object.getOwnPropertyNames(inputValue)) {
      if (typeof inputValue[key] !== "undefined") {
        returnValue[key] = _dropUndefinedKeys(inputValue[key], memoizationMap);
      }
    }
    return returnValue;
  }
  if (Array.isArray(inputValue)) {
    const memoVal = memoizationMap.get(inputValue);
    if (memoVal !== void 0) {
      return memoVal;
    }
    const returnValue = [];
    memoizationMap.set(inputValue, returnValue);
    inputValue.forEach((item) => {
      returnValue.push(_dropUndefinedKeys(item, memoizationMap));
    });
    return returnValue;
  }
  return inputValue;
}
function isPojo(input) {
  if (!isPlainObject(input)) {
    return false;
  }
  try {
    const name = Object.getPrototypeOf(input).constructor.name;
    return !name || name === "Object";
  } catch (e2) {
    return true;
  }
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/time.js
var ONE_SECOND_IN_MS = 1e3;
function dateTimestampInSeconds() {
  return Date.now() / ONE_SECOND_IN_MS;
}
function createUnixTimestampInSecondsFunc() {
  const { performance } = GLOBAL_OBJ2;
  if (!performance || !performance.now) {
    return dateTimestampInSeconds;
  }
  const approxStartingTimeOrigin = Date.now() - performance.now();
  const timeOrigin = performance.timeOrigin == void 0 ? approxStartingTimeOrigin : performance.timeOrigin;
  return () => {
    return (timeOrigin + performance.now()) / ONE_SECOND_IN_MS;
  };
}
var timestampInSeconds = createUnixTimestampInSecondsFunc();
(() => {
  const { performance } = GLOBAL_OBJ2;
  if (!performance || !performance.now) {
    return void 0;
  }
  const threshold = 3600 * 1e3;
  const performanceNow = performance.now();
  const dateNow = Date.now();
  const timeOriginDelta = performance.timeOrigin ? Math.abs(performance.timeOrigin + performanceNow - dateNow) : threshold;
  const timeOriginIsReliable = timeOriginDelta < threshold;
  const navigationStart = performance.timing && performance.timing.navigationStart;
  const hasNavigationStart = typeof navigationStart === "number";
  const navigationStartDelta = hasNavigationStart ? Math.abs(navigationStart + performanceNow - dateNow) : threshold;
  const navigationStartIsReliable = navigationStartDelta < threshold;
  if (timeOriginIsReliable || navigationStartIsReliable) {
    if (timeOriginDelta <= navigationStartDelta) {
      return performance.timeOrigin;
    } else {
      return navigationStart;
    }
  }
  return dateNow;
})();

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/misc.js
function uuid4() {
  const gbl = GLOBAL_OBJ2;
  const crypto = gbl.crypto || gbl.msCrypto;
  let getRandomByte = () => Math.random() * 16;
  try {
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "");
    }
    if (crypto && crypto.getRandomValues) {
      getRandomByte = () => {
        const typedArray = new Uint8Array(1);
        crypto.getRandomValues(typedArray);
        return typedArray[0];
      };
    }
  } catch (_) {
  }
  return ("10000000100040008000" + 1e11).replace(
    /[018]/g,
    (c) => (
      // eslint-disable-next-line no-bitwise
      (c ^ (getRandomByte() & 15) >> c / 4).toString(16)
    )
  );
}
function getFirstException(event) {
  return event.exception && event.exception.values ? event.exception.values[0] : void 0;
}
function getEventDescription(event) {
  const { message, event_id: eventId } = event;
  if (message) {
    return message;
  }
  const firstException = getFirstException(event);
  if (firstException) {
    if (firstException.type && firstException.value) {
      return `${firstException.type}: ${firstException.value}`;
    }
    return firstException.type || firstException.value || eventId || "<unknown>";
  }
  return eventId || "<unknown>";
}
function addExceptionTypeValue(event, value, type) {
  const exception = event.exception = event.exception || {};
  const values = exception.values = exception.values || [];
  const firstException = values[0] = values[0] || {};
  if (!firstException.value) {
    firstException.value = value || "";
  }
  if (!firstException.type) {
    firstException.type = type || "Error";
  }
}
function addExceptionMechanism(event, newMechanism) {
  const firstException = getFirstException(event);
  if (!firstException) {
    return;
  }
  const defaultMechanism = { type: "generic", handled: true };
  const currentMechanism = firstException.mechanism;
  firstException.mechanism = __spreadValues(__spreadValues(__spreadValues({}, defaultMechanism), currentMechanism), newMechanism);
  if (newMechanism && "data" in newMechanism) {
    const mergedData = __spreadValues(__spreadValues({}, currentMechanism && currentMechanism.data), newMechanism.data);
    firstException.mechanism.data = mergedData;
  }
}
function checkOrSetAlreadyCaught(exception) {
  if (isAlreadyCaptured(exception)) {
    return true;
  }
  try {
    addNonEnumerableProperty(exception, "__sentry_captured__", true);
  } catch (err) {
  }
  return false;
}
function isAlreadyCaptured(exception) {
  try {
    return exception.__sentry_captured__;
  } catch (e) {
  }
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/syncpromise.js
var States;
(function(States2) {
  const PENDING = 0;
  States2[States2["PENDING"] = PENDING] = "PENDING";
  const RESOLVED = 1;
  States2[States2["RESOLVED"] = RESOLVED] = "RESOLVED";
  const REJECTED = 2;
  States2[States2["REJECTED"] = REJECTED] = "REJECTED";
})(States || (States = {}));
function resolvedSyncPromise(value) {
  return new SyncPromise((resolve2) => {
    resolve2(value);
  });
}
function rejectedSyncPromise(reason) {
  return new SyncPromise((_, reject) => {
    reject(reason);
  });
}
var SyncPromise = class _SyncPromise {
  constructor(executor) {
    _SyncPromise.prototype.__init.call(this);
    _SyncPromise.prototype.__init2.call(this);
    _SyncPromise.prototype.__init3.call(this);
    _SyncPromise.prototype.__init4.call(this);
    this._state = States.PENDING;
    this._handlers = [];
    try {
      executor(this._resolve, this._reject);
    } catch (e) {
      this._reject(e);
    }
  }
  /** JSDoc */
  then(onfulfilled, onrejected) {
    return new _SyncPromise((resolve2, reject) => {
      this._handlers.push([
        false,
        (result) => {
          if (!onfulfilled) {
            resolve2(result);
          } else {
            try {
              resolve2(onfulfilled(result));
            } catch (e) {
              reject(e);
            }
          }
        },
        (reason) => {
          if (!onrejected) {
            reject(reason);
          } else {
            try {
              resolve2(onrejected(reason));
            } catch (e) {
              reject(e);
            }
          }
        }
      ]);
      this._executeHandlers();
    });
  }
  /** JSDoc */
  catch(onrejected) {
    return this.then((val) => val, onrejected);
  }
  /** JSDoc */
  finally(onfinally) {
    return new _SyncPromise((resolve2, reject) => {
      let val;
      let isRejected;
      return this.then(
        (value) => {
          isRejected = false;
          val = value;
          if (onfinally) {
            onfinally();
          }
        },
        (reason) => {
          isRejected = true;
          val = reason;
          if (onfinally) {
            onfinally();
          }
        }
      ).then(() => {
        if (isRejected) {
          reject(val);
          return;
        }
        resolve2(val);
      });
    });
  }
  /** JSDoc */
  __init() {
    this._resolve = (value) => {
      this._setResult(States.RESOLVED, value);
    };
  }
  /** JSDoc */
  __init2() {
    this._reject = (reason) => {
      this._setResult(States.REJECTED, reason);
    };
  }
  /** JSDoc */
  __init3() {
    this._setResult = (state, value) => {
      if (this._state !== States.PENDING) {
        return;
      }
      if (isThenable(value)) {
        void value.then(this._resolve, this._reject);
        return;
      }
      this._state = state;
      this._value = value;
      this._executeHandlers();
    };
  }
  /** JSDoc */
  __init4() {
    this._executeHandlers = () => {
      if (this._state === States.PENDING) {
        return;
      }
      const cachedHandlers = this._handlers.slice();
      this._handlers = [];
      cachedHandlers.forEach((handler) => {
        if (handler[0]) {
          return;
        }
        if (this._state === States.RESOLVED) {
          handler[1](this._value);
        }
        if (this._state === States.REJECTED) {
          handler[2](this._value);
        }
        handler[0] = true;
      });
    };
  }
};

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/session.js
function makeSession(context) {
  const startingTime = timestampInSeconds();
  const session = {
    sid: uuid4(),
    init: true,
    timestamp: startingTime,
    started: startingTime,
    duration: 0,
    status: "ok",
    errors: 0,
    ignoreDuration: false,
    toJSON: () => sessionToJSON(session)
  };
  if (context) {
    updateSession(session, context);
  }
  return session;
}
function updateSession(session, context = {}) {
  if (context.user) {
    if (!session.ipAddress && context.user.ip_address) {
      session.ipAddress = context.user.ip_address;
    }
    if (!session.did && !context.did) {
      session.did = context.user.id || context.user.email || context.user.username;
    }
  }
  session.timestamp = context.timestamp || timestampInSeconds();
  if (context.abnormal_mechanism) {
    session.abnormal_mechanism = context.abnormal_mechanism;
  }
  if (context.ignoreDuration) {
    session.ignoreDuration = context.ignoreDuration;
  }
  if (context.sid) {
    session.sid = context.sid.length === 32 ? context.sid : uuid4();
  }
  if (context.init !== void 0) {
    session.init = context.init;
  }
  if (!session.did && context.did) {
    session.did = `${context.did}`;
  }
  if (typeof context.started === "number") {
    session.started = context.started;
  }
  if (session.ignoreDuration) {
    session.duration = void 0;
  } else if (typeof context.duration === "number") {
    session.duration = context.duration;
  } else {
    const duration = session.timestamp - session.started;
    session.duration = duration >= 0 ? duration : 0;
  }
  if (context.release) {
    session.release = context.release;
  }
  if (context.environment) {
    session.environment = context.environment;
  }
  if (!session.ipAddress && context.ipAddress) {
    session.ipAddress = context.ipAddress;
  }
  if (!session.userAgent && context.userAgent) {
    session.userAgent = context.userAgent;
  }
  if (typeof context.errors === "number") {
    session.errors = context.errors;
  }
  if (context.status) {
    session.status = context.status;
  }
}
function closeSession(session, status) {
  let context = {};
  if (session.status === "ok") {
    context = { status: "exited" };
  }
  updateSession(session, context);
}
function sessionToJSON(session) {
  return dropUndefinedKeys({
    sid: `${session.sid}`,
    init: session.init,
    // Make sure that sec is converted to ms for date constructor
    started: new Date(session.started * 1e3).toISOString(),
    timestamp: new Date(session.timestamp * 1e3).toISOString(),
    status: session.status,
    errors: session.errors,
    did: typeof session.did === "number" || typeof session.did === "string" ? `${session.did}` : void 0,
    duration: session.duration,
    abnormal_mechanism: session.abnormal_mechanism,
    attrs: {
      release: session.release,
      environment: session.environment,
      ip_address: session.ipAddress,
      user_agent: session.userAgent
    }
  });
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/propagationContext.js
function generateTraceId() {
  return uuid4();
}
function generateSpanId() {
  return uuid4().substring(16);
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/merge.js
function merge(initialObj, mergeObj, levels = 2) {
  if (!mergeObj || typeof mergeObj !== "object" || levels <= 0) {
    return mergeObj;
  }
  if (initialObj && mergeObj && Object.keys(mergeObj).length === 0) {
    return initialObj;
  }
  const output = __spreadValues({}, initialObj);
  for (const key in mergeObj) {
    if (Object.prototype.hasOwnProperty.call(mergeObj, key)) {
      output[key] = merge(output[key], mergeObj[key], levels - 1);
    }
  }
  return output;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/spanOnScope.js
var SCOPE_SPAN_FIELD = "_sentrySpan";
function _setSpanForScope(scope, span) {
  if (span) {
    addNonEnumerableProperty(scope, SCOPE_SPAN_FIELD, span);
  } else {
    delete scope[SCOPE_SPAN_FIELD];
  }
}
function _getSpanForScope(scope) {
  return scope[SCOPE_SPAN_FIELD];
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/scope.js
var DEFAULT_MAX_BREADCRUMBS = 100;
var ScopeClass = class _ScopeClass {
  /** Flag if notifying is happening. */
  /** Callback for client to receive scope changes. */
  /** Callback list that will be called during event processing. */
  /** Array of breadcrumbs. */
  /** User */
  /** Tags */
  /** Extra */
  /** Contexts */
  /** Attachments */
  /** Propagation Context for distributed tracing */
  /**
   * A place to stash data which is needed at some point in the SDK's event processing pipeline but which shouldn't get
   * sent to Sentry
   */
  /** Fingerprint */
  /** Severity */
  /**
   * Transaction Name
   *
   * IMPORTANT: The transaction name on the scope has nothing to do with root spans/transaction objects.
   * It's purpose is to assign a transaction to the scope that's added to non-transaction events.
   */
  /** Session */
  /** Request Mode Session Status */
  // eslint-disable-next-line deprecation/deprecation
  /** The client on this scope */
  /** Contains the last event id of a captured event.  */
  // NOTE: Any field which gets added here should get added not only to the constructor but also to the `clone` method.
  constructor() {
    this._notifyingListeners = false;
    this._scopeListeners = [];
    this._eventProcessors = [];
    this._breadcrumbs = [];
    this._attachments = [];
    this._user = {};
    this._tags = {};
    this._extra = {};
    this._contexts = {};
    this._sdkProcessingMetadata = {};
    this._propagationContext = {
      traceId: generateTraceId(),
      spanId: generateSpanId()
    };
  }
  /**
   * @inheritDoc
   */
  clone() {
    const newScope = new _ScopeClass();
    newScope._breadcrumbs = [...this._breadcrumbs];
    newScope._tags = __spreadValues({}, this._tags);
    newScope._extra = __spreadValues({}, this._extra);
    newScope._contexts = __spreadValues({}, this._contexts);
    if (this._contexts.flags) {
      newScope._contexts.flags = {
        values: [...this._contexts.flags.values]
      };
    }
    newScope._user = this._user;
    newScope._level = this._level;
    newScope._session = this._session;
    newScope._transactionName = this._transactionName;
    newScope._fingerprint = this._fingerprint;
    newScope._eventProcessors = [...this._eventProcessors];
    newScope._requestSession = this._requestSession;
    newScope._attachments = [...this._attachments];
    newScope._sdkProcessingMetadata = __spreadValues({}, this._sdkProcessingMetadata);
    newScope._propagationContext = __spreadValues({}, this._propagationContext);
    newScope._client = this._client;
    newScope._lastEventId = this._lastEventId;
    _setSpanForScope(newScope, _getSpanForScope(this));
    return newScope;
  }
  /**
   * @inheritDoc
   */
  setClient(client) {
    this._client = client;
  }
  /**
   * @inheritDoc
   */
  setLastEventId(lastEventId3) {
    this._lastEventId = lastEventId3;
  }
  /**
   * @inheritDoc
   */
  getClient() {
    return this._client;
  }
  /**
   * @inheritDoc
   */
  lastEventId() {
    return this._lastEventId;
  }
  /**
   * @inheritDoc
   */
  addScopeListener(callback) {
    this._scopeListeners.push(callback);
  }
  /**
   * @inheritDoc
   */
  addEventProcessor(callback) {
    this._eventProcessors.push(callback);
    return this;
  }
  /**
   * @inheritDoc
   */
  setUser(user) {
    this._user = user || {
      email: void 0,
      id: void 0,
      ip_address: void 0,
      username: void 0
    };
    if (this._session) {
      updateSession(this._session, { user });
    }
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  getUser() {
    return this._user;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  getRequestSession() {
    return this._requestSession;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  setRequestSession(requestSession) {
    this._requestSession = requestSession;
    return this;
  }
  /**
   * @inheritDoc
   */
  setTags(tags) {
    this._tags = __spreadValues(__spreadValues({}, this._tags), tags);
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  setTag(key, value) {
    this._tags = __spreadProps(__spreadValues({}, this._tags), { [key]: value });
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  setExtras(extras) {
    this._extra = __spreadValues(__spreadValues({}, this._extra), extras);
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  setExtra(key, extra) {
    this._extra = __spreadProps(__spreadValues({}, this._extra), { [key]: extra });
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  setFingerprint(fingerprint) {
    this._fingerprint = fingerprint;
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  setLevel(level) {
    this._level = level;
    this._notifyScopeListeners();
    return this;
  }
  /**
   * Sets the transaction name on the scope so that the name of e.g. taken server route or
   * the page location is attached to future events.
   *
   * IMPORTANT: Calling this function does NOT change the name of the currently active
   * root span. If you want to change the name of the active root span, use
   * `Sentry.updateSpanName(rootSpan, 'new name')` instead.
   *
   * By default, the SDK updates the scope's transaction name automatically on sensible
   * occasions, such as a page navigation or when handling a new request on the server.
   */
  setTransactionName(name) {
    this._transactionName = name;
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  setContext(key, context) {
    if (context === null) {
      delete this._contexts[key];
    } else {
      this._contexts[key] = context;
    }
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  setSession(session) {
    if (!session) {
      delete this._session;
    } else {
      this._session = session;
    }
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  getSession() {
    return this._session;
  }
  /**
   * @inheritDoc
   */
  update(captureContext) {
    if (!captureContext) {
      return this;
    }
    const scopeToMerge = typeof captureContext === "function" ? captureContext(this) : captureContext;
    const [scopeInstance, requestSession] = scopeToMerge instanceof Scope ? (
      // eslint-disable-next-line deprecation/deprecation
      [scopeToMerge.getScopeData(), scopeToMerge.getRequestSession()]
    ) : isPlainObject(scopeToMerge) ? [captureContext, captureContext.requestSession] : [];
    const { tags, extra, user, contexts, level, fingerprint = [], propagationContext } = scopeInstance || {};
    this._tags = __spreadValues(__spreadValues({}, this._tags), tags);
    this._extra = __spreadValues(__spreadValues({}, this._extra), extra);
    this._contexts = __spreadValues(__spreadValues({}, this._contexts), contexts);
    if (user && Object.keys(user).length) {
      this._user = user;
    }
    if (level) {
      this._level = level;
    }
    if (fingerprint.length) {
      this._fingerprint = fingerprint;
    }
    if (propagationContext) {
      this._propagationContext = propagationContext;
    }
    if (requestSession) {
      this._requestSession = requestSession;
    }
    return this;
  }
  /**
   * @inheritDoc
   */
  clear() {
    this._breadcrumbs = [];
    this._tags = {};
    this._extra = {};
    this._user = {};
    this._contexts = {};
    this._level = void 0;
    this._transactionName = void 0;
    this._fingerprint = void 0;
    this._requestSession = void 0;
    this._session = void 0;
    _setSpanForScope(this, void 0);
    this._attachments = [];
    this.setPropagationContext({ traceId: generateTraceId() });
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  addBreadcrumb(breadcrumb, maxBreadcrumbs) {
    const maxCrumbs = typeof maxBreadcrumbs === "number" ? maxBreadcrumbs : DEFAULT_MAX_BREADCRUMBS;
    if (maxCrumbs <= 0) {
      return this;
    }
    const mergedBreadcrumb = __spreadValues({
      timestamp: dateTimestampInSeconds()
    }, breadcrumb);
    this._breadcrumbs.push(mergedBreadcrumb);
    if (this._breadcrumbs.length > maxCrumbs) {
      this._breadcrumbs = this._breadcrumbs.slice(-maxCrumbs);
      if (this._client) {
        this._client.recordDroppedEvent("buffer_overflow", "log_item");
      }
    }
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  getLastBreadcrumb() {
    return this._breadcrumbs[this._breadcrumbs.length - 1];
  }
  /**
   * @inheritDoc
   */
  clearBreadcrumbs() {
    this._breadcrumbs = [];
    this._notifyScopeListeners();
    return this;
  }
  /**
   * @inheritDoc
   */
  addAttachment(attachment) {
    this._attachments.push(attachment);
    return this;
  }
  /**
   * @inheritDoc
   */
  clearAttachments() {
    this._attachments = [];
    return this;
  }
  /** @inheritDoc */
  getScopeData() {
    return {
      breadcrumbs: this._breadcrumbs,
      attachments: this._attachments,
      contexts: this._contexts,
      tags: this._tags,
      extra: this._extra,
      user: this._user,
      level: this._level,
      fingerprint: this._fingerprint || [],
      eventProcessors: this._eventProcessors,
      propagationContext: this._propagationContext,
      sdkProcessingMetadata: this._sdkProcessingMetadata,
      transactionName: this._transactionName,
      span: _getSpanForScope(this)
    };
  }
  /**
   * @inheritDoc
   */
  setSDKProcessingMetadata(newData) {
    this._sdkProcessingMetadata = merge(this._sdkProcessingMetadata, newData, 2);
    return this;
  }
  /**
   * @inheritDoc
   */
  setPropagationContext(context) {
    this._propagationContext = __spreadValues({
      // eslint-disable-next-line deprecation/deprecation
      spanId: generateSpanId()
    }, context);
    return this;
  }
  /**
   * @inheritDoc
   */
  getPropagationContext() {
    return this._propagationContext;
  }
  /**
   * @inheritDoc
   */
  captureException(exception, hint) {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    if (!this._client) {
      logger.warn("No client configured on scope - will not capture exception!");
      return eventId;
    }
    const syntheticException = new Error("Sentry syntheticException");
    this._client.captureException(
      exception,
      __spreadProps(__spreadValues({
        originalException: exception,
        syntheticException
      }, hint), {
        event_id: eventId
      }),
      this
    );
    return eventId;
  }
  /**
   * @inheritDoc
   */
  captureMessage(message, level, hint) {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    if (!this._client) {
      logger.warn("No client configured on scope - will not capture message!");
      return eventId;
    }
    const syntheticException = new Error(message);
    this._client.captureMessage(
      message,
      level,
      __spreadProps(__spreadValues({
        originalException: message,
        syntheticException
      }, hint), {
        event_id: eventId
      }),
      this
    );
    return eventId;
  }
  /**
   * @inheritDoc
   */
  captureEvent(event, hint) {
    const eventId = hint && hint.event_id ? hint.event_id : uuid4();
    if (!this._client) {
      logger.warn("No client configured on scope - will not capture event!");
      return eventId;
    }
    this._client.captureEvent(event, __spreadProps(__spreadValues({}, hint), { event_id: eventId }), this);
    return eventId;
  }
  /**
   * This will be called on every set call.
   */
  _notifyScopeListeners() {
    if (!this._notifyingListeners) {
      this._notifyingListeners = true;
      this._scopeListeners.forEach((callback) => {
        callback(this);
      });
      this._notifyingListeners = false;
    }
  }
};
var Scope = ScopeClass;

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/defaultScopes.js
function getDefaultCurrentScope() {
  return getGlobalSingleton("defaultCurrentScope", () => new Scope());
}
function getDefaultIsolationScope() {
  return getGlobalSingleton("defaultIsolationScope", () => new Scope());
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/asyncContext/stackStrategy.js
var AsyncContextStack = class {
  constructor(scope, isolationScope) {
    let assignedScope;
    if (!scope) {
      assignedScope = new Scope();
    } else {
      assignedScope = scope;
    }
    let assignedIsolationScope;
    if (!isolationScope) {
      assignedIsolationScope = new Scope();
    } else {
      assignedIsolationScope = isolationScope;
    }
    this._stack = [{ scope: assignedScope }];
    this._isolationScope = assignedIsolationScope;
  }
  /**
   * Fork a scope for the stack.
   */
  withScope(callback) {
    const scope = this._pushScope();
    let maybePromiseResult;
    try {
      maybePromiseResult = callback(scope);
    } catch (e) {
      this._popScope();
      throw e;
    }
    if (isThenable(maybePromiseResult)) {
      return maybePromiseResult.then(
        (res) => {
          this._popScope();
          return res;
        },
        (e) => {
          this._popScope();
          throw e;
        }
      );
    }
    this._popScope();
    return maybePromiseResult;
  }
  /**
   * Get the client of the stack.
   */
  getClient() {
    return this.getStackTop().client;
  }
  /**
   * Returns the scope of the top stack.
   */
  getScope() {
    return this.getStackTop().scope;
  }
  /**
   * Get the isolation scope for the stack.
   */
  getIsolationScope() {
    return this._isolationScope;
  }
  /**
   * Returns the topmost scope layer in the order domain > local > process.
   */
  getStackTop() {
    return this._stack[this._stack.length - 1];
  }
  /**
   * Push a scope to the stack.
   */
  _pushScope() {
    const scope = this.getScope().clone();
    this._stack.push({
      client: this.getClient(),
      scope
    });
    return scope;
  }
  /**
   * Pop a scope from the stack.
   */
  _popScope() {
    if (this._stack.length <= 1) return false;
    return !!this._stack.pop();
  }
};
function getAsyncContextStack() {
  const registry = getMainCarrier();
  const sentry = getSentryCarrier(registry);
  return sentry.stack = sentry.stack || new AsyncContextStack(getDefaultCurrentScope(), getDefaultIsolationScope());
}
function withScope(callback) {
  return getAsyncContextStack().withScope(callback);
}
function withSetScope(scope, callback) {
  const stack = getAsyncContextStack();
  return stack.withScope(() => {
    stack.getStackTop().scope = scope;
    return callback(scope);
  });
}
function withIsolationScope(callback) {
  return getAsyncContextStack().withScope(() => {
    return callback(getAsyncContextStack().getIsolationScope());
  });
}
function getStackAsyncContextStrategy() {
  return {
    withIsolationScope,
    withScope,
    withSetScope,
    withSetIsolationScope: (_isolationScope, callback) => {
      return withIsolationScope(callback);
    },
    getCurrentScope: () => getAsyncContextStack().getScope(),
    getIsolationScope: () => getAsyncContextStack().getIsolationScope()
  };
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/asyncContext/index.js
function getAsyncContextStrategy(carrier) {
  const sentry = getSentryCarrier(carrier);
  if (sentry.acs) {
    return sentry.acs;
  }
  return getStackAsyncContextStrategy();
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/currentScopes.js
function getCurrentScope() {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  return acs.getCurrentScope();
}
function getIsolationScope() {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  return acs.getIsolationScope();
}
function getGlobalScope() {
  return getGlobalSingleton("globalScope", () => new Scope());
}
function withScope2(...rest) {
  const carrier = getMainCarrier();
  const acs = getAsyncContextStrategy(carrier);
  if (rest.length === 2) {
    const [scope, callback] = rest;
    if (!scope) {
      return acs.withScope(callback);
    }
    return acs.withSetScope(scope, callback);
  }
  return acs.withScope(rest[0]);
}
function getClient() {
  return getCurrentScope().getClient();
}
function getTraceContextFromScope(scope) {
  const propagationContext = scope.getPropagationContext();
  const { traceId, spanId, parentSpanId } = propagationContext;
  const traceContext = dropUndefinedKeys({
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: parentSpanId
  });
  return traceContext;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/metrics/metric-summary.js
var METRICS_SPAN_FIELD = "_sentryMetrics";
function getMetricSummaryJsonForSpan(span) {
  const storage = span[METRICS_SPAN_FIELD];
  if (!storage) {
    return void 0;
  }
  const output = {};
  for (const [, [exportKey, summary]] of storage) {
    const arr = output[exportKey] || (output[exportKey] = []);
    arr.push(dropUndefinedKeys(summary));
  }
  return output;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/semanticAttributes.js
var SEMANTIC_ATTRIBUTE_SENTRY_SOURCE = "sentry.source";
var SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE = "sentry.sample_rate";
var SEMANTIC_ATTRIBUTE_SENTRY_OP = "sentry.op";
var SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = "sentry.origin";

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/tracing/spanstatus.js
var SPAN_STATUS_UNSET = 0;
var SPAN_STATUS_OK = 1;

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/baggage.js
var SENTRY_BAGGAGE_KEY_PREFIX = "sentry-";
var SENTRY_BAGGAGE_KEY_PREFIX_REGEX = /^sentry-/;
function baggageHeaderToDynamicSamplingContext(baggageHeader) {
  const baggageObject = parseBaggageHeader(baggageHeader);
  if (!baggageObject) {
    return void 0;
  }
  const dynamicSamplingContext = Object.entries(baggageObject).reduce((acc, [key, value]) => {
    if (key.match(SENTRY_BAGGAGE_KEY_PREFIX_REGEX)) {
      const nonPrefixedKey = key.slice(SENTRY_BAGGAGE_KEY_PREFIX.length);
      acc[nonPrefixedKey] = value;
    }
    return acc;
  }, {});
  if (Object.keys(dynamicSamplingContext).length > 0) {
    return dynamicSamplingContext;
  } else {
    return void 0;
  }
}
function parseBaggageHeader(baggageHeader) {
  if (!baggageHeader || !isString(baggageHeader) && !Array.isArray(baggageHeader)) {
    return void 0;
  }
  if (Array.isArray(baggageHeader)) {
    return baggageHeader.reduce((acc, curr) => {
      const currBaggageObject = baggageHeaderToObject(curr);
      Object.entries(currBaggageObject).forEach(([key, value]) => {
        acc[key] = value;
      });
      return acc;
    }, {});
  }
  return baggageHeaderToObject(baggageHeader);
}
function baggageHeaderToObject(baggageHeader) {
  return baggageHeader.split(",").map((baggageEntry) => baggageEntry.split("=").map((keyOrValue) => decodeURIComponent(keyOrValue.trim()))).reduce((acc, [key, value]) => {
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/spanUtils.js
var TRACE_FLAG_SAMPLED = 1;
var hasShownSpanDropWarning = false;
function spanToTraceContext(span) {
  const { spanId, traceId: trace_id, isRemote } = span.spanContext();
  const parent_span_id = isRemote ? spanId : spanToJSON(span).parent_span_id;
  const span_id = isRemote ? generateSpanId() : spanId;
  return dropUndefinedKeys({
    parent_span_id,
    span_id,
    trace_id
  });
}
function spanTimeInputToSeconds(input) {
  if (typeof input === "number") {
    return ensureTimestampInSeconds(input);
  }
  if (Array.isArray(input)) {
    return input[0] + input[1] / 1e9;
  }
  if (input instanceof Date) {
    return ensureTimestampInSeconds(input.getTime());
  }
  return timestampInSeconds();
}
function ensureTimestampInSeconds(timestamp) {
  const isMs = timestamp > 9999999999;
  return isMs ? timestamp / 1e3 : timestamp;
}
function spanToJSON(span) {
  if (spanIsSentrySpan(span)) {
    return span.getSpanJSON();
  }
  try {
    const { spanId: span_id, traceId: trace_id } = span.spanContext();
    if (spanIsOpenTelemetrySdkTraceBaseSpan(span)) {
      const { attributes, startTime, name, endTime, parentSpanId, status } = span;
      return dropUndefinedKeys({
        span_id,
        trace_id,
        data: attributes,
        description: name,
        parent_span_id: parentSpanId,
        start_timestamp: spanTimeInputToSeconds(startTime),
        // This is [0,0] by default in OTEL, in which case we want to interpret this as no end time
        timestamp: spanTimeInputToSeconds(endTime) || void 0,
        status: getStatusMessage(status),
        op: attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP],
        origin: attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
        _metrics_summary: getMetricSummaryJsonForSpan(span)
      });
    }
    return {
      span_id,
      trace_id
    };
  } catch (e) {
    return {};
  }
}
function spanIsOpenTelemetrySdkTraceBaseSpan(span) {
  const castSpan = span;
  return !!castSpan.attributes && !!castSpan.startTime && !!castSpan.name && !!castSpan.endTime && !!castSpan.status;
}
function spanIsSentrySpan(span) {
  return typeof span.getSpanJSON === "function";
}
function spanIsSampled(span) {
  const { traceFlags } = span.spanContext();
  return traceFlags === TRACE_FLAG_SAMPLED;
}
function getStatusMessage(status) {
  if (!status || status.code === SPAN_STATUS_UNSET) {
    return void 0;
  }
  if (status.code === SPAN_STATUS_OK) {
    return "ok";
  }
  return status.message || "unknown_error";
}
var ROOT_SPAN_FIELD = "_sentryRootSpan";
function getRootSpan(span) {
  return span[ROOT_SPAN_FIELD] || span;
}
function showSpanDropWarning() {
  if (!hasShownSpanDropWarning) {
    consoleSandbox(() => {
      console.warn(
        "[Sentry] Deprecation warning: Returning null from `beforeSendSpan` will be disallowed from SDK version 9.0.0 onwards. The callback will only support mutating spans. To drop certain spans, configure the respective integrations directly."
      );
    });
    hasShownSpanDropWarning = true;
  }
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/hasTracingEnabled.js
function hasTracingEnabled(maybeOptions) {
  if (typeof __SENTRY_TRACING__ === "boolean" && !__SENTRY_TRACING__) {
    return false;
  }
  const client = getClient();
  const options = client && client.getOptions();
  return !!options && (options.enableTracing || "tracesSampleRate" in options || "tracesSampler" in options);
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/constants.js
var DEFAULT_ENVIRONMENT = "production";

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/tracing/dynamicSamplingContext.js
var FROZEN_DSC_FIELD = "_frozenDsc";
function getDynamicSamplingContextFromClient(trace_id, client) {
  const options = client.getOptions();
  const { publicKey: public_key } = client.getDsn() || {};
  const dsc = dropUndefinedKeys({
    environment: options.environment || DEFAULT_ENVIRONMENT,
    release: options.release,
    public_key,
    trace_id
  });
  client.emit("createDsc", dsc);
  return dsc;
}
function getDynamicSamplingContextFromScope(client, scope) {
  const propagationContext = scope.getPropagationContext();
  return propagationContext.dsc || getDynamicSamplingContextFromClient(propagationContext.traceId, client);
}
function getDynamicSamplingContextFromSpan(span) {
  const client = getClient();
  if (!client) {
    return {};
  }
  const rootSpan = getRootSpan(span);
  const frozenDsc = rootSpan[FROZEN_DSC_FIELD];
  if (frozenDsc) {
    return frozenDsc;
  }
  const traceState = rootSpan.spanContext().traceState;
  const traceStateDsc = traceState && traceState.get("sentry.dsc");
  const dscOnTraceState = traceStateDsc && baggageHeaderToDynamicSamplingContext(traceStateDsc);
  if (dscOnTraceState) {
    return dscOnTraceState;
  }
  const dsc = getDynamicSamplingContextFromClient(span.spanContext().traceId, client);
  const jsonSpan = spanToJSON(rootSpan);
  const attributes = jsonSpan.data || {};
  const maybeSampleRate = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE];
  if (maybeSampleRate != null) {
    dsc.sample_rate = `${maybeSampleRate}`;
  }
  const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  const name = jsonSpan.description;
  if (source !== "url" && name) {
    dsc.transaction = name;
  }
  if (hasTracingEnabled()) {
    dsc.sampled = String(spanIsSampled(rootSpan));
  }
  client.emit("createDsc", dsc, rootSpan);
  return dsc;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/parseSampleRate.js
function parseSampleRate(sampleRate) {
  if (typeof sampleRate === "boolean") {
    return Number(sampleRate);
  }
  const rate = typeof sampleRate === "string" ? parseFloat(sampleRate) : sampleRate;
  if (typeof rate !== "number" || isNaN(rate) || rate < 0 || rate > 1) {
    DEBUG_BUILD && logger.warn(
      `[Tracing] Given sample rate is invalid. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
        sampleRate
      )} of type ${JSON.stringify(typeof sampleRate)}.`
    );
    return void 0;
  }
  return rate;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/dsn.js
var DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+)?)?@)([\w.-]+)(?::(\d+))?\/(.+)/;
function isValidProtocol(protocol) {
  return protocol === "http" || protocol === "https";
}
function dsnToString(dsn, withPassword = false) {
  const { host, path, pass, port, projectId, protocol, publicKey } = dsn;
  return `${protocol}://${publicKey}${withPassword && pass ? `:${pass}` : ""}@${host}${port ? `:${port}` : ""}/${path ? `${path}/` : path}${projectId}`;
}
function dsnFromString(str) {
  const match = DSN_REGEX.exec(str);
  if (!match) {
    consoleSandbox(() => {
      console.error(`Invalid Sentry Dsn: ${str}`);
    });
    return void 0;
  }
  const [protocol, publicKey, pass = "", host = "", port = "", lastPath = ""] = match.slice(1);
  let path = "";
  let projectId = lastPath;
  const split = projectId.split("/");
  if (split.length > 1) {
    path = split.slice(0, -1).join("/");
    projectId = split.pop();
  }
  if (projectId) {
    const projectMatch = projectId.match(/^\d+/);
    if (projectMatch) {
      projectId = projectMatch[0];
    }
  }
  return dsnFromComponents({ host, pass, path, projectId, port, protocol, publicKey });
}
function dsnFromComponents(components) {
  return {
    protocol: components.protocol,
    publicKey: components.publicKey || "",
    pass: components.pass || "",
    host: components.host,
    port: components.port || "",
    path: components.path || "",
    projectId: components.projectId
  };
}
function validateDsn(dsn) {
  if (!DEBUG_BUILD2) {
    return true;
  }
  const { port, projectId, protocol } = dsn;
  const requiredComponents = ["protocol", "publicKey", "host", "projectId"];
  const hasMissingRequiredComponent = requiredComponents.find((component) => {
    if (!dsn[component]) {
      logger.error(`Invalid Sentry Dsn: ${component} missing`);
      return true;
    }
    return false;
  });
  if (hasMissingRequiredComponent) {
    return false;
  }
  if (!projectId.match(/^\d+$/)) {
    logger.error(`Invalid Sentry Dsn: Invalid projectId ${projectId}`);
    return false;
  }
  if (!isValidProtocol(protocol)) {
    logger.error(`Invalid Sentry Dsn: Invalid protocol ${protocol}`);
    return false;
  }
  if (port && isNaN(parseInt(port, 10))) {
    logger.error(`Invalid Sentry Dsn: Invalid port ${port}`);
    return false;
  }
  return true;
}
function makeDsn(from) {
  const components = typeof from === "string" ? dsnFromString(from) : dsnFromComponents(from);
  if (!components || !validateDsn(components)) {
    return void 0;
  }
  return components;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/memo.js
function memoBuilder() {
  const hasWeakSet = typeof WeakSet === "function";
  const inner = hasWeakSet ? /* @__PURE__ */ new WeakSet() : [];
  function memoize(obj) {
    if (hasWeakSet) {
      if (inner.has(obj)) {
        return true;
      }
      inner.add(obj);
      return false;
    }
    for (let i = 0; i < inner.length; i++) {
      const value = inner[i];
      if (value === obj) {
        return true;
      }
    }
    inner.push(obj);
    return false;
  }
  function unmemoize(obj) {
    if (hasWeakSet) {
      inner.delete(obj);
    } else {
      for (let i = 0; i < inner.length; i++) {
        if (inner[i] === obj) {
          inner.splice(i, 1);
          break;
        }
      }
    }
  }
  return [memoize, unmemoize];
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/normalize.js
function normalize(input, depth = 100, maxProperties = Infinity) {
  try {
    return visit("", input, depth, maxProperties);
  } catch (err) {
    return { ERROR: `**non-serializable** (${err})` };
  }
}
function normalizeToSize(object, depth = 3, maxSize = 100 * 1024) {
  const normalized = normalize(object, depth);
  if (jsonSize(normalized) > maxSize) {
    return normalizeToSize(object, depth - 1, maxSize);
  }
  return normalized;
}
function visit(key, value, depth = Infinity, maxProperties = Infinity, memo = memoBuilder()) {
  const [memoize, unmemoize] = memo;
  if (value == null || // this matches null and undefined -> eqeq not eqeqeq
  ["boolean", "string"].includes(typeof value) || typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const stringified = stringifyValue(key, value);
  if (!stringified.startsWith("[object ")) {
    return stringified;
  }
  if (value["__sentry_skip_normalization__"]) {
    return value;
  }
  const remainingDepth = typeof value["__sentry_override_normalization_depth__"] === "number" ? value["__sentry_override_normalization_depth__"] : depth;
  if (remainingDepth === 0) {
    return stringified.replace("object ", "");
  }
  if (memoize(value)) {
    return "[Circular ~]";
  }
  const valueWithToJSON = value;
  if (valueWithToJSON && typeof valueWithToJSON.toJSON === "function") {
    try {
      const jsonValue = valueWithToJSON.toJSON();
      return visit("", jsonValue, remainingDepth - 1, maxProperties, memo);
    } catch (err) {
    }
  }
  const normalized = Array.isArray(value) ? [] : {};
  let numAdded = 0;
  const visitable = convertToPlainObject(value);
  for (const visitKey in visitable) {
    if (!Object.prototype.hasOwnProperty.call(visitable, visitKey)) {
      continue;
    }
    if (numAdded >= maxProperties) {
      normalized[visitKey] = "[MaxProperties ~]";
      break;
    }
    const visitValue = visitable[visitKey];
    normalized[visitKey] = visit(visitKey, visitValue, remainingDepth - 1, maxProperties, memo);
    numAdded++;
  }
  unmemoize(value);
  return normalized;
}
function stringifyValue(key, value) {
  try {
    if (key === "domain" && value && typeof value === "object" && value._events) {
      return "[Domain]";
    }
    if (key === "domainEmitter") {
      return "[DomainEmitter]";
    }
    if (typeof global !== "undefined" && value === global) {
      return "[Global]";
    }
    if (typeof window !== "undefined" && value === window) {
      return "[Window]";
    }
    if (typeof document !== "undefined" && value === document) {
      return "[Document]";
    }
    if (isVueViewModel(value)) {
      return "[VueViewModel]";
    }
    if (isSyntheticEvent(value)) {
      return "[SyntheticEvent]";
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      return `[${value}]`;
    }
    if (typeof value === "function") {
      return `[Function: ${getFunctionName(value)}]`;
    }
    if (typeof value === "symbol") {
      return `[${String(value)}]`;
    }
    if (typeof value === "bigint") {
      return `[BigInt: ${String(value)}]`;
    }
    const objName = getConstructorName(value);
    if (/^HTML(\w*)Element$/.test(objName)) {
      return `[HTMLElement: ${objName}]`;
    }
    return `[object ${objName}]`;
  } catch (err) {
    return `**non-serializable** (${err})`;
  }
}
function getConstructorName(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype ? prototype.constructor.name : "null prototype";
}
function utf8Length(value) {
  return ~-encodeURI(value).split(/%..|./).length;
}
function jsonSize(value) {
  return utf8Length(JSON.stringify(value));
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/envelope.js
function createEnvelope(headers, items = []) {
  return [headers, items];
}
function addItemToEnvelope(envelope, newItem) {
  const [headers, items] = envelope;
  return [headers, [...items, newItem]];
}
function forEachEnvelopeItem(envelope, callback) {
  const envelopeItems = envelope[1];
  for (const envelopeItem of envelopeItems) {
    const envelopeItemType = envelopeItem[0].type;
    const result = callback(envelopeItem, envelopeItemType);
    if (result) {
      return true;
    }
  }
  return false;
}
function encodeUTF8(input) {
  return GLOBAL_OBJ2.__SENTRY__ && GLOBAL_OBJ2.__SENTRY__.encodePolyfill ? GLOBAL_OBJ2.__SENTRY__.encodePolyfill(input) : new TextEncoder().encode(input);
}
function serializeEnvelope(envelope) {
  const [envHeaders, items] = envelope;
  let parts = JSON.stringify(envHeaders);
  function append(next) {
    if (typeof parts === "string") {
      parts = typeof next === "string" ? parts + next : [encodeUTF8(parts), next];
    } else {
      parts.push(typeof next === "string" ? encodeUTF8(next) : next);
    }
  }
  for (const item of items) {
    const [itemHeaders, payload] = item;
    append(`
${JSON.stringify(itemHeaders)}
`);
    if (typeof payload === "string" || payload instanceof Uint8Array) {
      append(payload);
    } else {
      let stringifiedPayload;
      try {
        stringifiedPayload = JSON.stringify(payload);
      } catch (e) {
        stringifiedPayload = JSON.stringify(normalize(payload));
      }
      append(stringifiedPayload);
    }
  }
  return typeof parts === "string" ? parts : concatBuffers(parts);
}
function concatBuffers(buffers) {
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    merged.set(buffer, offset);
    offset += buffer.length;
  }
  return merged;
}
function createAttachmentEnvelopeItem(attachment) {
  const buffer = typeof attachment.data === "string" ? encodeUTF8(attachment.data) : attachment.data;
  return [
    dropUndefinedKeys({
      type: "attachment",
      length: buffer.length,
      filename: attachment.filename,
      content_type: attachment.contentType,
      attachment_type: attachment.attachmentType
    }),
    buffer
  ];
}
var ITEM_TYPE_TO_DATA_CATEGORY_MAP = {
  session: "session",
  sessions: "session",
  attachment: "attachment",
  transaction: "transaction",
  event: "error",
  client_report: "internal",
  user_report: "default",
  profile: "profile",
  profile_chunk: "profile",
  replay_event: "replay",
  replay_recording: "replay",
  check_in: "monitor",
  feedback: "feedback",
  span: "span",
  statsd: "metric_bucket",
  raw_security: "security"
};
function envelopeItemTypeToDataCategory(type) {
  return ITEM_TYPE_TO_DATA_CATEGORY_MAP[type];
}
function getSdkMetadataForEnvelopeHeader(metadataOrEvent) {
  if (!metadataOrEvent || !metadataOrEvent.sdk) {
    return;
  }
  const { name, version } = metadataOrEvent.sdk;
  return { name, version };
}
function createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn) {
  const dynamicSamplingContext = event.sdkProcessingMetadata && event.sdkProcessingMetadata.dynamicSamplingContext;
  return __spreadValues(__spreadValues(__spreadValues({
    event_id: event.event_id,
    sent_at: (/* @__PURE__ */ new Date()).toISOString()
  }, sdkInfo && { sdk: sdkInfo }), !!tunnel && dsn && { dsn: dsnToString(dsn) }), dynamicSamplingContext && {
    trace: dropUndefinedKeys(__spreadValues({}, dynamicSamplingContext))
  });
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/envelope.js
function enhanceEventWithSdkInfo(event, sdkInfo) {
  if (!sdkInfo) {
    return event;
  }
  event.sdk = event.sdk || {};
  event.sdk.name = event.sdk.name || sdkInfo.name;
  event.sdk.version = event.sdk.version || sdkInfo.version;
  event.sdk.integrations = [...event.sdk.integrations || [], ...sdkInfo.integrations || []];
  event.sdk.packages = [...event.sdk.packages || [], ...sdkInfo.packages || []];
  return event;
}
function createSessionEnvelope(session, dsn, metadata, tunnel) {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  const envelopeHeaders = __spreadValues(__spreadValues({
    sent_at: (/* @__PURE__ */ new Date()).toISOString()
  }, sdkInfo && { sdk: sdkInfo }), !!tunnel && dsn && { dsn: dsnToString(dsn) });
  const envelopeItem = "aggregates" in session ? [{ type: "sessions" }, session] : [{ type: "session" }, session.toJSON()];
  return createEnvelope(envelopeHeaders, [envelopeItem]);
}
function createEventEnvelope(event, dsn, metadata, tunnel) {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  const eventType = event.type && event.type !== "replay_event" ? event.type : "event";
  enhanceEventWithSdkInfo(event, metadata && metadata.sdk);
  const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);
  delete event.sdkProcessingMetadata;
  const eventItem = [{ type: eventType }, event];
  return createEnvelope(envelopeHeaders, [eventItem]);
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/eventProcessors.js
function notifyEventProcessors(processors, event, hint, index = 0) {
  return new SyncPromise((resolve2, reject) => {
    const processor = processors[index];
    if (event === null || typeof processor !== "function") {
      resolve2(event);
    } else {
      const result = processor(__spreadValues({}, event), hint);
      DEBUG_BUILD && processor.id && result === null && logger.log(`Event processor "${processor.id}" dropped event`);
      if (isThenable(result)) {
        void result.then((final) => notifyEventProcessors(processors, final, hint, index + 1).then(resolve2)).then(null, reject);
      } else {
        void notifyEventProcessors(processors, result, hint, index + 1).then(resolve2).then(null, reject);
      }
    }
  });
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/debug-ids.js
var parsedStackResults;
var lastKeysCount;
var cachedFilenameDebugIds;
function getFilenameToDebugIdMap(stackParser) {
  const debugIdMap = GLOBAL_OBJ2._sentryDebugIds;
  if (!debugIdMap) {
    return {};
  }
  const debugIdKeys = Object.keys(debugIdMap);
  if (cachedFilenameDebugIds && debugIdKeys.length === lastKeysCount) {
    return cachedFilenameDebugIds;
  }
  lastKeysCount = debugIdKeys.length;
  cachedFilenameDebugIds = debugIdKeys.reduce((acc, stackKey) => {
    if (!parsedStackResults) {
      parsedStackResults = {};
    }
    const result = parsedStackResults[stackKey];
    if (result) {
      acc[result[0]] = result[1];
    } else {
      const parsedStack = stackParser(stackKey);
      for (let i = parsedStack.length - 1; i >= 0; i--) {
        const stackFrame = parsedStack[i];
        const filename = stackFrame && stackFrame.filename;
        const debugId = debugIdMap[stackKey];
        if (filename && debugId) {
          acc[filename] = debugId;
          parsedStackResults[stackKey] = [filename, debugId];
          break;
        }
      }
    }
    return acc;
  }, {});
  return cachedFilenameDebugIds;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/applyScopeDataToEvent.js
function applyScopeDataToEvent(event, data) {
  const { fingerprint, span, breadcrumbs, sdkProcessingMetadata } = data;
  applyDataToEvent(event, data);
  if (span) {
    applySpanToEvent(event, span);
  }
  applyFingerprintToEvent(event, fingerprint);
  applyBreadcrumbsToEvent(event, breadcrumbs);
  applySdkMetadataToEvent(event, sdkProcessingMetadata);
}
function mergeScopeData(data, mergeData) {
  const {
    extra,
    tags,
    user,
    contexts,
    level,
    sdkProcessingMetadata,
    breadcrumbs,
    fingerprint,
    eventProcessors,
    attachments,
    propagationContext,
    transactionName,
    span
  } = mergeData;
  mergeAndOverwriteScopeData(data, "extra", extra);
  mergeAndOverwriteScopeData(data, "tags", tags);
  mergeAndOverwriteScopeData(data, "user", user);
  mergeAndOverwriteScopeData(data, "contexts", contexts);
  data.sdkProcessingMetadata = merge(data.sdkProcessingMetadata, sdkProcessingMetadata, 2);
  if (level) {
    data.level = level;
  }
  if (transactionName) {
    data.transactionName = transactionName;
  }
  if (span) {
    data.span = span;
  }
  if (breadcrumbs.length) {
    data.breadcrumbs = [...data.breadcrumbs, ...breadcrumbs];
  }
  if (fingerprint.length) {
    data.fingerprint = [...data.fingerprint, ...fingerprint];
  }
  if (eventProcessors.length) {
    data.eventProcessors = [...data.eventProcessors, ...eventProcessors];
  }
  if (attachments.length) {
    data.attachments = [...data.attachments, ...attachments];
  }
  data.propagationContext = __spreadValues(__spreadValues({}, data.propagationContext), propagationContext);
}
function mergeAndOverwriteScopeData(data, prop, mergeVal) {
  data[prop] = merge(data[prop], mergeVal, 1);
}
function applyDataToEvent(event, data) {
  const { extra, tags, user, contexts, level, transactionName } = data;
  const cleanedExtra = dropUndefinedKeys(extra);
  if (cleanedExtra && Object.keys(cleanedExtra).length) {
    event.extra = __spreadValues(__spreadValues({}, cleanedExtra), event.extra);
  }
  const cleanedTags = dropUndefinedKeys(tags);
  if (cleanedTags && Object.keys(cleanedTags).length) {
    event.tags = __spreadValues(__spreadValues({}, cleanedTags), event.tags);
  }
  const cleanedUser = dropUndefinedKeys(user);
  if (cleanedUser && Object.keys(cleanedUser).length) {
    event.user = __spreadValues(__spreadValues({}, cleanedUser), event.user);
  }
  const cleanedContexts = dropUndefinedKeys(contexts);
  if (cleanedContexts && Object.keys(cleanedContexts).length) {
    event.contexts = __spreadValues(__spreadValues({}, cleanedContexts), event.contexts);
  }
  if (level) {
    event.level = level;
  }
  if (transactionName && event.type !== "transaction") {
    event.transaction = transactionName;
  }
}
function applyBreadcrumbsToEvent(event, breadcrumbs) {
  const mergedBreadcrumbs = [...event.breadcrumbs || [], ...breadcrumbs];
  event.breadcrumbs = mergedBreadcrumbs.length ? mergedBreadcrumbs : void 0;
}
function applySdkMetadataToEvent(event, sdkProcessingMetadata) {
  event.sdkProcessingMetadata = __spreadValues(__spreadValues({}, event.sdkProcessingMetadata), sdkProcessingMetadata);
}
function applySpanToEvent(event, span) {
  event.contexts = __spreadValues({
    trace: spanToTraceContext(span)
  }, event.contexts);
  event.sdkProcessingMetadata = __spreadValues({
    dynamicSamplingContext: getDynamicSamplingContextFromSpan(span)
  }, event.sdkProcessingMetadata);
  const rootSpan = getRootSpan(span);
  const transactionName = spanToJSON(rootSpan).description;
  if (transactionName && !event.transaction && event.type === "transaction") {
    event.transaction = transactionName;
  }
}
function applyFingerprintToEvent(event, fingerprint) {
  event.fingerprint = event.fingerprint ? Array.isArray(event.fingerprint) ? event.fingerprint : [event.fingerprint] : [];
  if (fingerprint) {
    event.fingerprint = event.fingerprint.concat(fingerprint);
  }
  if (event.fingerprint && !event.fingerprint.length) {
    delete event.fingerprint;
  }
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/prepareEvent.js
function prepareEvent(options, event, hint, scope, client, isolationScope) {
  const { normalizeDepth = 3, normalizeMaxBreadth = 1e3 } = options;
  const prepared = __spreadProps(__spreadValues({}, event), {
    event_id: event.event_id || hint.event_id || uuid4(),
    timestamp: event.timestamp || dateTimestampInSeconds()
  });
  const integrations = hint.integrations || options.integrations.map((i) => i.name);
  applyClientOptions(prepared, options);
  applyIntegrationsMetadata(prepared, integrations);
  if (client) {
    client.emit("applyFrameMetadata", event);
  }
  if (event.type === void 0) {
    applyDebugIds(prepared, options.stackParser);
  }
  const finalScope = getFinalScope(scope, hint.captureContext);
  if (hint.mechanism) {
    addExceptionMechanism(prepared, hint.mechanism);
  }
  const clientEventProcessors = client ? client.getEventProcessors() : [];
  const data = getGlobalScope().getScopeData();
  if (isolationScope) {
    const isolationData = isolationScope.getScopeData();
    mergeScopeData(data, isolationData);
  }
  if (finalScope) {
    const finalScopeData = finalScope.getScopeData();
    mergeScopeData(data, finalScopeData);
  }
  const attachments = [...hint.attachments || [], ...data.attachments];
  if (attachments.length) {
    hint.attachments = attachments;
  }
  applyScopeDataToEvent(prepared, data);
  const eventProcessors = [
    ...clientEventProcessors,
    // Run scope event processors _after_ all other processors
    ...data.eventProcessors
  ];
  const result = notifyEventProcessors(eventProcessors, prepared, hint);
  return result.then((evt) => {
    if (evt) {
      applyDebugMeta(evt);
    }
    if (typeof normalizeDepth === "number" && normalizeDepth > 0) {
      return normalizeEvent(evt, normalizeDepth, normalizeMaxBreadth);
    }
    return evt;
  });
}
function applyClientOptions(event, options) {
  const { environment, release, dist, maxValueLength = 250 } = options;
  event.environment = event.environment || environment || DEFAULT_ENVIRONMENT;
  if (!event.release && release) {
    event.release = release;
  }
  if (!event.dist && dist) {
    event.dist = dist;
  }
  if (event.message) {
    event.message = truncate(event.message, maxValueLength);
  }
  const exception = event.exception && event.exception.values && event.exception.values[0];
  if (exception && exception.value) {
    exception.value = truncate(exception.value, maxValueLength);
  }
  const request = event.request;
  if (request && request.url) {
    request.url = truncate(request.url, maxValueLength);
  }
}
function applyDebugIds(event, stackParser) {
  const filenameDebugIdMap = getFilenameToDebugIdMap(stackParser);
  try {
    event.exception.values.forEach((exception) => {
      exception.stacktrace.frames.forEach((frame) => {
        if (filenameDebugIdMap && frame.filename) {
          frame.debug_id = filenameDebugIdMap[frame.filename];
        }
      });
    });
  } catch (e) {
  }
}
function applyDebugMeta(event) {
  const filenameDebugIdMap = {};
  try {
    event.exception.values.forEach((exception) => {
      exception.stacktrace.frames.forEach((frame) => {
        if (frame.debug_id) {
          if (frame.abs_path) {
            filenameDebugIdMap[frame.abs_path] = frame.debug_id;
          } else if (frame.filename) {
            filenameDebugIdMap[frame.filename] = frame.debug_id;
          }
          delete frame.debug_id;
        }
      });
    });
  } catch (e) {
  }
  if (Object.keys(filenameDebugIdMap).length === 0) {
    return;
  }
  event.debug_meta = event.debug_meta || {};
  event.debug_meta.images = event.debug_meta.images || [];
  const images = event.debug_meta.images;
  Object.entries(filenameDebugIdMap).forEach(([filename, debug_id]) => {
    images.push({
      type: "sourcemap",
      code_file: filename,
      debug_id
    });
  });
}
function applyIntegrationsMetadata(event, integrationNames) {
  if (integrationNames.length > 0) {
    event.sdk = event.sdk || {};
    event.sdk.integrations = [...event.sdk.integrations || [], ...integrationNames];
  }
}
function normalizeEvent(event, depth, maxBreadth) {
  if (!event) {
    return null;
  }
  const normalized = __spreadValues(__spreadValues(__spreadValues(__spreadValues(__spreadValues({}, event), event.breadcrumbs && {
    breadcrumbs: event.breadcrumbs.map((b) => __spreadValues(__spreadValues({}, b), b.data && {
      data: normalize(b.data, depth, maxBreadth)
    }))
  }), event.user && {
    user: normalize(event.user, depth, maxBreadth)
  }), event.contexts && {
    contexts: normalize(event.contexts, depth, maxBreadth)
  }), event.extra && {
    extra: normalize(event.extra, depth, maxBreadth)
  });
  if (event.contexts && event.contexts.trace && normalized.contexts) {
    normalized.contexts.trace = event.contexts.trace;
    if (event.contexts.trace.data) {
      normalized.contexts.trace.data = normalize(event.contexts.trace.data, depth, maxBreadth);
    }
  }
  if (event.spans) {
    normalized.spans = event.spans.map((span) => {
      return __spreadValues(__spreadValues({}, span), span.data && {
        data: normalize(span.data, depth, maxBreadth)
      });
    });
  }
  if (event.contexts && event.contexts.flags && normalized.contexts) {
    normalized.contexts.flags = normalize(event.contexts.flags, 3, maxBreadth);
  }
  return normalized;
}
function getFinalScope(scope, captureContext) {
  if (!captureContext) {
    return scope;
  }
  const finalScope = scope ? scope.clone() : new Scope();
  finalScope.update(captureContext);
  return finalScope;
}
function parseEventHintOrCaptureContext(hint) {
  if (!hint) {
    return void 0;
  }
  if (hintIsScopeOrFunction(hint)) {
    return { captureContext: hint };
  }
  if (hintIsScopeContext(hint)) {
    return {
      captureContext: hint
    };
  }
  return hint;
}
function hintIsScopeOrFunction(hint) {
  return hint instanceof Scope || typeof hint === "function";
}
var captureContextKeys = [
  "user",
  "level",
  "extra",
  "contexts",
  "tags",
  "fingerprint",
  "requestSession",
  "propagationContext"
];
function hintIsScopeContext(hint) {
  return Object.keys(hint).some((key) => captureContextKeys.includes(key));
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/exports.js
function captureException(exception, hint) {
  return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
}
function captureMessage(message, captureContext) {
  const level = typeof captureContext === "string" ? captureContext : void 0;
  const context = typeof captureContext !== "string" ? { captureContext } : void 0;
  return getCurrentScope().captureMessage(message, level, context);
}
function captureEvent(event, hint) {
  return getCurrentScope().captureEvent(event, hint);
}
function setContext(name, context) {
  getIsolationScope().setContext(name, context);
}
function setExtras(extras) {
  getIsolationScope().setExtras(extras);
}
function setExtra(key, extra) {
  getIsolationScope().setExtra(key, extra);
}
function setTags(tags) {
  getIsolationScope().setTags(tags);
}
function setTag(key, value) {
  getIsolationScope().setTag(key, value);
}
function setUser(user) {
  getIsolationScope().setUser(user);
}
function lastEventId() {
  return getIsolationScope().lastEventId();
}
function addEventProcessor(callback) {
  getIsolationScope().addEventProcessor(callback);
}
function startSession(context) {
  const client = getClient();
  const isolationScope = getIsolationScope();
  const currentScope = getCurrentScope();
  const { release, environment = DEFAULT_ENVIRONMENT } = client && client.getOptions() || {};
  const { userAgent } = GLOBAL_OBJ2.navigator || {};
  const session = makeSession(__spreadValues(__spreadValues({
    release,
    environment,
    user: currentScope.getUser() || isolationScope.getUser()
  }, userAgent && { userAgent }), context));
  const currentSession = isolationScope.getSession();
  if (currentSession && currentSession.status === "ok") {
    updateSession(currentSession, { status: "exited" });
  }
  endSession();
  isolationScope.setSession(session);
  currentScope.setSession(session);
  return session;
}
function endSession() {
  const isolationScope = getIsolationScope();
  const currentScope = getCurrentScope();
  const session = currentScope.getSession() || isolationScope.getSession();
  if (session) {
    closeSession(session);
  }
  _sendSessionUpdate();
  isolationScope.setSession();
  currentScope.setSession();
}
function _sendSessionUpdate() {
  const isolationScope = getIsolationScope();
  const currentScope = getCurrentScope();
  const client = getClient();
  const session = currentScope.getSession() || isolationScope.getSession();
  if (session && client) {
    client.captureSession(session);
  }
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/api.js
var SENTRY_API_VERSION = "7";
function getBaseApiEndpoint(dsn) {
  const protocol = dsn.protocol ? `${dsn.protocol}:` : "";
  const port = dsn.port ? `:${dsn.port}` : "";
  return `${protocol}//${dsn.host}${port}${dsn.path ? `/${dsn.path}` : ""}/api/`;
}
function _getIngestEndpoint(dsn) {
  return `${getBaseApiEndpoint(dsn)}${dsn.projectId}/envelope/`;
}
function _encodedAuth(dsn, sdkInfo) {
  const params = {
    sentry_version: SENTRY_API_VERSION
  };
  if (dsn.publicKey) {
    params.sentry_key = dsn.publicKey;
  }
  if (sdkInfo) {
    params.sentry_client = `${sdkInfo.name}/${sdkInfo.version}`;
  }
  return new URLSearchParams(params).toString();
}
function getEnvelopeEndpointWithUrlEncodedAuth(dsn, tunnel, sdkInfo) {
  return tunnel ? tunnel : `${_getIngestEndpoint(dsn)}?${_encodedAuth(dsn, sdkInfo)}`;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/integration.js
var installedIntegrations = [];
function setupIntegrations(client, integrations) {
  const integrationIndex = {};
  integrations.forEach((integration) => {
    if (integration) {
      setupIntegration(client, integration, integrationIndex);
    }
  });
  return integrationIndex;
}
function afterSetupIntegrations(client, integrations) {
  for (const integration of integrations) {
    if (integration && integration.afterAllSetup) {
      integration.afterAllSetup(client);
    }
  }
}
function setupIntegration(client, integration, integrationIndex) {
  if (integrationIndex[integration.name]) {
    DEBUG_BUILD && logger.log(`Integration skipped because it was already installed: ${integration.name}`);
    return;
  }
  integrationIndex[integration.name] = integration;
  if (installedIntegrations.indexOf(integration.name) === -1 && typeof integration.setupOnce === "function") {
    integration.setupOnce();
    installedIntegrations.push(integration.name);
  }
  if (integration.setup && typeof integration.setup === "function") {
    integration.setup(client);
  }
  if (typeof integration.preprocessEvent === "function") {
    const callback = integration.preprocessEvent.bind(integration);
    client.on("preprocessEvent", (event, hint) => callback(event, hint, client));
  }
  if (typeof integration.processEvent === "function") {
    const callback = integration.processEvent.bind(integration);
    const processor = Object.assign((event, hint) => callback(event, hint, client), {
      id: integration.name
    });
    client.addEventProcessor(processor);
  }
  DEBUG_BUILD && logger.log(`Integration installed: ${integration.name}`);
}
function defineIntegration(fn) {
  return fn;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/clientreport.js
function createClientReportEnvelope(discarded_events, dsn, timestamp) {
  const clientReportItem = [
    { type: "client_report" },
    {
      timestamp: dateTimestampInSeconds(),
      discarded_events
    }
  ];
  return createEnvelope(dsn ? { dsn } : {}, [clientReportItem]);
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/error.js
var SentryError = class extends Error {
  constructor(message, logLevel = "warn") {
    super(message);
    this.message = message;
    this.logLevel = logLevel;
  }
};

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/baseclient.js
var ALREADY_SEEN_ERROR = "Not capturing exception because it's already been captured.";
var BaseClient = class {
  /** Options passed to the SDK. */
  /** The client Dsn, if specified in options. Without this Dsn, the SDK will be disabled. */
  /** Array of set up integrations. */
  /** Number of calls being processed */
  /** Holds flushable  */
  // eslint-disable-next-line @typescript-eslint/ban-types
  /**
   * Initializes this client instance.
   *
   * @param options Options for the client.
   */
  constructor(options) {
    this._options = options;
    this._integrations = {};
    this._numProcessing = 0;
    this._outcomes = {};
    this._hooks = {};
    this._eventProcessors = [];
    if (options.dsn) {
      this._dsn = makeDsn(options.dsn);
    } else {
      DEBUG_BUILD && logger.warn("No DSN provided, client will not send events.");
    }
    if (this._dsn) {
      const url = getEnvelopeEndpointWithUrlEncodedAuth(
        this._dsn,
        options.tunnel,
        options._metadata ? options._metadata.sdk : void 0
      );
      this._transport = options.transport(__spreadProps(__spreadValues({
        tunnel: this._options.tunnel,
        recordDroppedEvent: this.recordDroppedEvent.bind(this)
      }, options.transportOptions), {
        url
      }));
    }
    const tracingOptions = ["enableTracing", "tracesSampleRate", "tracesSampler"];
    const undefinedOption = tracingOptions.find((option) => option in options && options[option] == void 0);
    if (undefinedOption) {
      consoleSandbox(() => {
        console.warn(
          `[Sentry] Deprecation warning: \`${undefinedOption}\` is set to undefined, which leads to tracing being enabled. In v9, a value of \`undefined\` will result in tracing being disabled.`
        );
      });
    }
  }
  /**
   * @inheritDoc
   */
  captureException(exception, hint, scope) {
    const eventId = uuid4();
    if (checkOrSetAlreadyCaught(exception)) {
      DEBUG_BUILD && logger.log(ALREADY_SEEN_ERROR);
      return eventId;
    }
    const hintWithEventId = __spreadValues({
      event_id: eventId
    }, hint);
    this._process(
      this.eventFromException(exception, hintWithEventId).then(
        (event) => this._captureEvent(event, hintWithEventId, scope)
      )
    );
    return hintWithEventId.event_id;
  }
  /**
   * @inheritDoc
   */
  captureMessage(message, level, hint, currentScope) {
    const hintWithEventId = __spreadValues({
      event_id: uuid4()
    }, hint);
    const eventMessage = isParameterizedString(message) ? message : String(message);
    const promisedEvent = isPrimitive(message) ? this.eventFromMessage(eventMessage, level, hintWithEventId) : this.eventFromException(message, hintWithEventId);
    this._process(promisedEvent.then((event) => this._captureEvent(event, hintWithEventId, currentScope)));
    return hintWithEventId.event_id;
  }
  /**
   * @inheritDoc
   */
  captureEvent(event, hint, currentScope) {
    const eventId = uuid4();
    if (hint && hint.originalException && checkOrSetAlreadyCaught(hint.originalException)) {
      DEBUG_BUILD && logger.log(ALREADY_SEEN_ERROR);
      return eventId;
    }
    const hintWithEventId = __spreadValues({
      event_id: eventId
    }, hint);
    const sdkProcessingMetadata = event.sdkProcessingMetadata || {};
    const capturedSpanScope = sdkProcessingMetadata.capturedSpanScope;
    this._process(this._captureEvent(event, hintWithEventId, capturedSpanScope || currentScope));
    return hintWithEventId.event_id;
  }
  /**
   * @inheritDoc
   */
  captureSession(session) {
    if (!(typeof session.release === "string")) {
      DEBUG_BUILD && logger.warn("Discarded session because of missing or non-string release");
    } else {
      this.sendSession(session);
      updateSession(session, { init: false });
    }
  }
  /**
   * @inheritDoc
   */
  getDsn() {
    return this._dsn;
  }
  /**
   * @inheritDoc
   */
  getOptions() {
    return this._options;
  }
  /**
   * @see SdkMetadata
   *
   * @return The metadata of the SDK
   */
  getSdkMetadata() {
    return this._options._metadata;
  }
  /**
   * @inheritDoc
   */
  getTransport() {
    return this._transport;
  }
  /**
   * @inheritDoc
   */
  flush(timeout) {
    const transport = this._transport;
    if (transport) {
      this.emit("flush");
      return this._isClientDoneProcessing(timeout).then((clientFinished) => {
        return transport.flush(timeout).then((transportFlushed) => clientFinished && transportFlushed);
      });
    } else {
      return resolvedSyncPromise(true);
    }
  }
  /**
   * @inheritDoc
   */
  close(timeout) {
    return this.flush(timeout).then((result) => {
      this.getOptions().enabled = false;
      this.emit("close");
      return result;
    });
  }
  /** Get all installed event processors. */
  getEventProcessors() {
    return this._eventProcessors;
  }
  /** @inheritDoc */
  addEventProcessor(eventProcessor) {
    this._eventProcessors.push(eventProcessor);
  }
  /** @inheritdoc */
  init() {
    if (this._isEnabled() || // Force integrations to be setup even if no DSN was set when we have
    // Spotlight enabled. This is particularly important for browser as we
    // don't support the `spotlight` option there and rely on the users
    // adding the `spotlightBrowserIntegration()` to their integrations which
    // wouldn't get initialized with the check below when there's no DSN set.
    this._options.integrations.some(({ name }) => name.startsWith("Spotlight"))) {
      this._setupIntegrations();
    }
  }
  /**
   * Gets an installed integration by its name.
   *
   * @returns The installed integration or `undefined` if no integration with that `name` was installed.
   */
  getIntegrationByName(integrationName) {
    return this._integrations[integrationName];
  }
  /**
   * @inheritDoc
   */
  addIntegration(integration) {
    const isAlreadyInstalled = this._integrations[integration.name];
    setupIntegration(this, integration, this._integrations);
    if (!isAlreadyInstalled) {
      afterSetupIntegrations(this, [integration]);
    }
  }
  /**
   * @inheritDoc
   */
  sendEvent(event, hint = {}) {
    this.emit("beforeSendEvent", event, hint);
    let env = createEventEnvelope(event, this._dsn, this._options._metadata, this._options.tunnel);
    for (const attachment of hint.attachments || []) {
      env = addItemToEnvelope(env, createAttachmentEnvelopeItem(attachment));
    }
    const promise = this.sendEnvelope(env);
    if (promise) {
      promise.then((sendResponse) => this.emit("afterSendEvent", event, sendResponse), null);
    }
  }
  /**
   * @inheritDoc
   */
  sendSession(session) {
    const env = createSessionEnvelope(session, this._dsn, this._options._metadata, this._options.tunnel);
    this.sendEnvelope(env);
  }
  /**
   * @inheritDoc
   */
  recordDroppedEvent(reason, category, eventOrCount) {
    if (this._options.sendClientReports) {
      const count = typeof eventOrCount === "number" ? eventOrCount : 1;
      const key = `${reason}:${category}`;
      DEBUG_BUILD && logger.log(`Recording outcome: "${key}"${count > 1 ? ` (${count} times)` : ""}`);
      this._outcomes[key] = (this._outcomes[key] || 0) + count;
    }
  }
  // Keep on() & emit() signatures in sync with types' client.ts interface
  /* eslint-disable @typescript-eslint/unified-signatures */
  /** @inheritdoc */
  /** @inheritdoc */
  on(hook, callback) {
    const hooks = this._hooks[hook] = this._hooks[hook] || [];
    hooks.push(callback);
    return () => {
      const cbIndex = hooks.indexOf(callback);
      if (cbIndex > -1) {
        hooks.splice(cbIndex, 1);
      }
    };
  }
  /** @inheritdoc */
  /** @inheritdoc */
  emit(hook, ...rest) {
    const callbacks = this._hooks[hook];
    if (callbacks) {
      callbacks.forEach((callback) => callback(...rest));
    }
  }
  /**
   * @inheritdoc
   */
  sendEnvelope(envelope) {
    this.emit("beforeEnvelope", envelope);
    if (this._isEnabled() && this._transport) {
      return this._transport.send(envelope).then(null, (reason) => {
        DEBUG_BUILD && logger.error("Error while sending envelope:", reason);
        return reason;
      });
    }
    DEBUG_BUILD && logger.error("Transport disabled");
    return resolvedSyncPromise({});
  }
  /* eslint-enable @typescript-eslint/unified-signatures */
  /** Setup integrations for this client. */
  _setupIntegrations() {
    const { integrations } = this._options;
    this._integrations = setupIntegrations(this, integrations);
    afterSetupIntegrations(this, integrations);
  }
  /** Updates existing session based on the provided event */
  _updateSessionFromEvent(session, event) {
    let crashed = event.level === "fatal";
    let errored = false;
    const exceptions = event.exception && event.exception.values;
    if (exceptions) {
      errored = true;
      for (const ex of exceptions) {
        const mechanism = ex.mechanism;
        if (mechanism && mechanism.handled === false) {
          crashed = true;
          break;
        }
      }
    }
    const sessionNonTerminal = session.status === "ok";
    const shouldUpdateAndSend = sessionNonTerminal && session.errors === 0 || sessionNonTerminal && crashed;
    if (shouldUpdateAndSend) {
      updateSession(session, __spreadProps(__spreadValues({}, crashed && { status: "crashed" }), {
        errors: session.errors || Number(errored || crashed)
      }));
      this.captureSession(session);
    }
  }
  /**
   * Determine if the client is finished processing. Returns a promise because it will wait `timeout` ms before saying
   * "no" (resolving to `false`) in order to give the client a chance to potentially finish first.
   *
   * @param timeout The time, in ms, after which to resolve to `false` if the client is still busy. Passing `0` (or not
   * passing anything) will make the promise wait as long as it takes for processing to finish before resolving to
   * `true`.
   * @returns A promise which will resolve to `true` if processing is already done or finishes before the timeout, and
   * `false` otherwise
   */
  _isClientDoneProcessing(timeout) {
    return new SyncPromise((resolve2) => {
      let ticked = 0;
      const tick = 1;
      const interval = setInterval(() => {
        if (this._numProcessing == 0) {
          clearInterval(interval);
          resolve2(true);
        } else {
          ticked += tick;
          if (timeout && ticked >= timeout) {
            clearInterval(interval);
            resolve2(false);
          }
        }
      }, tick);
    });
  }
  /** Determines whether this SDK is enabled and a transport is present. */
  _isEnabled() {
    return this.getOptions().enabled !== false && this._transport !== void 0;
  }
  /**
   * Adds common information to events.
   *
   * The information includes release and environment from `options`,
   * breadcrumbs and context (extra, tags and user) from the scope.
   *
   * Information that is already present in the event is never overwritten. For
   * nested objects, such as the context, keys are merged.
   *
   * @param event The original event.
   * @param hint May contain additional information about the original exception.
   * @param currentScope A scope containing event metadata.
   * @returns A new event with more information.
   */
  _prepareEvent(event, hint, currentScope = getCurrentScope(), isolationScope = getIsolationScope()) {
    const options = this.getOptions();
    const integrations = Object.keys(this._integrations);
    if (!hint.integrations && integrations.length > 0) {
      hint.integrations = integrations;
    }
    this.emit("preprocessEvent", event, hint);
    if (!event.type) {
      isolationScope.setLastEventId(event.event_id || hint.event_id);
    }
    return prepareEvent(options, event, hint, currentScope, this, isolationScope).then((evt) => {
      if (evt === null) {
        return evt;
      }
      evt.contexts = __spreadValues({
        trace: getTraceContextFromScope(currentScope)
      }, evt.contexts);
      const dynamicSamplingContext = getDynamicSamplingContextFromScope(this, currentScope);
      evt.sdkProcessingMetadata = __spreadValues({
        dynamicSamplingContext
      }, evt.sdkProcessingMetadata);
      return evt;
    });
  }
  /**
   * Processes the event and logs an error in case of rejection
   * @param event
   * @param hint
   * @param scope
   */
  _captureEvent(event, hint = {}, scope) {
    return this._processEvent(event, hint, scope).then(
      (finalEvent) => {
        return finalEvent.event_id;
      },
      (reason) => {
        if (DEBUG_BUILD) {
          if (reason instanceof SentryError && reason.logLevel === "log") {
            logger.log(reason.message);
          } else {
            logger.warn(reason);
          }
        }
        return void 0;
      }
    );
  }
  /**
   * Processes an event (either error or message) and sends it to Sentry.
   *
   * This also adds breadcrumbs and context information to the event. However,
   * platform specific meta data (such as the User's IP address) must be added
   * by the SDK implementor.
   *
   *
   * @param event The event to send to Sentry.
   * @param hint May contain additional information about the original exception.
   * @param currentScope A scope containing event metadata.
   * @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
   */
  _processEvent(event, hint, currentScope) {
    const options = this.getOptions();
    const { sampleRate } = options;
    const isTransaction = isTransactionEvent(event);
    const isError3 = isErrorEvent2(event);
    const eventType = event.type || "error";
    const beforeSendLabel = `before send for type \`${eventType}\``;
    const parsedSampleRate = typeof sampleRate === "undefined" ? void 0 : parseSampleRate(sampleRate);
    if (isError3 && typeof parsedSampleRate === "number" && Math.random() > parsedSampleRate) {
      this.recordDroppedEvent("sample_rate", "error", event);
      return rejectedSyncPromise(
        new SentryError(
          `Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`,
          "log"
        )
      );
    }
    const dataCategory = eventType === "replay_event" ? "replay" : eventType;
    const sdkProcessingMetadata = event.sdkProcessingMetadata || {};
    const capturedSpanIsolationScope = sdkProcessingMetadata.capturedSpanIsolationScope;
    return this._prepareEvent(event, hint, currentScope, capturedSpanIsolationScope).then((prepared) => {
      if (prepared === null) {
        this.recordDroppedEvent("event_processor", dataCategory, event);
        throw new SentryError("An event processor returned `null`, will not send event.", "log");
      }
      const isInternalException = hint.data && hint.data.__sentry__ === true;
      if (isInternalException) {
        return prepared;
      }
      const result = processBeforeSend(this, options, prepared, hint);
      return _validateBeforeSendResult(result, beforeSendLabel);
    }).then((processedEvent) => {
      if (processedEvent === null) {
        this.recordDroppedEvent("before_send", dataCategory, event);
        if (isTransaction) {
          const spans = event.spans || [];
          const spanCount = 1 + spans.length;
          this.recordDroppedEvent("before_send", "span", spanCount);
        }
        throw new SentryError(`${beforeSendLabel} returned \`null\`, will not send event.`, "log");
      }
      const session = currentScope && currentScope.getSession();
      if (!isTransaction && session) {
        this._updateSessionFromEvent(session, processedEvent);
      }
      if (isTransaction) {
        const spanCountBefore = processedEvent.sdkProcessingMetadata && processedEvent.sdkProcessingMetadata.spanCountBeforeProcessing || 0;
        const spanCountAfter = processedEvent.spans ? processedEvent.spans.length : 0;
        const droppedSpanCount = spanCountBefore - spanCountAfter;
        if (droppedSpanCount > 0) {
          this.recordDroppedEvent("before_send", "span", droppedSpanCount);
        }
      }
      const transactionInfo = processedEvent.transaction_info;
      if (isTransaction && transactionInfo && processedEvent.transaction !== event.transaction) {
        const source = "custom";
        processedEvent.transaction_info = __spreadProps(__spreadValues({}, transactionInfo), {
          source
        });
      }
      this.sendEvent(processedEvent, hint);
      return processedEvent;
    }).then(null, (reason) => {
      if (reason instanceof SentryError) {
        throw reason;
      }
      this.captureException(reason, {
        data: {
          __sentry__: true
        },
        originalException: reason
      });
      throw new SentryError(
        `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.
Reason: ${reason}`
      );
    });
  }
  /**
   * Occupies the client with processing and event
   */
  _process(promise) {
    this._numProcessing++;
    void promise.then(
      (value) => {
        this._numProcessing--;
        return value;
      },
      (reason) => {
        this._numProcessing--;
        return reason;
      }
    );
  }
  /**
   * Clears outcomes on this client and returns them.
   */
  _clearOutcomes() {
    const outcomes = this._outcomes;
    this._outcomes = {};
    return Object.entries(outcomes).map(([key, quantity]) => {
      const [reason, category] = key.split(":");
      return {
        reason,
        category,
        quantity
      };
    });
  }
  /**
   * Sends client reports as an envelope.
   */
  _flushOutcomes() {
    DEBUG_BUILD && logger.log("Flushing outcomes...");
    const outcomes = this._clearOutcomes();
    if (outcomes.length === 0) {
      DEBUG_BUILD && logger.log("No outcomes to send");
      return;
    }
    if (!this._dsn) {
      DEBUG_BUILD && logger.log("No dsn provided, will not send outcomes");
      return;
    }
    DEBUG_BUILD && logger.log("Sending outcomes:", outcomes);
    const envelope = createClientReportEnvelope(outcomes, this._options.tunnel && dsnToString(this._dsn));
    this.sendEnvelope(envelope);
  }
  /**
   * @inheritDoc
   */
};
function _validateBeforeSendResult(beforeSendResult, beforeSendLabel) {
  const invalidValueError = `${beforeSendLabel} must return \`null\` or a valid event.`;
  if (isThenable(beforeSendResult)) {
    return beforeSendResult.then(
      (event) => {
        if (!isPlainObject(event) && event !== null) {
          throw new SentryError(invalidValueError);
        }
        return event;
      },
      (e) => {
        throw new SentryError(`${beforeSendLabel} rejected with ${e}`);
      }
    );
  } else if (!isPlainObject(beforeSendResult) && beforeSendResult !== null) {
    throw new SentryError(invalidValueError);
  }
  return beforeSendResult;
}
function processBeforeSend(client, options, event, hint) {
  const { beforeSend, beforeSendTransaction, beforeSendSpan } = options;
  if (isErrorEvent2(event) && beforeSend) {
    return beforeSend(event, hint);
  }
  if (isTransactionEvent(event)) {
    if (event.spans && beforeSendSpan) {
      const processedSpans = [];
      for (const span of event.spans) {
        const processedSpan = beforeSendSpan(span);
        if (processedSpan) {
          processedSpans.push(processedSpan);
        } else {
          showSpanDropWarning();
          client.recordDroppedEvent("before_send", "span");
        }
      }
      event.spans = processedSpans;
    }
    if (beforeSendTransaction) {
      if (event.spans) {
        const spanCountBefore = event.spans.length;
        event.sdkProcessingMetadata = __spreadProps(__spreadValues({}, event.sdkProcessingMetadata), {
          spanCountBeforeProcessing: spanCountBefore
        });
      }
      return beforeSendTransaction(event, hint);
    }
  }
  return event;
}
function isErrorEvent2(event) {
  return event.type === void 0;
}
function isTransactionEvent(event) {
  return event.type === "transaction";
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/sdk.js
function initAndBind(clientClass, options) {
  if (options.debug === true) {
    if (DEBUG_BUILD) {
      logger.enable();
    } else {
      consoleSandbox(() => {
        console.warn("[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.");
      });
    }
  }
  const scope = getCurrentScope();
  scope.update(options.initialScope);
  const client = new clientClass(options);
  setCurrentClient(client);
  client.init();
  return client;
}
function setCurrentClient(client) {
  getCurrentScope().setClient(client);
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/promisebuffer.js
function makePromiseBuffer(limit) {
  const buffer = [];
  function isReady() {
    return limit === void 0 || buffer.length < limit;
  }
  function remove(task) {
    return buffer.splice(buffer.indexOf(task), 1)[0] || Promise.resolve(void 0);
  }
  function add(taskProducer) {
    if (!isReady()) {
      return rejectedSyncPromise(new SentryError("Not adding Promise because buffer limit was reached."));
    }
    const task = taskProducer();
    if (buffer.indexOf(task) === -1) {
      buffer.push(task);
    }
    void task.then(() => remove(task)).then(
      null,
      () => remove(task).then(null, () => {
      })
    );
    return task;
  }
  function drain(timeout) {
    return new SyncPromise((resolve2, reject) => {
      let counter = buffer.length;
      if (!counter) {
        return resolve2(true);
      }
      const capturedSetTimeout = setTimeout(() => {
        if (timeout && timeout > 0) {
          resolve2(false);
        }
      }, timeout);
      buffer.forEach((item) => {
        void resolvedSyncPromise(item).then(() => {
          if (!--counter) {
            clearTimeout(capturedSetTimeout);
            resolve2(true);
          }
        }, reject);
      });
    });
  }
  return {
    $: buffer,
    add,
    drain
  };
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils-hoist/ratelimit.js
var DEFAULT_RETRY_AFTER = 60 * 1e3;
function parseRetryAfterHeader(header, now = Date.now()) {
  const headerDelay = parseInt(`${header}`, 10);
  if (!isNaN(headerDelay)) {
    return headerDelay * 1e3;
  }
  const headerDate = Date.parse(`${header}`);
  if (!isNaN(headerDate)) {
    return headerDate - now;
  }
  return DEFAULT_RETRY_AFTER;
}
function disabledUntil(limits, dataCategory) {
  return limits[dataCategory] || limits.all || 0;
}
function isRateLimited(limits, dataCategory, now = Date.now()) {
  return disabledUntil(limits, dataCategory) > now;
}
function updateRateLimits(limits, { statusCode, headers }, now = Date.now()) {
  const updatedRateLimits = __spreadValues({}, limits);
  const rateLimitHeader = headers && headers["x-sentry-rate-limits"];
  const retryAfterHeader = headers && headers["retry-after"];
  if (rateLimitHeader) {
    for (const limit of rateLimitHeader.trim().split(",")) {
      const [retryAfter, categories, , , namespaces] = limit.split(":", 5);
      const headerDelay = parseInt(retryAfter, 10);
      const delay = (!isNaN(headerDelay) ? headerDelay : 60) * 1e3;
      if (!categories) {
        updatedRateLimits.all = now + delay;
      } else {
        for (const category of categories.split(";")) {
          if (category === "metric_bucket") {
            if (!namespaces || namespaces.split(";").includes("custom")) {
              updatedRateLimits[category] = now + delay;
            }
          } else {
            updatedRateLimits[category] = now + delay;
          }
        }
      }
    }
  } else if (retryAfterHeader) {
    updatedRateLimits.all = now + parseRetryAfterHeader(retryAfterHeader, now);
  } else if (statusCode === 429) {
    updatedRateLimits.all = now + 60 * 1e3;
  }
  return updatedRateLimits;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/transports/base.js
var DEFAULT_TRANSPORT_BUFFER_SIZE = 64;
function createTransport(options, makeRequest, buffer = makePromiseBuffer(
  options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE
)) {
  let rateLimits = {};
  const flush3 = (timeout) => buffer.drain(timeout);
  function send(envelope) {
    const filteredEnvelopeItems = [];
    forEachEnvelopeItem(envelope, (item, type) => {
      const dataCategory = envelopeItemTypeToDataCategory(type);
      if (isRateLimited(rateLimits, dataCategory)) {
        const event = getEventForEnvelopeItem(item, type);
        options.recordDroppedEvent("ratelimit_backoff", dataCategory, event);
      } else {
        filteredEnvelopeItems.push(item);
      }
    });
    if (filteredEnvelopeItems.length === 0) {
      return resolvedSyncPromise({});
    }
    const filteredEnvelope = createEnvelope(envelope[0], filteredEnvelopeItems);
    const recordEnvelopeLoss = (reason) => {
      forEachEnvelopeItem(filteredEnvelope, (item, type) => {
        const event = getEventForEnvelopeItem(item, type);
        options.recordDroppedEvent(reason, envelopeItemTypeToDataCategory(type), event);
      });
    };
    const requestTask = () => makeRequest({ body: serializeEnvelope(filteredEnvelope) }).then(
      (response) => {
        if (response.statusCode !== void 0 && (response.statusCode < 200 || response.statusCode >= 300)) {
          DEBUG_BUILD && logger.warn(`Sentry responded with status code ${response.statusCode} to sent event.`);
        }
        rateLimits = updateRateLimits(rateLimits, response);
        return response;
      },
      (error) => {
        recordEnvelopeLoss("network_error");
        throw error;
      }
    );
    return buffer.add(requestTask).then(
      (result) => result,
      (error) => {
        if (error instanceof SentryError) {
          DEBUG_BUILD && logger.error("Skipped sending event because buffer is full.");
          recordEnvelopeLoss("queue_overflow");
          return resolvedSyncPromise({});
        } else {
          throw error;
        }
      }
    );
  }
  return {
    send,
    flush: flush3
  };
}
function getEventForEnvelopeItem(item, type) {
  if (type !== "event" && type !== "transaction") {
    return void 0;
  }
  return Array.isArray(item) ? item[1] : void 0;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/utils/sdkMetadata.js
function applySdkMetadata(options, name, names = [name], source = "npm") {
  const metadata = options._metadata || {};
  if (!metadata.sdk) {
    metadata.sdk = {
      name: `sentry.javascript.${name}`,
      packages: names.map((name2) => ({
        name: `${source}:@sentry/${name2}`,
        version: SDK_VERSION
      })),
      version: SDK_VERSION
    };
  }
  options._metadata = metadata;
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/breadcrumbs.js
var DEFAULT_BREADCRUMBS = 100;
function addBreadcrumb(breadcrumb, hint) {
  const client = getClient();
  const isolationScope = getIsolationScope();
  if (!client) return;
  const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = client.getOptions();
  if (maxBreadcrumbs <= 0) return;
  const timestamp = dateTimestampInSeconds();
  const mergedBreadcrumb = __spreadValues({ timestamp }, breadcrumb);
  const finalBreadcrumb = beforeBreadcrumb ? consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) : mergedBreadcrumb;
  if (finalBreadcrumb === null) return;
  if (client.emit) {
    client.emit("beforeAddBreadcrumb", finalBreadcrumb, hint);
  }
  isolationScope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/integrations/functiontostring.js
var originalFunctionToString;
var INTEGRATION_NAME = "FunctionToString";
var SETUP_CLIENTS = /* @__PURE__ */ new WeakMap();
var _functionToStringIntegration = () => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      originalFunctionToString = Function.prototype.toString;
      try {
        Function.prototype.toString = function(...args) {
          const originalFunction = getOriginalFunction(this);
          const context = SETUP_CLIENTS.has(getClient()) && originalFunction !== void 0 ? originalFunction : this;
          return originalFunctionToString.apply(context, args);
        };
      } catch (e) {
      }
    },
    setup(client) {
      SETUP_CLIENTS.set(client, true);
    }
  };
};
var functionToStringIntegration = defineIntegration(_functionToStringIntegration);

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/integrations/inboundfilters.js
var DEFAULT_IGNORE_ERRORS = [
  /^Script error\.?$/,
  /^Javascript error: Script error\.? on line 0$/,
  /^ResizeObserver loop completed with undelivered notifications.$/,
  // The browser logs this when a ResizeObserver handler takes a bit longer. Usually this is not an actual issue though. It indicates slowness.
  /^Cannot redefine property: googletag$/,
  // This is thrown when google tag manager is used in combination with an ad blocker
  "undefined is not an object (evaluating 'a.L')",
  // Random error that happens but not actionable or noticeable to end-users.
  `can't redefine non-configurable property "solana"`,
  // Probably a browser extension or custom browser (Brave) throwing this error
  "vv().getRestrictions is not a function. (In 'vv().getRestrictions(1,a)', 'vv().getRestrictions' is undefined)",
  // Error thrown by GTM, seemingly not affecting end-users
  "Can't find variable: _AutofillCallbackHandler",
  // Unactionable error in instagram webview https://developers.facebook.com/community/threads/320013549791141/
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+, MethodName:simulateEvent, ParamCount:\d+$/
  // unactionable error from CEFSharp, a .NET library that embeds chromium in .NET apps
];
var INTEGRATION_NAME2 = "InboundFilters";
var _inboundFiltersIntegration = (options = {}) => {
  return {
    name: INTEGRATION_NAME2,
    processEvent(event, _hint, client) {
      const clientOptions = client.getOptions();
      const mergedOptions = _mergeOptions(options, clientOptions);
      return _shouldDropEvent(event, mergedOptions) ? null : event;
    }
  };
};
var inboundFiltersIntegration = defineIntegration(_inboundFiltersIntegration);
function _mergeOptions(internalOptions = {}, clientOptions = {}) {
  return {
    allowUrls: [...internalOptions.allowUrls || [], ...clientOptions.allowUrls || []],
    denyUrls: [...internalOptions.denyUrls || [], ...clientOptions.denyUrls || []],
    ignoreErrors: [
      ...internalOptions.ignoreErrors || [],
      ...clientOptions.ignoreErrors || [],
      ...internalOptions.disableErrorDefaults ? [] : DEFAULT_IGNORE_ERRORS
    ],
    ignoreTransactions: [...internalOptions.ignoreTransactions || [], ...clientOptions.ignoreTransactions || []],
    ignoreInternal: internalOptions.ignoreInternal !== void 0 ? internalOptions.ignoreInternal : true
  };
}
function _shouldDropEvent(event, options) {
  if (options.ignoreInternal && _isSentryError(event)) {
    DEBUG_BUILD && logger.warn(`Event dropped due to being internal Sentry Error.
Event: ${getEventDescription(event)}`);
    return true;
  }
  if (_isIgnoredError(event, options.ignoreErrors)) {
    DEBUG_BUILD && logger.warn(
      `Event dropped due to being matched by \`ignoreErrors\` option.
Event: ${getEventDescription(event)}`
    );
    return true;
  }
  if (_isUselessError(event)) {
    DEBUG_BUILD && logger.warn(
      `Event dropped due to not having an error message, error type or stacktrace.
Event: ${getEventDescription(
        event
      )}`
    );
    return true;
  }
  if (_isIgnoredTransaction(event, options.ignoreTransactions)) {
    DEBUG_BUILD && logger.warn(
      `Event dropped due to being matched by \`ignoreTransactions\` option.
Event: ${getEventDescription(event)}`
    );
    return true;
  }
  if (_isDeniedUrl(event, options.denyUrls)) {
    DEBUG_BUILD && logger.warn(
      `Event dropped due to being matched by \`denyUrls\` option.
Event: ${getEventDescription(
        event
      )}.
Url: ${_getEventFilterUrl(event)}`
    );
    return true;
  }
  if (!_isAllowedUrl(event, options.allowUrls)) {
    DEBUG_BUILD && logger.warn(
      `Event dropped due to not being matched by \`allowUrls\` option.
Event: ${getEventDescription(
        event
      )}.
Url: ${_getEventFilterUrl(event)}`
    );
    return true;
  }
  return false;
}
function _isIgnoredError(event, ignoreErrors) {
  if (event.type || !ignoreErrors || !ignoreErrors.length) {
    return false;
  }
  return _getPossibleEventMessages(event).some((message) => stringMatchesSomePattern(message, ignoreErrors));
}
function _isIgnoredTransaction(event, ignoreTransactions) {
  if (event.type !== "transaction" || !ignoreTransactions || !ignoreTransactions.length) {
    return false;
  }
  const name = event.transaction;
  return name ? stringMatchesSomePattern(name, ignoreTransactions) : false;
}
function _isDeniedUrl(event, denyUrls) {
  if (!denyUrls || !denyUrls.length) {
    return false;
  }
  const url = _getEventFilterUrl(event);
  return !url ? false : stringMatchesSomePattern(url, denyUrls);
}
function _isAllowedUrl(event, allowUrls) {
  if (!allowUrls || !allowUrls.length) {
    return true;
  }
  const url = _getEventFilterUrl(event);
  return !url ? true : stringMatchesSomePattern(url, allowUrls);
}
function _getPossibleEventMessages(event) {
  const possibleMessages = [];
  if (event.message) {
    possibleMessages.push(event.message);
  }
  let lastException;
  try {
    lastException = event.exception.values[event.exception.values.length - 1];
  } catch (e) {
  }
  if (lastException) {
    if (lastException.value) {
      possibleMessages.push(lastException.value);
      if (lastException.type) {
        possibleMessages.push(`${lastException.type}: ${lastException.value}`);
      }
    }
  }
  return possibleMessages;
}
function _isSentryError(event) {
  try {
    return event.exception.values[0].type === "SentryError";
  } catch (e) {
  }
  return false;
}
function _getLastValidUrl(frames = []) {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame && frame.filename !== "<anonymous>" && frame.filename !== "[native code]") {
      return frame.filename || null;
    }
  }
  return null;
}
function _getEventFilterUrl(event) {
  try {
    let frames;
    try {
      frames = event.exception.values[0].stacktrace.frames;
    } catch (e) {
    }
    return frames ? _getLastValidUrl(frames) : null;
  } catch (oO) {
    DEBUG_BUILD && logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
    return null;
  }
}
function _isUselessError(event) {
  if (event.type) {
    return false;
  }
  if (!event.exception || !event.exception.values || event.exception.values.length === 0) {
    return false;
  }
  return (
    // No top-level message
    !event.message && // There are no exception values that have a stacktrace, a non-generic-Error type or value
    !event.exception.values.some((value) => value.stacktrace || value.type && value.type !== "Error" || value.value)
  );
}

// node_modules/.pnpm/@sentry+core@8.55.0/node_modules/@sentry/core/build/esm/getCurrentHubShim.js
function getCurrentHubShim() {
  return {
    bindClient(client) {
      const scope = getCurrentScope();
      scope.setClient(client);
    },
    withScope: withScope2,
    getClient: () => getClient(),
    getScope: getCurrentScope,
    getIsolationScope,
    captureException: (exception, hint) => {
      return getCurrentScope().captureException(exception, hint);
    },
    captureMessage: (message, level, hint) => {
      return getCurrentScope().captureMessage(message, level, hint);
    },
    captureEvent,
    addBreadcrumb,
    setUser,
    setTags,
    setTag,
    setExtra,
    setExtras,
    setContext,
    getIntegration(integration) {
      const client = getClient();
      return client && client.getIntegrationByName(integration.id) || null;
    },
    startSession,
    endSession,
    captureSession(end) {
      if (end) {
        return endSession();
      }
      _sendSessionUpdate2();
    }
  };
}
var getCurrentHub = getCurrentHubShim;
function _sendSessionUpdate2() {
  const scope = getCurrentScope();
  const client = getClient();
  const session = scope.getSession();
  if (client && session) {
    client.captureSession(session);
  }
}

// src/scope.ts
function configureScope(callback) {
  const scope = getCurrentScope();
  callback(scope);
}

// node_modules/.pnpm/@sentry+utils@8.55.0/node_modules/@sentry/utils/build/esm/index.js
var GLOBAL_OBJ3 = GLOBAL_OBJ2;
var isDOMError2 = isDOMError;
var isDOMException2 = isDOMException;
var isError2 = isError;
var isErrorEvent3 = isErrorEvent;
var isEvent2 = isEvent;
var isPlainObject2 = isPlainObject;
var logger2 = logger;
var addExceptionMechanism2 = addExceptionMechanism;
var addExceptionTypeValue2 = addExceptionTypeValue;
var uuid42 = uuid4;
var normalize2 = normalize;
var normalizeToSize2 = normalizeToSize;
var dropUndefinedKeys2 = dropUndefinedKeys;
var extractExceptionKeysForMessage2 = extractExceptionKeysForMessage;
var fill2 = fill;
var SyncPromise2 = SyncPromise;
var resolvedSyncPromise2 = resolvedSyncPromise;
var dateTimestampInSeconds2 = dateTimestampInSeconds;

// src/tracing/flags.ts
var IS_DEBUG_BUILD = typeof __SENTRY_DEBUG__ === "undefined" ? true : __SENTRY_DEBUG__;

// src/tracing/constants.ts
var FINISH_REASON_TAG = "finishReason";
var IDLE_TRANSACTION_FINISH_REASONS = ["heartbeatFailed", "idleTimeout", "documentHidden"];

// src/tracing/utils.ts
var activeTransaction;
function hasTracingEnabled2(maybeOptions) {
  const client = getClient();
  const options = maybeOptions || client && client.getOptions && client.getOptions();
  return !!options && ("tracesSampleRate" in options || "tracesSampler" in options);
}
function getActiveTransaction() {
  return activeTransaction;
}
function setActiveTransaction(transaction) {
  activeTransaction = transaction;
}
function msToSec(time) {
  return time / 1e3;
}
function secToMs(time) {
  return time * 1e3;
}

// src/tracing/span.ts
var SpanRecorder = class {
  constructor(maxlen = 1e3) {
    this.spans = [];
    this._maxlen = maxlen;
  }
  /**
   * This is just so that we don't run out of memory while recording a lot
   * of spans. At some point we just stop and flush out the start of the
   * trace tree (i.e.the first n spans with the smallest
   * start_timestamp).
   */
  add(span) {
    if (this.spans.length > this._maxlen) {
      span.spanRecorder = void 0;
    } else {
      this.spans.push(span);
    }
  }
};
var Span = class _Span {
  /**
   * You should never call the constructor manually, always use `Sentry.startTransaction()`
   * or call `startChild()` on an existing span.
   * @internal
   * @hideconstructor
   * @hidden
   */
  constructor(spanContext) {
    /**
     * Human-readable identifier for the span. Mirrors description for backwards compatibility.
     */
    this.name = "";
    /**
     * @inheritDoc
     */
    this.traceId = uuid42();
    /**
     * @inheritDoc
     */
    this.spanId = uuid42().substring(16);
    /**
     * Timestamp in seconds when the span was created.
     */
    this.startTimestamp = dateTimestampInSeconds2();
    /**
     * @inheritDoc
     */
    this.tags = {};
    /**
     * @inheritDoc
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.data = {};
    /**
     * Attributes for the span (new Sentry/OpenTelemetry style).
     */
    this.attributes = {};
    /**
     * Instrumenter that created the span.
     */
    this.instrumenter = "sentry";
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    if (!spanContext) {
      return this;
    }
    this.traceId = (_a = spanContext.traceId) != null ? _a : this.traceId;
    this.spanId = (_b = spanContext.spanId) != null ? _b : this.spanId;
    this.parentSpanId = (_c = spanContext.parentSpanId) != null ? _c : this.parentSpanId;
    if ("sampled" in spanContext) {
      this.sampled = spanContext.sampled;
    }
    this.op = (_d = spanContext.op) != null ? _d : this.op;
    this.description = (_f = (_e = spanContext.description) != null ? _e : spanContext.name) != null ? _f : this.description;
    this.name = (_h = (_g = spanContext.name) != null ? _g : spanContext.description) != null ? _h : this.name;
    this.data = spanContext.data ? __spreadValues({}, spanContext.data) : this.data;
    this.tags = spanContext.tags ? __spreadValues({}, spanContext.tags) : this.tags;
    this.attributes = spanContext.attributes ? __spreadValues({}, spanContext.attributes) : this.attributes;
    this.status = (_i = spanContext.status) != null ? _i : this.status;
    this.startTimestamp = (_j = spanContext.startTimestamp) != null ? _j : this.startTimestamp;
    this.endTimestamp = (_k = spanContext.endTimestamp) != null ? _k : this.endTimestamp;
    this.instrumenter = (_l = spanContext.instrumenter) != null ? _l : this.instrumenter;
    this.origin = (_m = spanContext.origin) != null ? _m : this.origin;
  }
  /**
   * @inheritDoc
   * @deprecated
   */
  child(spanContext) {
    return this.startChild(spanContext);
  }
  /**
   * @inheritDoc
   */
  startChild(spanContext) {
    var _a;
    const childSpan = new _Span(__spreadProps(__spreadValues({}, spanContext), {
      parentSpanId: this.spanId,
      sampled: this.sampled,
      attributes: (_a = spanContext == null ? void 0 : spanContext.attributes) != null ? _a : {},
      instrumenter: this.instrumenter,
      traceId: this.traceId
    }));
    childSpan.spanRecorder = this.spanRecorder;
    if (childSpan.spanRecorder) {
      childSpan.spanRecorder.add(childSpan);
    }
    childSpan.transaction = this.transaction;
    return childSpan;
  }
  /**
   * @inheritDoc
   */
  setTag(key, value) {
    this.tags = __spreadProps(__spreadValues({}, this.tags), { [key]: value });
    return this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  setData(key, value) {
    this.data = __spreadProps(__spreadValues({}, this.data), { [key]: value });
    return this;
  }
  /**
   * @inheritDoc
   */
  setAttribute(key, value) {
    if (value === void 0) {
      delete this.attributes[key];
    } else {
      this.attributes[key] = value;
    }
    return this;
  }
  /**
   * @inheritDoc
   */
  setAttributes(attributes) {
    Object.keys(attributes).forEach((attributeKey) => this.setAttribute(attributeKey, attributes[attributeKey]));
    return this;
  }
  /**
   * @inheritDoc
   */
  setStatus(value) {
    var _a;
    this.status = typeof value === "string" ? value : (_a = value.message) != null ? _a : value.code;
    return this;
  }
  /**
   * @inheritDoc
   */
  setHttpStatus(httpStatus) {
    this.setTag("http.status_code", String(httpStatus));
    const spanStatus = spanStatusfromHttpCode(httpStatus);
    if (spanStatus !== "unknown_error") {
      this.setStatus(spanStatus);
    }
    return this;
  }
  /**
   * @inheritDoc
   */
  addEvent(_name, _attributesOrStartTime, _startTime) {
    return this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addLink(_link) {
    return this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addLinks(_links) {
    return this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  recordException(_exception) {
  }
  /**
   * @inheritDoc
   */
  isSuccess() {
    return this.status === "ok";
  }
  /**
   * @inheritDoc
   */
  setName(name) {
    this.name = name;
    this.description = name;
  }
  /**
   * @inheritDoc
   */
  updateName(name) {
    this.setName(name);
    return this;
  }
  /**
   * @inheritDoc
   */
  end(endTimestamp) {
    this.finish(spanTimeInputToSeconds2(endTimestamp));
  }
  /**
   * @inheritDoc
   */
  finish(endTimestamp) {
    this.endTimestamp = typeof endTimestamp === "number" ? endTimestamp : dateTimestampInSeconds2();
  }
  /**
   * @inheritDoc
   */
  toTraceparent() {
    let sampledString = "";
    if (this.sampled !== void 0) {
      sampledString = this.sampled ? "-1" : "-0";
    }
    return `${this.traceId}-${this.spanId}${sampledString}`;
  }
  /**
   * @inheritDoc
   */
  toContext() {
    return dropUndefinedKeys2({
      data: this.data,
      description: this.description,
      attributes: this.attributes,
      name: this.name,
      endTimestamp: this.endTimestamp,
      op: this.op,
      parentSpanId: this.parentSpanId,
      sampled: this.sampled,
      spanId: this.spanId,
      startTimestamp: this.startTimestamp,
      status: typeof this.status === "number" ? String(this.status) : this.status,
      tags: this.tags,
      traceId: this.traceId
    });
  }
  /**
   * @inheritDoc
   */
  updateWithContext(spanContext) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    this.data = (_a = spanContext.data) != null ? _a : {};
    this.description = (_b = spanContext.description) != null ? _b : spanContext.name;
    this.name = (_d = (_c = spanContext.name) != null ? _c : spanContext.description) != null ? _d : this.name;
    this.endTimestamp = spanContext.endTimestamp;
    this.op = spanContext.op;
    this.parentSpanId = spanContext.parentSpanId;
    this.sampled = spanContext.sampled;
    this.spanId = (_e = spanContext.spanId) != null ? _e : this.spanId;
    this.startTimestamp = (_f = spanContext.startTimestamp) != null ? _f : this.startTimestamp;
    this.status = spanContext.status;
    this.tags = (_g = spanContext.tags) != null ? _g : {};
    this.attributes = (_h = spanContext.attributes) != null ? _h : this.attributes;
    this.traceId = (_i = spanContext.traceId) != null ? _i : this.traceId;
    return this;
  }
  /**
   * @inheritDoc
   */
  getTraceContext() {
    return dropUndefinedKeys2({
      data: Object.keys(this.data).length > 0 ? this.data : void 0,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      status: typeof this.status === "number" ? String(this.status) : this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : void 0,
      trace_id: this.traceId
    });
  }
  /**
   * @inheritDoc
   */
  toJSON() {
    return dropUndefinedKeys2({
      data: Object.keys(this.data).length > 0 ? this.data : void 0,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      start_timestamp: this.startTimestamp,
      status: typeof this.status === "number" ? String(this.status) : this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : void 0,
      attributes: Object.keys(this.attributes).length > 0 ? this.attributes : void 0,
      timestamp: this.endTimestamp,
      trace_id: this.traceId
    });
  }
  /**
   * Return OTEL-like span context data.
   */
  spanContext() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      traceFlags: this.sampled ? 1 : 0
    };
  }
  /**
   * Whether span is recording (sampled and not finished).
   */
  isRecording() {
    return this.sampled !== false && this.endTimestamp === void 0;
  }
};
function spanTimeInputToSeconds2(input) {
  if (input === void 0) {
    return dateTimestampInSeconds2();
  }
  if (Array.isArray(input) && input.length === 2) {
    const [seconds, nanoseconds] = input;
    return seconds + nanoseconds / 1e9;
  }
  if (input instanceof Date) {
    return input.getTime() / 1e3;
  }
  if (typeof input === "number") {
    return input > 1e12 ? msToSec(input) : input;
  }
  return dateTimestampInSeconds2();
}
function spanStatusfromHttpCode(httpStatus) {
  if (httpStatus < 400 && httpStatus >= 100) {
    return "ok";
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    switch (httpStatus) {
      case 401:
        return "unauthenticated";
      case 403:
        return "permission_denied";
      case 404:
        return "not_found";
      case 409:
        return "already_exists";
      case 413:
        return "failed_precondition";
      case 429:
        return "resource_exhausted";
      default:
        return "invalid_argument";
    }
  }
  if (httpStatus >= 500 && httpStatus < 600) {
    switch (httpStatus) {
      case 501:
        return "unimplemented";
      case 503:
        return "unavailable";
      case 504:
        return "deadline_exceeded";
      default:
        return "internal_error";
    }
  }
  return "unknown_error";
}

// src/tracing/transaction.ts
var Transaction = class extends Span {
  /**
   * This constructor should never be called manually. Those instrumenting tracing should use
   * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  constructor(transactionContext) {
    super(transactionContext);
    this._measurements = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._contexts = {};
    this.name = transactionContext.name || "";
    this.metadata = __spreadValues({
      source: "custom",
      spanMetadata: {}
    }, transactionContext.metadata);
    this._trimEnd = transactionContext.trimEnd;
    this.transaction = this;
  }
  /**
   * JSDoc
   */
  setName(name) {
    this.name = name;
  }
  /**
   * Attach additional context to the transaction.
   * @deprecated Prefer attributes or scope data.
   */
  // eslint-disable-next-line @typescript-eslint/ban-types
  setContext(key, context) {
    this._contexts[key] = context;
  }
  /**
   * Record a single measurement.
   * @deprecated Prefer top-level `setMeasurement`.
   */
  setMeasurement(name, value, unit = "") {
    this._measurements[name] = { value, unit };
  }
  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
  initSpanRecorder(maxlen = 1e3) {
    if (!this.spanRecorder) {
      this.spanRecorder = new SpanRecorder(maxlen);
    }
    this.spanRecorder.add(this);
  }
  /**
   * Set observed measurements for this transaction.
   * @hidden
   */
  setMeasurements(measurements) {
    this._measurements = __spreadValues({}, measurements);
  }
  /**
   * Set metadata for this transaction.
   * @hidden
   */
  setMetadata(newMetadata) {
    this.metadata = __spreadValues(__spreadValues({}, this.metadata), newMetadata);
  }
  /**
   * Return dynamic sampling context for this transaction.
   */
  getDynamicSamplingContext() {
    var _a;
    return ((_a = this.metadata) == null ? void 0 : _a.dynamicSamplingContext) || {};
  }
  /**
   * Placeholder profile id (not used in miniapp tracing).
   */
  getProfileId() {
    return void 0;
  }
  /**
   * @inheritDoc
   */
  finish(endTimestamp) {
    if (this.endTimestamp !== void 0) {
      return void 0;
    }
    if (!this.name) {
      IS_DEBUG_BUILD && logger2.warn("Transaction has no name, falling back to `<unlabeled transaction>`.");
      this.name = "<unlabeled transaction>";
    }
    super.finish(endTimestamp);
    if (this.sampled !== true) {
      IS_DEBUG_BUILD && logger2.log("[Tracing] Discarding transaction because its trace was not chosen to be sampled.");
      return void 0;
    }
    const finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter((s) => s !== this && s.endTimestamp) : [];
    const serializedSpans = finishedSpans.map((span) => span.toJSON());
    if (this._trimEnd && finishedSpans.length > 0) {
      this.endTimestamp = finishedSpans.reduce((prev, current) => {
        if (prev.endTimestamp && current.endTimestamp) {
          return prev.endTimestamp > current.endTimestamp ? prev : current;
        }
        return prev;
      }).endTimestamp;
    }
    const transaction = {
      contexts: __spreadValues({
        trace: this.getTraceContext()
      }, this._contexts),
      spans: serializedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: "transaction",
      sdkProcessingMetadata: this.metadata
    };
    const hasMeasurements = Object.keys(this._measurements).length > 0;
    if (hasMeasurements) {
      IS_DEBUG_BUILD && logger2.log(
        "[Measurements] Adding measurements to transaction",
        JSON.stringify(this._measurements, void 0, 2)
      );
      transaction.measurements = this._measurements;
    }
    IS_DEBUG_BUILD && logger2.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`);
    return captureEvent(transaction);
  }
  /**
   * @inheritDoc
   */
  toContext() {
    const spanContext = super.toContext();
    return dropUndefinedKeys2(__spreadProps(__spreadValues({}, spanContext), {
      name: this.name,
      trimEnd: this._trimEnd
    }));
  }
  /**
   * @inheritDoc
   */
  updateWithContext(transactionContext) {
    var _a;
    super.updateWithContext(transactionContext);
    this.name = (_a = transactionContext.name) != null ? _a : "";
    this._trimEnd = transactionContext.trimEnd;
    return this;
  }
};

// src/tracing/idletransaction.ts
var DEFAULT_IDLE_TIMEOUT = 1e3;
var HEARTBEAT_INTERVAL = 5e3;
var IdleTransactionSpanRecorder = class extends SpanRecorder {
  constructor(_pushActivity, _popActivity, transactionSpanId = "", maxlen) {
    super(maxlen);
    this._pushActivity = _pushActivity;
    this._popActivity = _popActivity;
    this.transactionSpanId = transactionSpanId;
  }
  /**
   * @inheritDoc
   */
  add(span) {
    if (span.spanId !== this.transactionSpanId) {
      span.finish = (endTimestamp) => {
        span.endTimestamp = typeof endTimestamp === "number" ? endTimestamp : dateTimestampInSeconds2();
        this._popActivity(span.spanId);
      };
      if (span.endTimestamp === void 0) {
        this._pushActivity(span.spanId);
      }
    }
    super.add(span);
  }
};
var IdleTransaction = class extends Transaction {
  constructor(transactionContext, _idleTimeout = DEFAULT_IDLE_TIMEOUT, _onScope = false) {
    super(transactionContext);
    this._idleTimeout = _idleTimeout;
    this._onScope = _onScope;
    // Activities store a list of active spans
    this.activities = {};
    // Amount of times heartbeat has counted. Will cause transaction to finish after 3 beats.
    this._heartbeatCounter = 0;
    // We should not use heartbeat if we finished a transaction
    this._finished = false;
    this._beforeFinishCallbacks = [];
    if (_onScope) {
      IS_DEBUG_BUILD && logger2.log(`Setting idle transaction as active. Span ID: ${this.spanId}`);
      setActiveTransaction(this);
    }
    this._initTimeout = setTimeout(() => {
      if (!this._finished) {
        this.finish();
      }
    }, this._idleTimeout);
  }
  /** {@inheritDoc} */
  finish(endTimestamp = dateTimestampInSeconds2()) {
    this._finished = true;
    this.activities = {};
    if (this.spanRecorder) {
      IS_DEBUG_BUILD && logger2.log("[Tracing] finishing IdleTransaction", new Date(endTimestamp * 1e3).toISOString(), this.op);
      for (const callback of this._beforeFinishCallbacks) {
        callback(this, endTimestamp);
      }
      this.spanRecorder.spans = this.spanRecorder.spans.filter((span) => {
        if (span.spanId === this.spanId) {
          return true;
        }
        if (!span.endTimestamp) {
          span.endTimestamp = endTimestamp;
          span.setStatus("cancelled");
          IS_DEBUG_BUILD && logger2.log("[Tracing] cancelling span since transaction ended early", JSON.stringify(span, void 0, 2));
        }
        const keepSpan = span.startTimestamp < endTimestamp;
        if (!keepSpan) {
          IS_DEBUG_BUILD && logger2.log(
            "[Tracing] discarding Span since it happened after Transaction was finished",
            JSON.stringify(span, void 0, 2)
          );
        }
        return keepSpan;
      });
      IS_DEBUG_BUILD && logger2.log("[Tracing] flushing IdleTransaction");
    } else {
      IS_DEBUG_BUILD && logger2.log("[Tracing] No active IdleTransaction");
    }
    if (this._onScope) {
      setActiveTransaction(void 0);
    }
    return super.finish(endTimestamp);
  }
  /**
   * Register a callback function that gets excecuted before the transaction finishes.
   * Useful for cleanup or if you want to add any additional spans based on current context.
   *
   * This is exposed because users have no other way of running something before an idle transaction
   * finishes.
   */
  registerBeforeFinishCallback(callback) {
    this._beforeFinishCallbacks.push(callback);
  }
  /**
   * @inheritDoc
   */
  initSpanRecorder(maxlen) {
    if (!this.spanRecorder) {
      const pushActivity = (id) => {
        if (this._finished) {
          return;
        }
        this._pushActivity(id);
      };
      const popActivity = (id) => {
        if (this._finished) {
          return;
        }
        this._popActivity(id);
      };
      this.spanRecorder = new IdleTransactionSpanRecorder(pushActivity, popActivity, this.spanId, maxlen);
      IS_DEBUG_BUILD && logger2.log("Starting heartbeat");
      this._pingHeartbeat();
    }
    this.spanRecorder.add(this);
  }
  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
  _pushActivity(spanId) {
    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = void 0;
    }
    IS_DEBUG_BUILD && logger2.log(`[Tracing] pushActivity: ${spanId}`);
    this.activities[spanId] = true;
    IS_DEBUG_BUILD && logger2.log("[Tracing] new activities count", Object.keys(this.activities).length);
  }
  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  _popActivity(spanId) {
    if (this.activities[spanId]) {
      IS_DEBUG_BUILD && logger2.log(`[Tracing] popActivity ${spanId}`);
      delete this.activities[spanId];
      IS_DEBUG_BUILD && logger2.log("[Tracing] new activities count", Object.keys(this.activities).length);
    }
    if (Object.keys(this.activities).length === 0) {
      const timeout = this._idleTimeout;
      const end = dateTimestampInSeconds2() + timeout / 1e3;
      setTimeout(() => {
        if (!this._finished) {
          this.setTag(FINISH_REASON_TAG, IDLE_TRANSACTION_FINISH_REASONS[1]);
          this.finish(end);
        }
      }, timeout);
    }
  }
  /**
   * Checks when entries of this.activities are not changing for 3 beats.
   * If this occurs we finish the transaction.
   */
  _beat() {
    if (this._finished) {
      return;
    }
    const heartbeatString = Object.keys(this.activities).join("");
    if (heartbeatString === this._prevHeartbeatString) {
      this._heartbeatCounter += 1;
    } else {
      this._heartbeatCounter = 1;
    }
    this._prevHeartbeatString = heartbeatString;
    if (this._heartbeatCounter >= 3) {
      IS_DEBUG_BUILD && logger2.log("[Tracing] Transaction finished because of no change for 3 heart beats");
      this.setStatus("deadline_exceeded");
      this.setTag(FINISH_REASON_TAG, IDLE_TRANSACTION_FINISH_REASONS[0]);
      this.finish();
    } else {
      this._pingHeartbeat();
    }
  }
  /**
   * Pings the heartbeat
   */
  _pingHeartbeat() {
    IS_DEBUG_BUILD && logger2.log(`pinging Heartbeat -> current counter: ${this._heartbeatCounter}`);
    setTimeout(() => {
      this._beat();
    }, HEARTBEAT_INTERVAL);
  }
};

// src/tracing/hubextensions.ts
function sample(transaction, options, samplingContext) {
  if (!hasTracingEnabled2(options)) {
    transaction.sampled = false;
    return transaction;
  }
  if (transaction.sampled !== void 0) {
    return transaction;
  }
  let sampleRate;
  if (typeof options.tracesSampler === "function") {
    sampleRate = options.tracesSampler(samplingContext);
  } else if (samplingContext.parentSampled !== void 0) {
    sampleRate = samplingContext.parentSampled;
  } else {
    sampleRate = options.tracesSampleRate;
  }
  if (!isValidSampleRate(sampleRate)) {
    IS_DEBUG_BUILD && logger2.warn("[Tracing] Discarding transaction because of invalid sample rate.");
    transaction.sampled = false;
    return transaction;
  }
  if (!sampleRate) {
    IS_DEBUG_BUILD && logger2.log(
      `[Tracing] Discarding transaction because ${typeof options.tracesSampler === "function" ? "tracesSampler returned 0 or false" : "a negative sampling decision was inherited or tracesSampleRate is set to 0"}`
    );
    transaction.sampled = false;
    return transaction;
  }
  transaction.sampled = Math.random() < sampleRate;
  if (!transaction.sampled) {
    IS_DEBUG_BUILD && logger2.log(
      `[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(
        sampleRate
      )})`
    );
    return transaction;
  }
  IS_DEBUG_BUILD && logger2.log(`[Tracing] starting ${transaction.op} transaction - ${transaction.name}`);
  return transaction;
}
function isValidSampleRate(rate) {
  if (Number.isNaN(rate) || !(typeof rate === "number" || typeof rate === "boolean")) {
    IS_DEBUG_BUILD && logger2.warn(
      `[Tracing] Given sample rate is invalid. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
        rate
      )} of type ${JSON.stringify(typeof rate)}.`
    );
    return false;
  }
  if (rate < 0 || rate > 1) {
    IS_DEBUG_BUILD && logger2.warn(`[Tracing] Given sample rate is invalid. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}
function startTransaction(transactionContext, customSamplingContext) {
  const client = getClient();
  const options = client && client.getOptions && client.getOptions() || {};
  const transactionName = transactionContext.name || transactionContext.op || "unknown-transaction";
  const samplingContext = __spreadValues({
    parentSampled: transactionContext.parentSampled,
    transactionContext: __spreadProps(__spreadValues({}, transactionContext), { name: transactionName }),
    name: transactionName
  }, customSamplingContext);
  let transaction = new Transaction(__spreadProps(__spreadValues({}, transactionContext), { name: transactionName }));
  transaction = sample(transaction, options, samplingContext);
  if (transaction.sampled) {
    const maxSpans = options._experiments && options._experiments.maxSpans;
    transaction.initSpanRecorder(maxSpans);
    setActiveTransaction(transaction);
  }
  return transaction;
}
function startIdleTransaction(transactionContext, idleTimeout, onScope, customSamplingContext) {
  const client = getClient();
  const options = client && client.getOptions && client.getOptions() || {};
  const transactionName = transactionContext.name || transactionContext.op || "unknown-transaction";
  const samplingContext = __spreadValues({
    parentSampled: transactionContext.parentSampled,
    transactionContext: __spreadProps(__spreadValues({}, transactionContext), { name: transactionName }),
    name: transactionName
  }, customSamplingContext);
  let transaction = new IdleTransaction(__spreadProps(__spreadValues({}, transactionContext), { name: transactionName }), idleTimeout, onScope);
  transaction = sample(transaction, options, samplingContext);
  if (transaction.sampled) {
    const maxSpans = options._experiments && options._experiments.maxSpans;
    transaction.initSpanRecorder(maxSpans);
    setActiveTransaction(transaction);
  }
  return transaction;
}

// src/version.ts
var SDK_NAME = "sentry.javascript.miniapp";
var SDK_VERSION2 = "0.12.1";

// src/tracekit.ts
var UNKNOWN_FUNCTION2 = "?";
var chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|address|native|eval|webpack|<anonymous>|[-a-z]+:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
var gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i;
var winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
var geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
var chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/;
var miniapp = /^\s*at (.*?) ?\((\S*):(\d+):(\d+)\)/i;
function computeStackTrace(ex) {
  let stack = null;
  const popSize = ex && ex.framesToPop;
  try {
    stack = computeStackTraceFromStacktraceProp(ex);
    if (stack) {
      return popFrames(stack, popSize);
    }
  } catch (e) {
  }
  try {
    stack = computeStackTraceFromStackProp(ex);
    if (stack) {
      return popFrames(stack, popSize);
    }
  } catch (e) {
  }
  return {
    message: extractMessage(ex),
    name: ex && ex.name,
    stack: [],
    failed: true
  };
}
function computeStackTraceFromStackProp(ex) {
  if (!ex || !ex.stack) {
    return null;
  }
  const stack = [];
  const lines = ex.stack.split("\n");
  let isEval;
  let submatch;
  let parts;
  let element;
  for (let i = 0; i < lines.length; ++i) {
    if (parts = chrome.exec(lines[i])) {
      const isNative = parts[2] && parts[2].indexOf("native") === 0;
      isEval = parts[2] && parts[2].indexOf("eval") === 0;
      if (isEval && (submatch = chromeEval.exec(parts[2]))) {
        parts[2] = submatch[1];
        parts[3] = submatch[2];
        parts[4] = submatch[3];
      }
      element = {
        url: parts[2],
        func: parts[1] || UNKNOWN_FUNCTION2,
        args: isNative ? [parts[2]] : [],
        line: parts[3] ? +parts[3] : null,
        column: parts[4] ? +parts[4] : null
      };
    } else if (parts = winjs.exec(lines[i])) {
      element = {
        url: parts[2],
        func: parts[1] || UNKNOWN_FUNCTION2,
        args: [],
        line: +parts[3],
        column: parts[4] ? +parts[4] : null
      };
    } else if (parts = gecko.exec(lines[i])) {
      isEval = parts[3] && parts[3].indexOf(" > eval") > -1;
      if (isEval && (submatch = geckoEval.exec(parts[3]))) {
        parts[1] = parts[1] || `eval`;
        parts[3] = submatch[1];
        parts[4] = submatch[2];
        parts[5] = "";
      } else if (i === 0 && !parts[5] && ex.columnNumber !== void 0) {
        stack[0].column = ex.columnNumber + 1;
      }
      element = {
        url: parts[3],
        func: parts[1] || UNKNOWN_FUNCTION2,
        args: parts[2] ? parts[2].split(",") : [],
        line: parts[4] ? +parts[4] : null,
        column: parts[5] ? +parts[5] : null
      };
    } else if (parts = miniapp.exec(lines[i])) {
      element = {
        url: parts[2],
        func: parts[1] || UNKNOWN_FUNCTION2,
        args: [],
        line: parts[3] ? +parts[3] : null,
        column: parts[4] ? +parts[4] : null
      };
    } else {
      continue;
    }
    if (!element.func && element.line) {
      element.func = UNKNOWN_FUNCTION2;
    }
    stack.push(element);
  }
  if (!stack.length) {
    return null;
  }
  return {
    message: extractMessage(ex),
    name: ex.name,
    stack
  };
}
function computeStackTraceFromStacktraceProp(ex) {
  if (!ex || !ex.stacktrace) {
    return null;
  }
  const stacktrace = ex.stacktrace;
  const opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i;
  const opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i;
  const lines = stacktrace.split("\n");
  const stack = [];
  let parts;
  for (let line = 0; line < lines.length; line += 2) {
    let element = null;
    if (parts = opera10Regex.exec(lines[line])) {
      element = {
        url: parts[2],
        func: parts[3],
        args: [],
        line: +parts[1],
        column: null
      };
    } else if (parts = opera11Regex.exec(lines[line])) {
      element = {
        url: parts[6],
        func: parts[3] || parts[4],
        args: parts[5] ? parts[5].split(",") : [],
        line: +parts[1],
        column: +parts[2]
      };
    }
    if (element) {
      if (!element.func && element.line) {
        element.func = UNKNOWN_FUNCTION2;
      }
      stack.push(element);
    }
  }
  if (!stack.length) {
    return null;
  }
  return {
    message: extractMessage(ex),
    name: ex.name,
    stack
  };
}
function popFrames(stacktrace, popSize) {
  try {
    return __spreadProps(__spreadValues({}, stacktrace), {
      stack: stacktrace.stack.slice(popSize)
    });
  } catch (e) {
    return stacktrace;
  }
}
function extractMessage(ex) {
  const message = ex && ex.message;
  if (!message) {
    return "No error message";
  }
  if (message.error && typeof message.error.message === "string") {
    return message.error.message;
  }
  return message;
}

// src/parsers.ts
var STACKTRACE_LIMIT = 100;
function exceptionFromStacktrace(stacktrace) {
  const frames = prepareFramesForEvent(stacktrace.stack);
  const exception = {
    type: stacktrace.name,
    value: stacktrace.message
  };
  if (frames && frames.length) {
    exception.stacktrace = { frames };
  }
  if (exception.type === void 0 && exception.value === "") {
    exception.value = "Unrecoverable error caught";
  }
  return exception;
}
function eventFromPlainObject(exception, syntheticException, rejection) {
  const event = {
    exception: {
      values: [
        {
          type: isEvent2(exception) ? exception.constructor.name : rejection ? "UnhandledRejection" : "Error",
          value: `Non-Error ${rejection ? "promise rejection" : "exception"} captured with keys: ${extractExceptionKeysForMessage2(exception)}`
        }
      ]
    },
    extra: {
      __serialized__: normalizeToSize2(exception)
    }
  };
  if (syntheticException) {
    const stacktrace = computeStackTrace(syntheticException);
    const frames = prepareFramesForEvent(stacktrace.stack);
    event.stacktrace = {
      frames
    };
  }
  return event;
}
function eventFromStacktrace(stacktrace) {
  const exception = exceptionFromStacktrace(stacktrace);
  return {
    exception: {
      values: [exception]
    }
  };
}
function prepareFramesForEvent(stack) {
  if (!stack || !stack.length) {
    return [];
  }
  let localStack = stack;
  const firstFrameFunction = localStack[0].func || "";
  const lastFrameFunction = localStack[localStack.length - 1].func || "";
  if (firstFrameFunction.indexOf("captureMessage") !== -1 || firstFrameFunction.indexOf("captureException") !== -1) {
    localStack = localStack.slice(1);
  }
  if (lastFrameFunction.indexOf("sentryWrapped") !== -1) {
    localStack = localStack.slice(0, -1);
  }
  return localStack.map(
    (frame) => ({
      colno: frame.column === null ? void 0 : frame.column,
      filename: frame.url || localStack[0].url,
      function: frame.func || "?",
      in_app: true,
      lineno: frame.line === null ? void 0 : frame.line
    })
  ).slice(0, STACKTRACE_LIMIT).reverse();
}

// src/eventbuilder.ts
function eventFromUnknownInput2(exception, syntheticException, options = {}) {
  let event;
  if (isErrorEvent3(exception) && exception.error) {
    const errorEvent = exception;
    exception = errorEvent.error;
    event = eventFromStacktrace(computeStackTrace(exception));
    return event;
  }
  if (isDOMError2(exception) || isDOMException2(exception)) {
    const domException = exception;
    const name = domException.name || (isDOMError2(domException) ? "DOMError" : "DOMException");
    const message = domException.message ? `${name}: ${domException.message}` : name;
    event = eventFromString(message, syntheticException, options);
    addExceptionTypeValue2(event, message);
    return event;
  }
  if (isError2(exception)) {
    event = eventFromStacktrace(computeStackTrace(exception));
    return event;
  }
  if (isPlainObject2(exception) || isEvent2(exception)) {
    const objectException = exception;
    event = eventFromPlainObject(objectException, syntheticException, options.rejection);
    addExceptionMechanism2(event, {
      synthetic: true
    });
    return event;
  }
  event = eventFromString(exception, syntheticException, options);
  addExceptionTypeValue2(event, `${exception}`, void 0);
  addExceptionMechanism2(event, {
    synthetic: true
  });
  return event;
}
function eventFromString(input, syntheticException, options = {}) {
  const event = {
    message: input
  };
  if (options.attachStacktrace && syntheticException) {
    const stacktrace = computeStackTrace(syntheticException);
    const frames = prepareFramesForEvent(stacktrace.stack);
    event.stacktrace = {
      frames
    };
  }
  return event;
}

// src/transports/index.ts
var transports_exports = {};
__export(transports_exports, {
  makeMiniappTransport: () => makeMiniappTransport
});

// src/crossPlatform.ts
var getSDK = () => {
  let currentSdk = {
    // tslint:disable-next-line: no-empty
    request: () => {
    },
    // tslint:disable-next-line: no-empty
    httpRequest: () => {
    },
    // tslint:disable-next-line: no-empty
    getSystemInfoSync: () => {
    },
    getPerformance: () => {
      return {};
    },
    onAppHide: function(_cb) {
    },
    canIUse: function(_feature) {
      return false;
    }
  };
  if (typeof wx === "object") {
    currentSdk = wx;
  } else if (typeof my === "object") {
    currentSdk = my;
  } else if (typeof tt === "object") {
    currentSdk = tt;
  } else if (typeof dd === "object") {
    currentSdk = dd;
  } else if (typeof qq === "object") {
    currentSdk = qq;
  } else if (typeof swan === "object") {
    currentSdk = swan;
  } else {
    throw new Error("sentry-miniapp \u6682\u4E0D\u652F\u6301\u6B64\u5E73\u53F0");
  }
  return currentSdk;
};
var getAppName = () => {
  let currentAppName = "unknown";
  if (typeof wx === "object") {
    currentAppName = "wechat";
  } else if (typeof my === "object") {
    currentAppName = "alipay";
  } else if (typeof tt === "object") {
    currentAppName = "bytedance";
  } else if (typeof dd === "object") {
    currentAppName = "dingtalk";
  } else if (typeof qq === "object") {
    currentAppName = "qq";
  } else if (typeof swan === "object") {
    currentAppName = "swan";
  }
  return currentAppName;
};
var sdk = getSDK();
var appName = getAppName();

// src/transports/xhr.ts
var CONTENT_TYPE = "application/json";
function makeMiniappTransport(options) {
  function makeRequest(request) {
    return new SyncPromise2((resolve2, reject) => {
      const requestFn = sdk.request || sdk.httpRequest;
      if (typeof requestFn !== "function") {
        reject(new Error("Miniapp request function is not available"));
        return;
      }
      requestFn({
        url: options.url,
        method: "POST",
        data: request.body,
        header: { "content-type": CONTENT_TYPE },
        success(res) {
          var _a, _b, _c, _d;
          resolve2({
            statusCode: res == null ? void 0 : res.statusCode,
            headers: {
              "x-sentry-rate-limits": (_b = (_a = res == null ? void 0 : res.headers) == null ? void 0 : _a["X-Sentry-Rate-Limits"]) != null ? _b : null,
              "retry-after": (_d = (_c = res == null ? void 0 : res.headers) == null ? void 0 : _c["Retry-After"]) != null ? _d : null
            }
          });
        },
        fail(error) {
          reject(error);
        }
      });
    });
  }
  return createTransport(options, makeRequest);
}

// src/client.ts
var noopStackParser = () => [];
var MiniappClient = class extends BaseClient {
  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  constructor(options = {}) {
    const transport = options.transport || makeMiniappTransport;
    const stackParser = options.stackParser || noopStackParser;
    const integrations = options.integrations || options.defaultIntegrations || [];
    const opts = __spreadProps(__spreadValues({}, options), {
      transport,
      stackParser,
      integrations,
      dsn: options.dsn,
      // ensure defaults for required fields
      tracesSampleRate: options.tracesSampleRate
    });
    applySdkMetadata(opts, "miniapp", ["miniapp"]);
    super(opts);
  }
  /**
   * @inheritDoc
   */
  _prepareEvent(event, hint, scope, isolationScope) {
    event.platform = event.platform || "javascript";
    event.sdk = __spreadProps(__spreadValues({}, event.sdk), {
      name: SDK_NAME,
      packages: [
        ...event.sdk && event.sdk.packages || [],
        {
          name: "npm:@sentry/miniapp",
          version: SDK_VERSION2
        }
      ],
      version: SDK_VERSION2
    });
    return super._prepareEvent(event, hint, scope, isolationScope);
  }
  /**
   * Show a report dialog to the user to send feedback to a specific event.
   * 向用户显示报告对话框以将反馈发送到特定事件。---> 小程序上暂时用不到&不考虑。
   *
   * @param options Set individual options for the dialog
   */
  showReportDialog(options = {}) {
    console.log("sentry-miniapp \u6682\u672A\u5B9E\u73B0\u8BE5\u65B9\u6CD5", options);
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  eventFromException(exception, hint) {
    const syntheticException = hint && hint.syntheticException ? hint.syntheticException : void 0;
    const event = eventFromUnknownInput2(exception, syntheticException, {
      attachStacktrace: this._options.attachStacktrace
    });
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return Promise.resolve(event);
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  eventFromMessage(message, level = "info", hint) {
    const syntheticException = hint && hint.syntheticException ? hint.syntheticException : void 0;
    const event = eventFromString(String(message), syntheticException, {
      attachStacktrace: this._options.attachStacktrace
    });
    event.level = level;
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return Promise.resolve(event);
  }
};
function ignoreNextOnError() {
  setTimeout(() => {
  });
}
function wrap(fn, options = {}, before) {
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
  const sentryWrapped = function() {
    const args = Array.prototype.slice.call(arguments);
    try {
      const wrappedArguments = args.map((arg) => wrap(arg, options));
      if (fn.handleEvent) {
        return fn.handleEvent.apply(this, wrappedArguments);
      }
      return fn.apply(this, wrappedArguments);
    } catch (ex) {
      ignoreNextOnError();
      withScope2((scope) => {
        scope.addEventProcessor((event) => {
          const processedEvent = __spreadValues({}, event);
          if (options.mechanism) {
            addExceptionTypeValue2(processedEvent, void 0, void 0);
            addExceptionMechanism2(processedEvent, options.mechanism);
          }
          processedEvent.extra = __spreadProps(__spreadValues({}, processedEvent.extra), {
            arguments: normalize2(args, 3)
          });
          return processedEvent;
        });
        captureException(ex);
      });
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

// src/integrations/index.ts
var integrations_exports = {};
__export(integrations_exports, {
  GlobalHandlers: () => GlobalHandlers,
  IgnoreMpcrawlerErrors: () => IgnoreMpcrawlerErrors,
  LinkedErrors: () => LinkedErrors,
  Router: () => Router,
  System: () => System,
  TryCatch: () => TryCatch
});

// src/integrations/globalhandlers.ts
var _GlobalHandlers = class _GlobalHandlers {
  /** JSDoc */
  constructor(options) {
    /**
     * @inheritDoc
     */
    this.name = _GlobalHandlers.id;
    /** JSDoc */
    this._onErrorHandlerInstalled = false;
    /** JSDoc */
    this._onUnhandledRejectionHandlerInstalled = false;
    /** JSDoc */
    this._onPageNotFoundHandlerInstalled = false;
    /** JSDoc */
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
      logger2.log("Global Handler attached: onError");
      this._installGlobalOnErrorHandler();
    }
    if (this._options.onunhandledrejection) {
      logger2.log("Global Handler attached: onunhandledrejection");
      this._installGlobalOnUnhandledRejectionHandler();
    }
    if (this._options.onpagenotfound) {
      logger2.log("Global Handler attached: onPageNotFound");
      this._installGlobalOnPageNotFoundHandler();
    }
    if (this._options.onmemorywarning) {
      logger2.log("Global Handler attached: onMemoryWarning");
      this._installGlobalOnMemoryWarningHandler();
    }
  }
  /** JSDoc */
  _installGlobalOnErrorHandler() {
    if (this._onErrorHandlerInstalled) {
      return;
    }
    if (!!sdk.onError) {
      const currentHub = getCurrentHub();
      sdk.onError((err) => {
        const error = typeof err === "string" ? new Error(err) : err;
        currentHub.captureException(error);
      });
    }
    this._onErrorHandlerInstalled = true;
  }
  /** JSDoc */
  _installGlobalOnUnhandledRejectionHandler() {
    if (this._onUnhandledRejectionHandlerInstalled) {
      return;
    }
    if (!!sdk.onUnhandledRejection) {
      const currentHub = getCurrentHub();
      sdk.onUnhandledRejection(
        ({ reason, promise }) => {
          const error = typeof reason === "string" ? new Error(reason) : reason;
          currentHub.captureException(error, {
            data: promise
          });
        }
      );
    }
    this._onUnhandledRejectionHandlerInstalled = true;
  }
  /** JSDoc */
  _installGlobalOnPageNotFoundHandler() {
    if (this._onPageNotFoundHandlerInstalled) {
      return;
    }
    if (!!sdk.onPageNotFound) {
      const currentHub = getCurrentHub();
      sdk.onPageNotFound((res) => {
        const url = res.path.split("?")[0];
        currentHub.setTag("pagenotfound", url);
        currentHub.setExtra("message", JSON.stringify(res));
        currentHub.captureMessage(`\u9875\u9762\u65E0\u6CD5\u627E\u5230: ${url}`);
      });
    }
    this._onPageNotFoundHandlerInstalled = true;
  }
  /** JSDoc */
  _installGlobalOnMemoryWarningHandler() {
    if (this._onMemoryWarningHandlerInstalled) {
      return;
    }
    if (!!sdk.onMemoryWarning) {
      const currentHub = getCurrentHub();
      sdk.onMemoryWarning(({ level = -1 }) => {
        let levelMessage = "\u6CA1\u6709\u83B7\u53D6\u5230\u544A\u8B66\u7EA7\u522B\u4FE1\u606F";
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
        currentHub.setTag("memory-warning", String(level));
        currentHub.setExtra("message", levelMessage);
        currentHub.captureMessage(`\u5185\u5B58\u4E0D\u8DB3\u544A\u8B66`);
      });
    }
    this._onMemoryWarningHandlerInstalled = true;
  }
};
/**
 * @inheritDoc
 */
_GlobalHandlers.id = "GlobalHandlers";
var GlobalHandlers = _GlobalHandlers;

// src/integrations/trycatch.ts
var _TryCatch = class _TryCatch {
  constructor() {
    /** JSDoc */
    this._ignoreOnError = 0;
    /**
     * @inheritDoc
     */
    this.name = _TryCatch.id;
  }
  /** JSDoc */
  _wrapTimeFunction(original) {
    return function(...args) {
      const originalCallback = args[0];
      args[0] = wrap(originalCallback, {
        mechanism: {
          data: { function: getFunctionName2(original) },
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
        wrap(callback, {
          mechanism: {
            data: {
              function: "requestAnimationFrame",
              handler: getFunctionName2(original)
            },
            handled: true,
            type: "instrument"
          }
        })
      );
    };
  }
  /** JSDoc */
  _wrapEventTarget(target) {
    const global2 = GLOBAL_OBJ3;
    const proto = global2[target] && global2[target].prototype;
    if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty("addEventListener")) {
      return;
    }
    fill2(proto, "addEventListener", function(original) {
      return function(eventName, fn, options) {
        try {
          if (typeof fn.handleEvent === "function") {
            fn.handleEvent = wrap(fn.handleEvent.bind(fn), {
              mechanism: {
                data: {
                  function: "handleEvent",
                  handler: getFunctionName2(fn),
                  target
                },
                handled: true,
                type: "instrument"
              }
            });
          }
        } catch (err) {
        }
        return original.call(
          this,
          eventName,
          wrap(fn, {
            mechanism: {
              data: {
                function: "addEventListener",
                handler: getFunctionName2(fn),
                target
              },
              handled: true,
              type: "instrument"
            }
          }),
          options
        );
      };
    });
    fill2(proto, "removeEventListener", function(original) {
      return function(eventName, fn, options) {
        let callback = fn;
        try {
          callback = callback && (callback.__sentry_wrapped__ || callback);
        } catch (e) {
        }
        return original.call(this, eventName, callback, options);
      };
    });
  }
  /**
   * Wrap timer functions and event targets to catch errors
   * and provide better metadata.
   */
  setupOnce() {
    this._ignoreOnError = this._ignoreOnError;
    const global2 = GLOBAL_OBJ3;
    fill2(global2, "setTimeout", this._wrapTimeFunction.bind(this));
    fill2(global2, "setInterval", this._wrapTimeFunction.bind(this));
    fill2(global2, "requestAnimationFrame", this._wrapRAF.bind(this));
    [
      "EventTarget",
      "Window",
      "Node",
      "ApplicationCache",
      "AudioTrackList",
      "ChannelMergerNode",
      "CryptoOperation",
      "EventSource",
      "FileReader",
      "HTMLUnknownElement",
      "IDBDatabase",
      "IDBRequest",
      "IDBTransaction",
      "KeyOperation",
      "MediaController",
      "MessagePort",
      "ModalWindow",
      "Notification",
      "SVGElementInstance",
      "Screen",
      "TextTrack",
      "TextTrackCue",
      "TextTrackList",
      "WebSocket",
      "WebSocketWorker",
      "Worker",
      "XMLHttpRequest",
      "XMLHttpRequestEventTarget",
      "XMLHttpRequestUpload"
    ].forEach(this._wrapEventTarget.bind(this));
  }
};
/**
* @inheritDoc
*/
_TryCatch.id = "TryCatch";
var TryCatch = _TryCatch;
function getFunctionName2(fn) {
  try {
    return fn && fn.name || "<anonymous>";
  } catch (e) {
    return "<anonymous>";
  }
}

// src/integrations/linkederrors.ts
var DEFAULT_KEY = "cause";
var DEFAULT_LIMIT = 5;
var _LinkedErrors = class _LinkedErrors {
  /**
   * @inheritDoc
   */
  constructor(options = {}) {
    /**
     * @inheritDoc
     */
    this.name = _LinkedErrors.id;
    this._key = options.key || DEFAULT_KEY;
    this._limit = options.limit || DEFAULT_LIMIT;
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    addEventProcessor((event, hint) => {
      const self2 = getCurrentHub().getIntegration(_LinkedErrors);
      if (self2) {
        return self2._handler(event, hint);
      }
      return event;
    });
  }
  /**
   * @inheritDoc
   */
  _handler(event, hint) {
    if (!event.exception || !event.exception.values || !hint || !(hint.originalException instanceof Error)) {
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
    if (!(error[key] instanceof Error) || stack.length + 1 >= this._limit) {
      return stack;
    }
    const stacktrace = computeStackTrace(error[key]);
    const exception = exceptionFromStacktrace(stacktrace);
    return this._walkErrorTree(error[key], key, [exception, ...stack]);
  }
};
/**
 * @inheritDoc
 */
_LinkedErrors.id = "LinkedErrors";
var LinkedErrors = _LinkedErrors;

// src/integrations/system.ts
var _System = class _System {
  constructor() {
    /**
     * @inheritDoc
     */
    this.name = _System.id;
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    addEventProcessor((event) => {
      const currentHub = getCurrentHub();
      if (currentHub.getIntegration(_System)) {
        try {
          const systemInfo = sdk.getSystemInfoSync();
          const {
            SDKVersion = "0.0.0",
            batteryLevel,
            // 微信小程序
            currentBattery,
            // 支付宝小程序、 钉钉小程序
            battery,
            // 字节跳动小程序
            brand,
            language,
            model,
            pixelRatio,
            platform,
            screenHeight,
            screenWidth,
            // statusBarHeight,
            system,
            version,
            // windowHeight,
            // windowWidth,
            app,
            // 支付宝小程序
            appName: appName2
            // 字节跳动小程序
            // fontSizeSetting, // 支付宝小程序、 钉钉小程序、微信小程序
          } = systemInfo;
          const [systemName, systemVersion] = system.split(" ");
          currentHub.setTag("SDKVersion", SDKVersion);
          const appDisplay = app || appName2 || appName || "app";
          return __spreadProps(__spreadValues({}, event), {
            contexts: __spreadProps(__spreadValues({}, event.contexts), {
              device: {
                brand,
                battery_level: batteryLevel || currentBattery || battery,
                model,
                language,
                platform,
                screen_dpi: pixelRatio,
                screen_height: screenHeight,
                screen_width: screenWidth
              },
              os: {
                name: systemName || system,
                version: systemVersion || system
              },
              browser: {
                name: appDisplay,
                version
              }
            })
          });
        } catch (e) {
          console.warn(`sentry-miniapp get system info fail: ${e}`);
        }
      }
      return event;
    });
  }
};
/**
 * @inheritDoc
 */
_System.id = "System";
var System = _System;

// src/integrations/router.ts
var _Router = class _Router {
  /**
   * @inheritDoc
   */
  constructor(options) {
    /**
     * @inheritDoc
     */
    this.name = _Router.id;
    this._options = __spreadValues({
      enable: true
    }, options);
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    addEventProcessor((event) => {
      if (getCurrentHub().getIntegration(_Router)) {
        if (this._options.enable) {
          try {
            const routers = getCurrentPages().map(
              (route) => ({
                route: route.route,
                options: route.options
              })
            );
            return __spreadProps(__spreadValues({}, event), {
              extra: __spreadProps(__spreadValues({}, event.extra), {
                routers
              })
            });
          } catch (e) {
            console.warn(`sentry-miniapp get router info fail: ${e}`);
          }
        }
      }
      return event;
    });
  }
};
/**
 * @inheritDoc
 */
_Router.id = "Router";
var Router = _Router;

// src/integrations/ignoreMpcrawlerErrors.ts
var _IgnoreMpcrawlerErrors = class _IgnoreMpcrawlerErrors {
  constructor() {
    /**
     * @inheritDoc
     */
    this.name = _IgnoreMpcrawlerErrors.id;
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    addEventProcessor((event) => {
      if (getCurrentHub().getIntegration(_IgnoreMpcrawlerErrors) && appName === "wechat" && sdk.getLaunchOptionsSync) {
        const options = sdk.getLaunchOptionsSync();
        if (options.scene === 1129) {
          return null;
        }
      }
      return event;
    });
  }
};
/**
 * @inheritDoc
 */
_IgnoreMpcrawlerErrors.id = "IgnoreMpcrawlerErrors";
var IgnoreMpcrawlerErrors = _IgnoreMpcrawlerErrors;

// src/tracing/miniapp/metrics.ts
var EPOCH_TIME_THRESHOLD = 1e12;
var MetricsInstrumentation = class {
  constructor(_reportAllChanges = false) {
    this._reportAllChanges = _reportAllChanges;
    this._measurements = {};
  }
  addPerformanceEntries(transaction) {
    var _a;
    const performance = this._getPerformance();
    if (!performance) {
      return;
    }
    this._timeOrigin = this._getTimeOrigin(performance, transaction);
    this._observer = (_a = performance.createObserver) == null ? void 0 : _a.call(performance, (entryList) => {
      var _a2;
      const list = ((_a2 = entryList == null ? void 0 : entryList.getEntries) == null ? void 0 : _a2.call(entryList)) || [];
      list.forEach((entry) => this._handleEntry(transaction, entry));
    });
    if (!this._observer) {
      return;
    }
    this._observer.observe({
      entryTypes: ["navigation", "render", "script", "loadPackage", "resource"]
    });
  }
  _getPerformance() {
    if (!sdk.getPerformance) {
      return void 0;
    }
    const performance = sdk.getPerformance();
    if (!performance || typeof performance.createObserver !== "function") {
      return void 0;
    }
    return performance;
  }
  _getTimeOrigin(performance, transaction) {
    if (typeof performance.timeOrigin === "number") {
      return msToSec(performance.timeOrigin);
    }
    const perfNow = typeof performance.now === "function" ? performance.now() : void 0;
    if (typeof perfNow === "number") {
      return msToSec(Date.now() - perfNow);
    }
    return transaction.startTimestamp;
  }
  _handleEntry(transaction, entry) {
    if (transaction.endTimestamp !== void 0) {
      this._stopObserver();
      return;
    }
    const startTimestamp = this._toTimestamp(entry.startTime, transaction.startTimestamp);
    const endTimestamp = this._toTimestamp(entry.startTime + entry.duration, transaction.startTimestamp);
    _startChild(transaction, {
      op: this._mapOp(entry),
      description: this._getDescription(entry),
      startTimestamp,
      endTimestamp,
      data: this._buildSpanData(entry)
    });
    this._recordMeasurements(entry, transaction, startTimestamp);
    transaction.setTag("sentry_reportAllChanges", this._reportAllChanges);
    if (Object.keys(this._measurements).length > 0) {
      transaction.setMeasurements(this._measurements);
    }
  }
  _mapOp(entry) {
    switch (entry.entryType) {
      case "navigation":
        return "navigation";
      case "render":
        return "ui.render";
      case "script":
        return "script";
      case "loadPackage":
        return "resource.package";
      case "resource":
        return "resource";
      default:
        return entry.entryType || "custom";
    }
  }
  _getDescription(entry) {
    return entry.path || entry.moduleName || entry.name;
  }
  _buildSpanData(entry) {
    const data = { entryType: entry.entryType };
    if (entry.moduleName) {
      data.moduleName = entry.moduleName;
    }
    if (entry.path) {
      data.path = entry.path;
    }
    if (typeof entry.duration === "number") {
      data.duration = entry.duration;
    }
    return data;
  }
  _recordMeasurements(entry, transaction, startTimestamp) {
    const normalizedName = (entry.name || "").toLowerCase();
    const durationMs = entry.duration;
    const relativeStartMs = Math.max((startTimestamp - transaction.startTimestamp) * 1e3, 0);
    if (normalizedName === "first-paint" || normalizedName === "firstpaint") {
      this._measurements["fp"] = { value: relativeStartMs, unit: "millisecond" };
    } else if (normalizedName === "first-contentful-paint" || normalizedName === "firstcontentfulpaint") {
      this._measurements["fcp"] = { value: relativeStartMs, unit: "millisecond" };
    } else if (normalizedName === "largest-contentful-paint" || normalizedName === "largestcontentfulpaint" || normalizedName === "lcp") {
      this._measurements["lcp"] = { value: relativeStartMs, unit: "millisecond" };
    } else if ((normalizedName === "first-input-delay" || normalizedName === "firstinputdelay" || normalizedName === "fid") && typeof durationMs === "number") {
      this._measurements["fid"] = { value: durationMs, unit: "millisecond" };
    } else if (entry.entryType === "navigation" && typeof durationMs === "number" && !this._measurements["navigation"]) {
      this._measurements["navigation"] = { value: durationMs, unit: "millisecond" };
    }
    if (this._reportAllChanges && typeof durationMs === "number") {
      const key = this._measurementKey(entry);
      if (key && !this._measurements[key]) {
        this._measurements[key] = { value: durationMs, unit: "millisecond" };
      }
    }
  }
  _measurementKey(entry) {
    const base = entry.name || entry.entryType;
    if (!base) {
      return void 0;
    }
    return base.replace(/\s+/g, "_").toLowerCase();
  }
  _toTimestamp(startTimeMs, transactionStart) {
    var _a;
    if (startTimeMs > EPOCH_TIME_THRESHOLD) {
      return msToSec(startTimeMs);
    }
    const origin = (_a = this._timeOrigin) != null ? _a : transactionStart;
    return origin + msToSec(startTimeMs);
  }
  _stopObserver(transaction) {
    var _a;
    (_a = this._observer) == null ? void 0 : _a.disconnect();
    this._observer = void 0;
    if (transaction && !transaction.endTimestamp) {
      transaction.finish();
    }
  }
};
function _startChild(transaction, _a) {
  var _b = _a, { startTimestamp } = _b, ctx = __objRest(_b, ["startTimestamp"]);
  if (startTimestamp && transaction.startTimestamp > startTimestamp) {
    transaction.startTimestamp = startTimestamp;
  }
  return transaction.startChild(__spreadValues({
    startTimestamp
  }, ctx));
}

// src/tracing/miniapp/router.ts
function instrumentRoutingWithDefaults(startTransaction2, startTransactionOnPageLoad = true, startTransactionOnLocationChange = true) {
  const globalObj = GLOBAL_OBJ3;
  const onAppRoute = sdk.onAppRoute || globalObj.wx && globalObj.wx.onAppRoute;
  if (typeof onAppRoute !== "function") {
    return;
  }
  let hasStartedFirstRoute = false;
  let activeRouteTransaction;
  const startRouteTransaction = (context, isFirstRoute) => {
    const shouldStart = isFirstRoute && startTransactionOnPageLoad || !isFirstRoute && startTransactionOnLocationChange;
    if (!shouldStart) {
      return;
    }
    if (activeRouteTransaction && typeof activeRouteTransaction.finish === "function") {
      activeRouteTransaction.finish();
    }
    activeRouteTransaction = startTransaction2(context);
  };
  const handleRoute = (routeOptions, isFirstRoute = false) => {
    const path = (routeOptions == null ? void 0 : routeOptions.path) || (routeOptions == null ? void 0 : routeOptions.route) || (routeOptions == null ? void 0 : routeOptions.url) || "";
    const name = typeof path === "string" && path.length > 0 ? path : "unknown-route";
    startRouteTransaction(
      {
        name,
        op: "navigation",
        description: (routeOptions == null ? void 0 : routeOptions.openType) || (routeOptions == null ? void 0 : routeOptions.event) || void 0,
        metadata: { requestPath: name }
      },
      isFirstRoute
    );
  };
  if (startTransactionOnPageLoad && typeof globalObj.getCurrentPages === "function") {
    const pages = globalObj.getCurrentPages() || [];
    const current = pages[pages.length - 1];
    if (current && current.route) {
      hasStartedFirstRoute = true;
      handleRoute({ path: current.route }, true);
    }
  }
  onAppRoute((options) => {
    const isFirstRoute = !hasStartedFirstRoute;
    hasStartedFirstRoute = true;
    handleRoute(options, isFirstRoute);
  });
}

// src/tracing/miniapp/request.ts
var defaultRequestInstrumentationOptions = {
  traceRequest: true
};

// src/tracing/miniapp/miniapptracing.ts
var DEFAULT_MAX_TRANSACTION_DURATION_SECONDS = 600;
var DEFAULT_MINIAPP_TRACING_OPTIONS = __spreadValues({
  idleTimeout: 5e3,
  startTransactionOnLocationChange: true,
  startTransactionOnPageLoad: true,
  maxTransactionDuration: DEFAULT_MAX_TRANSACTION_DURATION_SECONDS,
  routingInstrumentation: instrumentRoutingWithDefaults
}, defaultRequestInstrumentationOptions);
var _MiniAppTracing = class _MiniAppTracing {
  constructor(_options) {
    /**
     * @inheritDoc
     */
    this.name = _MiniAppTracing.id;
    this._configuredIdleTimeout = _options == null ? void 0 : _options.idleTimeout;
    this.options = __spreadValues(__spreadValues({}, DEFAULT_MINIAPP_TRACING_OPTIONS), _options);
    const { _metricOptions } = this.options;
    this._metrics = new MetricsInstrumentation(_metricOptions && _metricOptions._reportAllChanges);
  }
  setupOnce() {
    var _a, _b;
    const {
      routingInstrumentation,
      startTransactionOnLocationChange,
      startTransactionOnPageLoad
      // traceRequest,
      // shouldCreateSpanForRequest,
    } = this.options;
    routingInstrumentation(
      (context) => this._createRouteTransaction(context),
      startTransactionOnPageLoad,
      startTransactionOnLocationChange
    );
    (_b = (_a = sdk).onAppHide) == null ? void 0 : _b.call(_a, () => {
      const active = getActiveTransaction();
      active == null ? void 0 : active.finish();
    });
  }
  /** Create routing idle transaction. */
  _createRouteTransaction(context) {
    var _a;
    const { beforeNavigate, idleTimeout, maxTransactionDuration } = this.options;
    const expandedContext = __spreadProps(__spreadValues({}, context), {
      trimEnd: true
    });
    const modifiedContext = typeof beforeNavigate === "function" ? beforeNavigate(expandedContext) : expandedContext;
    if (modifiedContext === void 0) {
      return void 0;
    }
    const idleTransaction = startIdleTransaction(modifiedContext, idleTimeout, true, {});
    idleTransaction.registerBeforeFinishCallback((transaction, endTimestamp) => {
      adjustTransactionDuration(secToMs(maxTransactionDuration), transaction, endTimestamp);
    });
    idleTransaction.setTag("idleTimeout", (_a = this._configuredIdleTimeout) != null ? _a : idleTimeout);
    this._metrics.addPerformanceEntries(idleTransaction);
    return idleTransaction;
  }
};
/**
 * @inheritDoc
 */
_MiniAppTracing.id = "MiniAppTracing";
var MiniAppTracing = _MiniAppTracing;
function adjustTransactionDuration(maxDuration, transaction, endTimestamp) {
  const diff = endTimestamp - transaction.startTimestamp;
  const isOutdatedTransaction = endTimestamp && (diff > maxDuration || diff < 0);
  if (isOutdatedTransaction) {
    transaction.setStatus("deadline_exceeded");
    transaction.setTag("maxTransactionDurationExceeded", "true");
  }
}

// src/sdk.ts
var defaultIntegrations = [
  inboundFiltersIntegration(),
  functionToStringIntegration(),
  new TryCatch(),
  new GlobalHandlers(),
  new LinkedErrors(),
  new System(),
  new Router(),
  new IgnoreMpcrawlerErrors(),
  new MiniAppTracing()
];
function init(options = {}) {
  if (options.defaultIntegrations === void 0) {
    options.defaultIntegrations = defaultIntegrations;
  }
  options.normalizeDepth = options.normalizeDepth || 5;
  const normalizedOptions = __spreadValues({
    integrations: options.integrations || options.defaultIntegrations || [],
    stackParser: options.stackParser || (() => []),
    transport: options.transport || makeMiniappTransport
  }, options);
  initAndBind(MiniappClient, normalizedOptions);
}
function showReportDialog(options = {}) {
  if (!options.eventId) {
    options.eventId = lastEventId();
  }
  const client = getCurrentHub().getClient();
  if (client) {
    client.showReportDialog(options);
  }
}
function lastEventId2() {
  return lastEventId();
}
function flush2(timeout) {
  const client = getCurrentHub().getClient();
  if (client) {
    return client.flush(timeout);
  }
  return resolvedSyncPromise2(false);
}
function close2(timeout) {
  const client = getCurrentHub().getClient();
  if (client) {
    return client.close(timeout);
  }
  return resolvedSyncPromise2(false);
}
function wrap2(fn) {
  return wrap(fn)();
}

export { integrations_exports as Integrations, MiniappClient, SDK_NAME, SDK_VERSION2 as SDK_VERSION, transports_exports as Transports, addBreadcrumb, addEventProcessor, captureEvent, captureException, captureMessage, close2 as close, configureScope, defaultIntegrations, flush2 as flush, getCurrentHub, getCurrentScope, init, lastEventId2 as lastEventId, setContext, setExtra, setExtras, setTag, setTags, setUser, showReportDialog, startTransaction, withScope2 as withScope, wrap2 as wrap };
