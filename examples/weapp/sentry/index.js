// sentry-miniapp v0.12.0
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
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/.pnpm/@sentry+types@6.19.7/node_modules/@sentry/types/esm/severity.js
var Severity;
(function(Severity2) {
  Severity2["Fatal"] = "fatal";
  Severity2["Error"] = "error";
  Severity2["Warning"] = "warning";
  Severity2["Log"] = "log";
  Severity2["Info"] = "info";
  Severity2["Debug"] = "debug";
  Severity2["Critical"] = "critical";
})(Severity || (Severity = {}));

// node_modules/.pnpm/tslib@1.14.1/node_modules/tslib/tslib.es6.js
var extendStatics = function(d, b) {
  extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
    d2.__proto__ = b2;
  } || function(d2, b2) {
    for (var p in b2) if (b2.hasOwnProperty(p)) d2[p] = b2[p];
  };
  return extendStatics(d, b);
};
function __extends(d, b) {
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
var __assign = function() {
  __assign = Object.assign || function __assign2(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
    }
    return t;
  };
  return __assign.apply(this, arguments);
};
function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
}
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
    ar = ar.concat(__read(arguments[i]));
  return ar;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/env.js
function isBrowserBundle() {
  return typeof __SENTRY_BROWSER_BUNDLE__ !== "undefined" && !!__SENTRY_BROWSER_BUNDLE__;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/node.js
function isNodeEnv() {
  return !isBrowserBundle() && Object.prototype.toString.call(typeof process !== "undefined" ? process : 0) === "[object process]";
}
function dynamicRequire(mod, request) {
  return mod.require(request);
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/global.js
var fallbackGlobalObject = {};
function getGlobalObject() {
  return isNodeEnv() ? global : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : fallbackGlobalObject;
}
function getGlobalSingleton(name, creator, obj) {
  var global3 = obj || getGlobalObject();
  var __SENTRY__ = global3.__SENTRY__ = global3.__SENTRY__ || {};
  var singleton = __SENTRY__[name] || (__SENTRY__[name] = creator());
  return singleton;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/is.js
var objectToString = Object.prototype.toString;
function isError(wat) {
  switch (objectToString.call(wat)) {
    case "[object Error]":
    case "[object Exception]":
    case "[object DOMException]":
      return true;
    default:
      return isInstanceOf(wat, Error);
  }
}
function isBuiltin(wat, ty) {
  return objectToString.call(wat) === "[object " + ty + "]";
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
function isPrimitive(wat) {
  return wat === null || typeof wat !== "object" && typeof wat !== "function";
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
function isNaN2(wat) {
  return typeof wat === "number" && wat !== wat;
}
function isInstanceOf(wat, base) {
  try {
    return wat instanceof base;
  } catch (_e) {
    return false;
  }
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/browser.js
function htmlTreeAsString(elem, keyAttrs) {
  try {
    var currentElem = elem;
    var MAX_TRAVERSE_HEIGHT = 5;
    var MAX_OUTPUT_LEN = 80;
    var out = [];
    var height = 0;
    var len = 0;
    var separator = " > ";
    var sepLength = separator.length;
    var nextStr = void 0;
    while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
      nextStr = _htmlElementAsString(currentElem, keyAttrs);
      if (nextStr === "html" || height > 1 && len + out.length * sepLength + nextStr.length >= MAX_OUTPUT_LEN) {
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
  var elem = el;
  var out = [];
  var className;
  var classes;
  var key;
  var attr;
  var i;
  if (!elem || !elem.tagName) {
    return "";
  }
  out.push(elem.tagName.toLowerCase());
  {
    if (elem.id) {
      out.push("#" + elem.id);
    }
    className = elem.className;
    if (className && isString(className)) {
      classes = className.split(/\s+/);
      for (i = 0; i < classes.length; i++) {
        out.push("." + classes[i]);
      }
    }
  }
  var allowedAttrs = ["type", "name", "title", "alt"];
  for (i = 0; i < allowedAttrs.length; i++) {
    key = allowedAttrs[i];
    attr = elem.getAttribute(key);
    if (attr) {
      out.push("[" + key + '="' + attr + '"]');
    }
  }
  return out.join("");
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/polyfill.js
var setPrototypeOf = Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? setProtoOf : mixinProperties);
function setProtoOf(obj, proto) {
  obj.__proto__ = proto;
  return obj;
}
function mixinProperties(obj, proto) {
  for (var prop in proto) {
    if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
      obj[prop] = proto[prop];
    }
  }
  return obj;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/error.js
var SentryError = (
  /** @class */
  function(_super) {
    __extends(SentryError2, _super);
    function SentryError2(message) {
      var _newTarget = this.constructor;
      var _this = _super.call(this, message) || this;
      _this.message = message;
      _this.name = _newTarget.prototype.constructor.name;
      setPrototypeOf(_this, _newTarget.prototype);
      return _this;
    }
    return SentryError2;
  }(Error)
);

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/flags.js
var IS_DEBUG_BUILD = typeof __SENTRY_DEBUG__ === "undefined" ? true : __SENTRY_DEBUG__;

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/dsn.js
var DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+))?@)([\w.-]+)(?::(\d+))?\/(.+)/;
function isValidProtocol(protocol) {
  return protocol === "http" || protocol === "https";
}
function dsnToString(dsn, withPassword) {
  if (withPassword === void 0) {
    withPassword = false;
  }
  var host = dsn.host, path = dsn.path, pass = dsn.pass, port = dsn.port, projectId = dsn.projectId, protocol = dsn.protocol, publicKey = dsn.publicKey;
  return protocol + "://" + publicKey + (withPassword && pass ? ":" + pass : "") + ("@" + host + (port ? ":" + port : "") + "/" + (path ? path + "/" : path) + projectId);
}
function dsnFromString(str) {
  var match = DSN_REGEX.exec(str);
  if (!match) {
    throw new SentryError("Invalid Sentry Dsn: " + str);
  }
  var _a = __read(match.slice(1), 6), protocol = _a[0], publicKey = _a[1], _b = _a[2], pass = _b === void 0 ? "" : _b, host = _a[3], _c = _a[4], port = _c === void 0 ? "" : _c, lastPath = _a[5];
  var path = "";
  var projectId = lastPath;
  var split = projectId.split("/");
  if (split.length > 1) {
    path = split.slice(0, -1).join("/");
    projectId = split.pop();
  }
  if (projectId) {
    var projectMatch = projectId.match(/^\d+/);
    if (projectMatch) {
      projectId = projectMatch[0];
    }
  }
  return dsnFromComponents({ host, pass, path, projectId, port, protocol, publicKey });
}
function dsnFromComponents(components) {
  if ("user" in components && !("publicKey" in components)) {
    components.publicKey = components.user;
  }
  return {
    user: components.publicKey || "",
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
  if (!IS_DEBUG_BUILD) {
    return;
  }
  var port = dsn.port, projectId = dsn.projectId, protocol = dsn.protocol;
  var requiredComponents = ["protocol", "publicKey", "host", "projectId"];
  requiredComponents.forEach(function(component) {
    if (!dsn[component]) {
      throw new SentryError("Invalid Sentry Dsn: " + component + " missing");
    }
  });
  if (!projectId.match(/^\d+$/)) {
    throw new SentryError("Invalid Sentry Dsn: Invalid projectId " + projectId);
  }
  if (!isValidProtocol(protocol)) {
    throw new SentryError("Invalid Sentry Dsn: Invalid protocol " + protocol);
  }
  if (port && isNaN(parseInt(port, 10))) {
    throw new SentryError("Invalid Sentry Dsn: Invalid port " + port);
  }
  return true;
}
function makeDsn(from) {
  var components = typeof from === "string" ? dsnFromString(from) : dsnFromComponents(from);
  validateDsn(components);
  return components;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/logger.js
var global2 = getGlobalObject();
var PREFIX = "Sentry Logger ";
var CONSOLE_LEVELS = ["debug", "info", "warn", "error", "log", "assert"];
function consoleSandbox(callback) {
  var global3 = getGlobalObject();
  if (!("console" in global3)) {
    return callback();
  }
  var originalConsole = global3.console;
  var wrappedLevels = {};
  CONSOLE_LEVELS.forEach(function(level) {
    var originalWrappedFunc = originalConsole[level] && originalConsole[level].__sentry_original__;
    if (level in global3.console && originalWrappedFunc) {
      wrappedLevels[level] = originalConsole[level];
      originalConsole[level] = originalWrappedFunc;
    }
  });
  try {
    return callback();
  } finally {
    Object.keys(wrappedLevels).forEach(function(level) {
      originalConsole[level] = wrappedLevels[level];
    });
  }
}
function makeLogger() {
  var enabled = false;
  var logger2 = {
    enable: function() {
      enabled = true;
    },
    disable: function() {
      enabled = false;
    }
  };
  if (IS_DEBUG_BUILD) {
    CONSOLE_LEVELS.forEach(function(name) {
      logger2[name] = function() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
          args[_i] = arguments[_i];
        }
        if (enabled) {
          consoleSandbox(function() {
            var _a;
            (_a = global2.console)[name].apply(_a, __spread([PREFIX + "[" + name + "]:"], args));
          });
        }
      };
    });
  } else {
    CONSOLE_LEVELS.forEach(function(name) {
      logger2[name] = function() {
        return void 0;
      };
    });
  }
  return logger2;
}
var logger;
if (IS_DEBUG_BUILD) {
  logger = getGlobalSingleton("logger", makeLogger);
} else {
  logger = makeLogger();
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/string.js
function truncate(str, max) {
  if (max === void 0) {
    max = 0;
  }
  if (typeof str !== "string" || max === 0) {
    return str;
  }
  return str.length <= max ? str : str.substr(0, max) + "...";
}
function isMatchingPattern(value, pattern) {
  if (!isString(value)) {
    return false;
  }
  if (isRegExp(pattern)) {
    return pattern.test(value);
  }
  if (typeof pattern === "string") {
    return value.indexOf(pattern) !== -1;
  }
  return false;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/object.js
function fill(source, name, replacementFactory) {
  if (!(name in source)) {
    return;
  }
  var original = source[name];
  var wrapped = replacementFactory(original);
  if (typeof wrapped === "function") {
    try {
      markFunctionWrapped(wrapped, original);
    } catch (_Oo) {
    }
  }
  source[name] = wrapped;
}
function addNonEnumerableProperty(obj, name, value) {
  Object.defineProperty(obj, name, {
    // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
    value,
    writable: true,
    configurable: true
  });
}
function markFunctionWrapped(wrapped, original) {
  var proto = original.prototype || {};
  wrapped.prototype = original.prototype = proto;
  addNonEnumerableProperty(wrapped, "__sentry_original__", original);
}
function getOriginalFunction(func) {
  return func.__sentry_original__;
}
function urlEncode(object) {
  return Object.keys(object).map(function(key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(object[key]);
  }).join("&");
}
function convertToPlainObject(value) {
  var newObj = value;
  if (isError(value)) {
    newObj = __assign({ message: value.message, name: value.name, stack: value.stack }, getOwnProperties(value));
  } else if (isEvent(value)) {
    var event_1 = value;
    newObj = __assign({ type: event_1.type, target: serializeEventTarget(event_1.target), currentTarget: serializeEventTarget(event_1.currentTarget) }, getOwnProperties(event_1));
    if (typeof CustomEvent !== "undefined" && isInstanceOf(value, CustomEvent)) {
      newObj.detail = event_1.detail;
    }
  }
  return newObj;
}
function serializeEventTarget(target) {
  try {
    return isElement(target) ? htmlTreeAsString(target) : Object.prototype.toString.call(target);
  } catch (_oO) {
    return "<unknown>";
  }
}
function getOwnProperties(obj) {
  var extractedProps = {};
  for (var property in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, property)) {
      extractedProps[property] = obj[property];
    }
  }
  return extractedProps;
}
function extractExceptionKeysForMessage(exception, maxLength) {
  if (maxLength === void 0) {
    maxLength = 40;
  }
  var keys = Object.keys(convertToPlainObject(exception));
  keys.sort();
  if (!keys.length) {
    return "[object has no keys]";
  }
  if (keys[0].length >= maxLength) {
    return truncate(keys[0], maxLength);
  }
  for (var includedKeys = keys.length; includedKeys > 0; includedKeys--) {
    var serialized = keys.slice(0, includedKeys).join(", ");
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
function dropUndefinedKeys(val) {
  var e_1, _a;
  if (isPlainObject(val)) {
    var rv = {};
    try {
      for (var _b = __values(Object.keys(val)), _c = _b.next(); !_c.done; _c = _b.next()) {
        var key = _c.value;
        if (typeof val[key] !== "undefined") {
          rv[key] = dropUndefinedKeys(val[key]);
        }
      }
    } catch (e_1_1) {
      e_1 = { error: e_1_1 };
    } finally {
      try {
        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
      } finally {
        if (e_1) throw e_1.error;
      }
    }
    return rv;
  }
  if (Array.isArray(val)) {
    return val.map(dropUndefinedKeys);
  }
  return val;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/stacktrace.js
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

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/memo.js
function memoBuilder() {
  var hasWeakSet = typeof WeakSet === "function";
  var inner = hasWeakSet ? /* @__PURE__ */ new WeakSet() : [];
  function memoize(obj) {
    if (hasWeakSet) {
      if (inner.has(obj)) {
        return true;
      }
      inner.add(obj);
      return false;
    }
    for (var i = 0; i < inner.length; i++) {
      var value = inner[i];
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
      for (var i = 0; i < inner.length; i++) {
        if (inner[i] === obj) {
          inner.splice(i, 1);
          break;
        }
      }
    }
  }
  return [memoize, unmemoize];
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/misc.js
function uuid4() {
  var global3 = getGlobalObject();
  var crypto = global3.crypto || global3.msCrypto;
  if (!(crypto === void 0) && crypto.getRandomValues) {
    var arr = new Uint16Array(8);
    crypto.getRandomValues(arr);
    arr[3] = arr[3] & 4095 | 16384;
    arr[4] = arr[4] & 16383 | 32768;
    var pad = function(num) {
      var v = num.toString(16);
      while (v.length < 4) {
        v = "0" + v;
      }
      return v;
    };
    return pad(arr[0]) + pad(arr[1]) + pad(arr[2]) + pad(arr[3]) + pad(arr[4]) + pad(arr[5]) + pad(arr[6]) + pad(arr[7]);
  }
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function getFirstException(event) {
  return event.exception && event.exception.values ? event.exception.values[0] : void 0;
}
function getEventDescription(event) {
  var message = event.message, eventId = event.event_id;
  if (message) {
    return message;
  }
  var firstException = getFirstException(event);
  if (firstException) {
    if (firstException.type && firstException.value) {
      return firstException.type + ": " + firstException.value;
    }
    return firstException.type || firstException.value || eventId || "<unknown>";
  }
  return eventId || "<unknown>";
}
function addExceptionTypeValue(event, value, type) {
  var exception = event.exception = event.exception || {};
  var values = exception.values = exception.values || [];
  var firstException = values[0] = values[0] || {};
  if (!firstException.value) {
    firstException.value = value || "";
  }
  if (!firstException.type) {
    firstException.type = "Error";
  }
}
function addExceptionMechanism(event, newMechanism) {
  var firstException = getFirstException(event);
  if (!firstException) {
    return;
  }
  var defaultMechanism = { type: "generic", handled: true };
  var currentMechanism = firstException.mechanism;
  firstException.mechanism = __assign(__assign(__assign({}, defaultMechanism), currentMechanism), newMechanism);
  if (newMechanism && "data" in newMechanism) {
    var mergedData = __assign(__assign({}, currentMechanism && currentMechanism.data), newMechanism.data);
    firstException.mechanism.data = mergedData;
  }
}
function checkOrSetAlreadyCaught(exception) {
  if (exception && exception.__sentry_captured__) {
    return true;
  }
  try {
    addNonEnumerableProperty(exception, "__sentry_captured__", true);
  } catch (err) {
  }
  return false;
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/normalize.js
function normalize(input, depth, maxProperties) {
  if (depth === void 0) {
    depth = Infinity;
  }
  if (maxProperties === void 0) {
    maxProperties = Infinity;
  }
  try {
    return visit("", input, depth, maxProperties);
  } catch (err) {
    return { ERROR: "**non-serializable** (" + err + ")" };
  }
}
function normalizeToSize(object, depth, maxSize) {
  if (depth === void 0) {
    depth = 3;
  }
  if (maxSize === void 0) {
    maxSize = 100 * 1024;
  }
  var normalized = normalize(object, depth);
  if (jsonSize(normalized) > maxSize) {
    return normalizeToSize(object, depth - 1, maxSize);
  }
  return normalized;
}
function visit(key, value, depth, maxProperties, memo) {
  if (depth === void 0) {
    depth = Infinity;
  }
  if (maxProperties === void 0) {
    maxProperties = Infinity;
  }
  if (memo === void 0) {
    memo = memoBuilder();
  }
  var _a = __read(memo, 2), memoize = _a[0], unmemoize = _a[1];
  var valueWithToJSON = value;
  if (valueWithToJSON && typeof valueWithToJSON.toJSON === "function") {
    try {
      return valueWithToJSON.toJSON();
    } catch (err) {
    }
  }
  if (value === null || ["number", "boolean", "string"].includes(typeof value) && !isNaN2(value)) {
    return value;
  }
  var stringified = stringifyValue(key, value);
  if (!stringified.startsWith("[object ")) {
    return stringified;
  }
  if (depth === 0) {
    return stringified.replace("object ", "");
  }
  if (memoize(value)) {
    return "[Circular ~]";
  }
  var normalized = Array.isArray(value) ? [] : {};
  var numAdded = 0;
  var visitable = isError(value) || isEvent(value) ? convertToPlainObject(value) : value;
  for (var visitKey in visitable) {
    if (!Object.prototype.hasOwnProperty.call(visitable, visitKey)) {
      continue;
    }
    if (numAdded >= maxProperties) {
      normalized[visitKey] = "[MaxProperties ~]";
      break;
    }
    var visitValue = visitable[visitKey];
    normalized[visitKey] = visit(visitKey, visitValue, depth - 1, maxProperties, memo);
    numAdded += 1;
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
    if (isSyntheticEvent(value)) {
      return "[SyntheticEvent]";
    }
    if (typeof value === "number" && value !== value) {
      return "[NaN]";
    }
    if (value === void 0) {
      return "[undefined]";
    }
    if (typeof value === "function") {
      return "[Function: " + getFunctionName(value) + "]";
    }
    if (typeof value === "symbol") {
      return "[" + String(value) + "]";
    }
    if (typeof value === "bigint") {
      return "[BigInt: " + String(value) + "]";
    }
    return "[object " + Object.getPrototypeOf(value).constructor.name + "]";
  } catch (err) {
    return "**non-serializable** (" + err + ")";
  }
}
function utf8Length(value) {
  return ~-encodeURI(value).split(/%..|./).length;
}
function jsonSize(value) {
  return utf8Length(JSON.stringify(value));
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/syncpromise.js
function resolvedSyncPromise(value) {
  return new SyncPromise(function(resolve) {
    resolve(value);
  });
}
function rejectedSyncPromise(reason) {
  return new SyncPromise(function(_, reject) {
    reject(reason);
  });
}
var SyncPromise = (
  /** @class */
  function() {
    function SyncPromise2(executor) {
      var _this = this;
      this._state = 0;
      this._handlers = [];
      this._resolve = function(value) {
        _this._setResult(1, value);
      };
      this._reject = function(reason) {
        _this._setResult(2, reason);
      };
      this._setResult = function(state, value) {
        if (_this._state !== 0) {
          return;
        }
        if (isThenable(value)) {
          void value.then(_this._resolve, _this._reject);
          return;
        }
        _this._state = state;
        _this._value = value;
        _this._executeHandlers();
      };
      this._executeHandlers = function() {
        if (_this._state === 0) {
          return;
        }
        var cachedHandlers = _this._handlers.slice();
        _this._handlers = [];
        cachedHandlers.forEach(function(handler) {
          if (handler[0]) {
            return;
          }
          if (_this._state === 1) {
            handler[1](_this._value);
          }
          if (_this._state === 2) {
            handler[2](_this._value);
          }
          handler[0] = true;
        });
      };
      try {
        executor(this._resolve, this._reject);
      } catch (e) {
        this._reject(e);
      }
    }
    SyncPromise2.prototype.then = function(onfulfilled, onrejected) {
      var _this = this;
      return new SyncPromise2(function(resolve, reject) {
        _this._handlers.push([
          false,
          function(result) {
            if (!onfulfilled) {
              resolve(result);
            } else {
              try {
                resolve(onfulfilled(result));
              } catch (e) {
                reject(e);
              }
            }
          },
          function(reason) {
            if (!onrejected) {
              reject(reason);
            } else {
              try {
                resolve(onrejected(reason));
              } catch (e) {
                reject(e);
              }
            }
          }
        ]);
        _this._executeHandlers();
      });
    };
    SyncPromise2.prototype.catch = function(onrejected) {
      return this.then(function(val) {
        return val;
      }, onrejected);
    };
    SyncPromise2.prototype.finally = function(onfinally) {
      var _this = this;
      return new SyncPromise2(function(resolve, reject) {
        var val;
        var isRejected;
        return _this.then(function(value) {
          isRejected = false;
          val = value;
          if (onfinally) {
            onfinally();
          }
        }, function(reason) {
          isRejected = true;
          val = reason;
          if (onfinally) {
            onfinally();
          }
        }).then(function() {
          if (isRejected) {
            reject(val);
            return;
          }
          resolve(val);
        });
      });
    };
    return SyncPromise2;
  }()
);

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/promisebuffer.js
function makePromiseBuffer(limit) {
  var buffer = [];
  function isReady() {
    return buffer.length < limit;
  }
  function remove(task) {
    return buffer.splice(buffer.indexOf(task), 1)[0];
  }
  function add(taskProducer) {
    if (!isReady()) {
      return rejectedSyncPromise(new SentryError("Not adding Promise due to buffer limit reached."));
    }
    var task = taskProducer();
    if (buffer.indexOf(task) === -1) {
      buffer.push(task);
    }
    void task.then(function() {
      return remove(task);
    }).then(null, function() {
      return remove(task).then(null, function() {
      });
    });
    return task;
  }
  function drain(timeout) {
    return new SyncPromise(function(resolve, reject) {
      var counter = buffer.length;
      if (!counter) {
        return resolve(true);
      }
      var capturedSetTimeout = setTimeout(function() {
        if (timeout && timeout > 0) {
          resolve(false);
        }
      }, timeout);
      buffer.forEach(function(item) {
        void resolvedSyncPromise(item).then(function() {
          if (!--counter) {
            clearTimeout(capturedSetTimeout);
            resolve(true);
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

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/status.js
function eventStatusFromHttpCode(code) {
  if (code >= 200 && code < 300) {
    return "success";
  }
  if (code === 429) {
    return "rate_limit";
  }
  if (code >= 400 && code < 500) {
    return "invalid";
  }
  if (code >= 500) {
    return "failed";
  }
  return "unknown";
}

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/time.js
var dateTimestampSource = {
  nowSeconds: function() {
    return Date.now() / 1e3;
  }
};
function getBrowserPerformance() {
  var performance = getGlobalObject().performance;
  if (!performance || !performance.now) {
    return void 0;
  }
  var timeOrigin = Date.now() - performance.now();
  return {
    now: function() {
      return performance.now();
    },
    timeOrigin
  };
}
function getNodePerformance() {
  try {
    var perfHooks = dynamicRequire(module, "perf_hooks");
    return perfHooks.performance;
  } catch (_) {
    return void 0;
  }
}
var platformPerformance = isNodeEnv() ? getNodePerformance() : getBrowserPerformance();
var timestampSource = platformPerformance === void 0 ? dateTimestampSource : {
  nowSeconds: function() {
    return (platformPerformance.timeOrigin + platformPerformance.now()) / 1e3;
  }
};
var dateTimestampInSeconds = dateTimestampSource.nowSeconds.bind(dateTimestampSource);
var timestampInSeconds = timestampSource.nowSeconds.bind(timestampSource);
var timestampWithMs = timestampInSeconds;
(function() {
  var performance = getGlobalObject().performance;
  if (!performance || !performance.now) {
    return void 0;
  }
  var threshold = 3600 * 1e3;
  var performanceNow = performance.now();
  var dateNow = Date.now();
  var timeOriginDelta = performance.timeOrigin ? Math.abs(performance.timeOrigin + performanceNow - dateNow) : threshold;
  var timeOriginIsReliable = timeOriginDelta < threshold;
  var navigationStart = performance.timing && performance.timing.navigationStart;
  var hasNavigationStart = typeof navigationStart === "number";
  var navigationStartDelta = hasNavigationStart ? Math.abs(navigationStart + performanceNow - dateNow) : threshold;
  var navigationStartIsReliable = navigationStartDelta < threshold;
  if (timeOriginIsReliable || navigationStartIsReliable) {
    if (timeOriginDelta <= navigationStartDelta) {
      return performance.timeOrigin;
    } else {
      return navigationStart;
    }
  }
  return dateNow;
})();

// node_modules/.pnpm/@sentry+utils@6.19.7/node_modules/@sentry/utils/esm/envelope.js
function createEnvelope(headers, items) {
  if (items === void 0) {
    items = [];
  }
  return [headers, items];
}

// node_modules/.pnpm/@sentry+hub@6.19.7/node_modules/@sentry/hub/esm/scope.js
var MAX_BREADCRUMBS = 100;
var Scope = (
  /** @class */
  function() {
    function Scope3() {
      this._notifyingListeners = false;
      this._scopeListeners = [];
      this._eventProcessors = [];
      this._breadcrumbs = [];
      this._user = {};
      this._tags = {};
      this._extra = {};
      this._contexts = {};
      this._sdkProcessingMetadata = {};
    }
    Scope3.clone = function(scope) {
      var newScope = new Scope3();
      if (scope) {
        newScope._breadcrumbs = __spread(scope._breadcrumbs);
        newScope._tags = __assign({}, scope._tags);
        newScope._extra = __assign({}, scope._extra);
        newScope._contexts = __assign({}, scope._contexts);
        newScope._user = scope._user;
        newScope._level = scope._level;
        newScope._span = scope._span;
        newScope._session = scope._session;
        newScope._transactionName = scope._transactionName;
        newScope._fingerprint = scope._fingerprint;
        newScope._eventProcessors = __spread(scope._eventProcessors);
        newScope._requestSession = scope._requestSession;
      }
      return newScope;
    };
    Scope3.prototype.addScopeListener = function(callback) {
      this._scopeListeners.push(callback);
    };
    Scope3.prototype.addEventProcessor = function(callback) {
      this._eventProcessors.push(callback);
      return this;
    };
    Scope3.prototype.setUser = function(user) {
      this._user = user || {};
      if (this._session) {
        this._session.update({ user });
      }
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.getUser = function() {
      return this._user;
    };
    Scope3.prototype.getRequestSession = function() {
      return this._requestSession;
    };
    Scope3.prototype.setRequestSession = function(requestSession) {
      this._requestSession = requestSession;
      return this;
    };
    Scope3.prototype.setTags = function(tags) {
      this._tags = __assign(__assign({}, this._tags), tags);
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setTag = function(key, value) {
      var _a;
      this._tags = __assign(__assign({}, this._tags), (_a = {}, _a[key] = value, _a));
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setExtras = function(extras) {
      this._extra = __assign(__assign({}, this._extra), extras);
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setExtra = function(key, extra) {
      var _a;
      this._extra = __assign(__assign({}, this._extra), (_a = {}, _a[key] = extra, _a));
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setFingerprint = function(fingerprint) {
      this._fingerprint = fingerprint;
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setLevel = function(level) {
      this._level = level;
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setTransactionName = function(name) {
      this._transactionName = name;
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setTransaction = function(name) {
      return this.setTransactionName(name);
    };
    Scope3.prototype.setContext = function(key, context) {
      var _a;
      if (context === null) {
        delete this._contexts[key];
      } else {
        this._contexts = __assign(__assign({}, this._contexts), (_a = {}, _a[key] = context, _a));
      }
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.setSpan = function(span) {
      this._span = span;
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.getSpan = function() {
      return this._span;
    };
    Scope3.prototype.getTransaction = function() {
      var span = this.getSpan();
      return span && span.transaction;
    };
    Scope3.prototype.setSession = function(session) {
      if (!session) {
        delete this._session;
      } else {
        this._session = session;
      }
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.getSession = function() {
      return this._session;
    };
    Scope3.prototype.update = function(captureContext) {
      if (!captureContext) {
        return this;
      }
      if (typeof captureContext === "function") {
        var updatedScope = captureContext(this);
        return updatedScope instanceof Scope3 ? updatedScope : this;
      }
      if (captureContext instanceof Scope3) {
        this._tags = __assign(__assign({}, this._tags), captureContext._tags);
        this._extra = __assign(__assign({}, this._extra), captureContext._extra);
        this._contexts = __assign(__assign({}, this._contexts), captureContext._contexts);
        if (captureContext._user && Object.keys(captureContext._user).length) {
          this._user = captureContext._user;
        }
        if (captureContext._level) {
          this._level = captureContext._level;
        }
        if (captureContext._fingerprint) {
          this._fingerprint = captureContext._fingerprint;
        }
        if (captureContext._requestSession) {
          this._requestSession = captureContext._requestSession;
        }
      } else if (isPlainObject(captureContext)) {
        captureContext = captureContext;
        this._tags = __assign(__assign({}, this._tags), captureContext.tags);
        this._extra = __assign(__assign({}, this._extra), captureContext.extra);
        this._contexts = __assign(__assign({}, this._contexts), captureContext.contexts);
        if (captureContext.user) {
          this._user = captureContext.user;
        }
        if (captureContext.level) {
          this._level = captureContext.level;
        }
        if (captureContext.fingerprint) {
          this._fingerprint = captureContext.fingerprint;
        }
        if (captureContext.requestSession) {
          this._requestSession = captureContext.requestSession;
        }
      }
      return this;
    };
    Scope3.prototype.clear = function() {
      this._breadcrumbs = [];
      this._tags = {};
      this._extra = {};
      this._user = {};
      this._contexts = {};
      this._level = void 0;
      this._transactionName = void 0;
      this._fingerprint = void 0;
      this._requestSession = void 0;
      this._span = void 0;
      this._session = void 0;
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.addBreadcrumb = function(breadcrumb, maxBreadcrumbs) {
      var maxCrumbs = typeof maxBreadcrumbs === "number" ? Math.min(maxBreadcrumbs, MAX_BREADCRUMBS) : MAX_BREADCRUMBS;
      if (maxCrumbs <= 0) {
        return this;
      }
      var mergedBreadcrumb = __assign({ timestamp: dateTimestampInSeconds() }, breadcrumb);
      this._breadcrumbs = __spread(this._breadcrumbs, [mergedBreadcrumb]).slice(-maxCrumbs);
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.clearBreadcrumbs = function() {
      this._breadcrumbs = [];
      this._notifyScopeListeners();
      return this;
    };
    Scope3.prototype.applyToEvent = function(event, hint) {
      if (this._extra && Object.keys(this._extra).length) {
        event.extra = __assign(__assign({}, this._extra), event.extra);
      }
      if (this._tags && Object.keys(this._tags).length) {
        event.tags = __assign(__assign({}, this._tags), event.tags);
      }
      if (this._user && Object.keys(this._user).length) {
        event.user = __assign(__assign({}, this._user), event.user);
      }
      if (this._contexts && Object.keys(this._contexts).length) {
        event.contexts = __assign(__assign({}, this._contexts), event.contexts);
      }
      if (this._level) {
        event.level = this._level;
      }
      if (this._transactionName) {
        event.transaction = this._transactionName;
      }
      if (this._span) {
        event.contexts = __assign({ trace: this._span.getTraceContext() }, event.contexts);
        var transactionName = this._span.transaction && this._span.transaction.name;
        if (transactionName) {
          event.tags = __assign({ transaction: transactionName }, event.tags);
        }
      }
      this._applyFingerprint(event);
      event.breadcrumbs = __spread(event.breadcrumbs || [], this._breadcrumbs);
      event.breadcrumbs = event.breadcrumbs.length > 0 ? event.breadcrumbs : void 0;
      event.sdkProcessingMetadata = this._sdkProcessingMetadata;
      return this._notifyEventProcessors(__spread(getGlobalEventProcessors(), this._eventProcessors), event, hint);
    };
    Scope3.prototype.setSDKProcessingMetadata = function(newData) {
      this._sdkProcessingMetadata = __assign(__assign({}, this._sdkProcessingMetadata), newData);
      return this;
    };
    Scope3.prototype._notifyEventProcessors = function(processors, event, hint, index) {
      var _this = this;
      if (index === void 0) {
        index = 0;
      }
      return new SyncPromise(function(resolve, reject) {
        var processor = processors[index];
        if (event === null || typeof processor !== "function") {
          resolve(event);
        } else {
          var result = processor(__assign({}, event), hint);
          if (isThenable(result)) {
            void result.then(function(final) {
              return _this._notifyEventProcessors(processors, final, hint, index + 1).then(resolve);
            }).then(null, reject);
          } else {
            void _this._notifyEventProcessors(processors, result, hint, index + 1).then(resolve).then(null, reject);
          }
        }
      });
    };
    Scope3.prototype._notifyScopeListeners = function() {
      var _this = this;
      if (!this._notifyingListeners) {
        this._notifyingListeners = true;
        this._scopeListeners.forEach(function(callback) {
          callback(_this);
        });
        this._notifyingListeners = false;
      }
    };
    Scope3.prototype._applyFingerprint = function(event) {
      event.fingerprint = event.fingerprint ? Array.isArray(event.fingerprint) ? event.fingerprint : [event.fingerprint] : [];
      if (this._fingerprint) {
        event.fingerprint = event.fingerprint.concat(this._fingerprint);
      }
      if (event.fingerprint && !event.fingerprint.length) {
        delete event.fingerprint;
      }
    };
    return Scope3;
  }()
);
function getGlobalEventProcessors() {
  return getGlobalSingleton("globalEventProcessors", function() {
    return [];
  });
}
function addGlobalEventProcessor(callback) {
  getGlobalEventProcessors().push(callback);
}

// node_modules/.pnpm/@sentry+hub@6.19.7/node_modules/@sentry/hub/esm/session.js
var Session = (
  /** @class */
  function() {
    function Session2(context) {
      this.errors = 0;
      this.sid = uuid4();
      this.duration = 0;
      this.status = "ok";
      this.init = true;
      this.ignoreDuration = false;
      var startingTime = timestampInSeconds();
      this.timestamp = startingTime;
      this.started = startingTime;
      if (context) {
        this.update(context);
      }
    }
    Session2.prototype.update = function(context) {
      if (context === void 0) {
        context = {};
      }
      if (context.user) {
        if (!this.ipAddress && context.user.ip_address) {
          this.ipAddress = context.user.ip_address;
        }
        if (!this.did && !context.did) {
          this.did = context.user.id || context.user.email || context.user.username;
        }
      }
      this.timestamp = context.timestamp || timestampInSeconds();
      if (context.ignoreDuration) {
        this.ignoreDuration = context.ignoreDuration;
      }
      if (context.sid) {
        this.sid = context.sid.length === 32 ? context.sid : uuid4();
      }
      if (context.init !== void 0) {
        this.init = context.init;
      }
      if (!this.did && context.did) {
        this.did = "" + context.did;
      }
      if (typeof context.started === "number") {
        this.started = context.started;
      }
      if (this.ignoreDuration) {
        this.duration = void 0;
      } else if (typeof context.duration === "number") {
        this.duration = context.duration;
      } else {
        var duration = this.timestamp - this.started;
        this.duration = duration >= 0 ? duration : 0;
      }
      if (context.release) {
        this.release = context.release;
      }
      if (context.environment) {
        this.environment = context.environment;
      }
      if (!this.ipAddress && context.ipAddress) {
        this.ipAddress = context.ipAddress;
      }
      if (!this.userAgent && context.userAgent) {
        this.userAgent = context.userAgent;
      }
      if (typeof context.errors === "number") {
        this.errors = context.errors;
      }
      if (context.status) {
        this.status = context.status;
      }
    };
    Session2.prototype.close = function(status) {
      if (status) {
        this.update({ status });
      } else if (this.status === "ok") {
        this.update({ status: "exited" });
      } else {
        this.update();
      }
    };
    Session2.prototype.toJSON = function() {
      return dropUndefinedKeys({
        sid: "" + this.sid,
        init: this.init,
        // Make sure that sec is converted to ms for date constructor
        started: new Date(this.started * 1e3).toISOString(),
        timestamp: new Date(this.timestamp * 1e3).toISOString(),
        status: this.status,
        errors: this.errors,
        did: typeof this.did === "number" || typeof this.did === "string" ? "" + this.did : void 0,
        duration: this.duration,
        attrs: {
          release: this.release,
          environment: this.environment,
          ip_address: this.ipAddress,
          user_agent: this.userAgent
        }
      });
    };
    return Session2;
  }()
);

// node_modules/.pnpm/@sentry+hub@6.19.7/node_modules/@sentry/hub/esm/flags.js
var IS_DEBUG_BUILD2 = typeof __SENTRY_DEBUG__ === "undefined" ? true : __SENTRY_DEBUG__;

// node_modules/.pnpm/@sentry+hub@6.19.7/node_modules/@sentry/hub/esm/hub.js
var API_VERSION = 4;
var DEFAULT_BREADCRUMBS = 100;
var Hub = (
  /** @class */
  function() {
    function Hub4(client, scope, _version) {
      if (scope === void 0) {
        scope = new Scope();
      }
      if (_version === void 0) {
        _version = API_VERSION;
      }
      this._version = _version;
      this._stack = [{}];
      this.getStackTop().scope = scope;
      if (client) {
        this.bindClient(client);
      }
    }
    Hub4.prototype.isOlderThan = function(version) {
      return this._version < version;
    };
    Hub4.prototype.bindClient = function(client) {
      var top = this.getStackTop();
      top.client = client;
      if (client && client.setupIntegrations) {
        client.setupIntegrations();
      }
    };
    Hub4.prototype.pushScope = function() {
      var scope = Scope.clone(this.getScope());
      this.getStack().push({
        client: this.getClient(),
        scope
      });
      return scope;
    };
    Hub4.prototype.popScope = function() {
      if (this.getStack().length <= 1)
        return false;
      return !!this.getStack().pop();
    };
    Hub4.prototype.withScope = function(callback) {
      var scope = this.pushScope();
      try {
        callback(scope);
      } finally {
        this.popScope();
      }
    };
    Hub4.prototype.getClient = function() {
      return this.getStackTop().client;
    };
    Hub4.prototype.getScope = function() {
      return this.getStackTop().scope;
    };
    Hub4.prototype.getStack = function() {
      return this._stack;
    };
    Hub4.prototype.getStackTop = function() {
      return this._stack[this._stack.length - 1];
    };
    Hub4.prototype.captureException = function(exception, hint) {
      var eventId = this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4();
      var finalHint = hint;
      if (!hint) {
        var syntheticException = void 0;
        try {
          throw new Error("Sentry syntheticException");
        } catch (exception2) {
          syntheticException = exception2;
        }
        finalHint = {
          originalException: exception,
          syntheticException
        };
      }
      this._invokeClient("captureException", exception, __assign(__assign({}, finalHint), { event_id: eventId }));
      return eventId;
    };
    Hub4.prototype.captureMessage = function(message, level, hint) {
      var eventId = this._lastEventId = hint && hint.event_id ? hint.event_id : uuid4();
      var finalHint = hint;
      if (!hint) {
        var syntheticException = void 0;
        try {
          throw new Error(message);
        } catch (exception) {
          syntheticException = exception;
        }
        finalHint = {
          originalException: message,
          syntheticException
        };
      }
      this._invokeClient("captureMessage", message, level, __assign(__assign({}, finalHint), { event_id: eventId }));
      return eventId;
    };
    Hub4.prototype.captureEvent = function(event, hint) {
      var eventId = hint && hint.event_id ? hint.event_id : uuid4();
      if (event.type !== "transaction") {
        this._lastEventId = eventId;
      }
      this._invokeClient("captureEvent", event, __assign(__assign({}, hint), { event_id: eventId }));
      return eventId;
    };
    Hub4.prototype.lastEventId = function() {
      return this._lastEventId;
    };
    Hub4.prototype.addBreadcrumb = function(breadcrumb, hint) {
      var _a = this.getStackTop(), scope = _a.scope, client = _a.client;
      if (!scope || !client)
        return;
      var _b = client.getOptions && client.getOptions() || {}, _c = _b.beforeBreadcrumb, beforeBreadcrumb = _c === void 0 ? null : _c, _d = _b.maxBreadcrumbs, maxBreadcrumbs = _d === void 0 ? DEFAULT_BREADCRUMBS : _d;
      if (maxBreadcrumbs <= 0)
        return;
      var timestamp = dateTimestampInSeconds();
      var mergedBreadcrumb = __assign({ timestamp }, breadcrumb);
      var finalBreadcrumb = beforeBreadcrumb ? consoleSandbox(function() {
        return beforeBreadcrumb(mergedBreadcrumb, hint);
      }) : mergedBreadcrumb;
      if (finalBreadcrumb === null)
        return;
      scope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
    };
    Hub4.prototype.setUser = function(user) {
      var scope = this.getScope();
      if (scope)
        scope.setUser(user);
    };
    Hub4.prototype.setTags = function(tags) {
      var scope = this.getScope();
      if (scope)
        scope.setTags(tags);
    };
    Hub4.prototype.setExtras = function(extras) {
      var scope = this.getScope();
      if (scope)
        scope.setExtras(extras);
    };
    Hub4.prototype.setTag = function(key, value) {
      var scope = this.getScope();
      if (scope)
        scope.setTag(key, value);
    };
    Hub4.prototype.setExtra = function(key, extra) {
      var scope = this.getScope();
      if (scope)
        scope.setExtra(key, extra);
    };
    Hub4.prototype.setContext = function(name, context) {
      var scope = this.getScope();
      if (scope)
        scope.setContext(name, context);
    };
    Hub4.prototype.configureScope = function(callback) {
      var _a = this.getStackTop(), scope = _a.scope, client = _a.client;
      if (scope && client) {
        callback(scope);
      }
    };
    Hub4.prototype.run = function(callback) {
      var oldHub = makeMain(this);
      try {
        callback(this);
      } finally {
        makeMain(oldHub);
      }
    };
    Hub4.prototype.getIntegration = function(integration) {
      var client = this.getClient();
      if (!client)
        return null;
      try {
        return client.getIntegration(integration);
      } catch (_oO) {
        IS_DEBUG_BUILD2 && logger.warn("Cannot retrieve integration " + integration.id + " from the current Hub");
        return null;
      }
    };
    Hub4.prototype.startSpan = function(context) {
      return this._callExtensionMethod("startSpan", context);
    };
    Hub4.prototype.startTransaction = function(context, customSamplingContext) {
      return this._callExtensionMethod("startTransaction", context, customSamplingContext);
    };
    Hub4.prototype.traceHeaders = function() {
      return this._callExtensionMethod("traceHeaders");
    };
    Hub4.prototype.captureSession = function(endSession) {
      if (endSession === void 0) {
        endSession = false;
      }
      if (endSession) {
        return this.endSession();
      }
      this._sendSessionUpdate();
    };
    Hub4.prototype.endSession = function() {
      var layer = this.getStackTop();
      var scope = layer && layer.scope;
      var session = scope && scope.getSession();
      if (session) {
        session.close();
      }
      this._sendSessionUpdate();
      if (scope) {
        scope.setSession();
      }
    };
    Hub4.prototype.startSession = function(context) {
      var _a = this.getStackTop(), scope = _a.scope, client = _a.client;
      var _b = client && client.getOptions() || {}, release = _b.release, environment = _b.environment;
      var global3 = getGlobalObject();
      var userAgent = (global3.navigator || {}).userAgent;
      var session = new Session(__assign(__assign(__assign({
        release,
        environment
      }, scope && { user: scope.getUser() }), userAgent && { userAgent }), context));
      if (scope) {
        var currentSession = scope.getSession && scope.getSession();
        if (currentSession && currentSession.status === "ok") {
          currentSession.update({ status: "exited" });
        }
        this.endSession();
        scope.setSession(session);
      }
      return session;
    };
    Hub4.prototype._sendSessionUpdate = function() {
      var _a = this.getStackTop(), scope = _a.scope, client = _a.client;
      if (!scope)
        return;
      var session = scope.getSession && scope.getSession();
      if (session) {
        if (client && client.captureSession) {
          client.captureSession(session);
        }
      }
    };
    Hub4.prototype._invokeClient = function(method) {
      var _a;
      var args = [];
      for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
      }
      var _b = this.getStackTop(), scope = _b.scope, client = _b.client;
      if (client && client[method]) {
        (_a = client)[method].apply(_a, __spread(args, [scope]));
      }
    };
    Hub4.prototype._callExtensionMethod = function(method) {
      var args = [];
      for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
      }
      var carrier = getMainCarrier();
      var sentry = carrier.__SENTRY__;
      if (sentry && sentry.extensions && typeof sentry.extensions[method] === "function") {
        return sentry.extensions[method].apply(this, args);
      }
      IS_DEBUG_BUILD2 && logger.warn("Extension method " + method + " couldn't be found, doing nothing.");
    };
    return Hub4;
  }()
);
function getMainCarrier() {
  var carrier = getGlobalObject();
  carrier.__SENTRY__ = carrier.__SENTRY__ || {
    extensions: {},
    hub: void 0
  };
  return carrier;
}
function makeMain(hub) {
  var registry = getMainCarrier();
  var oldHub = getHubFromCarrier(registry);
  setHubOnCarrier(registry, hub);
  return oldHub;
}
function getCurrentHub() {
  var registry = getMainCarrier();
  if (!hasHubOnCarrier(registry) || getHubFromCarrier(registry).isOlderThan(API_VERSION)) {
    setHubOnCarrier(registry, new Hub());
  }
  if (isNodeEnv()) {
    return getHubFromActiveDomain(registry);
  }
  return getHubFromCarrier(registry);
}
function getHubFromActiveDomain(registry) {
  try {
    var sentry = getMainCarrier().__SENTRY__;
    var activeDomain = sentry && sentry.extensions && sentry.extensions.domain && sentry.extensions.domain.active;
    if (!activeDomain) {
      return getHubFromCarrier(registry);
    }
    if (!hasHubOnCarrier(activeDomain) || getHubFromCarrier(activeDomain).isOlderThan(API_VERSION)) {
      var registryHubTopStack = getHubFromCarrier(registry).getStackTop();
      setHubOnCarrier(activeDomain, new Hub(registryHubTopStack.client, Scope.clone(registryHubTopStack.scope)));
    }
    return getHubFromCarrier(activeDomain);
  } catch (_Oo) {
    return getHubFromCarrier(registry);
  }
}
function hasHubOnCarrier(carrier) {
  return !!(carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub);
}
function getHubFromCarrier(carrier) {
  return getGlobalSingleton("hub", function() {
    return new Hub();
  }, carrier);
}
function setHubOnCarrier(carrier, hub) {
  if (!carrier)
    return false;
  var __SENTRY__ = carrier.__SENTRY__ = carrier.__SENTRY__ || {};
  __SENTRY__.hub = hub;
  return true;
}

// node_modules/.pnpm/@sentry+minimal@6.19.7/node_modules/@sentry/minimal/esm/index.js
function callOnHub(method) {
  var args = [];
  for (var _i = 1; _i < arguments.length; _i++) {
    args[_i - 1] = arguments[_i];
  }
  var hub = getCurrentHub();
  if (hub && hub[method]) {
    return hub[method].apply(hub, __spread(args));
  }
  throw new Error("No hub defined or " + method + " was not found on the hub, please open a bug report.");
}
function captureException(exception, captureContext) {
  var syntheticException = new Error("Sentry syntheticException");
  return callOnHub("captureException", exception, {
    captureContext,
    originalException: exception,
    syntheticException
  });
}
function captureMessage(message, captureContext) {
  var syntheticException = new Error(message);
  var level = typeof captureContext === "string" ? captureContext : void 0;
  var context = typeof captureContext !== "string" ? { captureContext } : void 0;
  return callOnHub("captureMessage", message, level, __assign({ originalException: message, syntheticException }, context));
}
function captureEvent(event) {
  return callOnHub("captureEvent", event);
}
function configureScope(callback) {
  callOnHub("configureScope", callback);
}
function addBreadcrumb(breadcrumb) {
  callOnHub("addBreadcrumb", breadcrumb);
}
function setContext(name, context) {
  callOnHub("setContext", name, context);
}
function setExtras(extras) {
  callOnHub("setExtras", extras);
}
function setTags(tags) {
  callOnHub("setTags", tags);
}
function setExtra(key, extra) {
  callOnHub("setExtra", key, extra);
}
function setTag(key, value) {
  callOnHub("setTag", key, value);
}
function setUser(user) {
  callOnHub("setUser", user);
}
function withScope(callback) {
  callOnHub("withScope", callback);
}
function startTransaction(context, customSamplingContext) {
  return callOnHub("startTransaction", __assign({}, context), customSamplingContext);
}

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/api.js
var SENTRY_API_VERSION = "7";
var API = (
  /** @class */
  function() {
    function API2(dsn, metadata, tunnel) {
      if (metadata === void 0) {
        metadata = {};
      }
      this.dsn = dsn;
      this._dsnObject = makeDsn(dsn);
      this.metadata = metadata;
      this._tunnel = tunnel;
    }
    API2.prototype.getDsn = function() {
      return this._dsnObject;
    };
    API2.prototype.forceEnvelope = function() {
      return !!this._tunnel;
    };
    API2.prototype.getBaseApiEndpoint = function() {
      return getBaseApiEndpoint(this._dsnObject);
    };
    API2.prototype.getStoreEndpoint = function() {
      return getStoreEndpoint(this._dsnObject);
    };
    API2.prototype.getStoreEndpointWithUrlEncodedAuth = function() {
      return getStoreEndpointWithUrlEncodedAuth(this._dsnObject);
    };
    API2.prototype.getEnvelopeEndpointWithUrlEncodedAuth = function() {
      return getEnvelopeEndpointWithUrlEncodedAuth(this._dsnObject, this._tunnel);
    };
    return API2;
  }()
);
function initAPIDetails(dsn, metadata, tunnel) {
  return {
    initDsn: dsn,
    metadata: metadata || {},
    dsn: makeDsn(dsn),
    tunnel
  };
}
function getBaseApiEndpoint(dsn) {
  var protocol = dsn.protocol ? dsn.protocol + ":" : "";
  var port = dsn.port ? ":" + dsn.port : "";
  return protocol + "//" + dsn.host + port + (dsn.path ? "/" + dsn.path : "") + "/api/";
}
function _getIngestEndpoint(dsn, target) {
  return "" + getBaseApiEndpoint(dsn) + dsn.projectId + "/" + target + "/";
}
function _encodedAuth(dsn) {
  return urlEncode({
    // We send only the minimum set of required information. See
    // https://github.com/getsentry/sentry-javascript/issues/2572.
    sentry_key: dsn.publicKey,
    sentry_version: SENTRY_API_VERSION
  });
}
function getStoreEndpoint(dsn) {
  return _getIngestEndpoint(dsn, "store");
}
function getStoreEndpointWithUrlEncodedAuth(dsn) {
  return getStoreEndpoint(dsn) + "?" + _encodedAuth(dsn);
}
function _getEnvelopeEndpoint(dsn) {
  return _getIngestEndpoint(dsn, "envelope");
}
function getEnvelopeEndpointWithUrlEncodedAuth(dsn, tunnel) {
  return tunnel ? tunnel : _getEnvelopeEndpoint(dsn) + "?" + _encodedAuth(dsn);
}

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/flags.js
var IS_DEBUG_BUILD3 = typeof __SENTRY_DEBUG__ === "undefined" ? true : __SENTRY_DEBUG__;

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/integration.js
var installedIntegrations = [];
function filterDuplicates(integrations) {
  return integrations.reduce(function(acc, integrations2) {
    if (acc.every(function(accIntegration) {
      return integrations2.name !== accIntegration.name;
    })) {
      acc.push(integrations2);
    }
    return acc;
  }, []);
}
function getIntegrationsToSetup(options) {
  var defaultIntegrations2 = options.defaultIntegrations && __spread(options.defaultIntegrations) || [];
  var userIntegrations = options.integrations;
  var integrations = __spread(filterDuplicates(defaultIntegrations2));
  if (Array.isArray(userIntegrations)) {
    integrations = __spread(integrations.filter(function(integrations2) {
      return userIntegrations.every(function(userIntegration) {
        return userIntegration.name !== integrations2.name;
      });
    }), filterDuplicates(userIntegrations));
  } else if (typeof userIntegrations === "function") {
    integrations = userIntegrations(integrations);
    integrations = Array.isArray(integrations) ? integrations : [integrations];
  }
  var integrationsNames = integrations.map(function(i) {
    return i.name;
  });
  var alwaysLastToRun = "Debug";
  if (integrationsNames.indexOf(alwaysLastToRun) !== -1) {
    integrations.push.apply(integrations, __spread(integrations.splice(integrationsNames.indexOf(alwaysLastToRun), 1)));
  }
  return integrations;
}
function setupIntegration(integration) {
  if (installedIntegrations.indexOf(integration.name) !== -1) {
    return;
  }
  integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
  installedIntegrations.push(integration.name);
  IS_DEBUG_BUILD3 && logger.log("Integration installed: " + integration.name);
}
function setupIntegrations(options) {
  var integrations = {};
  getIntegrationsToSetup(options).forEach(function(integration) {
    integrations[integration.name] = integration;
    setupIntegration(integration);
  });
  addNonEnumerableProperty(integrations, "initialized", true);
  return integrations;
}

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/baseclient.js
var ALREADY_SEEN_ERROR = "Not capturing exception because it's already been captured.";
var BaseClient = (
  /** @class */
  function() {
    function BaseClient2(backendClass, options) {
      this._integrations = {};
      this._numProcessing = 0;
      this._backend = new backendClass(options);
      this._options = options;
      if (options.dsn) {
        this._dsn = makeDsn(options.dsn);
      }
    }
    BaseClient2.prototype.captureException = function(exception, hint, scope) {
      var _this = this;
      if (checkOrSetAlreadyCaught(exception)) {
        IS_DEBUG_BUILD3 && logger.log(ALREADY_SEEN_ERROR);
        return;
      }
      var eventId = hint && hint.event_id;
      this._process(this._getBackend().eventFromException(exception, hint).then(function(event) {
        return _this._captureEvent(event, hint, scope);
      }).then(function(result) {
        eventId = result;
      }));
      return eventId;
    };
    BaseClient2.prototype.captureMessage = function(message, level, hint, scope) {
      var _this = this;
      var eventId = hint && hint.event_id;
      var promisedEvent = isPrimitive(message) ? this._getBackend().eventFromMessage(String(message), level, hint) : this._getBackend().eventFromException(message, hint);
      this._process(promisedEvent.then(function(event) {
        return _this._captureEvent(event, hint, scope);
      }).then(function(result) {
        eventId = result;
      }));
      return eventId;
    };
    BaseClient2.prototype.captureEvent = function(event, hint, scope) {
      if (hint && hint.originalException && checkOrSetAlreadyCaught(hint.originalException)) {
        IS_DEBUG_BUILD3 && logger.log(ALREADY_SEEN_ERROR);
        return;
      }
      var eventId = hint && hint.event_id;
      this._process(this._captureEvent(event, hint, scope).then(function(result) {
        eventId = result;
      }));
      return eventId;
    };
    BaseClient2.prototype.captureSession = function(session) {
      if (!this._isEnabled()) {
        IS_DEBUG_BUILD3 && logger.warn("SDK not enabled, will not capture session.");
        return;
      }
      if (!(typeof session.release === "string")) {
        IS_DEBUG_BUILD3 && logger.warn("Discarded session because of missing or non-string release");
      } else {
        this._sendSession(session);
        session.update({ init: false });
      }
    };
    BaseClient2.prototype.getDsn = function() {
      return this._dsn;
    };
    BaseClient2.prototype.getOptions = function() {
      return this._options;
    };
    BaseClient2.prototype.getTransport = function() {
      return this._getBackend().getTransport();
    };
    BaseClient2.prototype.flush = function(timeout) {
      var _this = this;
      return this._isClientDoneProcessing(timeout).then(function(clientFinished) {
        return _this.getTransport().close(timeout).then(function(transportFlushed) {
          return clientFinished && transportFlushed;
        });
      });
    };
    BaseClient2.prototype.close = function(timeout) {
      var _this = this;
      return this.flush(timeout).then(function(result) {
        _this.getOptions().enabled = false;
        return result;
      });
    };
    BaseClient2.prototype.setupIntegrations = function() {
      if (this._isEnabled() && !this._integrations.initialized) {
        this._integrations = setupIntegrations(this._options);
      }
    };
    BaseClient2.prototype.getIntegration = function(integration) {
      try {
        return this._integrations[integration.id] || null;
      } catch (_oO) {
        IS_DEBUG_BUILD3 && logger.warn("Cannot retrieve integration " + integration.id + " from the current Client");
        return null;
      }
    };
    BaseClient2.prototype._updateSessionFromEvent = function(session, event) {
      var e_1, _a;
      var crashed = false;
      var errored = false;
      var exceptions = event.exception && event.exception.values;
      if (exceptions) {
        errored = true;
        try {
          for (var exceptions_1 = __values(exceptions), exceptions_1_1 = exceptions_1.next(); !exceptions_1_1.done; exceptions_1_1 = exceptions_1.next()) {
            var ex = exceptions_1_1.value;
            var mechanism = ex.mechanism;
            if (mechanism && mechanism.handled === false) {
              crashed = true;
              break;
            }
          }
        } catch (e_1_1) {
          e_1 = { error: e_1_1 };
        } finally {
          try {
            if (exceptions_1_1 && !exceptions_1_1.done && (_a = exceptions_1.return)) _a.call(exceptions_1);
          } finally {
            if (e_1) throw e_1.error;
          }
        }
      }
      var sessionNonTerminal = session.status === "ok";
      var shouldUpdateAndSend = sessionNonTerminal && session.errors === 0 || sessionNonTerminal && crashed;
      if (shouldUpdateAndSend) {
        session.update(__assign(__assign({}, crashed && { status: "crashed" }), { errors: session.errors || Number(errored || crashed) }));
        this.captureSession(session);
      }
    };
    BaseClient2.prototype._sendSession = function(session) {
      this._getBackend().sendSession(session);
    };
    BaseClient2.prototype._isClientDoneProcessing = function(timeout) {
      var _this = this;
      return new SyncPromise(function(resolve) {
        var ticked = 0;
        var tick = 1;
        var interval = setInterval(function() {
          if (_this._numProcessing == 0) {
            clearInterval(interval);
            resolve(true);
          } else {
            ticked += tick;
            if (timeout && ticked >= timeout) {
              clearInterval(interval);
              resolve(false);
            }
          }
        }, tick);
      });
    };
    BaseClient2.prototype._getBackend = function() {
      return this._backend;
    };
    BaseClient2.prototype._isEnabled = function() {
      return this.getOptions().enabled !== false && this._dsn !== void 0;
    };
    BaseClient2.prototype._prepareEvent = function(event, scope, hint) {
      var _this = this;
      var _a = this.getOptions(), _b = _a.normalizeDepth, normalizeDepth = _b === void 0 ? 3 : _b, _c = _a.normalizeMaxBreadth, normalizeMaxBreadth = _c === void 0 ? 1e3 : _c;
      var prepared = __assign(__assign({}, event), { event_id: event.event_id || (hint && hint.event_id ? hint.event_id : uuid4()), timestamp: event.timestamp || dateTimestampInSeconds() });
      this._applyClientOptions(prepared);
      this._applyIntegrationsMetadata(prepared);
      var finalScope = scope;
      if (hint && hint.captureContext) {
        finalScope = Scope.clone(finalScope).update(hint.captureContext);
      }
      var result = resolvedSyncPromise(prepared);
      if (finalScope) {
        result = finalScope.applyToEvent(prepared, hint);
      }
      return result.then(function(evt) {
        if (evt) {
          evt.sdkProcessingMetadata = __assign(__assign({}, evt.sdkProcessingMetadata), { normalizeDepth: normalize(normalizeDepth) + " (" + typeof normalizeDepth + ")" });
        }
        if (typeof normalizeDepth === "number" && normalizeDepth > 0) {
          return _this._normalizeEvent(evt, normalizeDepth, normalizeMaxBreadth);
        }
        return evt;
      });
    };
    BaseClient2.prototype._normalizeEvent = function(event, depth, maxBreadth) {
      if (!event) {
        return null;
      }
      var normalized = __assign(__assign(__assign(__assign(__assign({}, event), event.breadcrumbs && {
        breadcrumbs: event.breadcrumbs.map(function(b) {
          return __assign(__assign({}, b), b.data && {
            data: normalize(b.data, depth, maxBreadth)
          });
        })
      }), event.user && {
        user: normalize(event.user, depth, maxBreadth)
      }), event.contexts && {
        contexts: normalize(event.contexts, depth, maxBreadth)
      }), event.extra && {
        extra: normalize(event.extra, depth, maxBreadth)
      });
      if (event.contexts && event.contexts.trace) {
        normalized.contexts.trace = event.contexts.trace;
      }
      normalized.sdkProcessingMetadata = __assign(__assign({}, normalized.sdkProcessingMetadata), { baseClientNormalized: true });
      return normalized;
    };
    BaseClient2.prototype._applyClientOptions = function(event) {
      var options = this.getOptions();
      var environment = options.environment, release = options.release, dist = options.dist, _a = options.maxValueLength, maxValueLength = _a === void 0 ? 250 : _a;
      if (!("environment" in event)) {
        event.environment = "environment" in options ? environment : "production";
      }
      if (event.release === void 0 && release !== void 0) {
        event.release = release;
      }
      if (event.dist === void 0 && dist !== void 0) {
        event.dist = dist;
      }
      if (event.message) {
        event.message = truncate(event.message, maxValueLength);
      }
      var exception = event.exception && event.exception.values && event.exception.values[0];
      if (exception && exception.value) {
        exception.value = truncate(exception.value, maxValueLength);
      }
      var request = event.request;
      if (request && request.url) {
        request.url = truncate(request.url, maxValueLength);
      }
    };
    BaseClient2.prototype._applyIntegrationsMetadata = function(event) {
      var integrationsArray = Object.keys(this._integrations);
      if (integrationsArray.length > 0) {
        event.sdk = event.sdk || {};
        event.sdk.integrations = __spread(event.sdk.integrations || [], integrationsArray);
      }
    };
    BaseClient2.prototype._sendEvent = function(event) {
      this._getBackend().sendEvent(event);
    };
    BaseClient2.prototype._captureEvent = function(event, hint, scope) {
      return this._processEvent(event, hint, scope).then(function(finalEvent) {
        return finalEvent.event_id;
      }, function(reason) {
        IS_DEBUG_BUILD3 && logger.error(reason);
        return void 0;
      });
    };
    BaseClient2.prototype._processEvent = function(event, hint, scope) {
      var _this = this;
      var _a = this.getOptions(), beforeSend = _a.beforeSend, sampleRate = _a.sampleRate;
      var transport = this.getTransport();
      function recordLostEvent(outcome, category) {
        if (transport.recordLostEvent) {
          transport.recordLostEvent(outcome, category);
        }
      }
      if (!this._isEnabled()) {
        return rejectedSyncPromise(new SentryError("SDK not enabled, will not capture event."));
      }
      var isTransaction = event.type === "transaction";
      if (!isTransaction && typeof sampleRate === "number" && Math.random() > sampleRate) {
        recordLostEvent("sample_rate", "event");
        return rejectedSyncPromise(new SentryError("Discarding event because it's not included in the random sample (sampling rate = " + sampleRate + ")"));
      }
      return this._prepareEvent(event, scope, hint).then(function(prepared) {
        if (prepared === null) {
          recordLostEvent("event_processor", event.type || "event");
          throw new SentryError("An event processor returned null, will not send event.");
        }
        var isInternalException = hint && hint.data && hint.data.__sentry__ === true;
        if (isInternalException || isTransaction || !beforeSend) {
          return prepared;
        }
        var beforeSendResult = beforeSend(prepared, hint);
        return _ensureBeforeSendRv(beforeSendResult);
      }).then(function(processedEvent) {
        if (processedEvent === null) {
          recordLostEvent("before_send", event.type || "event");
          throw new SentryError("`beforeSend` returned `null`, will not send event.");
        }
        var session = scope && scope.getSession && scope.getSession();
        if (!isTransaction && session) {
          _this._updateSessionFromEvent(session, processedEvent);
        }
        _this._sendEvent(processedEvent);
        return processedEvent;
      }).then(null, function(reason) {
        if (reason instanceof SentryError) {
          throw reason;
        }
        _this.captureException(reason, {
          data: {
            __sentry__: true
          },
          originalException: reason
        });
        throw new SentryError("Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.\nReason: " + reason);
      });
    };
    BaseClient2.prototype._process = function(promise) {
      var _this = this;
      this._numProcessing += 1;
      void promise.then(function(value) {
        _this._numProcessing -= 1;
        return value;
      }, function(reason) {
        _this._numProcessing -= 1;
        return reason;
      });
    };
    return BaseClient2;
  }()
);
function _ensureBeforeSendRv(rv) {
  var nullErr = "`beforeSend` method has to return `null` or a valid event.";
  if (isThenable(rv)) {
    return rv.then(function(event) {
      if (!(isPlainObject(event) || event === null)) {
        throw new SentryError(nullErr);
      }
      return event;
    }, function(e) {
      throw new SentryError("beforeSend rejected with " + e);
    });
  } else if (!(isPlainObject(rv) || rv === null)) {
    throw new SentryError(nullErr);
  }
  return rv;
}

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/request.js
function getSdkMetadataForEnvelopeHeader(api) {
  if (!api.metadata || !api.metadata.sdk) {
    return;
  }
  var _a = api.metadata.sdk, name = _a.name, version = _a.version;
  return { name, version };
}
function enhanceEventWithSdkInfo(event, sdkInfo) {
  if (!sdkInfo) {
    return event;
  }
  event.sdk = event.sdk || {};
  event.sdk.name = event.sdk.name || sdkInfo.name;
  event.sdk.version = event.sdk.version || sdkInfo.version;
  event.sdk.integrations = __spread(event.sdk.integrations || [], sdkInfo.integrations || []);
  event.sdk.packages = __spread(event.sdk.packages || [], sdkInfo.packages || []);
  return event;
}
function createSessionEnvelope(session, api) {
  var sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  var envelopeHeaders = __assign(__assign({ sent_at: (/* @__PURE__ */ new Date()).toISOString() }, sdkInfo && { sdk: sdkInfo }), !!api.tunnel && { dsn: dsnToString(api.dsn) });
  var type = "aggregates" in session ? "sessions" : "session";
  var envelopeItem = [{ type }, session];
  var envelope = createEnvelope(envelopeHeaders, [envelopeItem]);
  return [envelope, type];
}
function createEventEnvelope(event, api) {
  var sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  var eventType = event.type || "event";
  var transactionSampling = (event.sdkProcessingMetadata || {}).transactionSampling;
  var _a = transactionSampling || {}, samplingMethod = _a.method, sampleRate = _a.rate;
  enhanceEventWithSdkInfo(event, api.metadata.sdk);
  event.tags = event.tags || {};
  event.extra = event.extra || {};
  if (!(event.sdkProcessingMetadata && event.sdkProcessingMetadata.baseClientNormalized)) {
    event.tags.skippedNormalization = true;
    event.extra.normalizeDepth = event.sdkProcessingMetadata ? event.sdkProcessingMetadata.normalizeDepth : "unset";
  }
  delete event.sdkProcessingMetadata;
  var envelopeHeaders = __assign(__assign({ event_id: event.event_id, sent_at: (/* @__PURE__ */ new Date()).toISOString() }, sdkInfo && { sdk: sdkInfo }), !!api.tunnel && { dsn: dsnToString(api.dsn) });
  var eventItem = [
    {
      type: eventType,
      sample_rates: [{ id: samplingMethod, rate: sampleRate }]
    },
    event
  ];
  return createEnvelope(envelopeHeaders, [eventItem]);
}

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/transports/noop.js
var NoopTransport = (
  /** @class */
  function() {
    function NoopTransport2() {
    }
    NoopTransport2.prototype.sendEvent = function(_) {
      return resolvedSyncPromise({
        reason: "NoopTransport: Event has been skipped because no Dsn is configured.",
        status: "skipped"
      });
    };
    NoopTransport2.prototype.close = function(_) {
      return resolvedSyncPromise(true);
    };
    return NoopTransport2;
  }()
);

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/basebackend.js
var BaseBackend = (
  /** @class */
  function() {
    function BaseBackend2(options) {
      this._options = options;
      if (!this._options.dsn) {
        IS_DEBUG_BUILD3 && logger.warn("No DSN provided, backend will not do anything.");
      }
      this._transport = this._setupTransport();
    }
    BaseBackend2.prototype.eventFromException = function(_exception, _hint) {
      throw new SentryError("Backend has to implement `eventFromException` method");
    };
    BaseBackend2.prototype.eventFromMessage = function(_message, _level, _hint) {
      throw new SentryError("Backend has to implement `eventFromMessage` method");
    };
    BaseBackend2.prototype.sendEvent = function(event) {
      if (this._newTransport && this._options.dsn && this._options._experiments && this._options._experiments.newTransport) {
        var api = initAPIDetails(this._options.dsn, this._options._metadata, this._options.tunnel);
        var env = createEventEnvelope(event, api);
        void this._newTransport.send(env).then(null, function(reason) {
          IS_DEBUG_BUILD3 && logger.error("Error while sending event:", reason);
        });
      } else {
        void this._transport.sendEvent(event).then(null, function(reason) {
          IS_DEBUG_BUILD3 && logger.error("Error while sending event:", reason);
        });
      }
    };
    BaseBackend2.prototype.sendSession = function(session) {
      if (!this._transport.sendSession) {
        IS_DEBUG_BUILD3 && logger.warn("Dropping session because custom transport doesn't implement sendSession");
        return;
      }
      if (this._newTransport && this._options.dsn && this._options._experiments && this._options._experiments.newTransport) {
        var api = initAPIDetails(this._options.dsn, this._options._metadata, this._options.tunnel);
        var _a = __read(createSessionEnvelope(session, api), 1), env = _a[0];
        void this._newTransport.send(env).then(null, function(reason) {
          IS_DEBUG_BUILD3 && logger.error("Error while sending session:", reason);
        });
      } else {
        void this._transport.sendSession(session).then(null, function(reason) {
          IS_DEBUG_BUILD3 && logger.error("Error while sending session:", reason);
        });
      }
    };
    BaseBackend2.prototype.getTransport = function() {
      return this._transport;
    };
    BaseBackend2.prototype._setupTransport = function() {
      return new NoopTransport();
    };
    return BaseBackend2;
  }()
);

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/sdk.js
function initAndBind(clientClass, options) {
  if (options.debug === true) {
    if (IS_DEBUG_BUILD3) {
      logger.enable();
    } else {
      console.warn("[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.");
    }
  }
  var hub = getCurrentHub();
  var scope = hub.getScope();
  if (scope) {
    scope.update(options.initialScope);
  }
  var client = new clientClass(options);
  hub.bindClient(client);
}

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/integrations/index.js
var integrations_exports = {};
__export(integrations_exports, {
  FunctionToString: () => FunctionToString,
  InboundFilters: () => InboundFilters
});

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/integrations/functiontostring.js
var originalFunctionToString;
var FunctionToString = (
  /** @class */
  function() {
    function FunctionToString2() {
      this.name = FunctionToString2.id;
    }
    FunctionToString2.prototype.setupOnce = function() {
      originalFunctionToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
          args[_i] = arguments[_i];
        }
        var context = getOriginalFunction(this) || this;
        return originalFunctionToString.apply(context, args);
      };
    };
    FunctionToString2.id = "FunctionToString";
    return FunctionToString2;
  }()
);

// node_modules/.pnpm/@sentry+core@6.19.7/node_modules/@sentry/core/esm/integrations/inboundfilters.js
var DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];
var InboundFilters = (
  /** @class */
  function() {
    function InboundFilters2(_options) {
      if (_options === void 0) {
        _options = {};
      }
      this._options = _options;
      this.name = InboundFilters2.id;
    }
    InboundFilters2.prototype.setupOnce = function(addGlobalEventProcessor2, getCurrentHub2) {
      addGlobalEventProcessor2(function(event) {
        var hub = getCurrentHub2();
        if (hub) {
          var self_1 = hub.getIntegration(InboundFilters2);
          if (self_1) {
            var client = hub.getClient();
            var clientOptions = client ? client.getOptions() : {};
            var options = _mergeOptions(self_1._options, clientOptions);
            return _shouldDropEvent(event, options) ? null : event;
          }
        }
        return event;
      });
    };
    InboundFilters2.id = "InboundFilters";
    return InboundFilters2;
  }()
);
function _mergeOptions(internalOptions, clientOptions) {
  if (internalOptions === void 0) {
    internalOptions = {};
  }
  if (clientOptions === void 0) {
    clientOptions = {};
  }
  return {
    allowUrls: __spread(internalOptions.whitelistUrls || [], internalOptions.allowUrls || [], clientOptions.whitelistUrls || [], clientOptions.allowUrls || []),
    denyUrls: __spread(internalOptions.blacklistUrls || [], internalOptions.denyUrls || [], clientOptions.blacklistUrls || [], clientOptions.denyUrls || []),
    ignoreErrors: __spread(internalOptions.ignoreErrors || [], clientOptions.ignoreErrors || [], DEFAULT_IGNORE_ERRORS),
    ignoreInternal: internalOptions.ignoreInternal !== void 0 ? internalOptions.ignoreInternal : true
  };
}
function _shouldDropEvent(event, options) {
  if (options.ignoreInternal && _isSentryError(event)) {
    IS_DEBUG_BUILD3 && logger.warn("Event dropped due to being internal Sentry Error.\nEvent: " + getEventDescription(event));
    return true;
  }
  if (_isIgnoredError(event, options.ignoreErrors)) {
    IS_DEBUG_BUILD3 && logger.warn("Event dropped due to being matched by `ignoreErrors` option.\nEvent: " + getEventDescription(event));
    return true;
  }
  if (_isDeniedUrl(event, options.denyUrls)) {
    IS_DEBUG_BUILD3 && logger.warn("Event dropped due to being matched by `denyUrls` option.\nEvent: " + getEventDescription(event) + ".\nUrl: " + _getEventFilterUrl(event));
    return true;
  }
  if (!_isAllowedUrl(event, options.allowUrls)) {
    IS_DEBUG_BUILD3 && logger.warn("Event dropped due to not being matched by `allowUrls` option.\nEvent: " + getEventDescription(event) + ".\nUrl: " + _getEventFilterUrl(event));
    return true;
  }
  return false;
}
function _isIgnoredError(event, ignoreErrors) {
  if (!ignoreErrors || !ignoreErrors.length) {
    return false;
  }
  return _getPossibleEventMessages(event).some(function(message) {
    return ignoreErrors.some(function(pattern) {
      return isMatchingPattern(message, pattern);
    });
  });
}
function _isDeniedUrl(event, denyUrls) {
  if (!denyUrls || !denyUrls.length) {
    return false;
  }
  var url = _getEventFilterUrl(event);
  return !url ? false : denyUrls.some(function(pattern) {
    return isMatchingPattern(url, pattern);
  });
}
function _isAllowedUrl(event, allowUrls) {
  if (!allowUrls || !allowUrls.length) {
    return true;
  }
  var url = _getEventFilterUrl(event);
  return !url ? true : allowUrls.some(function(pattern) {
    return isMatchingPattern(url, pattern);
  });
}
function _getPossibleEventMessages(event) {
  if (event.message) {
    return [event.message];
  }
  if (event.exception) {
    try {
      var _a = event.exception.values && event.exception.values[0] || {}, _b = _a.type, type = _b === void 0 ? "" : _b, _c = _a.value, value = _c === void 0 ? "" : _c;
      return ["" + value, type + ": " + value];
    } catch (oO) {
      IS_DEBUG_BUILD3 && logger.error("Cannot extract message for event " + getEventDescription(event));
      return [];
    }
  }
  return [];
}
function _isSentryError(event) {
  try {
    return event.exception.values[0].type === "SentryError";
  } catch (e) {
  }
  return false;
}
function _getLastValidUrl(frames) {
  if (frames === void 0) {
    frames = [];
  }
  for (var i = frames.length - 1; i >= 0; i--) {
    var frame = frames[i];
    if (frame && frame.filename !== "<anonymous>" && frame.filename !== "[native code]") {
      return frame.filename || null;
    }
  }
  return null;
}
function _getEventFilterUrl(event) {
  try {
    if (event.stacktrace) {
      return _getLastValidUrl(event.stacktrace.frames);
    }
    var frames_1;
    try {
      frames_1 = event.exception.values[0].stacktrace.frames;
    } catch (e) {
    }
    return frames_1 ? _getLastValidUrl(frames_1) : null;
  } catch (oO) {
    IS_DEBUG_BUILD3 && logger.error("Cannot extract url for event " + getEventDescription(event));
    return null;
  }
}

// src/version.ts
var SDK_NAME = "sentry.javascript.miniapp";
var SDK_VERSION = "0.12.0";

// src/tracekit.ts
var UNKNOWN_FUNCTION = "?";
var chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[-a-z]+:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
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
        func: parts[1] || UNKNOWN_FUNCTION,
        args: isNative ? [parts[2]] : [],
        line: parts[3] ? +parts[3] : null,
        column: parts[4] ? +parts[4] : null
      };
    } else if (parts = winjs.exec(lines[i])) {
      element = {
        url: parts[2],
        func: parts[1] || UNKNOWN_FUNCTION,
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
        func: parts[1] || UNKNOWN_FUNCTION,
        args: parts[2] ? parts[2].split(",") : [],
        line: parts[4] ? +parts[4] : null,
        column: parts[5] ? +parts[5] : null
      };
    } else if (parts = miniapp.exec(lines[i])) {
      element = {
        url: parts[2],
        func: parts[1] || UNKNOWN_FUNCTION,
        args: [],
        line: parts[3] ? +parts[3] : null,
        column: parts[4] ? +parts[4] : null
      };
    } else {
      continue;
    }
    if (!element.func && element.line) {
      element.func = UNKNOWN_FUNCTION;
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
        element.func = UNKNOWN_FUNCTION;
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
          type: isEvent(exception) ? exception.constructor.name : rejection ? "UnhandledRejection" : "Error",
          value: `Non-Error ${rejection ? "promise rejection" : "exception"} captured with keys: ${extractExceptionKeysForMessage(exception)}`
        }
      ]
    },
    extra: {
      __serialized__: normalizeToSize(exception)
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
function eventFromUnknownInput(exception, syntheticException, options = {}) {
  let event;
  if (isErrorEvent(exception) && exception.error) {
    const errorEvent = exception;
    exception = errorEvent.error;
    event = eventFromStacktrace(computeStackTrace(exception));
    return event;
  }
  if (isDOMError(exception) || isDOMException(exception)) {
    const domException = exception;
    const name = domException.name || (isDOMError(domException) ? "DOMError" : "DOMException");
    const message = domException.message ? `${name}: ${domException.message}` : name;
    event = eventFromString(message, syntheticException, options);
    addExceptionTypeValue(event, message);
    return event;
  }
  if (isError(exception)) {
    event = eventFromStacktrace(computeStackTrace(exception));
    return event;
  }
  if (isPlainObject(exception) || isEvent(exception)) {
    const objectException = exception;
    event = eventFromPlainObject(objectException, syntheticException, options.rejection);
    addExceptionMechanism(event, {
      synthetic: true
    });
    return event;
  }
  event = eventFromString(exception, syntheticException, options);
  addExceptionTypeValue(event, `${exception}`);
  addExceptionMechanism(event, {
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
  BaseTransport: () => BaseTransport,
  XHRTransport: () => XHRTransport
});

// src/transports/base.ts
var BaseTransport = class {
  constructor(options) {
    this.options = options;
    /** A simple buffer holding all requests. */
    this._buffer = makePromiseBuffer(30);
    this.url = new API(this.options.dsn).getStoreEndpointWithUrlEncodedAuth();
  }
  /**
   * @inheritDoc
   */
  sendEvent(_) {
    throw new SentryError(
      "Transport Class has to implement `sendEvent` method"
    );
  }
  /**
   * @inheritDoc
   */
  close(timeout) {
    return this._buffer.drain(timeout);
  }
};

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
var XHRTransport = class extends BaseTransport {
  /**
   * @inheritDoc
   */
  sendEvent(event) {
    const request = sdk.request || sdk.httpRequest;
    return this._buffer.add(
      () => new Promise((resolve, reject) => {
        request({
          url: this.url,
          method: "POST",
          data: JSON.stringify(event),
          header: {
            "content-type": "application/json"
          },
          success(res) {
            resolve({
              status: eventStatusFromHttpCode(res.statusCode)
            });
          },
          fail(error) {
            reject(error);
          }
        });
      })
    );
  }
};

// src/backend.ts
var MiniappBackend = class extends BaseBackend {
  /**
   * @inheritDoc
   */
  _setupTransport() {
    if (!this._options.dsn) {
      return super._setupTransport();
    }
    const transportOptions = __spreadProps(__spreadValues({}, this._options.transportOptions), {
      dsn: this._options.dsn
    });
    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }
    return new XHRTransport(transportOptions);
  }
  /**
   * @inheritDoc
   */
  eventFromException(exception, hint) {
    const syntheticException = hint && hint.syntheticException || void 0;
    const event = eventFromUnknownInput(exception, syntheticException, {
      attachStacktrace: this._options.attachStacktrace
    });
    addExceptionMechanism(event, {
      handled: true,
      type: "generic"
    });
    event.level = Severity.Error;
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return resolvedSyncPromise(event);
  }
  /**
   * @inheritDoc
   */
  eventFromMessage(message, level = Severity.Info, hint) {
    const syntheticException = hint && hint.syntheticException || void 0;
    const event = eventFromString(message, syntheticException, {
      attachStacktrace: this._options.attachStacktrace
    });
    event.level = level;
    if (hint && hint.event_id) {
      event.event_id = hint.event_id;
    }
    return resolvedSyncPromise(event);
  }
};

// src/client.ts
var MiniappClient = class extends BaseClient {
  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  constructor(options = {}) {
    super(MiniappBackend, options);
  }
  /**
   * @inheritDoc
   */
  _prepareEvent(event, scope, hint) {
    event.platform = event.platform || "javascript";
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
    return super._prepareEvent(event, scope, hint);
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
      withScope((scope) => {
        scope.addEventProcessor((event) => {
          const processedEvent = __spreadValues({}, event);
          if (options.mechanism) {
            addExceptionTypeValue(processedEvent, void 0);
            addExceptionMechanism(processedEvent, options.mechanism);
          }
          processedEvent.extra = __spreadProps(__spreadValues({}, processedEvent.extra), {
            arguments: normalize(args, 3)
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
var integrations_exports2 = {};
__export(integrations_exports2, {
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
      logger.log("Global Handler attached: onError");
      this._installGlobalOnErrorHandler();
    }
    if (this._options.onunhandledrejection) {
      logger.log("Global Handler attached: onunhandledrejection");
      this._installGlobalOnUnhandledRejectionHandler();
    }
    if (this._options.onpagenotfound) {
      logger.log("Global Handler attached: onPageNotFound");
      this._installGlobalOnPageNotFoundHandler();
    }
    if (this._options.onmemorywarning) {
      logger.log("Global Handler attached: onMemoryWarning");
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
    const global3 = getGlobalObject();
    const proto = global3[target] && global3[target].prototype;
    if (!proto || !proto.hasOwnProperty || !proto.hasOwnProperty("addEventListener")) {
      return;
    }
    fill(proto, "addEventListener", function(original) {
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
    fill(proto, "removeEventListener", function(original) {
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
    const global3 = getGlobalObject();
    fill(global3, "setTimeout", this._wrapTimeFunction.bind(this));
    fill(global3, "setInterval", this._wrapTimeFunction.bind(this));
    fill(global3, "requestAnimationFrame", this._wrapRAF.bind(this));
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
    addGlobalEventProcessor((event, hint) => {
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
    addGlobalEventProcessor((event) => {
      if (getCurrentHub().getIntegration(_System)) {
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
            statusBarHeight,
            system,
            version,
            windowHeight,
            windowWidth,
            app,
            // 支付宝小程序
            appName: appName2,
            // 字节跳动小程序
            fontSizeSetting
            // 支付宝小程序、 钉钉小程序、微信小程序
          } = systemInfo;
          const [systemName, systemVersion] = system.split(" ");
          return __spreadProps(__spreadValues({}, event), {
            contexts: __spreadProps(__spreadValues({}, event.contexts), {
              device: {
                brand,
                battery_level: batteryLevel || currentBattery || battery,
                model,
                screen_dpi: pixelRatio
              },
              os: {
                name: systemName || system,
                version: systemVersion || system
              },
              extra: __spreadValues({
                SDKVersion,
                language,
                platform,
                screenHeight,
                screenWidth,
                statusBarHeight,
                version,
                windowHeight,
                windowWidth,
                fontSizeSetting,
                app: app || appName2 || appName
              }, systemInfo)
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
    addGlobalEventProcessor((event) => {
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
    addGlobalEventProcessor((event) => {
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

// src/tracing/flags.ts
var IS_DEBUG_BUILD4 = typeof __SENTRY_DEBUG__ === "undefined" ? true : __SENTRY_DEBUG__;

// src/tracing/constants.ts
var FINISH_REASON_TAG = "finishReason";
var IDLE_TRANSACTION_FINISH_REASONS = ["heartbeatFailed", "idleTimeout", "documentHidden"];

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
     * @inheritDoc
     */
    this.traceId = uuid4();
    /**
     * @inheritDoc
     */
    this.spanId = uuid4().substring(16);
    /**
     * Timestamp in seconds when the span was created.
     */
    this.startTimestamp = timestampWithMs();
    /**
     * @inheritDoc
     */
    this.tags = {};
    /**
     * @inheritDoc
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.data = {};
    if (!spanContext) {
      return this;
    }
    if (spanContext.traceId) {
      this.traceId = spanContext.traceId;
    }
    if (spanContext.spanId) {
      this.spanId = spanContext.spanId;
    }
    if (spanContext.parentSpanId) {
      this.parentSpanId = spanContext.parentSpanId;
    }
    if ("sampled" in spanContext) {
      this.sampled = spanContext.sampled;
    }
    if (spanContext.op) {
      this.op = spanContext.op;
    }
    if (spanContext.description) {
      this.description = spanContext.description;
    }
    if (spanContext.data) {
      this.data = spanContext.data;
    }
    if (spanContext.tags) {
      this.tags = spanContext.tags;
    }
    if (spanContext.status) {
      this.status = spanContext.status;
    }
    if (spanContext.startTimestamp) {
      this.startTimestamp = spanContext.startTimestamp;
    }
    if (spanContext.endTimestamp) {
      this.endTimestamp = spanContext.endTimestamp;
    }
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
    const childSpan = new _Span(__spreadProps(__spreadValues({}, spanContext), {
      parentSpanId: this.spanId,
      sampled: this.sampled,
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
  setStatus(value) {
    this.status = value;
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
  isSuccess() {
    return this.status === "ok";
  }
  /**
   * @inheritDoc
   */
  finish(endTimestamp) {
    this.endTimestamp = typeof endTimestamp === "number" ? endTimestamp : timestampWithMs();
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
    return dropUndefinedKeys({
      data: this.data,
      description: this.description,
      endTimestamp: this.endTimestamp,
      op: this.op,
      parentSpanId: this.parentSpanId,
      sampled: this.sampled,
      spanId: this.spanId,
      startTimestamp: this.startTimestamp,
      status: this.status,
      tags: this.tags,
      traceId: this.traceId
    });
  }
  /**
   * @inheritDoc
   */
  updateWithContext(spanContext) {
    var _a, _b, _c, _d, _e;
    this.data = (_a = spanContext.data) != null ? _a : {};
    this.description = spanContext.description;
    this.endTimestamp = spanContext.endTimestamp;
    this.op = spanContext.op;
    this.parentSpanId = spanContext.parentSpanId;
    this.sampled = spanContext.sampled;
    this.spanId = (_b = spanContext.spanId) != null ? _b : this.spanId;
    this.startTimestamp = (_c = spanContext.startTimestamp) != null ? _c : this.startTimestamp;
    this.status = spanContext.status;
    this.tags = (_d = spanContext.tags) != null ? _d : {};
    this.traceId = (_e = spanContext.traceId) != null ? _e : this.traceId;
    return this;
  }
  /**
   * @inheritDoc
   */
  getTraceContext() {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : void 0,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      status: this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : void 0,
      trace_id: this.traceId
    });
  }
  /**
   * @inheritDoc
   */
  toJSON() {
    return dropUndefinedKeys({
      data: Object.keys(this.data).length > 0 ? this.data : void 0,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      start_timestamp: this.startTimestamp,
      status: this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : void 0,
      timestamp: this.endTimestamp,
      trace_id: this.traceId
    });
  }
};
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
  constructor(transactionContext, hub) {
    super(transactionContext);
    this._measurements = {};
    /**
     * The reference to the current hub.
     */
    this._hub = getCurrentHub();
    if (isInstanceOf(hub, Hub)) {
      this._hub = hub;
    }
    this.name = transactionContext.name || "";
    this.metadata = transactionContext.metadata || {};
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
   * @inheritDoc
   */
  finish(endTimestamp) {
    if (this.endTimestamp !== void 0) {
      return void 0;
    }
    if (!this.name) {
      IS_DEBUG_BUILD4 && logger.warn("Transaction has no name, falling back to `<unlabeled transaction>`.");
      this.name = "<unlabeled transaction>";
    }
    super.finish(endTimestamp);
    if (this.sampled !== true) {
      IS_DEBUG_BUILD4 && logger.log("[Tracing] Discarding transaction because its trace was not chosen to be sampled.");
      const client = this._hub.getClient();
      const transport = client && client.getTransport && client.getTransport();
      if (transport && transport.recordLostEvent) {
        transport.recordLostEvent("sample_rate", "transaction");
      }
      return void 0;
    }
    const finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter((s) => s !== this && s.endTimestamp) : [];
    if (this._trimEnd && finishedSpans.length > 0) {
      this.endTimestamp = finishedSpans.reduce((prev, current) => {
        if (prev.endTimestamp && current.endTimestamp) {
          return prev.endTimestamp > current.endTimestamp ? prev : current;
        }
        return prev;
      }).endTimestamp;
    }
    const transaction = {
      contexts: {
        trace: this.getTraceContext()
      },
      spans: finishedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: "transaction",
      sdkProcessingMetadata: this.metadata
    };
    const hasMeasurements = Object.keys(this._measurements).length > 0;
    if (hasMeasurements) {
      IS_DEBUG_BUILD4 && logger.log(
        "[Measurements] Adding measurements to transaction",
        JSON.stringify(this._measurements, void 0, 2)
      );
      transaction.measurements = this._measurements;
    }
    IS_DEBUG_BUILD4 && logger.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`);
    return this._hub.captureEvent(transaction);
  }
  /**
   * @inheritDoc
   */
  toContext() {
    const spanContext = super.toContext();
    return dropUndefinedKeys(__spreadProps(__spreadValues({}, spanContext), {
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
        span.endTimestamp = typeof endTimestamp === "number" ? endTimestamp : timestampWithMs();
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
  constructor(transactionContext, _idleHub, _idleTimeout = DEFAULT_IDLE_TIMEOUT, _onScope = false) {
    super(transactionContext, _idleHub);
    this._idleHub = _idleHub;
    this._idleTimeout = _idleTimeout;
    this._onScope = _onScope;
    // Activities store a list of active spans
    this.activities = {};
    // Amount of times heartbeat has counted. Will cause transaction to finish after 3 beats.
    this._heartbeatCounter = 0;
    // We should not use heartbeat if we finished a transaction
    this._finished = false;
    this._beforeFinishCallbacks = [];
    if (_idleHub && _onScope) {
      clearActiveTransaction(_idleHub);
      IS_DEBUG_BUILD4 && logger.log(`Setting idle transaction on scope. Span ID: ${this.spanId}`);
      _idleHub.configureScope((scope) => scope.setSpan(this));
    }
    this._initTimeout = setTimeout(() => {
      if (!this._finished) {
        this.finish();
      }
    }, this._idleTimeout);
  }
  /** {@inheritDoc} */
  finish(endTimestamp = timestampWithMs()) {
    this._finished = true;
    this.activities = {};
    if (this.spanRecorder) {
      IS_DEBUG_BUILD4 && logger.log("[Tracing] finishing IdleTransaction", new Date(endTimestamp * 1e3).toISOString(), this.op);
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
          IS_DEBUG_BUILD4 && logger.log("[Tracing] cancelling span since transaction ended early", JSON.stringify(span, void 0, 2));
        }
        const keepSpan = span.startTimestamp < endTimestamp;
        if (!keepSpan) {
          IS_DEBUG_BUILD4 && logger.log(
            "[Tracing] discarding Span since it happened after Transaction was finished",
            JSON.stringify(span, void 0, 2)
          );
        }
        return keepSpan;
      });
      IS_DEBUG_BUILD4 && logger.log("[Tracing] flushing IdleTransaction");
    } else {
      IS_DEBUG_BUILD4 && logger.log("[Tracing] No active IdleTransaction");
    }
    if (this._onScope) {
      clearActiveTransaction(this._idleHub);
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
      IS_DEBUG_BUILD4 && logger.log("Starting heartbeat");
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
    IS_DEBUG_BUILD4 && logger.log(`[Tracing] pushActivity: ${spanId}`);
    this.activities[spanId] = true;
    IS_DEBUG_BUILD4 && logger.log("[Tracing] new activities count", Object.keys(this.activities).length);
  }
  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  _popActivity(spanId) {
    if (this.activities[spanId]) {
      IS_DEBUG_BUILD4 && logger.log(`[Tracing] popActivity ${spanId}`);
      delete this.activities[spanId];
      IS_DEBUG_BUILD4 && logger.log("[Tracing] new activities count", Object.keys(this.activities).length);
    }
    if (Object.keys(this.activities).length === 0) {
      const timeout = this._idleTimeout;
      const end = timestampWithMs() + timeout / 1e3;
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
      IS_DEBUG_BUILD4 && logger.log("[Tracing] Transaction finished because of no change for 3 heart beats");
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
    IS_DEBUG_BUILD4 && logger.log(`pinging Heartbeat -> current counter: ${this._heartbeatCounter}`);
    setTimeout(() => {
      this._beat();
    }, HEARTBEAT_INTERVAL);
  }
};
function clearActiveTransaction(hub) {
  if (hub) {
    const scope = hub.getScope();
    if (scope) {
      const transaction = scope.getTransaction();
      if (transaction) {
        scope.setSpan(void 0);
      }
    }
  }
}

// src/tracing/utils.ts
function hasTracingEnabled(maybeOptions) {
  const client = getCurrentHub().getClient();
  const options = maybeOptions || client && client.getOptions();
  return !!options && ("tracesSampleRate" in options || "tracesSampler" in options);
}

// src/tracing/hubextensions.ts
function traceHeaders() {
  const scope = this.getScope();
  if (scope) {
    const span = scope.getSpan();
    if (span) {
      return {
        "sentry-trace": span.toTraceparent()
      };
    }
  }
  return {};
}
function sample(transaction, options, samplingContext) {
  if (!hasTracingEnabled(options)) {
    transaction.sampled = false;
    return transaction;
  }
  if (transaction.sampled !== void 0) {
    transaction.setMetadata({
      transactionSampling: { method: "explicitly_set" }
    });
    return transaction;
  }
  let sampleRate;
  if (typeof options.tracesSampler === "function") {
    sampleRate = options.tracesSampler(samplingContext);
    transaction.setMetadata({
      transactionSampling: {
        method: "client_sampler",
        // cast to number in case it's a boolean
        rate: Number(sampleRate)
      }
    });
  } else if (samplingContext.parentSampled !== void 0) {
    sampleRate = samplingContext.parentSampled;
    transaction.setMetadata({
      transactionSampling: { method: "inheritance" }
    });
  } else {
    sampleRate = options.tracesSampleRate;
    transaction.setMetadata({
      transactionSampling: {
        method: "client_rate",
        // cast to number in case it's a boolean
        rate: Number(sampleRate)
      }
    });
  }
  if (!isValidSampleRate(sampleRate)) {
    IS_DEBUG_BUILD4 && logger.warn("[Tracing] Discarding transaction because of invalid sample rate.");
    transaction.sampled = false;
    return transaction;
  }
  if (!sampleRate) {
    IS_DEBUG_BUILD4 && logger.log(
      `[Tracing] Discarding transaction because ${typeof options.tracesSampler === "function" ? "tracesSampler returned 0 or false" : "a negative sampling decision was inherited or tracesSampleRate is set to 0"}`
    );
    transaction.sampled = false;
    return transaction;
  }
  transaction.sampled = Math.random() < sampleRate;
  if (!transaction.sampled) {
    IS_DEBUG_BUILD4 && logger.log(
      `[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(
        sampleRate
      )})`
    );
    return transaction;
  }
  IS_DEBUG_BUILD4 && logger.log(`[Tracing] starting ${transaction.op} transaction - ${transaction.name}`);
  return transaction;
}
function isValidSampleRate(rate) {
  if (isNaN2(rate) || !(typeof rate === "number" || typeof rate === "boolean")) {
    IS_DEBUG_BUILD4 && logger.warn(
      `[Tracing] Given sample rate is invalid. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
        rate
      )} of type ${JSON.stringify(typeof rate)}.`
    );
    return false;
  }
  if (rate < 0 || rate > 1) {
    IS_DEBUG_BUILD4 && logger.warn(`[Tracing] Given sample rate is invalid. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}
function _startTransaction(transactionContext, customSamplingContext) {
  const client = this.getClient();
  const options = client && client.getOptions() || {};
  let transaction = new Transaction(transactionContext, this);
  transaction = sample(transaction, options, __spreadValues({
    parentSampled: transactionContext.parentSampled,
    transactionContext
  }, customSamplingContext));
  if (transaction.sampled) {
    transaction.initSpanRecorder(options._experiments && options._experiments.maxSpans);
  }
  return transaction;
}
function startIdleTransaction(hub, transactionContext, idleTimeout, onScope, customSamplingContext) {
  const client = hub.getClient();
  const options = client && client.getOptions() || {};
  let transaction = new IdleTransaction(transactionContext, hub, idleTimeout, onScope);
  transaction = sample(transaction, options, __spreadValues({
    parentSampled: transactionContext.parentSampled,
    transactionContext
  }, customSamplingContext));
  if (transaction.sampled) {
    transaction.initSpanRecorder(options._experiments && options._experiments.maxSpans);
  }
  return transaction;
}
function _addTracingExtensions() {
  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    return;
  }
  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  if (!carrier.__SENTRY__.extensions.startTransaction) {
    carrier.__SENTRY__.extensions.startTransaction = _startTransaction;
  }
  if (!carrier.__SENTRY__.extensions.traceHeaders) {
    carrier.__SENTRY__.extensions.traceHeaders = traceHeaders;
  }
}

// src/tracing/browser/miniatracing.ts
var _MiniAppTracing = class _MiniAppTracing {
  constructor() {
    /**
     * @inheritDoc
     */
    this.name = _MiniAppTracing.id;
  }
  // private readonly _metrics: MetricsInstrumentation;
  setupOnce(_, getCurrentHub2) {
    _addTracingExtensions();
    const idleTimeout = 1e3;
    const hub = getCurrentHub2();
    const finalContext = {
      name: "idleTransaction",
      op: "idleTransaction"
    };
    const idleTransaction = startIdleTransaction(
      hub,
      finalContext,
      idleTimeout,
      true,
      {}
      // for use in the tracesSampler
    );
    idleTransaction.registerBeforeFinishCallback((_transaction, _endTimestamp) => {
    });
    idleTransaction.setTag("idleTimeout", idleTimeout);
  }
};
/**
   * @inheritDoc
   */
_MiniAppTracing.id = "MiniAppTracing";
var MiniAppTracing = _MiniAppTracing;

// src/sdk.ts
var defaultIntegrations = [
  new integrations_exports.InboundFilters(),
  new integrations_exports.FunctionToString(),
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
  initAndBind(MiniappClient, options);
}
function showReportDialog(options = {}) {
  if (!options.eventId) {
    options.eventId = getCurrentHub().lastEventId();
  }
  const client = getCurrentHub().getClient();
  if (client) {
    client.showReportDialog(options);
  }
}
function lastEventId() {
  return getCurrentHub().lastEventId();
}
function flush(timeout) {
  const client = getCurrentHub().getClient();
  if (client) {
    return client.flush(timeout);
  }
  return resolvedSyncPromise(false);
}
function close(timeout) {
  const client = getCurrentHub().getClient();
  if (client) {
    return client.close(timeout);
  }
  return resolvedSyncPromise(false);
}
function wrap2(fn) {
  return wrap(fn)();
}
/*! Bundled license information:

tslib/tslib.es6.js:
  (*! *****************************************************************************
  Copyright (c) Microsoft Corporation.
  
  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted.
  
  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
  PERFORMANCE OF THIS SOFTWARE.
  ***************************************************************************** *)
*/

export { Hub, integrations_exports2 as Integrations, MiniappClient, SDK_NAME, SDK_VERSION, Scope, Severity, transports_exports as Transports, addBreadcrumb, addGlobalEventProcessor, captureEvent, captureException, captureMessage, close, configureScope, defaultIntegrations, flush, getCurrentHub, getHubFromCarrier, init, lastEventId, setContext, setExtra, setExtras, setTag, setTags, setUser, showReportDialog, startTransaction, withScope, wrap2 as wrap };
