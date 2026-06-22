'use strict';
// Test harness for the Plush Crypt's vanilla, no-build, global-scope app.
//
// The UI code (app.js, or the app-*.js parts after the split lands) is a set
// of plain <script> files that share one global scope — there is no
// import/export, so the functions aren't directly require()-able. Instead we
// load the real source into a Node `vm` context with a thin DOM/browser stub,
// exactly the way nine <script> tags share one global on a page. That lets us
// unit-test the pure logic (parsers, categorisation, query, formatting)
// against the actual shipping code, with ZERO changes to production files.
//
// Node's `vm` shares top-level const/let/function/var across runInContext
// calls in one context, so loading the parts in order faithfully mimics the
// browser. Only the bootstrap at the very end of the last file executes at
// load — and `runAuthGate` is stubbed so it never actually boots the app.

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// The split parts, in load order. If they're not present yet (pre-split
// `main`), fall back to the monolith. Either way the harness tests the real
// shipping source.
const PARTS = [
  'app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
  'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js',
  'app-social.js',
];

function sourceFiles() {
  const haveParts = PARTS.every((f) => fs.existsSync(path.join(ROOT, f)));
  if (haveParts) return PARTS;
  if (fs.existsSync(path.join(ROOT, 'app.js'))) return ['app.js'];
  throw new Error('No app source found (expected app-*.js parts or app.js).');
}

// A chainable DOM node: any unknown property/method access returns another
// node (or a sane default), so nothing in the load path can throw on a
// missing DOM API. The app only registers listeners at load; their bodies
// run on user events, never here.
function makeNode() {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (prop === 'dataset') return {};
      if (prop === 'style') return {};
      if (prop === 'children' || prop === 'childNodes') return [];
      if (prop === 'closest') return () => null;
      if (prop === 'querySelector') return () => makeNode();
      if (prop === 'querySelectorAll' || prop === 'getElementsByClassName') return () => [];
      if (prop === 'getAttribute') return () => null;
      if (prop === 'addEventListener' || prop === 'removeEventListener') return () => {};
      if (prop === 'appendChild' || prop === 'append' || prop === 'prepend' || prop === 'insertBefore') return (x) => x;
      if (prop === 'cloneNode') return () => makeNode();
      if (prop === 'value' || prop === 'textContent' || prop === 'innerHTML' || prop === 'innerText') return '';
      if (prop === Symbol.toPrimitive) return () => '';
      return () => makeNode();
    },
    set() { return true; },
    apply() { return makeNode(); },
  });
}

function makeDocument() {
  return new Proxy({}, {
    get(_t, p) {
      if (p === 'body' || p === 'documentElement' || p === 'head') return makeNode();
      if (p === 'getElementById' || p === 'querySelector' || p === 'createElement') return () => makeNode();
      if (p === 'querySelectorAll' || p === 'getElementsByClassName') return () => [];
      if (p === 'addEventListener' || p === 'removeEventListener') return () => {};
      if (p === 'cookie') return '';
      if (p === 'readyState') return 'complete';
      return () => makeNode();
    },
  });
}

// Build a fresh context with the app source loaded. Returns helpers for
// poking at the global functions the app defines.
function loadApp() {
  const sandbox = {};
  const win = new Proxy(sandbox, {
    get(t, p) { return p in t ? t[p] : undefined; },
    set(t, p, v) { t[p] = v; return true; },
  });

  Object.assign(sandbox, {
    window: win, self: win, globalThis: win, document: makeDocument(),
    navigator: { userAgent: 'plush-crypt-test', serviceWorker: { register: () => Promise.resolve(), addEventListener() {} }, onLine: true },
    location: { href: 'https://plushcrypt.com/', origin: 'https://plushcrypt.com', hostname: 'plushcrypt.com', search: '', pathname: '/', hash: '', reload() {}, assign() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame() {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve(''), clone() { return this; } }),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {}, removeEventListener() {} }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    URL, URLSearchParams, Blob: class {}, FileReader: class {}, Image: class {},
    // Globals normally provided by config.js / auth.js / db.js / data.js. The
    // app reads these at runtime, not at load; `runAuthGate` is stubbed to a
    // no-op thenable so boot() never fires during the test load.
    data: new Proxy({}, { get: () => () => undefined }),
    runAuthGate: () => ({ catch() {} }),
    currentUser: null,
    supabase: { createClient: () => ({}) },
    IMG_PROXY_BASE: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '',
  });

  const ctx = vm.createContext(sandbox);
  const files = sourceFiles();
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }

  // Call a global function defined by the app. Non-primitive return values
  // are JSON-cloned across the vm realm boundary so assert.deepStrictEqual
  // compares structure, not cross-realm prototypes.
  function call(name, ...args) {
    sandbox.__args = args;
    const raw = vm.runInContext(`${name}(...globalThis.__args)`, ctx);
    return raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : raw;
  }

  const typeOf = (expr) => vm.runInContext(`typeof (${expr})`, ctx);
  const setGlobal = (k, v) => { sandbox[k] = v; };

  return { ctx, sandbox, files, call, typeOf, setGlobal };
}

module.exports = { loadApp, PARTS };
