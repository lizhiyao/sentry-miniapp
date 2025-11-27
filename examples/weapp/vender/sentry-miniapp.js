var _n = Object.defineProperty, yn = Object.defineProperties;
var Sn = Object.getOwnPropertyDescriptors;
var at = Object.getOwnPropertySymbols;
var oe = Object.prototype.hasOwnProperty, ae = Object.prototype.propertyIsEnumerable;
var ie = (e, t, n) => t in e ? _n(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n, u = (e, t) => {
  for (var n in t || (t = {}))
    oe.call(t, n) && ie(e, n, t[n]);
  if (at)
    for (var n of at(t))
      ae.call(t, n) && ie(e, n, t[n]);
  return e;
}, _ = (e, t) => yn(e, Sn(t));
var ce = (e, t) => {
  var n = {};
  for (var r in e)
    oe.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
  if (e != null && at)
    for (var r of at(e))
      t.indexOf(r) < 0 && ae.call(e, r) && (n[r] = e[r]);
  return n;
};
const ue = (
  // eslint-disable-next-line no-undef
  typeof globalThis != "undefined" && globalThis || // eslint-disable-next-line no-undef
  typeof self != "undefined" && self || // eslint-disable-next-line no-undef
  typeof window != "undefined" && window || // eslint-disable-next-line no-undef
  typeof global != "undefined" && global || {}
);
class En {
  constructor(t) {
    if (this._entries = [], !!t) {
      if (typeof t == "string") {
        const n = t.startsWith("?") ? t.slice(1) : t;
        n.length > 0 && n.split("&").forEach((r) => {
          if (!r)
            return;
          const [s, i = ""] = r.split("=");
          this.append(decodeURIComponent(s), decodeURIComponent(i));
        });
        return;
      }
      if (Array.isArray(t)) {
        t.forEach(([n, r]) => this.append(n, r));
        return;
      }
      Object.keys(t).forEach((n) => {
        const r = t[n];
        r != null && this.append(n, String(r));
      });
    }
  }
  append(t, n) {
    this._entries.push([t, n]);
  }
  toString() {
    return this._entries.map(([t, n]) => `${encodeURIComponent(t)}=${encodeURIComponent(n)}`).join("&");
  }
}
ue.URLSearchParams || (ue.URLSearchParams = En);
const S = typeof __SENTRY_DEBUG__ == "undefined" || __SENTRY_DEBUG__, F = "8.55.0", v = globalThis;
function kt(e, t, n) {
  const r = n || v, s = r.__SENTRY__ = r.__SENTRY__ || {}, i = s[F] = s[F] || {};
  return i[e] || (i[e] = t());
}
const wt = typeof __SENTRY_DEBUG__ == "undefined" || __SENTRY_DEBUG__, bn = "Sentry Logger ", le = [
  "debug",
  "info",
  "warn",
  "error",
  "log",
  "assert",
  "trace"
], de = {};
function z(e) {
  if (!("console" in v))
    return e();
  const t = v.console, n = {}, r = Object.keys(de);
  r.forEach((s) => {
    const i = de[s];
    n[s] = t[s], t[s] = i;
  });
  try {
    return e();
  } finally {
    r.forEach((s) => {
      t[s] = n[s];
    });
  }
}
function Tn() {
  let e = !1;
  const t = {
    enable: () => {
      e = !0;
    },
    disable: () => {
      e = !1;
    },
    isEnabled: () => e
  };
  return wt ? le.forEach((n) => {
    t[n] = (...r) => {
      e && z(() => {
        v.console[n](`${bn}[${n}]:`, ...r);
      });
    };
  }) : le.forEach((n) => {
    t[n] = () => {
    };
  }), t;
}
const h = kt("logger", Tn), Mt = "<anonymous>";
function In(e) {
  try {
    return !e || typeof e != "function" ? Mt : e.name || Mt;
  } catch (t) {
    return Mt;
  }
}
function Ot() {
  return Kt(v), v;
}
function Kt(e) {
  const t = e.__SENTRY__ = e.__SENTRY__ || {};
  return t.version = t.version || F, t[F] = t[F] || {};
}
const Ue = Object.prototype.toString;
function He(e) {
  switch (Ue.call(e)) {
    case "[object Error]":
    case "[object Exception]":
    case "[object DOMException]":
    case "[object WebAssembly.Exception]":
      return !0;
    default:
      return Rt(e, Error);
  }
}
function K(e, t) {
  return Ue.call(e) === `[object ${t}]`;
}
function vn(e) {
  return K(e, "ErrorEvent");
}
function kn(e) {
  return K(e, "DOMError");
}
function wn(e) {
  return K(e, "DOMException");
}
function ft(e) {
  return K(e, "String");
}
function Be(e) {
  return typeof e == "object" && e !== null && "__sentry_template_string__" in e && "__sentry_template_values__" in e;
}
function On(e) {
  return e === null || Be(e) || typeof e != "object" && typeof e != "function";
}
function B(e) {
  return K(e, "Object");
}
function Ge(e) {
  return typeof Event != "undefined" && Rt(e, Event);
}
function Nn(e) {
  return typeof Element != "undefined" && Rt(e, Element);
}
function Rn(e) {
  return K(e, "RegExp");
}
function Nt(e) {
  return !!(e && e.then && typeof e.then == "function");
}
function Dn(e) {
  return B(e) && "nativeEvent" in e && "preventDefault" in e && "stopPropagation" in e;
}
function Rt(e, t) {
  try {
    return e instanceof t;
  } catch (n) {
    return !1;
  }
}
function An(e) {
  return !!(typeof e == "object" && e !== null && (e.__isVue || e._isVue));
}
const Pn = v, xn = 80;
function Mn(e, t = {}) {
  if (!e)
    return "<unknown>";
  try {
    let n = e;
    const r = 5, s = [];
    let i = 0, o = 0;
    const a = " > ", c = a.length;
    let l;
    const d = Array.isArray(t) ? t : t.keyAttrs, p = !Array.isArray(t) && t.maxStringLength || xn;
    for (; n && i++ < r && (l = $n(n, d), !(l === "html" || i > 1 && o + s.length * c + l.length >= p)); )
      s.push(l), o += l.length, n = n.parentNode;
    return s.reverse().join(a);
  } catch (n) {
    return "<unknown>";
  }
}
function $n(e, t) {
  const n = e, r = [];
  if (!n || !n.tagName)
    return "";
  if (Pn.HTMLElement && n instanceof HTMLElement && n.dataset) {
    if (n.dataset.sentryComponent)
      return n.dataset.sentryComponent;
    if (n.dataset.sentryElement)
      return n.dataset.sentryElement;
  }
  r.push(n.tagName.toLowerCase());
  const s = t && t.length ? t.filter((o) => n.getAttribute(o)).map((o) => [o, n.getAttribute(o)]) : null;
  if (s && s.length)
    s.forEach((o) => {
      r.push(`[${o[0]}="${o[1]}"]`);
    });
  else {
    n.id && r.push(`#${n.id}`);
    const o = n.className;
    if (o && ft(o)) {
      const a = o.split(/\s+/);
      for (const c of a)
        r.push(`.${c}`);
    }
  }
  const i = ["aria-label", "type", "name", "title", "alt"];
  for (const o of i) {
    const a = n.getAttribute(o);
    a && r.push(`[${o}="${a}"]`);
  }
  return r.join("");
}
function Q(e, t = 0) {
  return typeof e != "string" || t === 0 || e.length <= t ? e : `${e.slice(0, t)}...`;
}
function Cn(e, t, n = !1) {
  return ft(e) ? Rn(t) ? t.test(e) : ft(t) ? n ? e === t : e.includes(t) : !1 : !1;
}
function Dt(e, t = [], n = !1) {
  return t.some((r) => Cn(e, r, n));
}
function Fn(e, t, n) {
  if (!(t in e))
    return;
  const r = e[t], s = n(r);
  typeof s == "function" && jn(s, r);
  try {
    e[t] = s;
  } catch (i) {
    wt && h.log(`Failed to replace method "${t}" in object`, e);
  }
}
function Yt(e, t, n) {
  try {
    Object.defineProperty(e, t, {
      // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
      value: n,
      writable: !0,
      configurable: !0
    });
  } catch (r) {
    wt && h.log(`Failed to add non-enumerable property "${t}" to object`, e);
  }
}
function jn(e, t) {
  try {
    const n = t.prototype || {};
    e.prototype = t.prototype = n, Yt(e, "__sentry_original__", t);
  } catch (n) {
  }
}
function Ln(e) {
  return e.__sentry_original__;
}
function qe(e) {
  if (He(e))
    return u({
      message: e.message,
      name: e.name,
      stack: e.stack
    }, fe(e));
  if (Ge(e)) {
    const t = u({
      type: e.type,
      target: pe(e.target),
      currentTarget: pe(e.currentTarget)
    }, fe(e));
    return typeof CustomEvent != "undefined" && Rt(e, CustomEvent) && (t.detail = e.detail), t;
  } else
    return e;
}
function pe(e) {
  try {
    return Nn(e) ? Mn(e) : Object.prototype.toString.call(e);
  } catch (t) {
    return "<unknown>";
  }
}
function fe(e) {
  if (typeof e == "object" && e !== null) {
    const t = {};
    for (const n in e)
      Object.prototype.hasOwnProperty.call(e, n) && (t[n] = e[n]);
    return t;
  } else
    return {};
}
function Un(e, t = 40) {
  const n = Object.keys(qe(e));
  n.sort();
  const r = n[0];
  if (!r)
    return "[object has no keys]";
  if (r.length >= t)
    return Q(r, t);
  for (let s = n.length; s > 0; s--) {
    const i = n.slice(0, s).join(", ");
    if (!(i.length > t))
      return s === n.length ? i : Q(i, t);
  }
  return "";
}
function w(e) {
  return $t(e, /* @__PURE__ */ new Map());
}
function $t(e, t) {
  if (Hn(e)) {
    const n = t.get(e);
    if (n !== void 0)
      return n;
    const r = {};
    t.set(e, r);
    for (const s of Object.getOwnPropertyNames(e))
      typeof e[s] != "undefined" && (r[s] = $t(e[s], t));
    return r;
  }
  if (Array.isArray(e)) {
    const n = t.get(e);
    if (n !== void 0)
      return n;
    const r = [];
    return t.set(e, r), e.forEach((s) => {
      r.push($t(s, t));
    }), r;
  }
  return e;
}
function Hn(e) {
  if (!B(e))
    return !1;
  try {
    const t = Object.getPrototypeOf(e).constructor.name;
    return !t || t === "Object";
  } catch (t) {
    return !0;
  }
}
const We = 1e3;
function Y() {
  return Date.now() / We;
}
function Bn() {
  const { performance: e } = v;
  if (!e || !e.now)
    return Y;
  const t = Date.now() - e.now(), n = e.timeOrigin == null ? t : e.timeOrigin;
  return () => (n + e.now()) / We;
}
const Jt = Bn();
(() => {
  const { performance: e } = v;
  if (!e || !e.now)
    return;
  const t = 3600 * 1e3, n = e.now(), r = Date.now(), s = e.timeOrigin ? Math.abs(e.timeOrigin + n - r) : t, i = s < t, o = e.timing && e.timing.navigationStart, c = typeof o == "number" ? Math.abs(o + n - r) : t, l = c < t;
  return i || l ? s <= c ? e.timeOrigin : o : r;
})();
function O() {
  const e = v, t = e.crypto || e.msCrypto;
  let n = () => Math.random() * 16;
  try {
    if (t && t.randomUUID)
      return t.randomUUID().replace(/-/g, "");
    t && t.getRandomValues && (n = () => {
      const r = new Uint8Array(1);
      return t.getRandomValues(r), r[0];
    });
  } catch (r) {
  }
  return ("10000000100040008000" + 1e11).replace(
    /[018]/g,
    (r) => (
      // eslint-disable-next-line no-bitwise
      (r ^ (n() & 15) >> r / 4).toString(16)
    )
  );
}
function ze(e) {
  return e.exception && e.exception.values ? e.exception.values[0] : void 0;
}
function $(e) {
  const { message: t, event_id: n } = e;
  if (t)
    return t;
  const r = ze(e);
  return r ? r.type && r.value ? `${r.type}: ${r.value}` : r.type || r.value || n || "<unknown>" : n || "<unknown>";
}
function Gn(e, t, n) {
  const r = e.exception = e.exception || {}, s = r.values = r.values || [], i = s[0] = s[0] || {};
  i.value || (i.value = t || ""), i.type || (i.type = n || "Error");
}
function Ke(e, t) {
  const n = ze(e);
  if (!n)
    return;
  const r = { type: "generic", handled: !0 }, s = n.mechanism;
  if (n.mechanism = u(u(u({}, r), s), t), t && "data" in t) {
    const i = u(u({}, s && s.data), t.data);
    n.mechanism.data = i;
  }
}
function he(e) {
  if (qn(e))
    return !0;
  try {
    Yt(e, "__sentry_captured__", !0);
  } catch (t) {
  }
  return !1;
}
function qn(e) {
  try {
    return e.__sentry_captured__;
  } catch (t) {
  }
}
var P;
(function(e) {
  e[e.PENDING = 0] = "PENDING";
  const n = 1;
  e[e.RESOLVED = n] = "RESOLVED";
  const r = 2;
  e[e.REJECTED = r] = "REJECTED";
})(P || (P = {}));
function G(e) {
  return new J((t) => {
    t(e);
  });
}
function Ye(e) {
  return new J((t, n) => {
    n(e);
  });
}
let J = class C {
  constructor(t) {
    C.prototype.__init.call(this), C.prototype.__init2.call(this), C.prototype.__init3.call(this), C.prototype.__init4.call(this), this._state = P.PENDING, this._handlers = [];
    try {
      t(this._resolve, this._reject);
    } catch (n) {
      this._reject(n);
    }
  }
  /** JSDoc */
  then(t, n) {
    return new C((r, s) => {
      this._handlers.push([
        !1,
        (i) => {
          if (!t)
            r(i);
          else
            try {
              r(t(i));
            } catch (o) {
              s(o);
            }
        },
        (i) => {
          if (!n)
            s(i);
          else
            try {
              r(n(i));
            } catch (o) {
              s(o);
            }
        }
      ]), this._executeHandlers();
    });
  }
  /** JSDoc */
  catch(t) {
    return this.then((n) => n, t);
  }
  /** JSDoc */
  finally(t) {
    return new C((n, r) => {
      let s, i;
      return this.then(
        (o) => {
          i = !1, s = o, t && t();
        },
        (o) => {
          i = !0, s = o, t && t();
        }
      ).then(() => {
        if (i) {
          r(s);
          return;
        }
        n(s);
      });
    });
  }
  /** JSDoc */
  __init() {
    this._resolve = (t) => {
      this._setResult(P.RESOLVED, t);
    };
  }
  /** JSDoc */
  __init2() {
    this._reject = (t) => {
      this._setResult(P.REJECTED, t);
    };
  }
  /** JSDoc */
  __init3() {
    this._setResult = (t, n) => {
      if (this._state === P.PENDING) {
        if (Nt(n)) {
          n.then(this._resolve, this._reject);
          return;
        }
        this._state = t, this._value = n, this._executeHandlers();
      }
    };
  }
  /** JSDoc */
  __init4() {
    this._executeHandlers = () => {
      if (this._state === P.PENDING)
        return;
      const t = this._handlers.slice();
      this._handlers = [], t.forEach((n) => {
        n[0] || (this._state === P.RESOLVED && n[1](this._value), this._state === P.REJECTED && n[2](this._value), n[0] = !0);
      });
    };
  }
};
function Wn(e) {
  const t = Jt(), n = {
    sid: O(),
    init: !0,
    timestamp: t,
    started: t,
    duration: 0,
    status: "ok",
    errors: 0,
    ignoreDuration: !1,
    toJSON: () => Kn(n)
  };
  return e && q(n, e), n;
}
function q(e, t = {}) {
  if (t.user && (!e.ipAddress && t.user.ip_address && (e.ipAddress = t.user.ip_address), !e.did && !t.did && (e.did = t.user.id || t.user.email || t.user.username)), e.timestamp = t.timestamp || Jt(), t.abnormal_mechanism && (e.abnormal_mechanism = t.abnormal_mechanism), t.ignoreDuration && (e.ignoreDuration = t.ignoreDuration), t.sid && (e.sid = t.sid.length === 32 ? t.sid : O()), t.init !== void 0 && (e.init = t.init), !e.did && t.did && (e.did = `${t.did}`), typeof t.started == "number" && (e.started = t.started), e.ignoreDuration)
    e.duration = void 0;
  else if (typeof t.duration == "number")
    e.duration = t.duration;
  else {
    const n = e.timestamp - e.started;
    e.duration = n >= 0 ? n : 0;
  }
  t.release && (e.release = t.release), t.environment && (e.environment = t.environment), !e.ipAddress && t.ipAddress && (e.ipAddress = t.ipAddress), !e.userAgent && t.userAgent && (e.userAgent = t.userAgent), typeof t.errors == "number" && (e.errors = t.errors), t.status && (e.status = t.status);
}
function zn(e, t) {
  let n = {};
  e.status === "ok" && (n = { status: "exited" }), q(e, n);
}
function Kn(e) {
  return w({
    sid: `${e.sid}`,
    init: e.init,
    // Make sure that sec is converted to ms for date constructor
    started: new Date(e.started * 1e3).toISOString(),
    timestamp: new Date(e.timestamp * 1e3).toISOString(),
    status: e.status,
    errors: e.errors,
    did: typeof e.did == "number" || typeof e.did == "string" ? `${e.did}` : void 0,
    duration: e.duration,
    abnormal_mechanism: e.abnormal_mechanism,
    attrs: {
      release: e.release,
      environment: e.environment,
      ip_address: e.ipAddress,
      user_agent: e.userAgent
    }
  });
}
function me() {
  return O();
}
function Ct() {
  return O().substring(16);
}
function At(e, t, n = 2) {
  if (!t || typeof t != "object" || n <= 0)
    return t;
  if (e && t && Object.keys(t).length === 0)
    return e;
  const r = u({}, e);
  for (const s in t)
    Object.prototype.hasOwnProperty.call(t, s) && (r[s] = At(r[s], t[s], n - 1));
  return r;
}
const Ft = "_sentrySpan";
function ge(e, t) {
  t ? Yt(e, Ft, t) : delete e[Ft];
}
function _e(e) {
  return e[Ft];
}
const Yn = 100;
class Vt {
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
    this._notifyingListeners = !1, this._scopeListeners = [], this._eventProcessors = [], this._breadcrumbs = [], this._attachments = [], this._user = {}, this._tags = {}, this._extra = {}, this._contexts = {}, this._sdkProcessingMetadata = {}, this._propagationContext = {
      traceId: me(),
      spanId: Ct()
    };
  }
  /**
   * @inheritDoc
   */
  clone() {
    const t = new Vt();
    return t._breadcrumbs = [...this._breadcrumbs], t._tags = u({}, this._tags), t._extra = u({}, this._extra), t._contexts = u({}, this._contexts), this._contexts.flags && (t._contexts.flags = {
      values: [...this._contexts.flags.values]
    }), t._user = this._user, t._level = this._level, t._session = this._session, t._transactionName = this._transactionName, t._fingerprint = this._fingerprint, t._eventProcessors = [...this._eventProcessors], t._requestSession = this._requestSession, t._attachments = [...this._attachments], t._sdkProcessingMetadata = u({}, this._sdkProcessingMetadata), t._propagationContext = u({}, this._propagationContext), t._client = this._client, t._lastEventId = this._lastEventId, ge(t, _e(this)), t;
  }
  /**
   * @inheritDoc
   */
  setClient(t) {
    this._client = t;
  }
  /**
   * @inheritDoc
   */
  setLastEventId(t) {
    this._lastEventId = t;
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
  addScopeListener(t) {
    this._scopeListeners.push(t);
  }
  /**
   * @inheritDoc
   */
  addEventProcessor(t) {
    return this._eventProcessors.push(t), this;
  }
  /**
   * @inheritDoc
   */
  setUser(t) {
    return this._user = t || {
      email: void 0,
      id: void 0,
      ip_address: void 0,
      username: void 0
    }, this._session && q(this._session, { user: t }), this._notifyScopeListeners(), this;
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
  setRequestSession(t) {
    return this._requestSession = t, this;
  }
  /**
   * @inheritDoc
   */
  setTags(t) {
    return this._tags = u(u({}, this._tags), t), this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  setTag(t, n) {
    return this._tags = _(u({}, this._tags), { [t]: n }), this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  setExtras(t) {
    return this._extra = u(u({}, this._extra), t), this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  setExtra(t, n) {
    return this._extra = _(u({}, this._extra), { [t]: n }), this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  setFingerprint(t) {
    return this._fingerprint = t, this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  setLevel(t) {
    return this._level = t, this._notifyScopeListeners(), this;
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
  setTransactionName(t) {
    return this._transactionName = t, this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  setContext(t, n) {
    return n === null ? delete this._contexts[t] : this._contexts[t] = n, this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  setSession(t) {
    return t ? this._session = t : delete this._session, this._notifyScopeListeners(), this;
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
  update(t) {
    if (!t)
      return this;
    const n = typeof t == "function" ? t(this) : t, [r, s] = n instanceof M ? (
      // eslint-disable-next-line deprecation/deprecation
      [n.getScopeData(), n.getRequestSession()]
    ) : B(n) ? [t, t.requestSession] : [], { tags: i, extra: o, user: a, contexts: c, level: l, fingerprint: d = [], propagationContext: p } = r || {};
    return this._tags = u(u({}, this._tags), i), this._extra = u(u({}, this._extra), o), this._contexts = u(u({}, this._contexts), c), a && Object.keys(a).length && (this._user = a), l && (this._level = l), d.length && (this._fingerprint = d), p && (this._propagationContext = p), s && (this._requestSession = s), this;
  }
  /**
   * @inheritDoc
   */
  clear() {
    return this._breadcrumbs = [], this._tags = {}, this._extra = {}, this._user = {}, this._contexts = {}, this._level = void 0, this._transactionName = void 0, this._fingerprint = void 0, this._requestSession = void 0, this._session = void 0, ge(this, void 0), this._attachments = [], this.setPropagationContext({ traceId: me() }), this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  addBreadcrumb(t, n) {
    const r = typeof n == "number" ? n : Yn;
    if (r <= 0)
      return this;
    const s = u({
      timestamp: Y()
    }, t);
    return this._breadcrumbs.push(s), this._breadcrumbs.length > r && (this._breadcrumbs = this._breadcrumbs.slice(-r), this._client && this._client.recordDroppedEvent("buffer_overflow", "log_item")), this._notifyScopeListeners(), this;
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
    return this._breadcrumbs = [], this._notifyScopeListeners(), this;
  }
  /**
   * @inheritDoc
   */
  addAttachment(t) {
    return this._attachments.push(t), this;
  }
  /**
   * @inheritDoc
   */
  clearAttachments() {
    return this._attachments = [], this;
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
      span: _e(this)
    };
  }
  /**
   * @inheritDoc
   */
  setSDKProcessingMetadata(t) {
    return this._sdkProcessingMetadata = At(this._sdkProcessingMetadata, t, 2), this;
  }
  /**
   * @inheritDoc
   */
  setPropagationContext(t) {
    return this._propagationContext = u({
      // eslint-disable-next-line deprecation/deprecation
      spanId: Ct()
    }, t), this;
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
  captureException(t, n) {
    const r = n && n.event_id ? n.event_id : O();
    if (!this._client)
      return h.warn("No client configured on scope - will not capture exception!"), r;
    const s = new Error("Sentry syntheticException");
    return this._client.captureException(
      t,
      _(u({
        originalException: t,
        syntheticException: s
      }, n), {
        event_id: r
      }),
      this
    ), r;
  }
  /**
   * @inheritDoc
   */
  captureMessage(t, n, r) {
    const s = r && r.event_id ? r.event_id : O();
    if (!this._client)
      return h.warn("No client configured on scope - will not capture message!"), s;
    const i = new Error(t);
    return this._client.captureMessage(
      t,
      n,
      _(u({
        originalException: t,
        syntheticException: i
      }, r), {
        event_id: s
      }),
      this
    ), s;
  }
  /**
   * @inheritDoc
   */
  captureEvent(t, n) {
    const r = n && n.event_id ? n.event_id : O();
    return this._client ? (this._client.captureEvent(t, _(u({}, n), { event_id: r }), this), r) : (h.warn("No client configured on scope - will not capture event!"), r);
  }
  /**
   * This will be called on every set call.
   */
  _notifyScopeListeners() {
    this._notifyingListeners || (this._notifyingListeners = !0, this._scopeListeners.forEach((t) => {
      t(this);
    }), this._notifyingListeners = !1);
  }
}
const M = Vt;
function Jn() {
  return kt("defaultCurrentScope", () => new M());
}
function Vn() {
  return kt("defaultIsolationScope", () => new M());
}
class Xn {
  constructor(t, n) {
    let r;
    t ? r = t : r = new M();
    let s;
    n ? s = n : s = new M(), this._stack = [{ scope: r }], this._isolationScope = s;
  }
  /**
   * Fork a scope for the stack.
   */
  withScope(t) {
    const n = this._pushScope();
    let r;
    try {
      r = t(n);
    } catch (s) {
      throw this._popScope(), s;
    }
    return Nt(r) ? r.then(
      (s) => (this._popScope(), s),
      (s) => {
        throw this._popScope(), s;
      }
    ) : (this._popScope(), r);
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
    const t = this.getScope().clone();
    return this._stack.push({
      client: this.getClient(),
      scope: t
    }), t;
  }
  /**
   * Pop a scope from the stack.
   */
  _popScope() {
    return this._stack.length <= 1 ? !1 : !!this._stack.pop();
  }
}
function W() {
  const e = Ot(), t = Kt(e);
  return t.stack = t.stack || new Xn(Jn(), Vn());
}
function Zn(e) {
  return W().withScope(e);
}
function Qn(e, t) {
  const n = W();
  return n.withScope(() => (n.getStackTop().scope = e, t(e)));
}
function ye(e) {
  return W().withScope(() => e(W().getIsolationScope()));
}
function tr() {
  return {
    withIsolationScope: ye,
    withScope: Zn,
    withSetScope: Qn,
    withSetIsolationScope: (e, t) => ye(t),
    getCurrentScope: () => W().getScope(),
    getIsolationScope: () => W().getIsolationScope()
  };
}
function Xt(e) {
  const t = Kt(e);
  return t.acs ? t.acs : tr();
}
function I() {
  const e = Ot();
  return Xt(e).getCurrentScope();
}
function k() {
  const e = Ot();
  return Xt(e).getIsolationScope();
}
function er() {
  return kt("globalScope", () => new M());
}
function Je(...e) {
  const t = Ot(), n = Xt(t);
  if (e.length === 2) {
    const [r, s] = e;
    return r ? n.withSetScope(r, s) : n.withScope(s);
  }
  return n.withScope(e[0]);
}
function N() {
  return I().getClient();
}
function nr(e) {
  const t = e.getPropagationContext(), { traceId: n, spanId: r, parentSpanId: s } = t;
  return w({
    trace_id: n,
    span_id: r,
    parent_span_id: s
  });
}
const rr = "_sentryMetrics";
function sr(e) {
  const t = e[rr];
  if (!t)
    return;
  const n = {};
  for (const [, [r, s]] of t)
    (n[r] || (n[r] = [])).push(w(s));
  return n;
}
const ir = "sentry.source", or = "sentry.sample_rate", ar = "sentry.op", cr = "sentry.origin", ur = 0, lr = 1, dr = "sentry-", pr = /^sentry-/;
function fr(e) {
  const t = hr(e);
  if (!t)
    return;
  const n = Object.entries(t).reduce((r, [s, i]) => {
    if (s.match(pr)) {
      const o = s.slice(dr.length);
      r[o] = i;
    }
    return r;
  }, {});
  if (Object.keys(n).length > 0)
    return n;
}
function hr(e) {
  if (!(!e || !ft(e) && !Array.isArray(e)))
    return Array.isArray(e) ? e.reduce((t, n) => {
      const r = Se(n);
      return Object.entries(r).forEach(([s, i]) => {
        t[s] = i;
      }), t;
    }, {}) : Se(e);
}
function Se(e) {
  return e.split(",").map((t) => t.split("=").map((n) => decodeURIComponent(n.trim()))).reduce((t, [n, r]) => (n && r && (t[n] = r), t), {});
}
const mr = 1;
let Ee = !1;
function gr(e) {
  const { spanId: t, traceId: n, isRemote: r } = e.spanContext(), s = r ? t : Zt(e).parent_span_id, i = r ? Ct() : t;
  return w({
    parent_span_id: s,
    span_id: i,
    trace_id: n
  });
}
function be(e) {
  return typeof e == "number" ? Te(e) : Array.isArray(e) ? e[0] + e[1] / 1e9 : e instanceof Date ? Te(e.getTime()) : Jt();
}
function Te(e) {
  return e > 9999999999 ? e / 1e3 : e;
}
function Zt(e) {
  if (yr(e))
    return e.getSpanJSON();
  try {
    const { spanId: t, traceId: n } = e.spanContext();
    if (_r(e)) {
      const { attributes: r, startTime: s, name: i, endTime: o, parentSpanId: a, status: c } = e;
      return w({
        span_id: t,
        trace_id: n,
        data: r,
        description: i,
        parent_span_id: a,
        start_timestamp: be(s),
        // This is [0,0] by default in OTEL, in which case we want to interpret this as no end time
        timestamp: be(o) || void 0,
        status: Er(c),
        op: r[ar],
        origin: r[cr],
        _metrics_summary: sr(e)
      });
    }
    return {
      span_id: t,
      trace_id: n
    };
  } catch (t) {
    return {};
  }
}
function _r(e) {
  const t = e;
  return !!t.attributes && !!t.startTime && !!t.name && !!t.endTime && !!t.status;
}
function yr(e) {
  return typeof e.getSpanJSON == "function";
}
function Sr(e) {
  const { traceFlags: t } = e.spanContext();
  return t === mr;
}
function Er(e) {
  if (!(!e || e.code === ur))
    return e.code === lr ? "ok" : e.message || "unknown_error";
}
const br = "_sentryRootSpan";
function Ve(e) {
  return e[br] || e;
}
function Tr() {
  Ee || (z(() => {
    console.warn(
      "[Sentry] Deprecation warning: Returning null from `beforeSendSpan` will be disallowed from SDK version 9.0.0 onwards. The callback will only support mutating spans. To drop certain spans, configure the respective integrations directly."
    );
  }), Ee = !0);
}
function Ir(e) {
  if (typeof __SENTRY_TRACING__ == "boolean" && !__SENTRY_TRACING__)
    return !1;
  const t = N(), n = t && t.getOptions();
  return !!n && (n.enableTracing || "tracesSampleRate" in n || "tracesSampler" in n);
}
const Qt = "production", vr = "_frozenDsc";
function Xe(e, t) {
  const n = t.getOptions(), { publicKey: r } = t.getDsn() || {}, s = w({
    environment: n.environment || Qt,
    release: n.release,
    public_key: r,
    trace_id: e
  });
  return t.emit("createDsc", s), s;
}
function kr(e, t) {
  const n = t.getPropagationContext();
  return n.dsc || Xe(n.traceId, e);
}
function wr(e) {
  const t = N();
  if (!t)
    return {};
  const n = Ve(e), r = n[vr];
  if (r)
    return r;
  const s = n.spanContext().traceState, i = s && s.get("sentry.dsc"), o = i && fr(i);
  if (o)
    return o;
  const a = Xe(e.spanContext().traceId, t), c = Zt(n), l = c.data || {}, d = l[or];
  d != null && (a.sample_rate = `${d}`);
  const p = l[ir], m = c.description;
  return p !== "url" && m && (a.transaction = m), Ir() && (a.sampled = String(Sr(n))), t.emit("createDsc", a, n), a;
}
function Or(e) {
  if (typeof e == "boolean")
    return Number(e);
  const t = typeof e == "string" ? parseFloat(e) : e;
  if (typeof t != "number" || isNaN(t) || t < 0 || t > 1) {
    S && h.warn(
      `[Tracing] Given sample rate is invalid. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
        e
      )} of type ${JSON.stringify(typeof e)}.`
    );
    return;
  }
  return t;
}
const Nr = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+)?)?@)([\w.-]+)(?::(\d+))?\/(.+)/;
function Rr(e) {
  return e === "http" || e === "https";
}
function te(e, t = !1) {
  const { host: n, path: r, pass: s, port: i, projectId: o, protocol: a, publicKey: c } = e;
  return `${a}://${c}${t && s ? `:${s}` : ""}@${n}${i ? `:${i}` : ""}/${r && `${r}/`}${o}`;
}
function Dr(e) {
  const t = Nr.exec(e);
  if (!t) {
    z(() => {
      console.error(`Invalid Sentry Dsn: ${e}`);
    });
    return;
  }
  const [n, r, s = "", i = "", o = "", a = ""] = t.slice(1);
  let c = "", l = a;
  const d = l.split("/");
  if (d.length > 1 && (c = d.slice(0, -1).join("/"), l = d.pop()), l) {
    const p = l.match(/^\d+/);
    p && (l = p[0]);
  }
  return Ze({ host: i, pass: s, path: c, projectId: l, port: o, protocol: n, publicKey: r });
}
function Ze(e) {
  return {
    protocol: e.protocol,
    publicKey: e.publicKey || "",
    pass: e.pass || "",
    host: e.host,
    port: e.port || "",
    path: e.path || "",
    projectId: e.projectId
  };
}
function Ar(e) {
  if (!wt)
    return !0;
  const { port: t, projectId: n, protocol: r } = e;
  return ["protocol", "publicKey", "host", "projectId"].find((o) => e[o] ? !1 : (h.error(`Invalid Sentry Dsn: ${o} missing`), !0)) ? !1 : n.match(/^\d+$/) ? Rr(r) ? t && isNaN(parseInt(t, 10)) ? (h.error(`Invalid Sentry Dsn: Invalid port ${t}`), !1) : !0 : (h.error(`Invalid Sentry Dsn: Invalid protocol ${r}`), !1) : (h.error(`Invalid Sentry Dsn: Invalid projectId ${n}`), !1);
}
function Pr(e) {
  const t = typeof e == "string" ? Dr(e) : Ze(e);
  if (!(!t || !Ar(t)))
    return t;
}
function xr() {
  const e = typeof WeakSet == "function", t = e ? /* @__PURE__ */ new WeakSet() : [];
  function n(s) {
    if (e)
      return t.has(s) ? !0 : (t.add(s), !1);
    for (let i = 0; i < t.length; i++)
      if (t[i] === s)
        return !0;
    return t.push(s), !1;
  }
  function r(s) {
    if (e)
      t.delete(s);
    else
      for (let i = 0; i < t.length; i++)
        if (t[i] === s) {
          t.splice(i, 1);
          break;
        }
  }
  return [n, r];
}
function A(e, t = 100, n = 1 / 0) {
  try {
    return jt("", e, t, n);
  } catch (r) {
    return { ERROR: `**non-serializable** (${r})` };
  }
}
function Qe(e, t = 3, n = 100 * 1024) {
  const r = A(e, t);
  return Fr(r) > n ? Qe(e, t - 1, n) : r;
}
function jt(e, t, n = 1 / 0, r = 1 / 0, s = xr()) {
  const [i, o] = s;
  if (t == null || // this matches null and undefined -> eqeq not eqeqeq
  ["boolean", "string"].includes(typeof t) || typeof t == "number" && Number.isFinite(t))
    return t;
  const a = Mr(e, t);
  if (!a.startsWith("[object "))
    return a;
  if (t.__sentry_skip_normalization__)
    return t;
  const c = typeof t.__sentry_override_normalization_depth__ == "number" ? t.__sentry_override_normalization_depth__ : n;
  if (c === 0)
    return a.replace("object ", "");
  if (i(t))
    return "[Circular ~]";
  const l = t;
  if (l && typeof l.toJSON == "function")
    try {
      const g = l.toJSON();
      return jt("", g, c - 1, r, s);
    } catch (g) {
    }
  const d = Array.isArray(t) ? [] : {};
  let p = 0;
  const m = qe(t);
  for (const g in m) {
    if (!Object.prototype.hasOwnProperty.call(m, g))
      continue;
    if (p >= r) {
      d[g] = "[MaxProperties ~]";
      break;
    }
    const f = m[g];
    d[g] = jt(g, f, c - 1, r, s), p++;
  }
  return o(t), d;
}
function Mr(e, t) {
  try {
    if (e === "domain" && t && typeof t == "object" && t._events)
      return "[Domain]";
    if (e === "domainEmitter")
      return "[DomainEmitter]";
    if (typeof global != "undefined" && t === global)
      return "[Global]";
    if (typeof window != "undefined" && t === window)
      return "[Window]";
    if (typeof document != "undefined" && t === document)
      return "[Document]";
    if (An(t))
      return "[VueViewModel]";
    if (Dn(t))
      return "[SyntheticEvent]";
    if (typeof t == "number" && !Number.isFinite(t))
      return `[${t}]`;
    if (typeof t == "function")
      return `[Function: ${In(t)}]`;
    if (typeof t == "symbol")
      return `[${String(t)}]`;
    if (typeof t == "bigint")
      return `[BigInt: ${String(t)}]`;
    const n = $r(t);
    return /^HTML(\w*)Element$/.test(n) ? `[HTMLElement: ${n}]` : `[object ${n}]`;
  } catch (n) {
    return `**non-serializable** (${n})`;
  }
}
function $r(e) {
  const t = Object.getPrototypeOf(e);
  return t ? t.constructor.name : "null prototype";
}
function Cr(e) {
  return ~-encodeURI(e).split(/%..|./).length;
}
function Fr(e) {
  return Cr(JSON.stringify(e));
}
function Pt(e, t = []) {
  return [e, t];
}
function jr(e, t) {
  const [n, r] = e;
  return [n, [...r, t]];
}
function Ie(e, t) {
  const n = e[1];
  for (const r of n) {
    const s = r[0].type;
    if (t(r, s))
      return !0;
  }
  return !1;
}
function Lt(e) {
  return v.__SENTRY__ && v.__SENTRY__.encodePolyfill ? v.__SENTRY__.encodePolyfill(e) : new TextEncoder().encode(e);
}
function Lr(e) {
  const [t, n] = e;
  let r = JSON.stringify(t);
  function s(i) {
    typeof r == "string" ? r = typeof i == "string" ? r + i : [Lt(r), i] : r.push(typeof i == "string" ? Lt(i) : i);
  }
  for (const i of n) {
    const [o, a] = i;
    if (s(`
${JSON.stringify(o)}
`), typeof a == "string" || a instanceof Uint8Array)
      s(a);
    else {
      let c;
      try {
        c = JSON.stringify(a);
      } catch (l) {
        c = JSON.stringify(A(a));
      }
      s(c);
    }
  }
  return typeof r == "string" ? r : Ur(r);
}
function Ur(e) {
  const t = e.reduce((s, i) => s + i.length, 0), n = new Uint8Array(t);
  let r = 0;
  for (const s of e)
    n.set(s, r), r += s.length;
  return n;
}
function Hr(e) {
  const t = typeof e.data == "string" ? Lt(e.data) : e.data;
  return [
    w({
      type: "attachment",
      length: t.length,
      filename: e.filename,
      content_type: e.contentType,
      attachment_type: e.attachmentType
    }),
    t
  ];
}
const Br = {
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
function ve(e) {
  return Br[e];
}
function tn(e) {
  if (!e || !e.sdk)
    return;
  const { name: t, version: n } = e.sdk;
  return { name: t, version: n };
}
function Gr(e, t, n, r) {
  const s = e.sdkProcessingMetadata && e.sdkProcessingMetadata.dynamicSamplingContext;
  return u(u(u({
    event_id: e.event_id,
    sent_at: (/* @__PURE__ */ new Date()).toISOString()
  }, t && { sdk: t }), !!n && r && { dsn: te(r) }), s && {
    trace: w(u({}, s))
  });
}
function qr(e, t) {
  return t && (e.sdk = e.sdk || {}, e.sdk.name = e.sdk.name || t.name, e.sdk.version = e.sdk.version || t.version, e.sdk.integrations = [...e.sdk.integrations || [], ...t.integrations || []], e.sdk.packages = [...e.sdk.packages || [], ...t.packages || []]), e;
}
function Wr(e, t, n, r) {
  const s = tn(n), i = u(u({
    sent_at: (/* @__PURE__ */ new Date()).toISOString()
  }, s && { sdk: s }), !!r && t && { dsn: te(t) }), o = "aggregates" in e ? [{ type: "sessions" }, e] : [{ type: "session" }, e.toJSON()];
  return Pt(i, [o]);
}
function zr(e, t, n, r) {
  const s = tn(n), i = e.type && e.type !== "replay_event" ? e.type : "event";
  qr(e, n && n.sdk);
  const o = Gr(e, s, r, t);
  return delete e.sdkProcessingMetadata, Pt(o, [[{ type: i }, e]]);
}
function Ut(e, t, n, r = 0) {
  return new J((s, i) => {
    const o = e[r];
    if (t === null || typeof o != "function")
      s(t);
    else {
      const a = o(u({}, t), n);
      S && o.id && a === null && h.log(`Event processor "${o.id}" dropped event`), Nt(a) ? a.then((c) => Ut(e, c, n, r + 1).then(s)).then(null, i) : Ut(e, a, n, r + 1).then(s).then(null, i);
    }
  });
}
let ct, ke, ut;
function Kr(e) {
  const t = v._sentryDebugIds;
  if (!t)
    return {};
  const n = Object.keys(t);
  return ut && n.length === ke || (ke = n.length, ut = n.reduce((r, s) => {
    ct || (ct = {});
    const i = ct[s];
    if (i)
      r[i[0]] = i[1];
    else {
      const o = e(s);
      for (let a = o.length - 1; a >= 0; a--) {
        const c = o[a], l = c && c.filename, d = t[s];
        if (l && d) {
          r[l] = d, ct[s] = [l, d];
          break;
        }
      }
    }
    return r;
  }, {})), ut;
}
function Yr(e, t) {
  const { fingerprint: n, span: r, breadcrumbs: s, sdkProcessingMetadata: i } = t;
  Jr(e, t), r && Zr(e, r), Qr(e, n), Vr(e, s), Xr(e, i);
}
function we(e, t) {
  const {
    extra: n,
    tags: r,
    user: s,
    contexts: i,
    level: o,
    sdkProcessingMetadata: a,
    breadcrumbs: c,
    fingerprint: l,
    eventProcessors: d,
    attachments: p,
    propagationContext: m,
    transactionName: g,
    span: f
  } = t;
  lt(e, "extra", n), lt(e, "tags", r), lt(e, "user", s), lt(e, "contexts", i), e.sdkProcessingMetadata = At(e.sdkProcessingMetadata, a, 2), o && (e.level = o), g && (e.transactionName = g), f && (e.span = f), c.length && (e.breadcrumbs = [...e.breadcrumbs, ...c]), l.length && (e.fingerprint = [...e.fingerprint, ...l]), d.length && (e.eventProcessors = [...e.eventProcessors, ...d]), p.length && (e.attachments = [...e.attachments, ...p]), e.propagationContext = u(u({}, e.propagationContext), m);
}
function lt(e, t, n) {
  e[t] = At(e[t], n, 1);
}
function Jr(e, t) {
  const { extra: n, tags: r, user: s, contexts: i, level: o, transactionName: a } = t, c = w(n);
  c && Object.keys(c).length && (e.extra = u(u({}, c), e.extra));
  const l = w(r);
  l && Object.keys(l).length && (e.tags = u(u({}, l), e.tags));
  const d = w(s);
  d && Object.keys(d).length && (e.user = u(u({}, d), e.user));
  const p = w(i);
  p && Object.keys(p).length && (e.contexts = u(u({}, p), e.contexts)), o && (e.level = o), a && e.type !== "transaction" && (e.transaction = a);
}
function Vr(e, t) {
  const n = [...e.breadcrumbs || [], ...t];
  e.breadcrumbs = n.length ? n : void 0;
}
function Xr(e, t) {
  e.sdkProcessingMetadata = u(u({}, e.sdkProcessingMetadata), t);
}
function Zr(e, t) {
  e.contexts = u({
    trace: gr(t)
  }, e.contexts), e.sdkProcessingMetadata = u({
    dynamicSamplingContext: wr(t)
  }, e.sdkProcessingMetadata);
  const n = Ve(t), r = Zt(n).description;
  r && !e.transaction && e.type === "transaction" && (e.transaction = r);
}
function Qr(e, t) {
  e.fingerprint = e.fingerprint ? Array.isArray(e.fingerprint) ? e.fingerprint : [e.fingerprint] : [], t && (e.fingerprint = e.fingerprint.concat(t)), e.fingerprint && !e.fingerprint.length && delete e.fingerprint;
}
function ts(e, t, n, r, s, i) {
  const { normalizeDepth: o = 3, normalizeMaxBreadth: a = 1e3 } = e, c = _(u({}, t), {
    event_id: t.event_id || n.event_id || O(),
    timestamp: t.timestamp || Y()
  }), l = n.integrations || e.integrations.map((T) => T.name);
  es(c, e), ss(c, l), s && s.emit("applyFrameMetadata", t), t.type === void 0 && ns(c, e.stackParser);
  const d = os(r, n.captureContext);
  n.mechanism && Ke(c, n.mechanism);
  const p = s ? s.getEventProcessors() : [], m = er().getScopeData();
  if (i) {
    const T = i.getScopeData();
    we(m, T);
  }
  if (d) {
    const T = d.getScopeData();
    we(m, T);
  }
  const g = [...n.attachments || [], ...m.attachments];
  g.length && (n.attachments = g), Yr(c, m);
  const f = [
    ...p,
    // Run scope event processors _after_ all other processors
    ...m.eventProcessors
  ];
  return Ut(f, c, n).then((T) => (T && rs(T), typeof o == "number" && o > 0 ? is(T, o, a) : T));
}
function es(e, t) {
  const { environment: n, release: r, dist: s, maxValueLength: i = 250 } = t;
  e.environment = e.environment || n || Qt, !e.release && r && (e.release = r), !e.dist && s && (e.dist = s), e.message && (e.message = Q(e.message, i));
  const o = e.exception && e.exception.values && e.exception.values[0];
  o && o.value && (o.value = Q(o.value, i));
  const a = e.request;
  a && a.url && (a.url = Q(a.url, i));
}
function ns(e, t) {
  const n = Kr(t);
  try {
    e.exception.values.forEach((r) => {
      r.stacktrace.frames.forEach((s) => {
        n && s.filename && (s.debug_id = n[s.filename]);
      });
    });
  } catch (r) {
  }
}
function rs(e) {
  const t = {};
  try {
    e.exception.values.forEach((r) => {
      r.stacktrace.frames.forEach((s) => {
        s.debug_id && (s.abs_path ? t[s.abs_path] = s.debug_id : s.filename && (t[s.filename] = s.debug_id), delete s.debug_id);
      });
    });
  } catch (r) {
  }
  if (Object.keys(t).length === 0)
    return;
  e.debug_meta = e.debug_meta || {}, e.debug_meta.images = e.debug_meta.images || [];
  const n = e.debug_meta.images;
  Object.entries(t).forEach(([r, s]) => {
    n.push({
      type: "sourcemap",
      code_file: r,
      debug_id: s
    });
  });
}
function ss(e, t) {
  t.length > 0 && (e.sdk = e.sdk || {}, e.sdk.integrations = [...e.sdk.integrations || [], ...t]);
}
function is(e, t, n) {
  if (!e)
    return null;
  const r = u(u(u(u(u({}, e), e.breadcrumbs && {
    breadcrumbs: e.breadcrumbs.map((s) => u(u({}, s), s.data && {
      data: A(s.data, t, n)
    }))
  }), e.user && {
    user: A(e.user, t, n)
  }), e.contexts && {
    contexts: A(e.contexts, t, n)
  }), e.extra && {
    extra: A(e.extra, t, n)
  });
  return e.contexts && e.contexts.trace && r.contexts && (r.contexts.trace = e.contexts.trace, e.contexts.trace.data && (r.contexts.trace.data = A(e.contexts.trace.data, t, n))), e.spans && (r.spans = e.spans.map((s) => u(u({}, s), s.data && {
    data: A(s.data, t, n)
  }))), e.contexts && e.contexts.flags && r.contexts && (r.contexts.flags = A(e.contexts.flags, 3, n)), r;
}
function os(e, t) {
  if (!t)
    return e;
  const n = e ? e.clone() : new M();
  return n.update(t), n;
}
function as(e) {
  if (e)
    return cs(e) ? { captureContext: e } : ls(e) ? {
      captureContext: e
    } : e;
}
function cs(e) {
  return e instanceof M || typeof e == "function";
}
const us = [
  "user",
  "level",
  "extra",
  "contexts",
  "tags",
  "fingerprint",
  "requestSession",
  "propagationContext"
];
function ls(e) {
  return Object.keys(e).some((t) => us.includes(t));
}
function ds(e, t) {
  return I().captureException(e, as(t));
}
function ro(e, t) {
  const n = typeof t == "string" ? t : void 0, r = typeof t != "string" ? { captureContext: t } : void 0;
  return I().captureMessage(e, n, r);
}
function en(e, t) {
  return I().captureEvent(e, t);
}
function ps(e, t) {
  k().setContext(e, t);
}
function fs(e) {
  k().setExtras(e);
}
function hs(e, t) {
  k().setExtra(e, t);
}
function ms(e) {
  k().setTags(e);
}
function gs(e, t) {
  k().setTag(e, t);
}
function _s(e) {
  k().setUser(e);
}
function nn() {
  return k().lastEventId();
}
function xt(e) {
  k().addEventProcessor(e);
}
function ys(e) {
  const t = N(), n = k(), r = I(), { release: s, environment: i = Qt } = t && t.getOptions() || {}, { userAgent: o } = v.navigator || {}, a = Wn(u(u({
    release: s,
    environment: i,
    user: r.getUser() || n.getUser()
  }, o && { userAgent: o }), e)), c = n.getSession();
  return c && c.status === "ok" && q(c, { status: "exited" }), Ht(), n.setSession(a), r.setSession(a), a;
}
function Ht() {
  const e = k(), t = I(), n = t.getSession() || e.getSession();
  n && zn(n), Ss(), e.setSession(), t.setSession();
}
function Ss() {
  const e = k(), t = I(), n = N(), r = t.getSession() || e.getSession();
  r && n && n.captureSession(r);
}
const Es = "7";
function bs(e) {
  const t = e.protocol ? `${e.protocol}:` : "", n = e.port ? `:${e.port}` : "";
  return `${t}//${e.host}${n}${e.path ? `/${e.path}` : ""}/api/`;
}
function Ts(e) {
  return `${bs(e)}${e.projectId}/envelope/`;
}
function Is(e, t) {
  const n = {
    sentry_version: Es
  };
  return e.publicKey && (n.sentry_key = e.publicKey), t && (n.sentry_client = `${t.name}/${t.version}`), new URLSearchParams(n).toString();
}
function vs(e, t, n) {
  return t || `${Ts(e)}?${Is(e, n)}`;
}
const Oe = [];
function ks(e, t) {
  const n = {};
  return t.forEach((r) => {
    r && rn(e, r, n);
  }), n;
}
function Ne(e, t) {
  for (const n of t)
    n && n.afterAllSetup && n.afterAllSetup(e);
}
function rn(e, t, n) {
  if (n[t.name]) {
    S && h.log(`Integration skipped because it was already installed: ${t.name}`);
    return;
  }
  if (n[t.name] = t, Oe.indexOf(t.name) === -1 && typeof t.setupOnce == "function" && (t.setupOnce(), Oe.push(t.name)), t.setup && typeof t.setup == "function" && t.setup(e), typeof t.preprocessEvent == "function") {
    const r = t.preprocessEvent.bind(t);
    e.on("preprocessEvent", (s, i) => r(s, i, e));
  }
  if (typeof t.processEvent == "function") {
    const r = t.processEvent.bind(t), s = Object.assign((i, o) => r(i, o, e), {
      id: t.name
    });
    e.addEventProcessor(s);
  }
  S && h.log(`Integration installed: ${t.name}`);
}
function ws(e, t, n) {
  const r = [
    { type: "client_report" },
    {
      timestamp: n || Y(),
      discarded_events: e
    }
  ];
  return Pt(t ? { dsn: t } : {}, [r]);
}
class R extends Error {
  constructor(t, n = "warn") {
    super(t), this.message = t, this.logLevel = n;
  }
}
const Re = "Not capturing exception because it's already been captured.";
class Os {
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
  constructor(t) {
    if (this._options = t, this._integrations = {}, this._numProcessing = 0, this._outcomes = {}, this._hooks = {}, this._eventProcessors = [], t.dsn ? this._dsn = Pr(t.dsn) : S && h.warn("No DSN provided, client will not send events."), this._dsn) {
      const s = vs(
        this._dsn,
        t.tunnel,
        t._metadata ? t._metadata.sdk : void 0
      );
      this._transport = t.transport(_(u({
        tunnel: this._options.tunnel,
        recordDroppedEvent: this.recordDroppedEvent.bind(this)
      }, t.transportOptions), {
        url: s
      }));
    }
    const r = ["enableTracing", "tracesSampleRate", "tracesSampler"].find((s) => s in t && t[s] == null);
    r && z(() => {
      console.warn(
        `[Sentry] Deprecation warning: \`${r}\` is set to undefined, which leads to tracing being enabled. In v9, a value of \`undefined\` will result in tracing being disabled.`
      );
    });
  }
  /**
   * @inheritDoc
   */
  captureException(t, n, r) {
    const s = O();
    if (he(t))
      return S && h.log(Re), s;
    const i = u({
      event_id: s
    }, n);
    return this._process(
      this.eventFromException(t, i).then(
        (o) => this._captureEvent(o, i, r)
      )
    ), i.event_id;
  }
  /**
   * @inheritDoc
   */
  captureMessage(t, n, r, s) {
    const i = u({
      event_id: O()
    }, r), o = Be(t) ? t : String(t), a = On(t) ? this.eventFromMessage(o, n, i) : this.eventFromException(t, i);
    return this._process(a.then((c) => this._captureEvent(c, i, s))), i.event_id;
  }
  /**
   * @inheritDoc
   */
  captureEvent(t, n, r) {
    const s = O();
    if (n && n.originalException && he(n.originalException))
      return S && h.log(Re), s;
    const i = u({
      event_id: s
    }, n), a = (t.sdkProcessingMetadata || {}).capturedSpanScope;
    return this._process(this._captureEvent(t, i, a || r)), i.event_id;
  }
  /**
   * @inheritDoc
   */
  captureSession(t) {
    typeof t.release != "string" ? S && h.warn("Discarded session because of missing or non-string release") : (this.sendSession(t), q(t, { init: !1 }));
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
  flush(t) {
    const n = this._transport;
    return n ? (this.emit("flush"), this._isClientDoneProcessing(t).then((r) => n.flush(t).then((s) => r && s))) : G(!0);
  }
  /**
   * @inheritDoc
   */
  close(t) {
    return this.flush(t).then((n) => (this.getOptions().enabled = !1, this.emit("close"), n));
  }
  /** Get all installed event processors. */
  getEventProcessors() {
    return this._eventProcessors;
  }
  /** @inheritDoc */
  addEventProcessor(t) {
    this._eventProcessors.push(t);
  }
  /** @inheritdoc */
  init() {
    (this._isEnabled() || // Force integrations to be setup even if no DSN was set when we have
    // Spotlight enabled. This is particularly important for browser as we
    // don't support the `spotlight` option there and rely on the users
    // adding the `spotlightBrowserIntegration()` to their integrations which
    // wouldn't get initialized with the check below when there's no DSN set.
    this._options.integrations.some(({ name: t }) => t.startsWith("Spotlight"))) && this._setupIntegrations();
  }
  /**
   * Gets an installed integration by its name.
   *
   * @returns The installed integration or `undefined` if no integration with that `name` was installed.
   */
  getIntegrationByName(t) {
    return this._integrations[t];
  }
  /**
   * @inheritDoc
   */
  addIntegration(t) {
    const n = this._integrations[t.name];
    rn(this, t, this._integrations), n || Ne(this, [t]);
  }
  /**
   * @inheritDoc
   */
  sendEvent(t, n = {}) {
    this.emit("beforeSendEvent", t, n);
    let r = zr(t, this._dsn, this._options._metadata, this._options.tunnel);
    for (const i of n.attachments || [])
      r = jr(r, Hr(i));
    const s = this.sendEnvelope(r);
    s && s.then((i) => this.emit("afterSendEvent", t, i), null);
  }
  /**
   * @inheritDoc
   */
  sendSession(t) {
    const n = Wr(t, this._dsn, this._options._metadata, this._options.tunnel);
    this.sendEnvelope(n);
  }
  /**
   * @inheritDoc
   */
  recordDroppedEvent(t, n, r) {
    if (this._options.sendClientReports) {
      const s = typeof r == "number" ? r : 1, i = `${t}:${n}`;
      S && h.log(`Recording outcome: "${i}"${s > 1 ? ` (${s} times)` : ""}`), this._outcomes[i] = (this._outcomes[i] || 0) + s;
    }
  }
  // Keep on() & emit() signatures in sync with types' client.ts interface
  /* eslint-disable @typescript-eslint/unified-signatures */
  /** @inheritdoc */
  /** @inheritdoc */
  on(t, n) {
    const r = this._hooks[t] = this._hooks[t] || [];
    return r.push(n), () => {
      const s = r.indexOf(n);
      s > -1 && r.splice(s, 1);
    };
  }
  /** @inheritdoc */
  /** @inheritdoc */
  emit(t, ...n) {
    const r = this._hooks[t];
    r && r.forEach((s) => s(...n));
  }
  /**
   * @inheritdoc
   */
  sendEnvelope(t) {
    return this.emit("beforeEnvelope", t), this._isEnabled() && this._transport ? this._transport.send(t).then(null, (n) => (S && h.error("Error while sending envelope:", n), n)) : (S && h.error("Transport disabled"), G({}));
  }
  /* eslint-enable @typescript-eslint/unified-signatures */
  /** Setup integrations for this client. */
  _setupIntegrations() {
    const { integrations: t } = this._options;
    this._integrations = ks(this, t), Ne(this, t);
  }
  /** Updates existing session based on the provided event */
  _updateSessionFromEvent(t, n) {
    let r = n.level === "fatal", s = !1;
    const i = n.exception && n.exception.values;
    if (i) {
      s = !0;
      for (const c of i) {
        const l = c.mechanism;
        if (l && l.handled === !1) {
          r = !0;
          break;
        }
      }
    }
    const o = t.status === "ok";
    (o && t.errors === 0 || o && r) && (q(t, _(u({}, r && { status: "crashed" }), {
      errors: t.errors || Number(s || r)
    })), this.captureSession(t));
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
  _isClientDoneProcessing(t) {
    return new J((n) => {
      let r = 0;
      const s = 1, i = setInterval(() => {
        this._numProcessing == 0 ? (clearInterval(i), n(!0)) : (r += s, t && r >= t && (clearInterval(i), n(!1)));
      }, s);
    });
  }
  /** Determines whether this SDK is enabled and a transport is present. */
  _isEnabled() {
    return this.getOptions().enabled !== !1 && this._transport !== void 0;
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
  _prepareEvent(t, n, r = I(), s = k()) {
    const i = this.getOptions(), o = Object.keys(this._integrations);
    return !n.integrations && o.length > 0 && (n.integrations = o), this.emit("preprocessEvent", t, n), t.type || s.setLastEventId(t.event_id || n.event_id), ts(i, t, n, r, this, s).then((a) => {
      if (a === null)
        return a;
      a.contexts = u({
        trace: nr(r)
      }, a.contexts);
      const c = kr(this, r);
      return a.sdkProcessingMetadata = u({
        dynamicSamplingContext: c
      }, a.sdkProcessingMetadata), a;
    });
  }
  /**
   * Processes the event and logs an error in case of rejection
   * @param event
   * @param hint
   * @param scope
   */
  _captureEvent(t, n = {}, r) {
    return this._processEvent(t, n, r).then(
      (s) => s.event_id,
      (s) => {
        S && (s instanceof R && s.logLevel === "log" ? h.log(s.message) : h.warn(s));
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
  _processEvent(t, n, r) {
    const s = this.getOptions(), { sampleRate: i } = s, o = on(t), a = sn(t), c = t.type || "error", l = `before send for type \`${c}\``, d = typeof i == "undefined" ? void 0 : Or(i);
    if (a && typeof d == "number" && Math.random() > d)
      return this.recordDroppedEvent("sample_rate", "error", t), Ye(
        new R(
          `Discarding event because it's not included in the random sample (sampling rate = ${i})`,
          "log"
        )
      );
    const p = c === "replay_event" ? "replay" : c, g = (t.sdkProcessingMetadata || {}).capturedSpanIsolationScope;
    return this._prepareEvent(t, n, r, g).then((f) => {
      if (f === null)
        throw this.recordDroppedEvent("event_processor", p, t), new R("An event processor returned `null`, will not send event.", "log");
      if (n.data && n.data.__sentry__ === !0)
        return f;
      const T = Rs(this, s, f, n);
      return Ns(T, l);
    }).then((f) => {
      if (f === null) {
        if (this.recordDroppedEvent("before_send", p, t), o) {
          const V = 1 + (t.spans || []).length;
          this.recordDroppedEvent("before_send", "span", V);
        }
        throw new R(`${l} returned \`null\`, will not send event.`, "log");
      }
      const x = r && r.getSession();
      if (!o && x && this._updateSessionFromEvent(x, f), o) {
        const L = f.sdkProcessingMetadata && f.sdkProcessingMetadata.spanCountBeforeProcessing || 0, V = f.spans ? f.spans.length : 0, ot = L - V;
        ot > 0 && this.recordDroppedEvent("before_send", "span", ot);
      }
      const T = f.transaction_info;
      if (o && T && f.transaction !== t.transaction) {
        const L = "custom";
        f.transaction_info = _(u({}, T), {
          source: L
        });
      }
      return this.sendEvent(f, n), f;
    }).then(null, (f) => {
      throw f instanceof R ? f : (this.captureException(f, {
        data: {
          __sentry__: !0
        },
        originalException: f
      }), new R(
        `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.
Reason: ${f}`
      ));
    });
  }
  /**
   * Occupies the client with processing and event
   */
  _process(t) {
    this._numProcessing++, t.then(
      (n) => (this._numProcessing--, n),
      (n) => (this._numProcessing--, n)
    );
  }
  /**
   * Clears outcomes on this client and returns them.
   */
  _clearOutcomes() {
    const t = this._outcomes;
    return this._outcomes = {}, Object.entries(t).map(([n, r]) => {
      const [s, i] = n.split(":");
      return {
        reason: s,
        category: i,
        quantity: r
      };
    });
  }
  /**
   * Sends client reports as an envelope.
   */
  _flushOutcomes() {
    S && h.log("Flushing outcomes...");
    const t = this._clearOutcomes();
    if (t.length === 0) {
      S && h.log("No outcomes to send");
      return;
    }
    if (!this._dsn) {
      S && h.log("No dsn provided, will not send outcomes");
      return;
    }
    S && h.log("Sending outcomes:", t);
    const n = ws(t, this._options.tunnel && te(this._dsn));
    this.sendEnvelope(n);
  }
  /**
   * @inheritDoc
   */
}
function Ns(e, t) {
  const n = `${t} must return \`null\` or a valid event.`;
  if (Nt(e))
    return e.then(
      (r) => {
        if (!B(r) && r !== null)
          throw new R(n);
        return r;
      },
      (r) => {
        throw new R(`${t} rejected with ${r}`);
      }
    );
  if (!B(e) && e !== null)
    throw new R(n);
  return e;
}
function Rs(e, t, n, r) {
  const { beforeSend: s, beforeSendTransaction: i, beforeSendSpan: o } = t;
  if (sn(n) && s)
    return s(n, r);
  if (on(n)) {
    if (n.spans && o) {
      const a = [];
      for (const c of n.spans) {
        const l = o(c);
        l ? a.push(l) : (Tr(), e.recordDroppedEvent("before_send", "span"));
      }
      n.spans = a;
    }
    if (i) {
      if (n.spans) {
        const a = n.spans.length;
        n.sdkProcessingMetadata = _(u({}, n.sdkProcessingMetadata), {
          spanCountBeforeProcessing: a
        });
      }
      return i(n, r);
    }
  }
  return n;
}
function sn(e) {
  return e.type === void 0;
}
function on(e) {
  return e.type === "transaction";
}
function Ds(e, t) {
  t.debug === !0 && (S ? h.enable() : z(() => {
    console.warn("[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.");
  })), I().update(t.initialScope);
  const r = new e(t);
  return As(r), r.init(), r;
}
function As(e) {
  I().setClient(e);
}
function Ps(e) {
  const t = [];
  function n() {
    return e === void 0 || t.length < e;
  }
  function r(o) {
    return t.splice(t.indexOf(o), 1)[0] || Promise.resolve(void 0);
  }
  function s(o) {
    if (!n())
      return Ye(new R("Not adding Promise because buffer limit was reached."));
    const a = o();
    return t.indexOf(a) === -1 && t.push(a), a.then(() => r(a)).then(
      null,
      () => r(a).then(null, () => {
      })
    ), a;
  }
  function i(o) {
    return new J((a, c) => {
      let l = t.length;
      if (!l)
        return a(!0);
      const d = setTimeout(() => {
        o && o > 0 && a(!1);
      }, o);
      t.forEach((p) => {
        G(p).then(() => {
          --l || (clearTimeout(d), a(!0));
        }, c);
      });
    });
  }
  return {
    $: t,
    add: s,
    drain: i
  };
}
const xs = 60 * 1e3;
function Ms(e, t = Date.now()) {
  const n = parseInt(`${e}`, 10);
  if (!isNaN(n))
    return n * 1e3;
  const r = Date.parse(`${e}`);
  return isNaN(r) ? xs : r - t;
}
function $s(e, t) {
  return e[t] || e.all || 0;
}
function Cs(e, t, n = Date.now()) {
  return $s(e, t) > n;
}
function Fs(e, { statusCode: t, headers: n }, r = Date.now()) {
  const s = u({}, e), i = n && n["x-sentry-rate-limits"], o = n && n["retry-after"];
  if (i)
    for (const a of i.trim().split(",")) {
      const [c, l, , , d] = a.split(":", 5), p = parseInt(c, 10), m = (isNaN(p) ? 60 : p) * 1e3;
      if (!l)
        s.all = r + m;
      else
        for (const g of l.split(";"))
          g === "metric_bucket" ? (!d || d.split(";").includes("custom")) && (s[g] = r + m) : s[g] = r + m;
    }
  else o ? s.all = r + Ms(o, r) : t === 429 && (s.all = r + 60 * 1e3);
  return s;
}
const js = 64;
function Ls(e, t, n = Ps(
  e.bufferSize || js
)) {
  let r = {};
  const s = (o) => n.drain(o);
  function i(o) {
    const a = [];
    if (Ie(o, (p, m) => {
      const g = ve(m);
      if (Cs(r, g)) {
        const f = De(p, m);
        e.recordDroppedEvent("ratelimit_backoff", g, f);
      } else
        a.push(p);
    }), a.length === 0)
      return G({});
    const c = Pt(o[0], a), l = (p) => {
      Ie(c, (m, g) => {
        const f = De(m, g);
        e.recordDroppedEvent(p, ve(g), f);
      });
    }, d = () => t({ body: Lr(c) }).then(
      (p) => (p.statusCode !== void 0 && (p.statusCode < 200 || p.statusCode >= 300) && S && h.warn(`Sentry responded with status code ${p.statusCode} to sent event.`), r = Fs(r, p), p),
      (p) => {
        throw l("network_error"), p;
      }
    );
    return n.add(d).then(
      (p) => p,
      (p) => {
        if (p instanceof R)
          return S && h.error("Skipped sending event because buffer is full."), l("queue_overflow"), G({});
        throw p;
      }
    );
  }
  return {
    send: i,
    flush: s
  };
}
function De(e, t) {
  if (!(t !== "event" && t !== "transaction"))
    return Array.isArray(e) ? e[1] : void 0;
}
function Us(e, t, n = [t], r = "npm") {
  const s = e._metadata || {};
  s.sdk || (s.sdk = {
    name: `sentry.javascript.${t}`,
    packages: n.map((i) => ({
      name: `${r}:@sentry/${i}`,
      version: F
    })),
    version: F
  }), e._metadata = s;
}
const Hs = 100;
function Bs(e, t) {
  const n = N(), r = k();
  if (!n) return;
  const { beforeBreadcrumb: s = null, maxBreadcrumbs: i = Hs } = n.getOptions();
  if (i <= 0) return;
  const o = Y(), a = u({ timestamp: o }, e), c = s ? z(() => s(a, t)) : a;
  c !== null && (n.emit && n.emit("beforeAddBreadcrumb", c, t), r.addBreadcrumb(c, i));
}
let Ae;
const Gs = "FunctionToString", Pe = /* @__PURE__ */ new WeakMap(), qs = (() => ({
  name: Gs,
  setupOnce() {
    Ae = Function.prototype.toString;
    try {
      Function.prototype.toString = function(...e) {
        const t = Ln(this), n = Pe.has(N()) && t !== void 0 ? t : this;
        return Ae.apply(n, e);
      };
    } catch (e) {
    }
  },
  setup(e) {
    Pe.set(e, !0);
  }
})), Ws = qs, zs = [
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
], Ks = "InboundFilters", Ys = ((e = {}) => ({
  name: Ks,
  processEvent(t, n, r) {
    const s = r.getOptions(), i = Vs(e, s);
    return Xs(t, i) ? null : t;
  }
})), Js = Ys;
function Vs(e = {}, t = {}) {
  return {
    allowUrls: [...e.allowUrls || [], ...t.allowUrls || []],
    denyUrls: [...e.denyUrls || [], ...t.denyUrls || []],
    ignoreErrors: [
      ...e.ignoreErrors || [],
      ...t.ignoreErrors || [],
      ...e.disableErrorDefaults ? [] : zs
    ],
    ignoreTransactions: [...e.ignoreTransactions || [], ...t.ignoreTransactions || []],
    ignoreInternal: e.ignoreInternal !== void 0 ? e.ignoreInternal : !0
  };
}
function Xs(e, t) {
  return t.ignoreInternal && ri(e) ? (S && h.warn(`Event dropped due to being internal Sentry Error.
Event: ${$(e)}`), !0) : Zs(e, t.ignoreErrors) ? (S && h.warn(
    `Event dropped due to being matched by \`ignoreErrors\` option.
Event: ${$(e)}`
  ), !0) : ii(e) ? (S && h.warn(
    `Event dropped due to not having an error message, error type or stacktrace.
Event: ${$(
      e
    )}`
  ), !0) : Qs(e, t.ignoreTransactions) ? (S && h.warn(
    `Event dropped due to being matched by \`ignoreTransactions\` option.
Event: ${$(e)}`
  ), !0) : ti(e, t.denyUrls) ? (S && h.warn(
    `Event dropped due to being matched by \`denyUrls\` option.
Event: ${$(
      e
    )}.
Url: ${ht(e)}`
  ), !0) : ei(e, t.allowUrls) ? !1 : (S && h.warn(
    `Event dropped due to not being matched by \`allowUrls\` option.
Event: ${$(
      e
    )}.
Url: ${ht(e)}`
  ), !0);
}
function Zs(e, t) {
  return e.type || !t || !t.length ? !1 : ni(e).some((n) => Dt(n, t));
}
function Qs(e, t) {
  if (e.type !== "transaction" || !t || !t.length)
    return !1;
  const n = e.transaction;
  return n ? Dt(n, t) : !1;
}
function ti(e, t) {
  if (!t || !t.length)
    return !1;
  const n = ht(e);
  return n ? Dt(n, t) : !1;
}
function ei(e, t) {
  if (!t || !t.length)
    return !0;
  const n = ht(e);
  return n ? Dt(n, t) : !0;
}
function ni(e) {
  const t = [];
  e.message && t.push(e.message);
  let n;
  try {
    n = e.exception.values[e.exception.values.length - 1];
  } catch (r) {
  }
  return n && n.value && (t.push(n.value), n.type && t.push(`${n.type}: ${n.value}`)), t;
}
function ri(e) {
  try {
    return e.exception.values[0].type === "SentryError";
  } catch (t) {
  }
  return !1;
}
function si(e = []) {
  for (let t = e.length - 1; t >= 0; t--) {
    const n = e[t];
    if (n && n.filename !== "<anonymous>" && n.filename !== "[native code]")
      return n.filename || null;
  }
  return null;
}
function ht(e) {
  try {
    let t;
    try {
      t = e.exception.values[0].stacktrace.frames;
    } catch (n) {
    }
    return t ? si(t) : null;
  } catch (t) {
    return S && h.error(`Cannot extract url for event ${$(e)}`), null;
  }
}
function ii(e) {
  return e.type || !e.exception || !e.exception.values || e.exception.values.length === 0 ? !1 : (
    // No top-level message
    !e.message && // There are no exception values that have a stacktrace, a non-generic-Error type or value
    !e.exception.values.some((t) => t.stacktrace || t.type && t.type !== "Error" || t.value)
  );
}
function oi() {
  return {
    bindClient(e) {
      I().setClient(e);
    },
    withScope: Je,
    getClient: () => N(),
    getScope: I,
    getIsolationScope: k,
    captureException: (e, t) => I().captureException(e, t),
    captureMessage: (e, t, n) => I().captureMessage(e, t, n),
    captureEvent: en,
    addBreadcrumb: Bs,
    setUser: _s,
    setTags: ms,
    setTag: gs,
    setExtra: hs,
    setExtras: fs,
    setContext: ps,
    getIntegration(e) {
      const t = N();
      return t && t.getIntegrationByName(e.id) || null;
    },
    startSession: ys,
    endSession: Ht,
    captureSession(e) {
      if (e)
        return Ht();
      ai();
    }
  };
}
const D = oi;
function ai() {
  const e = I(), t = N(), n = e.getSession();
  t && n && t.captureSession(n);
}
function so(e) {
  const t = I();
  e(t);
}
const Bt = v, xe = kn, ci = wn, ui = He, li = vn, an = Ge, di = B, y = h, Gt = Ke, qt = Gn, Me = O, pi = A, fi = Qe, pt = w, hi = Un, X = Fn, mi = J, cn = G, j = Y, E = typeof __SENTRY_DEBUG__ == "undefined" ? !0 : __SENTRY_DEBUG__, $e = "finishReason", Ce = ["heartbeatFailed", "idleTimeout", "documentHidden"];
let un;
function gi(e) {
  const t = N(), n = e || t && t.getOptions && t.getOptions();
  return !!n && ("tracesSampleRate" in n || "tracesSampler" in n);
}
function _i() {
  return un;
}
function mt(e) {
  un = e;
}
function Z(e) {
  return e / 1e3;
}
function yi(e) {
  return e * 1e3;
}
class ln {
  constructor(t = 1e3) {
    this.spans = [], this._maxlen = t;
  }
  /**
   * This is just so that we don't run out of memory while recording a lot
   * of spans. At some point we just stop and flush out the start of the
   * trace tree (i.e.the first n spans with the smallest
   * start_timestamp).
   */
  add(t) {
    this.spans.length > this._maxlen ? t.spanRecorder = void 0 : this.spans.push(t);
  }
}
class ee {
  /**
   * You should never call the constructor manually, always use `Sentry.startTransaction()`
   * or call `startChild()` on an existing span.
   * @internal
   * @hideconstructor
   * @hidden
   */
  constructor(t) {
    var n, r, s, i, o, a, c, l, d, p, m, g, f;
    if (this.name = "", this.traceId = Me(), this.spanId = Me().substring(16), this.startTimestamp = j(), this.tags = {}, this.data = {}, this.attributes = {}, this.instrumenter = "sentry", !t)
      return this;
    this.traceId = (n = t.traceId) != null ? n : this.traceId, this.spanId = (r = t.spanId) != null ? r : this.spanId, this.parentSpanId = (s = t.parentSpanId) != null ? s : this.parentSpanId, "sampled" in t && (this.sampled = t.sampled), this.op = (i = t.op) != null ? i : this.op, this.description = (a = (o = t.description) != null ? o : t.name) != null ? a : this.description, this.name = (l = (c = t.name) != null ? c : t.description) != null ? l : this.name, this.data = t.data ? u({}, t.data) : this.data, this.tags = t.tags ? u({}, t.tags) : this.tags, this.attributes = t.attributes ? u({}, t.attributes) : this.attributes, this.status = (d = t.status) != null ? d : this.status, this.startTimestamp = (p = t.startTimestamp) != null ? p : this.startTimestamp, this.endTimestamp = (m = t.endTimestamp) != null ? m : this.endTimestamp, this.instrumenter = (g = t.instrumenter) != null ? g : this.instrumenter, this.origin = (f = t.origin) != null ? f : this.origin;
  }
  /**
   * @inheritDoc
   * @deprecated
   */
  child(t) {
    return this.startChild(t);
  }
  /**
   * @inheritDoc
   */
  startChild(t) {
    var r;
    const n = new ee(_(u({}, t), {
      parentSpanId: this.spanId,
      sampled: this.sampled,
      attributes: (r = t == null ? void 0 : t.attributes) != null ? r : {},
      instrumenter: this.instrumenter,
      traceId: this.traceId
    }));
    return n.spanRecorder = this.spanRecorder, n.spanRecorder && n.spanRecorder.add(n), n.transaction = this.transaction, n;
  }
  /**
   * @inheritDoc
   */
  setTag(t, n) {
    return this.tags = _(u({}, this.tags), { [t]: n }), this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  setData(t, n) {
    return this.data = _(u({}, this.data), { [t]: n }), this;
  }
  /**
   * @inheritDoc
   */
  setAttribute(t, n) {
    return n === void 0 ? delete this.attributes[t] : this.attributes[t] = n, this;
  }
  /**
   * @inheritDoc
   */
  setAttributes(t) {
    return Object.keys(t).forEach((n) => this.setAttribute(n, t[n])), this;
  }
  /**
   * @inheritDoc
   */
  setStatus(t) {
    var n;
    return this.status = typeof t == "string" ? t : (n = t.message) != null ? n : t.code, this;
  }
  /**
   * @inheritDoc
   */
  setHttpStatus(t) {
    this.setTag("http.status_code", String(t));
    const n = Ei(t);
    return n !== "unknown_error" && this.setStatus(n), this;
  }
  /**
   * @inheritDoc
   */
  addEvent(t, n, r) {
    return this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addLink(t) {
    return this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addLinks(t) {
    return this;
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  recordException(t) {
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
  setName(t) {
    this.name = t, this.description = t;
  }
  /**
   * @inheritDoc
   */
  updateName(t) {
    return this.setName(t), this;
  }
  /**
   * @inheritDoc
   */
  end(t) {
    this.finish(Si(t));
  }
  /**
   * @inheritDoc
   */
  finish(t) {
    this.endTimestamp = typeof t == "number" ? t : j();
  }
  /**
   * @inheritDoc
   */
  toTraceparent() {
    let t = "";
    return this.sampled !== void 0 && (t = this.sampled ? "-1" : "-0"), `${this.traceId}-${this.spanId}${t}`;
  }
  /**
   * @inheritDoc
   */
  toContext() {
    return pt({
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
      status: typeof this.status == "number" ? String(this.status) : this.status,
      tags: this.tags,
      traceId: this.traceId
    });
  }
  /**
   * @inheritDoc
   */
  updateWithContext(t) {
    var n, r, s, i, o, a, c, l, d;
    return this.data = (n = t.data) != null ? n : {}, this.description = (r = t.description) != null ? r : t.name, this.name = (i = (s = t.name) != null ? s : t.description) != null ? i : this.name, this.endTimestamp = t.endTimestamp, this.op = t.op, this.parentSpanId = t.parentSpanId, this.sampled = t.sampled, this.spanId = (o = t.spanId) != null ? o : this.spanId, this.startTimestamp = (a = t.startTimestamp) != null ? a : this.startTimestamp, this.status = t.status, this.tags = (c = t.tags) != null ? c : {}, this.attributes = (l = t.attributes) != null ? l : this.attributes, this.traceId = (d = t.traceId) != null ? d : this.traceId, this;
  }
  /**
   * @inheritDoc
   */
  getTraceContext() {
    return pt({
      data: Object.keys(this.data).length > 0 ? this.data : void 0,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      status: typeof this.status == "number" ? String(this.status) : this.status,
      tags: Object.keys(this.tags).length > 0 ? this.tags : void 0,
      trace_id: this.traceId
    });
  }
  /**
   * @inheritDoc
   */
  toJSON() {
    return pt({
      data: Object.keys(this.data).length > 0 ? this.data : void 0,
      description: this.description,
      op: this.op,
      parent_span_id: this.parentSpanId,
      span_id: this.spanId,
      start_timestamp: this.startTimestamp,
      status: typeof this.status == "number" ? String(this.status) : this.status,
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
    return this.sampled !== !1 && this.endTimestamp === void 0;
  }
}
function Si(e) {
  if (e === void 0)
    return j();
  if (Array.isArray(e) && e.length === 2) {
    const [t, n] = e;
    return t + n / 1e9;
  }
  return e instanceof Date ? e.getTime() / 1e3 : typeof e == "number" ? e > 1e12 ? Z(e) : e : j();
}
function Ei(e) {
  if (e < 400 && e >= 100)
    return "ok";
  if (e >= 400 && e < 500)
    switch (e) {
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
  if (e >= 500 && e < 600)
    switch (e) {
      case 501:
        return "unimplemented";
      case 503:
        return "unavailable";
      case 504:
        return "deadline_exceeded";
      default:
        return "internal_error";
    }
  return "unknown_error";
}
class dn extends ee {
  /**
   * This constructor should never be called manually. Those instrumenting tracing should use
   * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  constructor(t) {
    super(t), this._measurements = {}, this._contexts = {}, this.name = t.name || "", this.metadata = u({
      source: "custom",
      spanMetadata: {}
    }, t.metadata), this._trimEnd = t.trimEnd, this.transaction = this;
  }
  /**
   * JSDoc
   */
  setName(t) {
    this.name = t;
  }
  /**
   * Attach additional context to the transaction.
   * @deprecated Prefer attributes or scope data.
   */
  // eslint-disable-next-line @typescript-eslint/ban-types
  setContext(t, n) {
    this._contexts[t] = n;
  }
  /**
   * Record a single measurement.
   * @deprecated Prefer top-level `setMeasurement`.
   */
  setMeasurement(t, n, r = "") {
    this._measurements[t] = { value: n, unit: r };
  }
  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
  initSpanRecorder(t = 1e3) {
    this.spanRecorder || (this.spanRecorder = new ln(t)), this.spanRecorder.add(this);
  }
  /**
   * Set observed measurements for this transaction.
   * @hidden
   */
  setMeasurements(t) {
    this._measurements = u({}, t);
  }
  /**
   * Set metadata for this transaction.
   * @hidden
   */
  setMetadata(t) {
    this.metadata = u(u({}, this.metadata), t);
  }
  /**
   * Return dynamic sampling context for this transaction.
   */
  getDynamicSamplingContext() {
    var t;
    return ((t = this.metadata) == null ? void 0 : t.dynamicSamplingContext) || {};
  }
  /**
   * Placeholder profile id (not used in miniapp tracing).
   */
  getProfileId() {
  }
  /**
   * @inheritDoc
   */
  finish(t) {
    if (this.endTimestamp !== void 0)
      return;
    if (this.name || (E && y.warn("Transaction has no name, falling back to `<unlabeled transaction>`."), this.name = "<unlabeled transaction>"), super.finish(t), this.sampled !== !0) {
      E && y.log("[Tracing] Discarding transaction because its trace was not chosen to be sampled.");
      return;
    }
    const n = this.spanRecorder ? this.spanRecorder.spans.filter((o) => o !== this && o.endTimestamp) : [], r = n.map((o) => o.toJSON());
    this._trimEnd && n.length > 0 && (this.endTimestamp = n.reduce((o, a) => o.endTimestamp && a.endTimestamp ? o.endTimestamp > a.endTimestamp ? o : a : o).endTimestamp);
    const s = {
      contexts: u({
        trace: this.getTraceContext()
      }, this._contexts),
      spans: r,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: "transaction",
      sdkProcessingMetadata: this.metadata
    };
    return Object.keys(this._measurements).length > 0 && (E && y.log(
      "[Measurements] Adding measurements to transaction",
      JSON.stringify(this._measurements, void 0, 2)
    ), s.measurements = this._measurements), E && y.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`), en(s);
  }
  /**
   * @inheritDoc
   */
  toContext() {
    const t = super.toContext();
    return pt(_(u({}, t), {
      name: this.name,
      trimEnd: this._trimEnd
    }));
  }
  /**
   * @inheritDoc
   */
  updateWithContext(t) {
    var n;
    return super.updateWithContext(t), this.name = (n = t.name) != null ? n : "", this._trimEnd = t.trimEnd, this;
  }
}
const bi = 1e3, Ti = 5e3;
class Ii extends ln {
  constructor(t, n, r = "", s) {
    super(s), this._pushActivity = t, this._popActivity = n, this.transactionSpanId = r;
  }
  /**
   * @inheritDoc
   */
  add(t) {
    t.spanId !== this.transactionSpanId && (t.finish = (n) => {
      t.endTimestamp = typeof n == "number" ? n : j(), this._popActivity(t.spanId);
    }, t.endTimestamp === void 0 && this._pushActivity(t.spanId)), super.add(t);
  }
}
class vi extends dn {
  constructor(t, n = bi, r = !1) {
    super(t), this._idleTimeout = n, this._onScope = r, this.activities = {}, this._heartbeatCounter = 0, this._finished = !1, this._beforeFinishCallbacks = [], r && (E && y.log(`Setting idle transaction as active. Span ID: ${this.spanId}`), mt(this)), this._initTimeout = setTimeout(() => {
      this._finished || this.finish();
    }, this._idleTimeout);
  }
  /** {@inheritDoc} */
  finish(t = j()) {
    if (this._finished = !0, this.activities = {}, this.spanRecorder) {
      E && y.log("[Tracing] finishing IdleTransaction", new Date(t * 1e3).toISOString(), this.op);
      for (const n of this._beforeFinishCallbacks)
        n(this, t);
      this.spanRecorder.spans = this.spanRecorder.spans.filter((n) => {
        if (n.spanId === this.spanId)
          return !0;
        n.endTimestamp || (n.endTimestamp = t, n.setStatus("cancelled"), E && y.log("[Tracing] cancelling span since transaction ended early", JSON.stringify(n, void 0, 2)));
        const r = n.startTimestamp < t;
        return r || E && y.log(
          "[Tracing] discarding Span since it happened after Transaction was finished",
          JSON.stringify(n, void 0, 2)
        ), r;
      }), E && y.log("[Tracing] flushing IdleTransaction");
    } else
      E && y.log("[Tracing] No active IdleTransaction");
    return this._onScope && mt(void 0), super.finish(t);
  }
  /**
   * Register a callback function that gets excecuted before the transaction finishes.
   * Useful for cleanup or if you want to add any additional spans based on current context.
   *
   * This is exposed because users have no other way of running something before an idle transaction
   * finishes.
   */
  registerBeforeFinishCallback(t) {
    this._beforeFinishCallbacks.push(t);
  }
  /**
   * @inheritDoc
   */
  initSpanRecorder(t) {
    if (!this.spanRecorder) {
      const n = (s) => {
        this._finished || this._pushActivity(s);
      }, r = (s) => {
        this._finished || this._popActivity(s);
      };
      this.spanRecorder = new Ii(n, r, this.spanId, t), E && y.log("Starting heartbeat"), this._pingHeartbeat();
    }
    this.spanRecorder.add(this);
  }
  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
  _pushActivity(t) {
    this._initTimeout && (clearTimeout(this._initTimeout), this._initTimeout = void 0), E && y.log(`[Tracing] pushActivity: ${t}`), this.activities[t] = !0, E && y.log("[Tracing] new activities count", Object.keys(this.activities).length);
  }
  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
  _popActivity(t) {
    if (this.activities[t] && (E && y.log(`[Tracing] popActivity ${t}`), delete this.activities[t], E && y.log("[Tracing] new activities count", Object.keys(this.activities).length)), Object.keys(this.activities).length === 0) {
      const n = this._idleTimeout, r = j() + n / 1e3;
      setTimeout(() => {
        this._finished || (this.setTag($e, Ce[1]), this.finish(r));
      }, n);
    }
  }
  /**
   * Checks when entries of this.activities are not changing for 3 beats.
   * If this occurs we finish the transaction.
   */
  _beat() {
    if (this._finished)
      return;
    const t = Object.keys(this.activities).join("");
    t === this._prevHeartbeatString ? this._heartbeatCounter += 1 : this._heartbeatCounter = 1, this._prevHeartbeatString = t, this._heartbeatCounter >= 3 ? (E && y.log("[Tracing] Transaction finished because of no change for 3 heart beats"), this.setStatus("deadline_exceeded"), this.setTag($e, Ce[0]), this.finish()) : this._pingHeartbeat();
  }
  /**
   * Pings the heartbeat
   */
  _pingHeartbeat() {
    E && y.log(`pinging Heartbeat -> current counter: ${this._heartbeatCounter}`), setTimeout(() => {
      this._beat();
    }, Ti);
  }
}
function pn(e, t, n) {
  if (!gi(t))
    return e.sampled = !1, e;
  if (e.sampled !== void 0)
    return e;
  let r;
  return typeof t.tracesSampler == "function" ? r = t.tracesSampler(n) : n.parentSampled !== void 0 ? r = n.parentSampled : r = t.tracesSampleRate, ki(r) ? r ? (e.sampled = Math.random() < r, e.sampled ? (E && y.log(`[Tracing] starting ${e.op} transaction - ${e.name}`), e) : (E && y.log(
    `[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(
      r
    )})`
  ), e)) : (E && y.log(
    `[Tracing] Discarding transaction because ${typeof t.tracesSampler == "function" ? "tracesSampler returned 0 or false" : "a negative sampling decision was inherited or tracesSampleRate is set to 0"}`
  ), e.sampled = !1, e) : (E && y.warn("[Tracing] Discarding transaction because of invalid sample rate."), e.sampled = !1, e);
}
function ki(e) {
  return Number.isNaN(e) || !(typeof e == "number" || typeof e == "boolean") ? (E && y.warn(
    `[Tracing] Given sample rate is invalid. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
      e
    )} of type ${JSON.stringify(typeof e)}.`
  ), !1) : e < 0 || e > 1 ? (E && y.warn(`[Tracing] Given sample rate is invalid. Sample rate must be between 0 and 1. Got ${e}.`), !1) : !0;
}
function io(e, t) {
  const n = N(), r = n && n.getOptions && n.getOptions() || {}, s = e.name || e.op || "unknown-transaction", i = u({
    parentSampled: e.parentSampled,
    transactionContext: _(u({}, e), { name: s }),
    name: s
  }, t);
  let o = new dn(_(u({}, e), { name: s }));
  if (o = pn(o, r, i), o.sampled) {
    const a = r._experiments && r._experiments.maxSpans;
    o.initSpanRecorder(a), mt(o);
  }
  return o;
}
function wi(e, t, n, r) {
  const s = N(), i = s && s.getOptions && s.getOptions() || {}, o = e.name || e.op || "unknown-transaction", a = u({
    parentSampled: e.parentSampled,
    transactionContext: _(u({}, e), { name: o }),
    name: o
  }, r);
  let c = new vi(_(u({}, e), { name: o }), t, n);
  if (c = pn(c, i, a), c.sampled) {
    const l = i._experiments && i._experiments.maxSpans;
    c.initSpanRecorder(l), mt(c);
  }
  return c;
}
const Oi = "sentry.javascript.miniapp", Fe = "0.12.1", U = "?", Ni = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|address|native|eval|webpack|<anonymous>|[-a-z]+:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i, Ri = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js))(?::(\d+))?(?::(\d+))?\s*$/i, Di = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i, Ai = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i, Pi = /\((\S*)(?::(\d+))(?::(\d+))\)/, xi = /^\s*at (.*?) ?\((\S*):(\d+):(\d+)\)/i;
function it(e) {
  let t = null;
  const n = e && e.framesToPop;
  try {
    if (t = $i(e), t)
      return je(t, n);
  } catch (r) {
  }
  try {
    if (t = Mi(e), t)
      return je(t, n);
  } catch (r) {
  }
  return {
    message: ne(e),
    name: e && e.name,
    stack: [],
    failed: !0
  };
}
function Mi(e) {
  if (!e || !e.stack)
    return null;
  const t = [], n = e.stack.split(`
`);
  let r, s, i, o;
  for (let a = 0; a < n.length; ++a) {
    if (i = Ni.exec(n[a])) {
      const c = i[2] && i[2].indexOf("native") === 0;
      r = i[2] && i[2].indexOf("eval") === 0, r && (s = Pi.exec(i[2])) && (i[2] = s[1], i[3] = s[2], i[4] = s[3]), o = {
        url: i[2],
        func: i[1] || U,
        args: c ? [i[2]] : [],
        line: i[3] ? +i[3] : null,
        column: i[4] ? +i[4] : null
      };
    } else if (i = Di.exec(n[a]))
      o = {
        url: i[2],
        func: i[1] || U,
        args: [],
        line: +i[3],
        column: i[4] ? +i[4] : null
      };
    else if (i = Ri.exec(n[a]))
      r = i[3] && i[3].indexOf(" > eval") > -1, r && (s = Ai.exec(i[3])) ? (i[1] = i[1] || "eval", i[3] = s[1], i[4] = s[2], i[5] = "") : a === 0 && !i[5] && e.columnNumber !== void 0 && (t[0].column = e.columnNumber + 1), o = {
        url: i[3],
        func: i[1] || U,
        args: i[2] ? i[2].split(",") : [],
        line: i[4] ? +i[4] : null,
        column: i[5] ? +i[5] : null
      };
    else if (i = xi.exec(n[a]))
      o = {
        url: i[2],
        func: i[1] || U,
        args: [],
        line: i[3] ? +i[3] : null,
        column: i[4] ? +i[4] : null
      };
    else
      continue;
    !o.func && o.line && (o.func = U), t.push(o);
  }
  return t.length ? {
    message: ne(e),
    name: e.name,
    stack: t
  } : null;
}
function $i(e) {
  if (!e || !e.stacktrace)
    return null;
  const t = e.stacktrace, n = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i, r = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i, s = t.split(`
`), i = [];
  let o;
  for (let a = 0; a < s.length; a += 2) {
    let c = null;
    (o = n.exec(s[a])) ? c = {
      url: o[2],
      func: o[3],
      args: [],
      line: +o[1],
      column: null
    } : (o = r.exec(s[a])) && (c = {
      url: o[6],
      func: o[3] || o[4],
      args: o[5] ? o[5].split(",") : [],
      line: +o[1],
      column: +o[2]
    }), c && (!c.func && c.line && (c.func = U), i.push(c));
  }
  return i.length ? {
    message: ne(e),
    name: e.name,
    stack: i
  } : null;
}
function je(e, t) {
  try {
    return _(u({}, e), {
      stack: e.stack.slice(t)
    });
  } catch (n) {
    return e;
  }
}
function ne(e) {
  const t = e && e.message;
  return t ? t.error && typeof t.error.message == "string" ? t.error.message : t : "No error message";
}
const Ci = 100;
function fn(e) {
  const t = re(e.stack), n = {
    type: e.name,
    value: e.message
  };
  return t && t.length && (n.stacktrace = { frames: t }), n.type === void 0 && n.value === "" && (n.value = "Unrecoverable error caught"), n;
}
function Fi(e, t, n) {
  const r = {
    exception: {
      values: [
        {
          type: an(e) ? e.constructor.name : n ? "UnhandledRejection" : "Error",
          value: `Non-Error ${n ? "promise rejection" : "exception"} captured with keys: ${hi(e)}`
        }
      ]
    },
    extra: {
      __serialized__: fi(e)
    }
  };
  if (t) {
    const s = it(t), i = re(s.stack);
    r.stacktrace = {
      frames: i
    };
  }
  return r;
}
function Le(e) {
  return {
    exception: {
      values: [fn(e)]
    }
  };
}
function re(e) {
  if (!e || !e.length)
    return [];
  let t = e;
  const n = t[0].func || "", r = t[t.length - 1].func || "";
  return (n.indexOf("captureMessage") !== -1 || n.indexOf("captureException") !== -1) && (t = t.slice(1)), r.indexOf("sentryWrapped") !== -1 && (t = t.slice(0, -1)), t.map(
    (s) => ({
      colno: s.column === null ? void 0 : s.column,
      filename: s.url || t[0].url,
      function: s.func || "?",
      in_app: !0,
      lineno: s.line === null ? void 0 : s.line
    })
  ).slice(0, Ci).reverse();
}
function ji(e, t, n = {}) {
  let r;
  if (li(e) && e.error)
    return e = e.error, r = Le(it(e)), r;
  if (xe(e) || ci(e)) {
    const s = e, i = s.name || (xe(s) ? "DOMError" : "DOMException"), o = s.message ? `${i}: ${s.message}` : i;
    return r = Wt(o, t, n), qt(r, o), r;
  }
  return ui(e) ? (r = Le(it(e)), r) : di(e) || an(e) ? (r = Fi(e, t, n.rejection), Gt(r, {
    synthetic: !0
  }), r) : (r = Wt(e, t, n), qt(r, `${e}`, void 0), Gt(r, {
    synthetic: !0
  }), r);
}
function Wt(e, t, n = {}) {
  const r = {
    message: e
  };
  if (n.attachStacktrace && t) {
    const s = it(t), i = re(s.stack);
    r.stacktrace = {
      frames: i
    };
  }
  return r;
}
const Li = () => {
  let e = {
    // tslint:disable-next-line: no-empty
    request: () => {
    },
    // tslint:disable-next-line: no-empty
    httpRequest: () => {
    },
    // tslint:disable-next-line: no-empty
    getSystemInfoSync: () => {
    },
    getPerformance: () => ({}),
    onAppHide: function(t) {
    },
    canIUse: function(t) {
      return !1;
    }
  };
  if (typeof wx == "object")
    e = wx;
  else if (typeof my == "object")
    e = my;
  else if (typeof tt == "object")
    e = tt;
  else if (typeof dd == "object")
    e = dd;
  else if (typeof qq == "object")
    e = qq;
  else if (typeof swan == "object")
    e = swan;
  else
    throw new Error("sentry-miniapp 暂不支持此平台");
  return e;
}, Ui = () => {
  let e = "unknown";
  return typeof wx == "object" ? e = "wechat" : typeof my == "object" ? e = "alipay" : typeof tt == "object" ? e = "bytedance" : typeof dd == "object" ? e = "dingtalk" : typeof qq == "object" ? e = "qq" : typeof swan == "object" && (e = "swan"), e;
}, b = Li(), hn = Ui(), Hi = "application/json";
function se(e) {
  function t(n) {
    return new mi((r, s) => {
      const i = b.request || b.httpRequest;
      if (typeof i != "function") {
        s(new Error("Miniapp request function is not available"));
        return;
      }
      i({
        url: e.url,
        method: "POST",
        data: n.body,
        header: { "content-type": Hi },
        success(o) {
          var a, c, l, d;
          r({
            statusCode: o == null ? void 0 : o.statusCode,
            headers: {
              "x-sentry-rate-limits": (c = (a = o == null ? void 0 : o.headers) == null ? void 0 : a["X-Sentry-Rate-Limits"]) != null ? c : null,
              "retry-after": (d = (l = o == null ? void 0 : o.headers) == null ? void 0 : l["Retry-After"]) != null ? d : null
            }
          });
        },
        fail(o) {
          s(o);
        }
      });
    });
  }
  return Ls(e, t);
}
const oo = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  makeMiniappTransport: se
}, Symbol.toStringTag, { value: "Module" })), Bi = () => [];
class Gi extends Os {
  /**
   * Creates a new Miniapp SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  constructor(t = {}) {
    const n = t.transport || se, r = t.stackParser || Bi, s = t.integrations || t.defaultIntegrations || [], i = _(u({}, t), {
      transport: n,
      stackParser: r,
      integrations: s,
      dsn: t.dsn,
      // ensure defaults for required fields
      tracesSampleRate: t.tracesSampleRate
    });
    Us(i, "miniapp", ["miniapp"]), super(i);
  }
  /**
   * @inheritDoc
   */
  _prepareEvent(t, n, r, s) {
    return t.platform = t.platform || "javascript", t.sdk = _(u({}, t.sdk), {
      name: Oi,
      packages: [
        ...t.sdk && t.sdk.packages || [],
        {
          name: "npm:@sentry/miniapp",
          version: Fe
        }
      ],
      version: Fe
    }), super._prepareEvent(t, n, r, s);
  }
  /**
   * Show a report dialog to the user to send feedback to a specific event.
   * 向用户显示报告对话框以将反馈发送到特定事件。---> 小程序上暂时用不到&不考虑。
   *
   * @param options Set individual options for the dialog
   */
  showReportDialog(t = {}) {
    console.log("sentry-miniapp 暂未实现该方法", t);
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  eventFromException(t, n) {
    const r = n && n.syntheticException ? n.syntheticException : void 0, s = ji(t, r, {
      attachStacktrace: this._options.attachStacktrace
    });
    return n && n.event_id && (s.event_id = n.event_id), Promise.resolve(s);
  }
  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  eventFromMessage(t, n = "info", r) {
    const s = r && r.syntheticException ? r.syntheticException : void 0, i = Wt(String(t), s, {
      attachStacktrace: this._options.attachStacktrace
    });
    return i.level = n, r && r.event_id && (i.event_id = r.event_id), Promise.resolve(i);
  }
}
function qi() {
  setTimeout(() => {
  });
}
function H(e, t = {}, n) {
  if (typeof e != "function")
    return e;
  try {
    if (e.__sentry__)
      return e;
    if (e.__sentry_wrapped__)
      return e.__sentry_wrapped__;
  } catch (s) {
    return e;
  }
  const r = function() {
    const s = Array.prototype.slice.call(arguments);
    try {
      const i = s.map((o) => H(o, t));
      return e.handleEvent ? e.handleEvent.apply(this, i) : e.apply(this, i);
    } catch (i) {
      throw qi(), Je((o) => {
        o.addEventProcessor((a) => {
          const c = u({}, a);
          return t.mechanism && (qt(c, void 0, void 0), Gt(c, t.mechanism)), c.extra = _(u({}, c.extra), {
            arguments: pi(s, 3)
          }), c;
        }), ds(i);
      }), i;
    }
  };
  try {
    for (const s in e)
      Object.prototype.hasOwnProperty.call(e, s) && (r[s] = e[s]);
  } catch (s) {
  }
  e.prototype = e.prototype || {}, r.prototype = e.prototype, Object.defineProperty(e, "__sentry_wrapped__", {
    enumerable: !1,
    value: r
  }), Object.defineProperties(r, {
    __sentry__: {
      enumerable: !1,
      value: !0
    },
    __sentry_original__: {
      enumerable: !1,
      value: e
    }
  });
  try {
    Object.getOwnPropertyDescriptor(r, "name").configurable && Object.defineProperty(r, "name", {
      get() {
        return e.name;
      }
    });
  } catch (s) {
  }
  return r;
}
const Tt = class Tt {
  /** JSDoc */
  constructor(t) {
    this.name = Tt.id, this._onErrorHandlerInstalled = !1, this._onUnhandledRejectionHandlerInstalled = !1, this._onPageNotFoundHandlerInstalled = !1, this._onMemoryWarningHandlerInstalled = !1, this._options = u({
      onerror: !0,
      onunhandledrejection: !0,
      onpagenotfound: !0,
      onmemorywarning: !0
    }, t);
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    Error.stackTraceLimit = 50, this._options.onerror && (y.log("Global Handler attached: onError"), this._installGlobalOnErrorHandler()), this._options.onunhandledrejection && (y.log("Global Handler attached: onunhandledrejection"), this._installGlobalOnUnhandledRejectionHandler()), this._options.onpagenotfound && (y.log("Global Handler attached: onPageNotFound"), this._installGlobalOnPageNotFoundHandler()), this._options.onmemorywarning && (y.log("Global Handler attached: onMemoryWarning"), this._installGlobalOnMemoryWarningHandler());
  }
  /** JSDoc */
  _installGlobalOnErrorHandler() {
    if (!this._onErrorHandlerInstalled) {
      if (b.onError) {
        const t = D();
        b.onError((n) => {
          const r = typeof n == "string" ? new Error(n) : n;
          t.captureException(r);
        });
      }
      this._onErrorHandlerInstalled = !0;
    }
  }
  /** JSDoc */
  _installGlobalOnUnhandledRejectionHandler() {
    if (!this._onUnhandledRejectionHandlerInstalled) {
      if (b.onUnhandledRejection) {
        const t = D();
        b.onUnhandledRejection(
          ({ reason: n, promise: r }) => {
            const s = typeof n == "string" ? new Error(n) : n;
            t.captureException(s, {
              data: r
            });
          }
        );
      }
      this._onUnhandledRejectionHandlerInstalled = !0;
    }
  }
  /** JSDoc */
  _installGlobalOnPageNotFoundHandler() {
    if (!this._onPageNotFoundHandlerInstalled) {
      if (b.onPageNotFound) {
        const t = D();
        b.onPageNotFound((n) => {
          const r = n.path.split("?")[0];
          t.setTag("pagenotfound", r), t.setExtra("message", JSON.stringify(n)), t.captureMessage(`页面无法找到: ${r}`);
        });
      }
      this._onPageNotFoundHandlerInstalled = !0;
    }
  }
  /** JSDoc */
  _installGlobalOnMemoryWarningHandler() {
    if (!this._onMemoryWarningHandlerInstalled) {
      if (b.onMemoryWarning) {
        const t = D();
        b.onMemoryWarning(({ level: n = -1 }) => {
          let r = "没有获取到告警级别信息";
          switch (n) {
            case 5:
              r = "TRIM_MEMORY_RUNNING_MODERATE";
              break;
            case 10:
              r = "TRIM_MEMORY_RUNNING_LOW";
              break;
            case 15:
              r = "TRIM_MEMORY_RUNNING_CRITICAL";
              break;
            default:
              return;
          }
          t.setTag("memory-warning", String(n)), t.setExtra("message", r), t.captureMessage("内存不足告警");
        });
      }
      this._onMemoryWarningHandlerInstalled = !0;
    }
  }
};
Tt.id = "GlobalHandlers";
let gt = Tt;
const It = class It {
  constructor() {
    this._ignoreOnError = 0, this.name = It.id;
  }
  /** JSDoc */
  _wrapTimeFunction(t) {
    return function(...n) {
      const r = n[0];
      return n[0] = H(r, {
        mechanism: {
          data: { function: dt(t) },
          handled: !0,
          type: "instrument"
        }
      }), t.apply(this, n);
    };
  }
  /** JSDoc */
  _wrapRAF(t) {
    return function(n) {
      return t(
        H(n, {
          mechanism: {
            data: {
              function: "requestAnimationFrame",
              handler: dt(t)
            },
            handled: !0,
            type: "instrument"
          }
        })
      );
    };
  }
  /** JSDoc */
  _wrapEventTarget(t) {
    const n = Bt, r = n[t] && n[t].prototype;
    !r || !r.hasOwnProperty || !r.hasOwnProperty("addEventListener") || (X(r, "addEventListener", function(s) {
      return function(i, o, a) {
        try {
          typeof o.handleEvent == "function" && (o.handleEvent = H(o.handleEvent.bind(o), {
            mechanism: {
              data: {
                function: "handleEvent",
                handler: dt(o),
                target: t
              },
              handled: !0,
              type: "instrument"
            }
          }));
        } catch (c) {
        }
        return s.call(
          this,
          i,
          H(o, {
            mechanism: {
              data: {
                function: "addEventListener",
                handler: dt(o),
                target: t
              },
              handled: !0,
              type: "instrument"
            }
          }),
          a
        );
      };
    }), X(r, "removeEventListener", function(s) {
      return function(i, o, a) {
        let c = o;
        try {
          c = c && (c.__sentry_wrapped__ || c);
        } catch (l) {
        }
        return s.call(this, i, c, a);
      };
    }));
  }
  /**
   * Wrap timer functions and event targets to catch errors
   * and provide better metadata.
   */
  setupOnce() {
    this._ignoreOnError = this._ignoreOnError;
    const t = Bt;
    X(t, "setTimeout", this._wrapTimeFunction.bind(this)), X(t, "setInterval", this._wrapTimeFunction.bind(this)), X(t, "requestAnimationFrame", this._wrapRAF.bind(this)), [
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
It.id = "TryCatch";
let _t = It;
function dt(e) {
  try {
    return e && e.name || "<anonymous>";
  } catch (t) {
    return "<anonymous>";
  }
}
const Wi = "cause", zi = 5, et = class et {
  /**
   * @inheritDoc
   */
  constructor(t = {}) {
    this.name = et.id, this._key = t.key || Wi, this._limit = t.limit || zi;
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    xt((t, n) => {
      const r = D().getIntegration(et);
      return r ? r._handler(t, n) : t;
    });
  }
  /**
   * @inheritDoc
   */
  _handler(t, n) {
    if (!t.exception || !t.exception.values || !n || !(n.originalException instanceof Error))
      return t;
    const r = this._walkErrorTree(n.originalException, this._key);
    return t.exception.values = [...r, ...t.exception.values], t;
  }
  /**
   * @inheritDoc
   */
  _walkErrorTree(t, n, r = []) {
    if (!(t[n] instanceof Error) || r.length + 1 >= this._limit)
      return r;
    const s = it(t[n]), i = fn(s);
    return this._walkErrorTree(t[n], n, [i, ...r]);
  }
};
et.id = "LinkedErrors";
let yt = et;
const nt = class nt {
  constructor() {
    this.name = nt.id;
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    xt((t) => {
      const n = D();
      if (n.getIntegration(nt))
        try {
          const r = b.getSystemInfoSync(), {
            SDKVersion: s = "0.0.0",
            batteryLevel: i,
            // 微信小程序
            currentBattery: o,
            // 支付宝小程序、 钉钉小程序
            battery: a,
            // 字节跳动小程序
            brand: c,
            language: l,
            model: d,
            pixelRatio: p,
            platform: m,
            screenHeight: g,
            screenWidth: f,
            // statusBarHeight,
            system: x,
            version: T,
            // windowHeight,
            // windowWidth,
            app: L,
            // 支付宝小程序
            appName: V
            // 字节跳动小程序
            // fontSizeSetting, // 支付宝小程序、 钉钉小程序、微信小程序
          } = r, [ot, mn] = x.split(" ");
          n.setTag("SDKVersion", s);
          const gn = L || V || hn || "app";
          return _(u({}, t), {
            contexts: _(u({}, t.contexts), {
              device: {
                brand: c,
                battery_level: i || o || a,
                model: d,
                language: l,
                platform: m,
                screen_dpi: p,
                screen_height: g,
                screen_width: f
              },
              os: {
                name: ot || x,
                version: mn || x
              },
              browser: {
                name: gn,
                version: T
              }
            })
          });
        } catch (r) {
          console.warn(`sentry-miniapp get system info fail: ${r}`);
        }
      return t;
    });
  }
};
nt.id = "System";
let St = nt;
const rt = class rt {
  /**
   * @inheritDoc
   */
  constructor(t) {
    this.name = rt.id, this._options = u({
      enable: !0
    }, t);
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    xt((t) => {
      if (D().getIntegration(rt) && this._options.enable)
        try {
          const n = getCurrentPages().map(
            (r) => ({
              route: r.route,
              options: r.options
            })
          );
          return _(u({}, t), {
            extra: _(u({}, t.extra), {
              routers: n
            })
          });
        } catch (n) {
          console.warn(`sentry-miniapp get router info fail: ${n}`);
        }
      return t;
    });
  }
};
rt.id = "Router";
let Et = rt;
const st = class st {
  constructor() {
    this.name = st.id;
  }
  /**
   * @inheritDoc
   */
  setupOnce() {
    xt((t) => D().getIntegration(st) && hn === "wechat" && b.getLaunchOptionsSync && b.getLaunchOptionsSync().scene === 1129 ? null : t);
  }
};
st.id = "IgnoreMpcrawlerErrors";
let bt = st;
const ao = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GlobalHandlers: gt,
  IgnoreMpcrawlerErrors: bt,
  LinkedErrors: yt,
  Router: Et,
  System: St,
  TryCatch: _t
}, Symbol.toStringTag, { value: "Module" })), Ki = 1e12;
class Yi {
  constructor(t = !1) {
    this._reportAllChanges = t, this._measurements = {};
  }
  addPerformanceEntries(t) {
    var r;
    const n = this._getPerformance();
    n && (this._timeOrigin = this._getTimeOrigin(n, t), this._observer = (r = n.createObserver) == null ? void 0 : r.call(n, (s) => {
      var o;
      (((o = s == null ? void 0 : s.getEntries) == null ? void 0 : o.call(s)) || []).forEach((a) => this._handleEntry(t, a));
    }), this._observer && this._observer.observe({
      entryTypes: ["navigation", "render", "script", "loadPackage", "resource"]
    }));
  }
  _getPerformance() {
    if (!b.getPerformance)
      return;
    const t = b.getPerformance();
    if (!(!t || typeof t.createObserver != "function"))
      return t;
  }
  _getTimeOrigin(t, n) {
    if (typeof t.timeOrigin == "number")
      return Z(t.timeOrigin);
    const r = typeof t.now == "function" ? t.now() : void 0;
    return typeof r == "number" ? Z(Date.now() - r) : n.startTimestamp;
  }
  _handleEntry(t, n) {
    if (t.endTimestamp !== void 0) {
      this._stopObserver();
      return;
    }
    const r = this._toTimestamp(n.startTime, t.startTimestamp), s = this._toTimestamp(n.startTime + n.duration, t.startTimestamp);
    Ji(t, {
      op: this._mapOp(n),
      description: this._getDescription(n),
      startTimestamp: r,
      endTimestamp: s,
      data: this._buildSpanData(n)
    }), this._recordMeasurements(n, t, r), t.setTag("sentry_reportAllChanges", this._reportAllChanges), Object.keys(this._measurements).length > 0 && t.setMeasurements(this._measurements);
  }
  _mapOp(t) {
    switch (t.entryType) {
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
        return t.entryType || "custom";
    }
  }
  _getDescription(t) {
    return t.path || t.moduleName || t.name;
  }
  _buildSpanData(t) {
    const n = { entryType: t.entryType };
    return t.moduleName && (n.moduleName = t.moduleName), t.path && (n.path = t.path), typeof t.duration == "number" && (n.duration = t.duration), n;
  }
  _recordMeasurements(t, n, r) {
    const s = (t.name || "").toLowerCase(), i = t.duration, o = Math.max((r - n.startTimestamp) * 1e3, 0);
    if (s === "first-paint" || s === "firstpaint" ? this._measurements.fp = { value: o, unit: "millisecond" } : s === "first-contentful-paint" || s === "firstcontentfulpaint" ? this._measurements.fcp = { value: o, unit: "millisecond" } : s === "largest-contentful-paint" || s === "largestcontentfulpaint" || s === "lcp" ? this._measurements.lcp = { value: o, unit: "millisecond" } : (s === "first-input-delay" || s === "firstinputdelay" || s === "fid") && typeof i == "number" ? this._measurements.fid = { value: i, unit: "millisecond" } : t.entryType === "navigation" && typeof i == "number" && !this._measurements.navigation && (this._measurements.navigation = { value: i, unit: "millisecond" }), this._reportAllChanges && typeof i == "number") {
      const a = this._measurementKey(t);
      a && !this._measurements[a] && (this._measurements[a] = { value: i, unit: "millisecond" });
    }
  }
  _measurementKey(t) {
    const n = t.name || t.entryType;
    if (n)
      return n.replace(/\s+/g, "_").toLowerCase();
  }
  _toTimestamp(t, n) {
    var s;
    return t > Ki ? Z(t) : ((s = this._timeOrigin) != null ? s : n) + Z(t);
  }
  _stopObserver(t) {
    var n;
    (n = this._observer) == null || n.disconnect(), this._observer = void 0, t && !t.endTimestamp && t.finish();
  }
}
function Ji(e, r) {
  var s = r, { startTimestamp: t } = s, n = ce(s, ["startTimestamp"]);
  return t && e.startTimestamp > t && (e.startTimestamp = t), e.startChild(u({
    startTimestamp: t
  }, n));
}
function Vi(e, t = !0, n = !0) {
  const r = Bt, s = b.onAppRoute || r.wx && r.wx.onAppRoute;
  if (typeof s != "function")
    return;
  let i = !1, o;
  const a = (l, d) => {
    (d && t || !d && n) && (o && typeof o.finish == "function" && o.finish(), o = e(l));
  }, c = (l, d = !1) => {
    const p = (l == null ? void 0 : l.path) || (l == null ? void 0 : l.route) || (l == null ? void 0 : l.url) || "", m = typeof p == "string" && p.length > 0 ? p : "unknown-route";
    a(
      {
        name: m,
        op: "navigation",
        description: (l == null ? void 0 : l.openType) || (l == null ? void 0 : l.event) || void 0,
        metadata: { requestPath: m }
      },
      d
    );
  };
  if (t && typeof r.getCurrentPages == "function") {
    const l = r.getCurrentPages() || [], d = l[l.length - 1];
    d && d.route && (i = !0, c({ path: d.route }, !0));
  }
  s((l) => {
    const d = !i;
    i = !0, c(l, d);
  });
}
const Xi = {
  traceRequest: !0
}, Zi = 600, Qi = u({
  idleTimeout: 5e3,
  startTransactionOnLocationChange: !0,
  startTransactionOnPageLoad: !0,
  maxTransactionDuration: Zi,
  routingInstrumentation: Vi
}, Xi), vt = class vt {
  constructor(t) {
    this.name = vt.id, this._configuredIdleTimeout = t == null ? void 0 : t.idleTimeout, this.options = u(u({}, Qi), t);
    const { _metricOptions: n } = this.options;
    this._metrics = new Yi(n && n._reportAllChanges);
  }
  setupOnce() {
    var s;
    const {
      routingInstrumentation: t,
      startTransactionOnLocationChange: n,
      startTransactionOnPageLoad: r
      // traceRequest,
      // shouldCreateSpanForRequest,
    } = this.options;
    t(
      (i) => this._createRouteTransaction(i),
      r,
      n
    ), (s = b.onAppHide) == null || s.call(b, () => {
      const i = _i();
      i == null || i.finish();
    });
  }
  /** Create routing idle transaction. */
  _createRouteTransaction(t) {
    var c;
    const { beforeNavigate: n, idleTimeout: r, maxTransactionDuration: s } = this.options, i = _(u({}, t), {
      trimEnd: !0
    }), o = typeof n == "function" ? n(i) : i;
    if (o === void 0)
      return;
    const a = wi(o, r, !0, {});
    return a.registerBeforeFinishCallback((l, d) => {
      to(yi(s), l, d);
    }), a.setTag("idleTimeout", (c = this._configuredIdleTimeout) != null ? c : r), this._metrics.addPerformanceEntries(a), a;
  }
};
vt.id = "MiniAppTracing";
let zt = vt;
function to(e, t, n) {
  const r = n - t.startTimestamp;
  n && (r > e || r < 0) && (t.setStatus("deadline_exceeded"), t.setTag("maxTransactionDurationExceeded", "true"));
}
const eo = [
  Js(),
  Ws(),
  new _t(),
  new gt(),
  new yt(),
  new St(),
  new Et(),
  new bt(),
  new zt()
];
function co(e = {}) {
  e.defaultIntegrations === void 0 && (e.defaultIntegrations = eo), e.normalizeDepth = e.normalizeDepth || 5;
  const t = u({
    integrations: e.integrations || e.defaultIntegrations || [],
    stackParser: e.stackParser || (() => []),
    transport: e.transport || se
  }, e);
  Ds(Gi, t);
}
function uo(e = {}) {
  e.eventId || (e.eventId = nn());
  const t = D().getClient();
  t && t.showReportDialog(e);
}
function lo() {
  return nn();
}
function po(e) {
  const t = D().getClient();
  return t ? t.flush(e) : cn(!1);
}
function fo(e) {
  const t = D().getClient();
  return t ? t.close(e) : cn(!1);
}
function ho(e) {
  return H(e)();
}
export {
  ao as Integrations,
  Gi as MiniappClient,
  Oi as SDK_NAME,
  Fe as SDK_VERSION,
  oo as Transports,
  Bs as addBreadcrumb,
  xt as addEventProcessor,
  en as captureEvent,
  ds as captureException,
  ro as captureMessage,
  fo as close,
  so as configureScope,
  eo as defaultIntegrations,
  po as flush,
  D as getCurrentHub,
  I as getCurrentScope,
  co as init,
  lo as lastEventId,
  ps as setContext,
  hs as setExtra,
  fs as setExtras,
  gs as setTag,
  ms as setTags,
  _s as setUser,
  uo as showReportDialog,
  io as startTransaction,
  Je as withScope,
  ho as wrap
};
