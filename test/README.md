# Tests

A dev-time test suite for the Plush Crypt. **It does not change how the app
ships** — the app stays a no-build static site (`index.html` + the `app-*.js`
parts + `data.js` + `styles.css`). These tests only run on your machine and in
CI.

## Running

```sh
npm test        # or: node --test
```

Requires Node 20+. No dependencies to install — the suite uses Node's built-in
test runner (`node:test`) and assertions (`node:assert`).

## How it works

The app's UI code is plain `<script>` files that share one global scope (no
`import`/`export`), so the functions aren't directly `require()`-able. The
harness (`test/harness.js`) loads the **real, unmodified** app source into a
Node `vm` context with a thin DOM/browser stub — exactly the way the browser
loads the scripts in order into one shared global. Tests then call the global
functions and assert on their output. Zero production code is touched or
duplicated.

The harness auto-detects the source layout: the nine `app-*.js` parts if
present, otherwise the legacy single `app.js`.

## What's covered

- **`smoke.test.js` (Tier 0)** — proves the whole app loads in order with no
  `ReferenceError`/TDZ (the silent failure mode of a global-scope app), and
  that key cross-file functions are defined.
- **`units.test.js` (Tier 1)** — unit tests for the pure logic that's most
  prone to silent regressions: the catalog name/accessory parser
  (`cleanCatalogName`, `canonicalizeAccessoryName`, `normalizeAccessories`,
  …), product categorisation (`catalogCategory`, `itemStatus`), image-URL
  helpers, and the search-query parser (`parseQuery`, `matchesQuery`).
- **`release-hygiene.test.js` (Tier 0)** — guards the ship-time conventions a
  no-build static site can't get from a compiler, so a correct code change
  can't ship as an *invisible* fix (stale cache). Enforces: all `app-*.js`
  share one `?v=`; every `?v=` asset exists; the SW precache list is real and
  query-string-free; no root-absolute (Capacitor-hostile) asset paths; unique
  migration numbers; `<script>` tags in the load-bearing order (supports before
  parts, parts in harness-`PARTS` order, `app-social.js` last); every local
  asset either cache-busted or SW-precached. Plus a git-aware check that any
  versioned asset whose
  bytes changed vs `origin/main` had its `?v=` **and** the `sw.js` `CACHE`
  bumped (skips cleanly when no base ref is resolvable).

## What's intentionally not here (yet)

- **DOM-walking parser tests** — `parseBodyHtml` and friends need a real DOM
  (e.g. `jsdom`); that's the natural next batch.
- **End-to-end browser tests** — a thin Playwright smoke suite (load, switch
  tabs, render a card) is the next tier up; it needs a way past Supabase auth
  (a seeded test session or a mocked gate).

## Adding a test

To pin a pure function's behaviour, call it through the harness and assert:

```js
const { loadApp } = require('./harness.js');
const app = loadApp();
assert.equal(app.call('cleanCatalogName', 'Plushie Dreadfuls - Cheshie - Plush Stuffed Animal'), 'Cheshie');
```
